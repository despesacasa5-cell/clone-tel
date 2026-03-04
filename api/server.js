// api/server.js - Servidor local para desenvolvimento
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Rotas
app.post("/api/auth", require("./auth"));
app.post("/api/groups", require("./groups"));
app.post("/api/clone", require("./clone"));

// Fallback para o index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}\n`);
});