// api/messages.js - Encaminha mensagens em batch
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildInputPeer(group) {
  const id = parseInt(group.id);
  const hash = BigInt(group.accessHash || "0");
  if (group.isChannel || group.type === "channel") {
    return new Api.InputPeerChannel({ channelId: id, accessHash: hash });
  }
  return new Api.InputPeerChat({ chatId: id });
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
    const {
      apiId, apiHash, sessionString,
      sourceGroup, targetGroup,   // objetos completos com id + accessHash
      batchSize = 20,
      delayMs = 1500,
      offsetId = 0,
      onlyNew = false,
      minId = 0,
      dryRun = false,
    } = req.body || {};

    if (!apiId || !apiHash || !sessionString || !sourceGroup || !targetGroup)
      return res.status(400).json({ error: "Campos obrigatórios faltando." });

    client = new TelegramClient(new StringSession(sessionString), parseInt(apiId), apiHash,
      { connectionRetries: 3, retryDelay: 1000, autoReconnect: false });
    await client.connect();

    const sourcePeer = buildInputPeer(sourceGroup);
    const targetPeer = buildInputPeer(targetGroup);

    const fetchOptions = {
      limit: Math.min(parseInt(batchSize), 50),
      reverse: true,
    };

    if (onlyNew) {
      fetchOptions.minId = parseInt(minId) || 0;
    } else if (parseInt(offsetId) > 0) {
      fetchOptions.minId = parseInt(offsetId);
    }

    const messages = await client.getMessages(sourcePeer, fetchOptions);

    const results = { total: messages.length, forwarded: 0, skipped: 0, errors: [] };
    let lastProcessedId = parseInt(offsetId) || parseInt(minId) || 0;

    for (const msg of messages) {
      if (!msg.id) { results.skipped++; continue; }
      // Pula mensagens de serviço (sem texto e sem mídia)
      if (!msg.message && !msg.media) { results.skipped++; continue; }

      lastProcessedId = msg.id;
      if (dryRun) continue; // só registra o ID, não encaminha

      try {
        await client.forwardMessages(targetPeer, {
          messages: [msg.id],
          fromPeer: sourcePeer,
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
    console.error("[messages] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};