// db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// ✅ Define caminho do banco
// Local = database.db na raiz do projeto
// Render = /tmp/database.db (pasta gravável)
const dbPath = process.env.RENDER
  ? "/tmp/database.db"
  : path.join(__dirname, "..", "database.db");

// ✅ cria/abre banco
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Erro abrindo banco SQLite:", err.message);
  } else {
    console.log("✅ Banco SQLite conectado em:", dbPath);
  }
});

db.serialize(() => {

  // habilita foreign key
  db.run(`PRAGMA foreign_keys = ON`);

  // ================= CLIENTES =================
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      observacao TEXT
    )
  `);

  // ================= RESERVAS (SINAL) =================
  db.run(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      servico TEXT NOT NULL,
      data TEXT NOT NULL,
      horario TEXT NOT NULL,

      valor_sinal REAL NOT NULL DEFAULT 40.0,

      status TEXT NOT NULL DEFAULT 'pendente',

      token TEXT NOT NULL,

      criado_em TEXT DEFAULT (datetime('now')),
      expira_em TEXT,

      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  // ================= AGENDAMENTOS =================
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      horario TEXT NOT NULL,
      servico TEXT NOT NULL,
      observacao TEXT,
      lembrete_enviado INTEGER DEFAULT 0,
      lembrete_enviado_em TEXT,
      confirmado INTEGER DEFAULT 0,

      reserva_id INTEGER,

      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (reserva_id) REFERENCES reservas(id)
    )
  `);

  // ================= ÍNDICES =================

  // impede horário duplicado
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamento_unico
    ON agendamentos(data, horario)
  `);

  // impede telefone duplicado
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefone_unico
    ON clientes(telefone)
  `);

  // token único
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_token_unico
    ON reservas(token)
  `);

  // reserva única pendente
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_unica_pendente
    ON reservas(data, horario)
    WHERE status = 'pendente'
  `);

  // index de expiração
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_reservas_status_expira
    ON reservas(status, expira_em)
  `);

  // index consultas
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_reservas_data_status
    ON reservas(data, status)
  `);

});

module.exports = db;