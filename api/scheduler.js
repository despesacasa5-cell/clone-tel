// api/scheduler.js - CRUD de agendamentos no MongoDB
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
  const col = db.collection("schedules");

  try {
    // ── Criar agendamento ─────────────────────────────────────────────────
    if (action === "create") {
      const {
        type,           // 'members' | 'messages'
        label,
        sourceGroup,
        targetGroup,
        params,         // config da operação
        schedule,       // { mode: 'once'|'interval'|'daily', runAt?, intervalMinutes?, dailyTime? }
        sessionDbId,    // referência à sessão salva
      } = req.body;

      const doc = {
        type, label, sourceGroup, targetGroup, params, schedule, sessionDbId,
        status: "active",  // active | paused | done
        lastRun: null,
        nextRun: computeNextRun(schedule),
        runCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const r = await col.insertOne(doc);
      return res.status(200).json({ success: true, scheduleId: r.insertedId.toString() });
    }

    // ── Listar agendamentos ───────────────────────────────────────────────
    if (action === "list") {
      const schedules = await col.find({}).sort({ createdAt: -1 }).limit(50).toArray();
      return res.status(200).json({ success: true, schedules });
    }

    // ── Atualizar status ──────────────────────────────────────────────────
    if (action === "updateStatus") {
      const { scheduleId, status } = req.body;
      await col.updateOne(
        { _id: new ObjectId(scheduleId) },
        { $set: { status, updatedAt: new Date() } }
      );
      return res.status(200).json({ success: true });
    }

    // ── Registrar execução ────────────────────────────────────────────────
    if (action === "markRun") {
      const { scheduleId } = req.body;
      const sched = await col.findOne({ _id: new ObjectId(scheduleId) });
      if (!sched) return res.status(404).json({ error: "Agendamento não encontrado." });

      const nextRun = computeNextRun(sched.schedule, sched.schedule.mode === "once");
      const newStatus = sched.schedule.mode === "once" ? "done" : "active";

      await col.updateOne(
        { _id: new ObjectId(scheduleId) },
        { $set: { lastRun: new Date(), nextRun, status: newStatus, updatedAt: new Date() }, $inc: { runCount: 1 } }
      );
      return res.status(200).json({ success: true, nextRun });
    }

    // ── Deletar ───────────────────────────────────────────────────────────
    if (action === "delete") {
      const { scheduleId } = req.body;
      await col.deleteOne({ _id: new ObjectId(scheduleId) });
      return res.status(200).json({ success: true });
    }

    // ── Buscar agendamentos pendentes (para o ticker do frontend) ─────────
    if (action === "getDue") {
      const now = new Date();
      const candidates = await col.find({
        status: "active",
        nextRun: { $lte: now },
      }).toArray();
      // Filtra business-hours: só executa se estiver dentro da janela ativa
      const due = candidates.filter(s => isBusinessDue(s.schedule, now));
      return res.status(200).json({ success: true, schedules: due });
    }

    return res.status(400).json({ error: "Action inválida." });

  } catch (err) {
    console.error("[scheduler] Erro:", err);
    return res.status(500).json({ error: err.message });
  }
};

function computeNextRun(schedule, isDone = false) {
  if (isDone || schedule.mode === "once") return null;
  const now = new Date();

  if (schedule.mode === "interval") {
    return new Date(now.getTime() + (schedule.intervalMinutes || 60) * 60000);
  }

  if (schedule.mode === "daily") {
    const [h, m] = (schedule.dailyTime || "08:00").split(":").map(Number);
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  if (schedule.mode === "business") {
    // days: array of weekday numbers (0=Sun,1=Mon,...,6=Sat)
    // startTime/endTime: "HH:MM"
    // intervalMinutes: interval between runs
    const days = schedule.days || [1,2,3,4,5];
    const [sh, sm] = (schedule.startTime || "09:00").split(":").map(Number);
    const [eh, em] = (schedule.endTime   || "18:00").split(":").map(Number);
    const intervalMs = (schedule.intervalMinutes || 60) * 60000;

    // Try from now + interval, look up to 8 days ahead
    let candidate = new Date(now.getTime() + intervalMs);
    for (let attempt = 0; attempt < 8 * 24 * 60; attempt++) {
      const dow = candidate.getDay();
      const h = candidate.getHours();
      const m = candidate.getMinutes();
      const afterStart = h > sh || (h === sh && m >= sm);
      const beforeEnd  = h < eh || (h === eh && m <= em);
      if (days.includes(dow) && afterStart && beforeEnd) return candidate;
      // Snap to next valid slot
      if (!days.includes(dow) || h > eh || (h === eh && m > em)) {
        // Move to start of next valid day
        candidate = new Date(candidate);
        candidate.setHours(sh, sm, 0, 0);
        candidate.setDate(candidate.getDate() + 1);
        while (!days.includes(candidate.getDay())) {
          candidate.setDate(candidate.getDate() + 1);
        }
        return candidate;
      }
      if (h < sh || (h === sh && m < sm)) {
        // Move to start of today
        candidate = new Date(candidate);
        candidate.setHours(sh, sm, 0, 0);
        return candidate;
      }
      candidate = new Date(candidate.getTime() + intervalMs);
    }
    return null;
  }

  return null;
}

// Check if a business-hours schedule is currently "due" (within active window)
function isBusinessDue(schedule, now = new Date()) {
  if (schedule.mode !== "business") return true;
  const days = schedule.days || [1,2,3,4,5];
  const [sh, sm] = (schedule.startTime || "09:00").split(":").map(Number);
  const [eh, em] = (schedule.endTime   || "18:00").split(":").map(Number);
  const dow = now.getDay();
  const h   = now.getHours();
  const mn  = now.getMinutes();
  const afterStart = h > sh || (h === sh && mn >= sm);
  const beforeEnd  = h < eh || (h === eh && mn <= em);
  return days.includes(dow) && afterStart && beforeEnd;
}