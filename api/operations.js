// api/operations.js - CRUD de operações no MongoDB
const { getDb } = require("./db");
const { ObjectId } = require("mongodb");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body || {};
  const db = await getDb();
  const col = db.collection("operations");

  try {
    // ── Criar operação ────────────────────────────────────────────────────
    if (action === "create") {
      const { type, label, sourceGroup, targetGroup, params } = req.body;
      const doc = {
        type, label, sourceGroup, targetGroup,
        status: "running",
        stats: { ok: 0, skip: 0, err: 0, total: 0, progress: 0 },
        params: { ...params, sessionString: undefined }, // não salva session no params
        log: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const r = await col.insertOne(doc);
      return res.status(200).json({ success: true, opId: r.insertedId.toString() });
    }

    // ── Atualizar stats ───────────────────────────────────────────────────
    if (action === "update") {
      const { opId, status, stats, log } = req.body;
      await col.updateOne(
        { _id: new ObjectId(opId) },
        { $set: { status, stats, log, updatedAt: new Date() } }
      );
      return res.status(200).json({ success: true });
    }

    // ── Listar operações ──────────────────────────────────────────────────
    if (action === "list") {
      const ops = await col.find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .project({ "params.sessionString": 0 })
        .toArray();
      return res.status(200).json({ success: true, operations: ops });
    }

    // ── Deletar finalizadas ───────────────────────────────────────────────
    if (action === "clearFinished") {
      await col.deleteMany({ status: { $in: ["done", "cancelled", "error"] } });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Action inválida." });

  } catch (err) {
    console.error("[operations] Erro:", err);
    return res.status(500).json({ error: err.message });
  }
};