// In-memory store — persiste enquanto o processo Node estiver rodando.
// Para múltiplas instâncias na Vercel, use Upstash Redis.

const processes = new Map()
const logs      = new Map()
const workers   = new Map() // referências aos TelegramClient ativos

// ─── Processos ────────────────────────────────────────────

export function getAllProcesses() {
  return Array.from(processes.values())
}

export function getProcess(id) {
  return processes.get(id) || null
}

export function createProcess(id, { sources, destination, label, sessionStr }) {
  const proc = {
    id,
    label: label || `Processo ${processes.size + 1}`,
    sources,      // array de strings/números (chat IDs de origem)
    destination,  // string/número (chat ID destino)
    sessionStr: sessionStr || '', // string de sessão MTProto (gramjs)
    status: 'paused',    // paused | running | stopped | auth_needed
    messageCount: 0,
    errorCount: 0,
    createdAt: new Date().toISOString(),
    lastActivity: null,
    startedAt: null,
  }
  processes.set(id, proc)
  logs.set(id, [])
  return proc
}

export function updateProcess(id, updates) {
  const proc = processes.get(id)
  if (!proc) return null
  const updated = { ...proc, ...updates }
  processes.set(id, updated)
  return updated
}

export function deleteProcess(id) {
  processes.delete(id)
  logs.delete(id)
}

// ─── Logs ─────────────────────────────────────────────────

export function addLog(processId, message, type = 'info') {
  const list = logs.get(processId) || []
  const entry = {
    id: Date.now() + Math.random(),
    message,
    type, // info | success | error | warning
    timestamp: new Date().toISOString(),
  }
  list.unshift(entry)
  if (list.length > 300) list.splice(300)
  logs.set(processId, list)
  return entry
}

export function getLogs(processId, limit = 80) {
  return (logs.get(processId) || []).slice(0, limit)
}

// ─── Workers (TelegramClient ativos) ─────────────────────

export function setWorker(processId, ref) {
  workers.set(processId, ref)
}

export function getWorker(processId) {
  return workers.get(processId) || null
}

export function removeWorker(processId) {
  workers.delete(processId)
}