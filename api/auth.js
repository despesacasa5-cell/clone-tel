// api/auth.js - Autenticação Telegram via MTProto (GramJS)
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

// Armazena sessões temporárias em memória (por requestId)
const pendingSessions = new Map();

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, apiId, apiHash, phone, code, password, sessionId } = req.body;

  try {
    // ── STEP 1: Iniciar sessão e enviar código ──────────────────────────
    if (action === "sendCode") {
      if (!apiId || !apiHash || !phone) {
        return res.status(400).json({ error: "apiId, apiHash e phone são obrigatórios" });
      }

      const session = new StringSession("");
      const client = new TelegramClient(session, parseInt(apiId), apiHash, {
        connectionRetries: 3,
        timeout: 30000,
      });

      await client.connect();

      const result = await client.sendCode(
        { apiId: parseInt(apiId), apiHash },
        phone
      );

      const sid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingSessions.set(sid, { client, phoneCodeHash: result.phoneCodeHash, phone, apiId, apiHash });

      // Limpa sessão antiga após 10 min
      setTimeout(() => pendingSessions.delete(sid), 600000);

      return res.json({ success: true, sessionId: sid, message: "Código enviado para " + phone });
    }

    // ── STEP 2: Verificar código ────────────────────────────────────────
    if (action === "verifyCode") {
      if (!sessionId || !code) {
        return res.status(400).json({ error: "sessionId e code são obrigatórios" });
      }

      const pending = pendingSessions.get(sessionId);
      if (!pending) return res.status(404).json({ error: "Sessão não encontrada ou expirada" });

      const { client, phoneCodeHash, phone } = pending;

      try {
        await client.invoke(
          new (require("telegram/tl").Api.auth.SignIn)({
            phoneNumber: phone,
            phoneCodeHash,
            phoneCode: code,
          })
        );
      } catch (err) {
        if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
          return res.json({ success: true, requires2FA: true, sessionId, message: "2FA necessário" });
        }
        throw err;
      }

      const sessionString = client.session.save();
      await client.disconnect();
      pendingSessions.delete(sessionId);

      return res.json({ success: true, session: sessionString, message: "Autenticado com sucesso!" });
    }

    // ── STEP 3: 2FA Password ────────────────────────────────────────────
    if (action === "verify2FA") {
      if (!sessionId || !password) {
        return res.status(400).json({ error: "sessionId e password são obrigatórios" });
      }

      const pending = pendingSessions.get(sessionId);
      if (!pending) return res.status(404).json({ error: "Sessão não encontrada ou expirada" });

      const { client } = pending;

      await client.signInWithPassword(
        { apiId: parseInt(pending.apiId), apiHash: pending.apiHash },
        { password: async () => password, onError: (err) => { throw err; } }
      );

      const sessionString = client.session.save();
      await client.disconnect();
      pendingSessions.delete(sessionId);

      return res.json({ success: true, session: sessionString, message: "Autenticado com 2FA!" });
    }

    return res.status(400).json({ error: "Action inválida" });

  } catch (err) {
    console.error("[auth] Erro:", err.message);
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};