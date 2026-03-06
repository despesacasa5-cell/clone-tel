// api/messages.js - Encaminha mensagens em batch (frontend controla o loop)
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
      offsetId = 0,      // para histórico: ID a partir do qual buscar (paginação)
      onlyNew = false,   // true = busca apenas mensagens APÓS minId
      minId = 0,         // para onlyNew: só mensagens com id > minId
      dryRun = false,    // true = só lê mensagens, não encaminha (usado para baseline)
    } = req.body || {};

    if (!apiId || !apiHash || !sessionString || !sourceGroupId || !targetGroupId)
      return res.status(400).json({ error: "Campos obrigatórios faltando." });

    client = new TelegramClient(
      new StringSession(sessionString),
      parseInt(apiId), apiHash,
      { connectionRetries: 3, retryDelay: 1000, autoReconnect: false }
    );

    await client.connect();

    const sourceEntity = await client.getEntity(sourceGroupId);
    const targetEntity = await client.getEntity(targetGroupId);

    // ── Busca as mensagens ─────────────────────────────────────────────────
    // Para histórico completo: offsetId avança do mais antigo para o mais novo
    // Para apenas novas:       minId filtra só as mais recentes que o último ID visto
    const fetchOptions = {
      limit: Math.min(parseInt(batchSize), 50),
      reverse: true, // do mais antigo para o mais novo
    };

    if (onlyNew) {
      // minId faz o Telegram retornar só mensagens com id MAIOR que minId
      fetchOptions.minId = parseInt(minId) || 0;
    } else {
      // offsetId faz o Telegram pular as mensagens já processadas
      if (parseInt(offsetId) > 0) {
        fetchOptions.minId = parseInt(offsetId); // usar minId aqui também para paginação crescente
      }
    }

    const messages = await client.getMessages(sourceEntity, fetchOptions);

    const results = { total: messages.length, forwarded: 0, skipped: 0, errors: [] };
    let lastProcessedId = parseInt(offsetId) || parseInt(minId) || 0;

    for (const msg of messages) {
      if (!msg.id || !msg.message && !msg.media) {
        // Pula mensagens de serviço (entrou no grupo, saiu, etc.)
        results.skipped++;
        continue;
      }
      lastProcessedId = msg.id;

      // dryRun: apenas registra o ID, não encaminha
      if (dryRun) { lastProcessedId = msg.id; continue; }

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

    // hasMore: true se provavelmente há mais mensagens antigas para buscar
    const hasMore = !onlyNew && messages.length === parseInt(batchSize);

    await client.disconnect().catch(() => {});
    return res.status(200).json({
      success: true,
      results,
      lastProcessedId, // frontend usa para próximo offsetId / novo minId
      hasMore,
    });

  } catch (err) {
    console.error("[messages] Erro:", err);
    if (client) await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
};