// db.js
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.db");

db.serialize(() => {
  // ✅ habilita foreign key (IMPORTANTE)
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
  // ✅ Pré-reserva até pagar R$40
  // ✅ cria ANTES de agendamentos porque agendamentos referencia reservas
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

      -- ✅ PADRÃO: tudo em minúsculo (pendente | pago | cancelado | expirada)
      status TEXT NOT NULL DEFAULT 'pendente',

      -- ✅ token único pra validar/confirmar
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

      -- ✅ ligação opcional com reserva paga
      reserva_id INTEGER,

      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (reserva_id) REFERENCES reservas(id)
    )
  `);

  // ================= ÍNDICES / UNIQUE =================

  // ✅ impede horário duplicado em AGENDAMENTOS
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamento_unico
    ON agendamentos(data, horario)
  `);

  // ✅ impede telefone duplicado em CLIENTES
  db.run(
    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefone_unico
    ON clientes(telefone)
    `,
    (err) => {
      if (err) {
        if (err.code === "SQLITE_CONSTRAINT") {
          console.warn(
            "⚠️ Existem telefones duplicados em clientes. Limpe duplicados para ativar UNIQUE."
          );
        } else {
          console.error("Erro criando idx_clientes_telefone_unico:", err.message);
        }
      }
    }
  );

  // ✅ token único por segurança
  db.run(
    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_token_unico
    ON reservas(token)
    `,
    (err) => {
      if (err && err.code !== "SQLITE_CONSTRAINT") {
        console.error("Erro criando idx_reserva_token_unico:", err.message);
      }
    }
  );

  // ✅ reserva única SOMENTE enquanto estiver pendente
  // (isso permite que reservas antigas "pago/expirada/cancelado" não bloqueiem pra sempre)
  db.run(
    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_unica_pendente
    ON reservas(data, horario)
    WHERE status = 'pendente'
    `,
    (err) => {
      if (err && err.code !== "SQLITE_CONSTRAINT") {
        console.error("Erro criando idx_reserva_unica_pendente:", err.message);
      }
    }
  );

  // ✅ ajuda na expiração automática e listagens
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_reservas_status_expira
    ON reservas(status, expira_em)
  `);

  // ✅ (opcional) consultas por data e status
  db.run(
    `
    CREATE INDEX IF NOT EXISTS idx_reservas_data_status
    ON reservas(data, status)
    `,
    (err) => {
      if (err) console.error("Erro criando idx_reservas_data_status:", err.message);
    }
  );
});

module.exports = db;