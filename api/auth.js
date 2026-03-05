// api/auth.js - Autenticação Telegram via MTProto (GramJS) + MongoDB
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { getDb } = require("./db");

const pendingSessions = new Map();

function makeClient(apiId, apiHash, sessionStr = "") {
  return new TelegramClient(
    new StringSession(sessionStr),
    parseInt(apiId), apiHash,
    { connectionRetries: 3, retryDelay: 1000, autoReconnect: false }
  );
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let client;
  try {
    const { action, apiId, apiHash, phone, code, password, sessionId } = req.body || {};

    // ── STEP 1: Enviar código ──────────────────────────────────────────────
    if (action === "sendCode") {
      if (!apiId || !apiHash || !phone)
        return res.status(400).json({ error: "apiId, apiHash e phone são obrigatórios" });

      client = makeClient(apiId, apiHash);
      await client.connect();
      const result = await client.sendCode({ apiId: parseInt(apiId), apiHash }, phone);

      const sid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingSessions.set(sid, { client, phoneCodeHash: result.phoneCodeHash, phone, apiId, apiHash });
      setTimeout(() => {
        const s = pendingSessions.get(sid);
        if (s) { s.client.disconnect().catch(() => {}); pendingSessions.delete(sid); }
      }, 600000);

      return res.status(200).json({ success: true, sessionId: sid, message: "Código enviado para " + phone });
    }

    // ── STEP 2: Verificar código ───────────────────────────────────────────
    if (action === "verifyCode") {
      if (!sessionId || !code)
        return res.status(400).json({ error: "sessionId e code são obrigatórios" });

      const pending = pendingSessions.get(sessionId);
      if (!pending)
        return res.status(404).json({ error: "Sessão expirada. Clique em Reiniciar e tente novamente." });

      client = pending.client;
      try {
        await client.invoke(new (require("telegram/tl").Api.auth.SignIn)({
          phoneNumber: pending.phone,
          phoneCodeHash: pending.phoneCodeHash,
          phoneCode: code.trim(),
        }));
      } catch (err) {
        if (err.errorMessage === "SESSION_PASSWORD_NEEDED")
          return res.status(200).json({ success: true, requires2FA: true, sessionId, message: "2FA necessário" });
        throw err;
      }

      const sessionString = client.session.save();
      await client.disconnect().catch(() => {});
      pendingSessions.delete(sessionId);

      // Salva sessão no MongoDB
      await saveSession({ apiId: pending.apiId, apiHash: pending.apiHash, phone: pending.phone, sessionString });

      return res.status(200).json({ success: true, session: sessionString, message: "Autenticado com sucesso!" });
    }

    // ── STEP 3: 2FA ───────────────────────────────────────────────────────
    if (action === "verify2FA") {
      if (!sessionId || !password)
        return res.status(400).json({ error: "sessionId e password são obrigatórios" });

      const pending = pendingSessions.get(sessionId);
      if (!pending) return res.status(404).json({ error: "Sessão não encontrada ou expirada." });

      client = pending.client;
      await client.signInWithPassword(
        { apiId: parseInt(pending.apiId), apiHash: pending.apiHash },
        { password: async () => password, onError: (e) => { throw e; } }
      );

      const sessionString = client.session.save();
      await client.disconnect().catch(() => {});
      pendingSessions.delete(sessionId);

      await saveSession({ apiId: pending.apiId, apiHash: pending.apiHash, phone: pending.phone, sessionString });

      return res.status(200).json({ success: true, session: sessionString, message: "Autenticado com 2FA!" });
    }

    // ── GET SAVED SESSIONS ─────────────────────────────────────────────────
    if (action === "getSessions") {
      const db = await getDb();
      const sessions = await db.collection("sessions")
        .find({}, { projection: { sessionString: 0 } }) // não expõe a string
        .sort({ lastUsedAt: -1 })
        .limit(20)
        .toArray();
      return res.status(200).json({ success: true, sessions });
    }

    // ── LOAD SESSION ───────────────────────────────────────────────────────
    if (action === "loadSession") {
      const { sessionDbId } = req.body;
      const { ObjectId } = require("mongodb");
      const db = await getDb();
      const s = await db.collection("sessions").findOne({ _id: new ObjectId(sessionDbId) });
      if (!s) return res.status(404).json({ error: "Sessão não encontrada." });
      await db.collection("sessions").updateOne({ _id: s._id }, { $set: { lastUsedAt: new Date() } });
      return res.status(200).json({ success: true, session: s.sessionString, apiId: s.apiId, apiHash: s.apiHash, phone: s.phone });
    }

    // ── DELETE SESSION ─────────────────────────────────────────────────────
    if (action === "deleteSession") {
      const { sessionDbId } = req.body;
      const { ObjectId } = require("mongodb");
      const db = await getDb();
      await db.collection("sessions").deleteOne({ _id: new ObjectId(sessionDbId) });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Action inválida." });

  } catch (err) {
    console.error("[auth] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};

async function saveSession({ apiId, apiHash, phone, sessionString }) {
  try {
    const db = await getDb();
    await db.collection("sessions").updateOne(
      { phone },
      { $set: { apiId, apiHash, phone, sessionString, lastUsedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.error("[auth] Erro ao salvar sessão:", e.message);
  }
}