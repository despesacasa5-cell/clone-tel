// api/db.js - Conexão singleton com MongoDB Atlas
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) throw new Error("MONGODB_URI não definida nas variáveis de ambiente.");

let client;
let db;

async function getDb() {
  if (db) return db;
  if (!client) {
    client = new MongoClient(MONGO_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });
  }
  await client.connect();
  db = client.db("tgcloner"); // nome do banco
  return db;
}

// Coleções disponíveis:
// sessions   → sessões Telegram ativas (apiId, apiHash, phone, sessionString, createdAt, lastUsedAt)
// operations → histórico de operações (type, status, sourceGroup, targetGroup, stats, createdAt, updatedAt)
// config     → configurações gerais do app (sitePassword, etc)
// logs       → logs de erros detalhados por operação

module.exports = { getDb };