// api/clone.js - Clona membros de um grupo para outro
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");

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
    limit = 50,
    delayMs = 3000,
    offset = 0,
  } = req.body || {};

  if (!apiId || !apiHash || !sessionString || !sourceGroupId || !targetGroupId) {
    return res.status(400).json({ error: "Campos obrigatórios faltando." });
  }

  const client = new TelegramClient(
    new StringSession(sessionString),
    parseInt(apiId), apiHash,
    { connectionRetries: 5, retryDelay: 1000 }
  );

  try {
    await client.connect();

    // getEntity aceita string "-100XXXXXXXXXX" para canais/supergrupos
    // e string "-XXXXXXXXXX" para grupos normais
    let sourceEntity, targetEntity;
    try {
      sourceEntity = await client.getEntity(sourceGroupId);
    } catch(e) {
      return res.status(500).json({ error: `Não foi possível encontrar grupo de origem (${sourceGroupId}): ${e.message}` });
    }
    try {
      targetEntity = await client.getEntity(targetGroupId);
    } catch(e) {
      return res.status(500).json({ error: `Não foi possível encontrar grupo de destino (${targetGroupId}): ${e.message}` });
    }

    const participants = await client.getParticipants(sourceEntity, {
      limit: Math.min(parseInt(limit), 200),
      offset: parseInt(offset),
    });

    const results = { total: participants.length, added: 0, skipped: 0, errors: [] };

    for (const user of participants) {
      if (user.bot || user.deleted) { results.skipped++; continue; }
      try {
        await client.invoke(new Api.channels.InviteToChannel({
          channel: targetEntity,
          users: [user],
        }));
        results.added++;
      } catch (err) {
        const msg = err.errorMessage || err.message || "erro";
        if (
          msg.includes("USER_ALREADY_PARTICIPANT") ||
          msg.includes("USER_NOT_MUTUAL_CONTACT") ||
          msg.includes("INPUT_USER_DEACTIVATED") ||
          msg.includes("USER_PRIVACY_RESTRICTED") ||
          msg.includes("PEER_FLOOD")
        ) {
          results.skipped++;
        } else if (msg.includes("FLOOD_WAIT")) {
          const w = parseInt(msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "60");
          results.errors.push({ userId: user.id?.toString(), error: `FloodWait ${w}s` });
          await sleep(w * 1000 + 2000);
        } else {
          results.errors.push({ userId: user.id?.toString(), error: msg });
        }
      }
      await sleep(parseInt(delayMs));
    }

    const nextOffset = parseInt(offset) + participants.length;
    const hasMore = participants.length === Math.min(parseInt(limit), 200);

    await client.disconnect().catch(() => {});
    return res.status(200).json({ success: true, results, nextOffset, hasMore });

  } catch (err) {
    console.error("[clone] Erro:", err.message);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};