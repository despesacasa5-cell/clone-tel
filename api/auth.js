// api/auth.js - Autenticação Telegram via MTProto (GramJS)
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

// Armazena sessões temporárias em memória (por sessionId)
// Nota: em serverless cada invocação pode ser uma instância diferente.
// Para produção real, use Redis ou KV store. Para uso pessoal, funciona ok.
const pendingSessions = new Map();

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

    // ── STEP 1: Enviar código SMS ──────────────────────────────────────────
    if (action === "sendCode") {
      if (!apiId || !apiHash || !phone) {
        return res.status(400).json({ error: "apiId, apiHash e phone são obrigatórios" });
      }

      client = new TelegramClient(
        new StringSession(""),
        parseInt(apiId),
        apiHash,
        {
          connectionRetries: 3,
          retryDelay: 1000,
          autoReconnect: false,
          baseLogger: { levels: [], log: () => {} },
        }
      );

      await client.connect();

      const result = await client.sendCode(
        { apiId: parseInt(apiId), apiHash },
        phone
      );

      const sid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingSessions.set(sid, {
        client,
        phoneCodeHash: result.phoneCodeHash,
        phone,
        apiId,
        apiHash,
      });

      setTimeout(() => {
        const s = pendingSessions.get(sid);
        if (s) { s.client.disconnect().catch(() => {}); pendingSessions.delete(sid); }
      }, 600000);

      return res.status(200).json({ success: true, sessionId: sid, message: "Código enviado para " + phone });
    }

    // ── STEP 2: Verificar código ───────────────────────────────────────────
    if (action === "verifyCode") {
      if (!sessionId || !code) {
        return res.status(400).json({ error: "sessionId e code são obrigatórios" });
      }

      const pending = pendingSessions.get(sessionId);
      if (!pending) {
        return res.status(404).json({
          error: "Sessão não encontrada. Isso pode ocorrer em ambientes serverless — tente reenviar o código.",
        });
      }

      const { phoneCodeHash, phone } = pending;
      client = pending.client;

      try {
        await client.invoke(
          new (require("telegram/tl").Api.auth.SignIn)({
            phoneNumber: phone,
            phoneCodeHash,
            phoneCode: code.trim(),
          })
        );
      } catch (err) {
        if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
          return res.status(200).json({
            success: true,
            requires2FA: true,
            sessionId,
            message: "2FA necessário",
          });
        }
        throw err;
      }

      const sessionString = client.session.save();
      await client.disconnect().catch(() => {});
      pendingSessions.delete(sessionId);

      return res.status(200).json({ success: true, session: sessionString, message: "Autenticado com sucesso!" });
    }

    // ── STEP 3: 2FA ───────────────────────────────────────────────────────
    if (action === "verify2FA") {
      if (!sessionId || !password) {
        return res.status(400).json({ error: "sessionId e password são obrigatórios" });
      }

      const pending = pendingSessions.get(sessionId);
      if (!pending) {
        return res.status(404).json({ error: "Sessão não encontrada ou expirada." });
      }

      client = pending.client;

      await client.signInWithPassword(
        { apiId: parseInt(pending.apiId), apiHash: pending.apiHash },
        {
          password: async () => password,
          onError: (err) => { throw err; },
        }
      );

      const sessionString = client.session.save();
      await client.disconnect().catch(() => {});
      pendingSessions.delete(sessionId);

      return res.status(200).json({ success: true, session: sessionString, message: "Autenticado com 2FA!" });
    }

    return res.status(400).json({ error: "Action inválida. Use: sendCode, verifyCode, verify2FA" });

  } catch (err) {
    console.error("[auth] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno no servidor" });
  }
};