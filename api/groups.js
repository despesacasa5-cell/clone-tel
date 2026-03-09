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

  const { apiId, apiHash, sessionString } = req.body || {};
  if (!apiId || !apiHash || !sessionString)
    return res.status(400).json({ error: "apiId, apiHash e sessionString são obrigatórios" });

  const client = new TelegramClient(
    new StringSession(sessionString),
    parseInt(apiId), apiHash,
    { connectionRetries: 5, retryDelay: 1000 }
  );

  try {
    await client.connect();
    const dialogs = await client.getDialogs({ limit: 200 });

    const groups = dialogs
      .filter(d => d.isGroup || d.isChannel)
      .map(d => {
        const e = d.entity;
        const rawId = e.id?.toString() || d.id?.toString();

        // Para canais e supergrupos, o GramJS usa IDs positivos internamente
        // mas getEntity() precisa do formato -100XXXXXXXXXX (peer completo)
        // Para grupos normais (chat), o ID já é negativo: -XXXXXXXXXX
        let peerId;
        if (d.isChannel) {
          // Canal ou supergrupo: prefixo -100
          peerId = `-100${rawId}`;
        } else {
          // Grupo normal: ID negativo
          peerId = rawId.startsWith('-') ? rawId : `-${rawId}`;
        }

        return {
          id: peerId,             // ID no formato correto para getEntity()
          rawId: rawId,           // ID original sem prefixo (para referência)
          title: d.title || "(sem nome)",
          type: d.isChannel ? "channel" : "group",
          membersCount: e?.participantsCount || 0,
          username: e?.username || null,
        };
      });

    await client.disconnect().catch(() => {});
    return res.status(200).json({ success: true, groups });
  } catch (err) {
    console.error("[groups] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};