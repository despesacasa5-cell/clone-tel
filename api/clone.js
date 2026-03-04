// api/clone.js - Clona membros de um grupo para outro
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");

// Helper: aguarda X ms
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    apiId,
    apiHash,
    sessionString,
    sourceGroupId,
    targetGroupId,
    limit = 50,
    delayMs = 3000,
  } = req.body;

  if (!apiId || !apiHash || !sessionString || !sourceGroupId || !targetGroupId) {
    return res.status(400).json({
      error: "apiId, apiHash, sessionString, sourceGroupId e targetGroupId são obrigatórios",
    });
  }

  const client = new TelegramClient(
    new StringSession(sessionString),
    parseInt(apiId),
    apiHash,
    { connectionRetries: 3 }
  );

  try {
    await client.connect();

    // Resolve entidades
    const sourceEntity = await client.getEntity(sourceGroupId);
    const targetEntity = await client.getEntity(targetGroupId);

    // Busca participantes do grupo de origem
    const participants = await client.getParticipants(sourceEntity, {
      limit: Math.min(parseInt(limit), 200),
    });

    const results = {
      total: participants.length,
      added: 0,
      skipped: 0,
      errors: [],
    };

    for (const user of participants) {
      // Pula bots e usuários sem username/acesso
      if (user.bot || user.deleted) {
        results.skipped++;
        continue;
      }

      try {
        await client.invoke(
          new Api.channels.InviteToChannel({
            channel: targetEntity,
            users: [user],
          })
        );
        results.added++;
      } catch (err) {
        const msg = err.errorMessage || err.message || "erro desconhecido";

        // Erros esperados que não devem parar o processo
        if (
          msg.includes("USER_ALREADY_PARTICIPANT") ||
          msg.includes("USER_NOT_MUTUAL_CONTACT") ||
          msg.includes("INPUT_USER_DEACTIVATED")
        ) {
          results.skipped++;
        } else if (msg.includes("FLOOD_WAIT")) {
          // Extrai segundos de espera do Telegram
          const waitSec = parseInt(msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "60");
          results.errors.push({ userId: user.id?.toString(), error: `FloodWait ${waitSec}s` });
          await sleep(waitSec * 1000 + 2000);
        } else {
          results.errors.push({ userId: user.id?.toString(), error: msg });
        }
      }

      // Delay entre cada adição para evitar flood
      await sleep(parseInt(delayMs));
    }

    await client.disconnect();
    return res.json({ success: true, results });

  } catch (err) {
    console.error("[clone] Erro:", err.message);
    await client.disconnect().catch(() => {});
    return res.status(500).json({ error: err.message });
  }
};