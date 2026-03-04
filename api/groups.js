// api/groups.js - Lista grupos do usuário
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let client;
  try {
    const { apiId, apiHash, sessionString } = req.body || {};

    if (!apiId || !apiHash || !sessionString) {
      return res.status(400).json({ error: "apiId, apiHash e sessionString são obrigatórios" });
    }

    client = new TelegramClient(
      new StringSession(sessionString),
      parseInt(apiId),
      apiHash,
      { connectionRetries: 3, retryDelay: 1000, autoReconnect: false }
    );

    await client.connect();

    const dialogs = await client.getDialogs({ limit: 200 });

    const groups = dialogs
      .filter(d => d.isGroup || d.isChannel)
      .map(d => ({
        id: d.id?.toString(),
        title: d.title || "(sem nome)",
        type: d.isChannel ? "channel" : "group",
        membersCount: d.entity?.participantsCount || 0,
        username: d.entity?.username || null,
      }));

    await client.disconnect().catch(() => {});
    return res.status(200).json({ success: true, groups });

  } catch (err) {
    console.error("[groups] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno no servidor" });
  }
};