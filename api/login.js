// api/login.js - Autenticação do painel web
const { getDb } = require("./db");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password } = req.body || {};
  const SITE_PASSWORD = process.env.SITE_PASSWORD || "admin123";
  if (!password) return res.status(400).json({ error: "Senha obrigatória." });
  if (password !== SITE_PASSWORD) return res.status(401).json({ error: "Senha incorreta." });

  // Salva log de acesso no MongoDB
  try {
    const db = await getDb();
    await db.collection("logs").insertOne({
      type: "login",
      ip: req.headers["x-forwarded-for"] || "unknown",
      at: new Date(),
    });
  } catch (_) {}

  const token = Buffer.from(`${SITE_PASSWORD}:${Math.floor(Date.now() / 3600000)}`).toString("base64");
  return res.status(200).json({ success: true, token });
};