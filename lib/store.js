// In-memory store (persists during the Node process lifecycle)
// Para produção com múltiplas instâncias, use Redis ou DB

const processes = new Map()
const logs = new Map()

export function getAllProcesses() {
  return Array.from(processes.values())
}

export function getProcess(id) {
  return processes.get(id) || null
}

export function createProcess(id, { sources, destination, label }) {
  const proc = {
    id,
    label: label || `Processo ${processes.size + 1}`,
    sources,
    destination,
    status: 'paused', // paused | running | stopped
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

export function addLog(processId, message, type = 'info') {
  const list = logs.get(processId) || []
  const entry = {
    id: Date.now(),
    message,
    type, // info | success | error | warning
    timestamp: new Date().toISOString(),
  }
  // Keep last 200 logs per process
  list.unshift(entry)
  if (list.length > 200) list.splice(200)
  logs.set(processId, list)
  return entry
}

export function getLogs(processId, limit = 50) {
  return (logs.get(processId) || []).slice(0, limit)
}