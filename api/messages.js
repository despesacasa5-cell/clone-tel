// api/messages.js - Encaminha mensagens em batch
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    apiId, apiHash, sessionString,
    sourceGroupId, targetGroupId,
    batchSize = 20,
    delayMs = 1500,
    offsetId = 0,
    onlyNew = false,
    minId = 0,
    dryRun = false,
  } = req.body || {};

  if (!apiId || !apiHash || !sessionString || !sourceGroupId || !targetGroupId)
    return res.status(400).json({ error: "Campos obrigatórios faltando." });

  const client = new TelegramClient(
    new StringSession(sessionString),
    parseInt(apiId), apiHash,
    { connectionRetries: 5, retryDelay: 1000 }
  );

  try {
    await client.connect();

    let sourceEntity, targetEntity;
    try {
      sourceEntity = await client.getEntity(sourceGroupId);
    } catch(e) {
      return res.status(500).json({ error: `Grupo de origem não encontrado (${sourceGroupId}): ${e.message}` });
    }
    try {
      targetEntity = await client.getEntity(targetGroupId);
    } catch(e) {
      return res.status(500).json({ error: `Grupo de destino não encontrado (${targetGroupId}): ${e.message}` });
    }

    const fetchOptions = {
      limit: Math.min(parseInt(batchSize), 50),
      reverse: true,
    };

    if (onlyNew) {
      fetchOptions.minId = parseInt(minId) || 0;
    } else if (parseInt(offsetId) > 0) {
      fetchOptions.minId = parseInt(offsetId);
    }

    const messages = await client.getMessages(sourceEntity, fetchOptions);

    const results = { total: messages.length, forwarded: 0, skipped: 0, errors: [] };
    let lastProcessedId = parseInt(offsetId) || parseInt(minId) || 0;

    for (const msg of messages) {
      if (!msg.id) { results.skipped++; continue; }
      if (!msg.message && !msg.media) { results.skipped++; continue; }

      lastProcessedId = msg.id;
      if (dryRun) continue;

      try {
        await client.forwardMessages(targetEntity, {
          messages: [msg.id],
          fromPeer: sourceEntity,
          dropAuthor: false,
        });
        results.forwarded++;
      } catch (err) {
        const m = err.errorMessage || err.message || "erro";
        if (m.includes("FLOOD_WAIT")) {
          const w = parseInt(m.match(/FLOOD_WAIT_(\d+)/)?.[1] || "30");
          results.errors.push({ msgId: msg.id, error: `FloodWait ${w}s` });
          await sleep(w * 1000 + 2000);
        } else if (m.includes("CHAT_FORWARD_RESTRICTED") || m.includes("FORWARDS_RESTRICTED")) {
          results.skipped++;
        } else {
          results.errors.push({ msgId: msg.id, error: m });
        }
      }
      await sleep(parseInt(delayMs));
    }

    const hasMore = !onlyNew && messages.length === Math.min(parseInt(batchSize), 50);

    await client.disconnect().catch(() => {});
    return res.status(200).json({ success: true, results, lastProcessedId, hasMore });

  } catch (err) {
    console.error("[messages] Erro:", err.message);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};