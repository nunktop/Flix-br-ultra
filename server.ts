import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const USERS_FILE = path.join(process.cwd(), "users.json");

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Middleware to verify admin token
const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase Admin not configured" });
  }
  
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }

  req.user = user;
  next();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- ADMIN API ROUTES ---

  app.get("/api/admin/users", verifyAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase Admin not configured" });
    
    // Fetch profiles
    const { data: profiles, error } = await supabaseAdmin.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    
    res.json(profiles || []);
  });

  app.post("/api/admin/users/vip", verifyAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase Admin not configured" });
    
    const { userId, isVip, vipUntil } = req.body;
    
    const { error } = await supabaseAdmin.from('profiles').update({ 
      is_vip: isVip,
      vip_until: vipUntil
    }).eq('id', userId);
    
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true });
  });

  app.post("/api/admin/users/create", verifyAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase Admin not configured" });
    
    const { email, password, isAdmin, isVip, vipUntil } = req.body;
    
    // Create user in auth.users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    
    if (authError) return res.status(400).json({ success: false, message: authError.message });
    
    // The trigger will create the profile, but we need to update it with admin/vip status
    if (authData.user) {
      // Wait a moment for the trigger to run
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { error: profileError } = await supabaseAdmin.from('profiles').update({
        is_admin: isAdmin,
        is_vip: isVip,
        vip_until: vipUntil
      }).eq('id', authData.user.id);
      
      if (profileError) console.error("Error updating profile roles:", profileError);
    }
    
    return res.json({ success: true, user: authData.user });
  });

  app.post("/api/admin/users/reset-password", verifyAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase Admin not configured" });
    
    const { userId, newPassword } = req.body;
    
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });
    
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true });
  });

  app.delete("/api/admin/users/:id", verifyAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase Admin not configured" });
    
    const { id } = req.params;
    
    // Prevent deleting self
    if (req.user?.id === id) {
      return res.status(400).json({ success: false, message: "Você não pode excluir sua própria conta." });
    }
    
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true });
  });

  // --- AI ROUTES ---
  app.post("/api/ai/magic-search", async (req, res) => {
    try {
      const { magicSearchQuery, context } = req.body;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const prompt = `O usuário está procurando por: "${magicSearchQuery}". ${context || ''}
      Identifique se é um Filme, Série, Anime ou Desenho Animado.
      Se o usuário pedir uma recomendação, escolha a melhor opção e retorne os dados dela.
      Encontre o ID do TMDB (se existir) ou um link de streaming/embed direto e seguro para este conteúdo.
      Retorne um JSON com: { "title": "Título Encontrado", "id": "ID_TMDB_OU_URL", "type": "movie ou tv", "isUrl": true/false }.
      Priorize encontrar o ID do TMDB para que possamos usar nossos servidores internos.
      Se for um Anime, tente encontrar o ID do TMDB da série de TV correspondente.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        },
      });

      const result = JSON.parse(response.text || "{}");
      res.json(result);
    } catch (error: any) {
      console.error("Erro na busca mágica:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/find-link", async (req, res) => {
    try {
      const { title, tipo, season, ep, id } = req.body;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const prompt = `Encontre um link de embed (iframe) funcional e seguro para assistir o conteúdo "${title}" ${tipo === 'tv' ? `temporada ${season} episódio ${ep}` : ''} online. 
      Procure em sites como vidsrc, embed.su, warezcdn, superflix, ou similares que permitam embed via ID do TMDB (${id}).
      Retorne APENAS a URL final do embed em texto puro, sem markdown e sem explicações. Se não encontrar um link direto, tente encontrar o link de um player funcional.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text?.trim();
      res.json({ url: text });
    } catch (error: any) {
      console.error("Erro na busca IA:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
