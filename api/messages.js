// api/messages.js - Clona mensagens de um grupo para outro
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
      apiId,
      apiHash,
      sessionString,
      sourceGroupId,
      targetGroupId,
      limit = 100,
      delayMs = 1500,
      offsetId = 0,
    } = req.body || {};

    if (!apiId || !apiHash || !sessionString || !sourceGroupId || !targetGroupId) {
      return res.status(400).json({ error: "Campos obrigatórios faltando." });
    }

    client = new TelegramClient(
      new StringSession(sessionString),
      parseInt(apiId),
      apiHash,
      { connectionRetries: 3, retryDelay: 1000, autoReconnect: false }
    );

    await client.connect();

    const sourceEntity = await client.getEntity(sourceGroupId);
    const targetEntity = await client.getEntity(targetGroupId);

    // Busca mensagens do grupo origem
    const messages = await client.getMessages(sourceEntity, {
      limit: Math.min(parseInt(limit), 200),
      offsetId: parseInt(offsetId),
      reverse: true,
    });

    const results = { total: messages.length, forwarded: 0, skipped: 0, errors: [] };

    for (const msg of messages) {
      if (!msg.id) { results.skipped++; continue; }

      try {
        await client.forwardMessages(targetEntity, {
          messages: [msg.id],
          fromPeer: sourceEntity,
        });
        results.forwarded++;
      } catch (err) {
        const errMsg = err.errorMessage || err.message || "erro";
        if (errMsg.includes("FLOOD_WAIT")) {
          const waitSec = parseInt(errMsg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "30");
          results.errors.push({ msgId: msg.id, error: `FloodWait ${waitSec}s` });
          await sleep(waitSec * 1000 + 2000);
        } else if (errMsg.includes("CHAT_FORWARD_RESTRICTED")) {
          results.skipped++;
        } else {
          results.errors.push({ msgId: msg.id, error: errMsg });
        }
      }

      await sleep(parseInt(delayMs));
    }

    // Retorna o ID da última mensagem para paginação
    const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;

    await client.disconnect().catch(() => {});
    return res.status(200).json({ success: true, results, lastId });

  } catch (err) {
    console.error("[messages] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};