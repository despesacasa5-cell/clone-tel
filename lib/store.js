import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.json');

// Função para ler do arquivo
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return { processes: {}, logs: {} };
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { processes: {}, logs: {} };
  }
}

// Função para escrever no arquivo
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function getAllProcesses() {
  const db = readDB();
  return Object.values(db.processes);
}

export function getProcess(id) {
  const db = readDB();
  return db.processes[id] || null;
}

export function createProcess(id, { sources, destination, label }) {
  const db = readDB();
  const proc = {
    id,
    label: label || `Processo ${Object.keys(db.processes).length + 1}`,
    sources,
    destination,
    status: 'paused',
    messageCount: 0,
    errorCount: 0,
    createdAt: new Date().toISOString(),
    lastActivity: null,
  };
  db.processes[id] = proc;
  db.logs[id] = [];
  writeDB(db);
  return proc;
}

export function updateProcess(id, updates) {
  const db = readDB();
  if (!db.processes[id]) return null;
  db.processes[id] = { ...db.processes[id], ...updates };
  writeDB(db);
  return db.processes[id];
}

export function deleteProcess(id) {
  const db = readDB();
  delete db.processes[id];
  delete db.logs[id];
  writeDB(db);
}

export function addLog(processId, message, type = 'info') {
  const db = readDB();
  if (!db.logs[processId]) db.logs[processId] = [];
  
  const entry = {
    id: Date.now(),
    message,
    type,
    timestamp: new Date().toISOString(),
  };
  
  db.logs[processId].unshift(entry);
  if (db.logs[processId].length > 200) db.logs[processId].splice(200);
  
  writeDB(db);
  return entry;
}