import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const USERS_FILE = path.join(process.cwd(), "users.json");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Initialize users file if it doesn't exist (fallback)
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([
    {
      id: "admin",
      username: "admin",
      password: "admin",
      isAdmin: true,
      isVip: true,
      vipDays: 9999,
      createdAt: new Date().toISOString()
    }
  ]));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/users", async (req, res) => {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*');
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    res.json(users);
  });

  app.post("/api/users/update-vip", async (req, res) => {
    const { userId, days, isVip } = req.body;
    const createdAt = new Date().toISOString();

    if (supabase) {
      const updateData: any = { createdAt };
      if (isVip !== undefined) updateData.isVip = isVip;
      else updateData.isVip = true;
      if (days !== undefined) updateData.vipDays = days;

      const { error } = await supabase.from('users').update(updateData).eq('id', userId);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.json({ success: true });
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const userIndex = users.findIndex((u: any) => u.id === userId);

    if (userIndex !== -1) {
      if (isVip !== undefined) users[userIndex].isVip = isVip;
      else users[userIndex].isVip = true;
      if (days !== undefined) users[userIndex].vipDays = days;
      
      users[userIndex].createdAt = createdAt;
      fs.writeFileSync(USERS_FILE, JSON.stringify(users));
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: "Usuário não encontrado" });
    }
  });

  app.post("/api/users/login", async (req, res) => {
    const { username, password } = req.body;

    if (supabase) {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();
        
      if (error || !user) {
        return res.status(401).json({ success: false, message: "Usuário ou senha incorretos" });
      }
      return res.json({ success: true, user });
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const user = users.find((u: any) => u.username === username && u.password === password);
    
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: "Usuário ou senha incorretos" });
    }
  });

  app.post("/api/users/create", async (req, res) => {
    const { username, password, isAdmin, isVip, vipDays } = req.body;
    const newUser = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      password,
      isAdmin: !!isAdmin,
      isVip: !!isVip,
      vipDays: parseInt(vipDays) || 0,
      createdAt: new Date().toISOString()
    };

    if (supabase) {
      // Check if user exists
      const { data: existing } = await supabase.from('users').select('id').eq('username', username).single();
      if (existing) return res.status(400).json({ success: false, message: "Usuário já cadastrado" });

      const { error } = await supabase.from('users').insert([newUser]);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.json({ success: true, user: newUser });
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    if (users.find((u: any) => u.username === username)) {
      return res.status(400).json({ success: false, message: "Usuário já cadastrado" });
    }

    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
    res.json({ success: true, user: newUser });
  });

  app.post("/api/users/reset-password", async (req, res) => {
    const { userId, newPassword } = req.body;

    if (supabase) {
      const { error } = await supabase.from('users').update({ password: newPassword }).eq('id', userId);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.json({ success: true });
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const userIndex = users.findIndex((u: any) => u.id === userId);

    if (userIndex !== -1) {
      users[userIndex].password = newPassword;
      fs.writeFileSync(USERS_FILE, JSON.stringify(users));
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: "Usuário não encontrado" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    const { id } = req.params;

    if (supabase) {
      const { data: users } = await supabase.from('users').select('*');
      if (!users) return res.status(500).json({ success: false, message: "Erro ao buscar usuários" });
      
      const user = users.find((u: any) => u.id === id);
      if (user && user.isAdmin && users.filter((u: any) => u.isAdmin).length <= 1) {
        return res.status(400).json({ success: false, message: "Não é possível excluir o único administrador" });
      }

      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.json({ success: true });
    }

    let users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const user = users.find((u: any) => u.id === id);

    if (user && user.isAdmin && users.filter((u: any) => u.isAdmin).length <= 1) {
      return res.status(400).json({ success: false, message: "Não é possível excluir o único administrador" });
    }

    users = users.filter((u: any) => u.id !== id);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
    res.json({ success: true });
  });

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
