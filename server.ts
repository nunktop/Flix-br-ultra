import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const USERS_FILE = path.join(process.cwd(), "users.json");

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://sgpheellaheyizlunyoz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncGhlZWxsYWhleWl6bHVueW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjQyNzcsImV4cCI6MjA5MTE0MDI3N30.f9HRVlf3S3-9laqm4VCTYYwicvf7-fJEw_Wngo-K92Y';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Middleware to verify admin token
const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase Admin not configured" });
  }
  
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token === "undefined" || token === "null") {
    return res.status(401).json({ error: "No token provided. Você não possui uma sessão ativa." });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    const errorMsg = error?.message || "Usuário não encontrado";
    console.error(`Token verificação falhou. URL server: ${supabaseUrl}. Erro:`, errorMsg, "Token:", token.substring(0, 15) + "...");
    return res.status(401).json({ error: `Sessão inválida ou expirada. Original erro: ${errorMsg}` });
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
    
    // Sync missing profiles from auth.users (repair mechanism for broken triggers)
    try {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
      if (authData?.users) {
        const { data: existingProfiles } = await supabaseAdmin.from('profiles').select('id');
        const profileIds = new Set(existingProfiles?.map((p: any) => p.id) || []);
        
        const missingUsers = authData.users.filter((u: any) => !profileIds.has(u.id));
        
        for (const u of missingUsers) {
          const isAdmin = u.user_metadata?.is_admin === true;
          const isVip = u.user_metadata?.is_vip === true;
          const vipUntil = u.user_metadata?.vip_until || null;
          
          await supabaseAdmin.from('profiles').insert({
             id: u.id,
             username: u.email?.split('@')[0] || 'User',
             is_admin: isAdmin,
             is_vip: isVip,
             vip_until: vipUntil
          });
          console.log(`Synced missing profile for user: ${u.email}`);
        }
      }
    } catch(e) {
      console.error("Error syncing users to profiles:", e);
    }
    
    // Fetch profiles
    const { data: profiles, error } = await supabaseAdmin.from('profiles').select('*');
    if (error) {
      console.error("Error fetching profiles:", error.message);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(profiles || []);
  });

  app.post("/api/admin/users/vip", verifyAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase Admin not configured" });
    
    const { userId, isVip, vipUntil } = req.body;
    
    // First, try a simple update
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ is_vip: isVip, vip_until: vipUntil })
      .eq('id', userId)
      .select();
      
    // If update affected 0 rows (missing profile), handle creation manually
    if (!updateError && (!updateData || updateData.length === 0)) {
      console.log(`Profile missing for ${userId} during VIP update. Attempting full upsert.`);
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
      
      const { error: insertError } = await supabaseAdmin.from('profiles').upsert({
        id: userId,
        username: authData?.user?.email?.split('@')[0] || 'User',
        is_admin: false,
        is_vip: isVip,
        vip_until: vipUntil
      });
      
      if (insertError) return res.status(500).json({ success: false, message: "Erro ao forçar criação do perfil: " + insertError.message });
      return res.json({ success: true, message: "Perfil criado e atualizado." });
    }
    
    if (updateError) return res.status(500).json({ success: false, message: updateError.message });
    return res.json({ success: true });
  });

  app.post("/api/admin/users/create", verifyAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: "Supabase Admin not configured" });
    
    const { email, password, isAdmin, isVip, vipUntil } = req.body;
    
    // Create user in auth.users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        is_admin: isAdmin,
        is_vip: isVip,
        vip_until: vipUntil
      }
    });
    
    if (authError) return res.status(400).json({ success: false, message: authError.message });
    
    // The trigger will create the profile, but we need to update it with admin/vip status
    if (authData.user) {
      // Wait a moment for the trigger to run (if it exists)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Use upsert to create or update the profile
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id: authData.user.id,
        username: email.split('@')[0],
        is_admin: isAdmin,
        is_vip: isVip,
        vip_until: vipUntil
      }, { onConflict: 'id' });
      
      if (profileError) {
        console.error("Error upserting profile:", profileError);
        return res.status(500).json({ success: false, message: "Erro ao criar perfil. Verifique as tabelas do banco de dados.", error: profileError.message });
      }
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
