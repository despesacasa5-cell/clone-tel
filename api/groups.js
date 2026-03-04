// api/groups.js - Lista grupos do usuário
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { apiId, apiHash, sessionString } = req.body;

  if (!apiId || !apiHash || !sessionString) {
    return res.status(400).json({ error: "apiId, apiHash e sessionString são obrigatórios" });
  }

  const client = new TelegramClient(
    new StringSession(sessionString),
    parseInt(apiId),
    apiHash,
    { connectionRetries: 3 }
  );

  try {
    await client.connect();

    const dialogs = await client.getDialogs({ limit: 200 });

    const groups = dialogs
      .filter(d => d.isGroup || d.isChannel)
      .map(d => ({
        id: d.id?.toString(),
        title: d.title,
        type: d.isChannel ? "channel" : "group",
        membersCount: d.entity?.participantsCount || 0,
        username: d.entity?.username || null,
        accessHash: d.entity?.accessHash?.toString() || null,
      }));

    await client.disconnect();
    return res.json({ success: true, groups });

  } catch (err) {
    console.error("[groups] Erro:", err.message);
    await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message });
  }
};