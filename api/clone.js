// api/clone.js - Adiciona um BATCH de membros (frontend controla o loop)
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

  let client;
  try {
    const {
      apiId, apiHash, sessionString,
      sourceGroupId, targetGroupId,
      batchSize = 20,
      delayMs = 3000,
      offset = 0,       // índice de onde continuar na lista de membros
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

    // Resolve entities — normalise IDs (strip leading '-100' for channels/supergroups)
    const resolveEntity = async (id) => {
      const s = String(id);
      // Try as-is first
      try { return await client.getEntity(s); } catch (_) {}
      // Try as integer
      try { return await client.getEntity(parseInt(s)); } catch (_) {}
      // Try stripping -100 prefix (supergroup/channel)
      if (s.startsWith('-100')) {
        try { return await client.getEntity(parseInt(s.slice(4))); } catch (_) {}
      }
      // Try as negative int
      try { return await client.getEntity(-Math.abs(parseInt(s))); } catch (_) {}
      throw new Error(`Não foi possível resolver o grupo: ${id}`);
    };

    const sourceEntity = await resolveEntity(sourceGroupId);
    const targetEntity = await resolveEntity(targetGroupId);

    const participants = await client.getParticipants(sourceEntity, {
      limit: Math.min(parseInt(batchSize), 50),
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
        const m = err.errorMessage || err.message || "erro";
        if (m.includes("USER_ALREADY_PARTICIPANT") || m.includes("USER_NOT_MUTUAL_CONTACT") || m.includes("INPUT_USER_DEACTIVATED")) {
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
    const hasMore = participants.length === parseInt(batchSize);

    await client.disconnect().catch(() => {});
    return res.status(200).json({ success: true, results, nextOffset, hasMore });

  } catch (err) {
    console.error("[clone] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};