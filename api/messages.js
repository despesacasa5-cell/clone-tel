// api/messages.js - Encaminha um BATCH de mensagens (frontend controla o loop)
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

  let client;
  try {
    const {
      apiId, apiHash, sessionString,
      sourceGroupId, targetGroupId,
      batchSize = 20,
      delayMs = 1500,
      offsetId = 0,
      onlyNew = false,
      lastKnownId = 0,
    } = req.body || {};

    if (!apiId || !apiHash || !sessionString || !sourceGroupId || !targetGroupId) {
      return res.status(400).json({ error: "Campos obrigatórios faltando." });
    }

    client = new TelegramClient(
      new StringSession(sessionString),
      parseInt(apiId), apiHash,
      { connectionRetries: 3, retryDelay: 1000, autoReconnect: false }
    );

    await client.connect();

    const sourceEntity = await client.getEntity(sourceGroupId);
    const targetEntity = await client.getEntity(targetGroupId);

    const fetchOptions = { limit: Math.min(parseInt(batchSize), 50), reverse: true };

    if (onlyNew && lastKnownId) {
      fetchOptions.minId = parseInt(lastKnownId);
    } else if (offsetId) {
      fetchOptions.offsetId = parseInt(offsetId);
    }

    const messages = await client.getMessages(sourceEntity, fetchOptions);
    const results = { total: messages.length, forwarded: 0, skipped: 0, errors: [] };
    let lastProcessedId = parseInt(offsetId) || 0;

    for (const msg of messages) {
      if (!msg.id) { results.skipped++; continue; }
      lastProcessedId = msg.id;

      try {
        await client.forwardMessages(targetEntity, { messages: [msg.id], fromPeer: sourceEntity });
        results.forwarded++;
      } catch (err) {
        const m = err.errorMessage || err.message || "erro";
        if (m.includes("FLOOD_WAIT")) {
          const w = parseInt(m.match(/FLOOD_WAIT_(\d+)/)?.[1] || "30");
          results.errors.push({ msgId: msg.id, error: `FloodWait ${w}s` });
          await sleep(w * 1000 + 2000);
        } else if (m.includes("CHAT_FORWARD_RESTRICTED")) {
          results.skipped++;
        } else {
          results.errors.push({ msgId: msg.id, error: m });
        }
      }

      await sleep(parseInt(delayMs));
    }

    const hasMore = messages.length === parseInt(batchSize);
    await client.disconnect().catch(() => {});
    return res.status(200).json({ success: true, results, lastProcessedId, hasMore });

  } catch (err) {
    console.error("[messages] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};