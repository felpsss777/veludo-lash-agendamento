// db.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

/**
 * Render NÃO mantém arquivo fora de /tmp sem disco persistente.
 * Se você não configurou "Disk" no Render, /tmp é o único lugar gravável.
 * (Mas o banco zera quando redeploya/reinicia)
 */
const isRender = !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);

const dbPath = isRender
  ? "/tmp/database.db"
  : path.join(__dirname, "..", "database.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("❌ Erro abrindo banco SQLite:", err.message);
  else console.log("✅ Banco SQLite conectado em:", dbPath);
});

db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON`);
  db.run(`PRAGMA journal_mode = WAL`);
  db.run(`PRAGMA synchronous = NORMAL`);
  db.run(`PRAGMA busy_timeout = 5000`);

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
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamento_unico
    ON agendamentos(data, horario)
  `);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefone_unico
    ON clientes(telefone)
  `);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_token_unico
    ON reservas(token)
  `);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_unica_pendente
    ON reservas(data, horario)
    WHERE status = 'pendente'
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_reservas_status_expira
    ON reservas(status, expira_em)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_reservas_data_status
    ON reservas(data, status)
  `);
});

module.exports = db;