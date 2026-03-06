// api/clone.js - Clona membros de um grupo para outro
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Monta o InputPeer correto usando id + accessHash que vêm do groups.js
function buildInputPeer(group) {
  const id = parseInt(group.id);
  const hash = BigInt(group.accessHash || "0");

  if (group.isChannel || group.type === "channel") {
    return new Api.InputPeerChannel({ channelId: id, accessHash: hash });
  }
  // Grupo normal (chat)
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
      sourceGroup, targetGroup,   // objetos completos {id, accessHash, type, isChannel}
      batchSize = 50,
      delayMs = 3000,
      offset = 0,
    } = req.body || {};

    if (!apiId || !apiHash || !sessionString || !sourceGroup || !targetGroup)
      return res.status(400).json({ error: "Campos obrigatórios faltando." });

    client = new TelegramClient(new StringSession(sessionString), parseInt(apiId), apiHash,
      { connectionRetries: 3, retryDelay: 1000, autoReconnect: false });
    await client.connect();

    const sourcePeer = buildInputPeer(sourceGroup);
    const targetPeer = buildInputPeer(targetGroup);

    const participants = await client.getParticipants(sourcePeer, {
      limit: Math.min(parseInt(batchSize), 50),
      offset: parseInt(offset),
    });

    const results = { total: participants.length, added: 0, skipped: 0, errors: [] };

    for (const user of participants) {
      if (user.bot || user.deleted) { results.skipped++; continue; }
      try {
        await client.invoke(new Api.channels.InviteToChannel({
          channel: targetPeer,
          users: [user],
        }));
        results.added++;
      } catch (err) {
        const m = err.errorMessage || err.message || "erro";
        if (m.includes("USER_ALREADY_PARTICIPANT") || m.includes("USER_NOT_MUTUAL_CONTACT") || m.includes("INPUT_USER_DEACTIVATED") || m.includes("USER_PRIVACY_RESTRICTED")) {
          results.skipped++;
        } else if (m.includes("FLOOD_WAIT")) {
          const w = parseInt(m.match(/FLOOD_WAIT_(\d+)/)?.[1] || "60");
          results.errors.push({ userId: user.id?.toString(), error: `FloodWait ${w}s` });
          await sleep(w * 1000 + 2000);
        } else {
          results.errors.push({ userId: user.id?.toString(), error: m });
        }
      }
      await sleep(parseInt(delayMs));
    }

    const nextOffset = parseInt(offset) + participants.length;
    const hasMore = participants.length === Math.min(parseInt(batchSize), 50);

    await client.disconnect().catch(() => {});
    return res.status(200).json({ success: true, results, nextOffset, hasMore });

  } catch (err) {
    console.error("[clone] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};