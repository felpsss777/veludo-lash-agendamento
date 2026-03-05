// server.js
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const QRCode = require("qrcode");
const path = require("path");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ===================== ROTAS PÚBLICAS (SÓ BOOKING + ADMIN) ===================== */

// ✅ HOME = BOOKING
app.get("/", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "booking.html"));
});

// ✅ /booking = BOOKING
app.get("/booking", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "booking.html"));
});

// ✅ /admin = ADMIN
app.get("/admin", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ❌ Bloquear páginas antigas (se existirem)
app.get(["/index.html", "/agenda.html", "/lembretes.html"], (req, res) => {
  return res.status(404).send("Página removida ✅");
});

// ✅ endpoint de teste da API (se quiser)
app.get("/health", (req, res) => res.send("API rodando ✅"));

/* ===================== CONFIG SINAL (COBRANÇA) ===================== */
const REQUIRE_SINAL_NO_PUBLICO = true; // ✅ se true, bloqueia /public-agendar
const SINAL_VALOR = 40.0; // R$ 40 para reservar
const RESERVA_MINUTOS = 15; // segura o horário por X minutos

/* ===================== CONFIG PIX (QR CODE) ===================== */
const PIX_CHAVE = "vmell.sj@gmail.com"; // chave pix
const PIX_NOME = "VITORIA MELL"; // máx 25
const PIX_CIDADE = "SAO PAULO"; // máx 15
const PIX_DESCRICAO = "SINAL AGENDAMENTO";

/* ===================== SQLITE PROMISE HELPERS ===================== */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

/* ===================== HELPERS ===================== */
function tokenSeguro() {
  return crypto.randomBytes(18).toString("hex"); // 36 chars
}
function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}
function validarTelefoneBR(telefone) {
  const t = onlyDigits(telefone);
  if (!(t.length === 10 || t.length === 11)) return { ok: false, tel: t };
  const ddd = t.slice(0, 2);
  if (ddd === "00") return { ok: false, tel: t };
  return { ok: true, tel: t };
}

/* ===================== RESERVAS: EXPIRAR ===================== */
async function expirarReservas() {
  await dbRun(
    `
    UPDATE reservas
    SET status='expirada'
    WHERE lower(status)='pendente'
      AND expira_em IS NOT NULL
      AND datetime(expira_em) <= datetime('now')
    `
  );
}
setInterval(() => expirarReservas().catch(() => {}), 60 * 1000);
expirarReservas().catch(() => {});

/* ===================== PIX: GERAR "COPIA E COLA" + QR ===================== */
function limparTextoPix(str, maxLen) {
  const s = String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return s.slice(0, maxLen);
}
function tlv(id, value) {
  const v = String(value ?? "");
  const len = String(v.length).padStart(2, "0");
  return `${id}${len}${v}`;
}
function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function gerarPixCopiaEColaFixo({ chave, nome, cidade, valor, descricao }) {
  if (!chave || String(chave).includes("COLOQUE_SUA_CHAVE_PIX_AQUI")) {
    throw new Error("PIX_CHAVE não configurada no server.js");
  }

  const merchantName = limparTextoPix(nome, 25);
  const merchantCity = limparTextoPix(cidade, 15);

  const gui = tlv("00", "br.gov.bcb.pix");
  const key = tlv("01", String(chave).trim());
  const desc = descricao ? tlv("02", limparTextoPix(descricao, 50)) : "";
  const mai = tlv("26", gui + key + desc);

  const txid = tlv("05", "***");
  const add = tlv("62", txid);

  const amount = Number(valor || 0).toFixed(2);

  const payloadSemCRC =
    tlv("00", "01") +
    tlv("01", "12") +
    mai +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", amount) +
    tlv("58", "BR") +
    tlv("59", merchantName) +
    tlv("60", merchantCity) +
    add;

  const payloadComCRC = payloadSemCRC + "6304";
  const crc = crc16(payloadComCRC);

  return payloadSemCRC + tlv("63", crc);
}

async function gerarQRCodeDataURL(payload) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
  });
}

/* ===================== ENDPOINT PIX FIXO (R$40) ===================== */
app.get("/pix-sinal", async (req, res) => {
  try {
    const payload = gerarPixCopiaEColaFixo({
      chave: PIX_CHAVE,
      nome: PIX_NOME,
      cidade: PIX_CIDADE,
      valor: SINAL_VALOR,
      descricao: PIX_DESCRICAO,
    });

    const qrCodeDataUrl = await gerarQRCodeDataURL(payload);

    res.json({
      ok: true,
      valor: SINAL_VALOR,
      pix_copia_e_cola: payload,
      qr_code_data_url: qrCodeDataUrl,
    });
  } catch (e) {
    res.status(500).json({ erro: e.message || "Falha ao gerar PIX" });
  }
});

/* ===================== SSE: NOTIFICAR CLIENTE AO CONFIRMAR ===================== */
const sseClientsByToken = new Map(); // token -> Set(res)

function sseSend(res, eventName, dataObj) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
}

function notifyToken(token, eventName, dataObj) {
  const set = sseClientsByToken.get(token);
  if (!set || set.size === 0) return;

  for (const res of set) {
    try {
      sseSend(res, eventName, dataObj);
      if (eventName === "paid" || eventName === "expired") res.end();
    } catch (_) {}
  }

  if (eventName === "paid" || eventName === "expired") {
    sseClientsByToken.delete(token);
  }
}

app.get("/reservas/:token/stream", async (req, res) => {
  const { token } = req.params;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  sseSend(res, "hello", { ok: true, token });

  if (!sseClientsByToken.has(token)) sseClientsByToken.set(token, new Set());
  sseClientsByToken.get(token).add(res);

  try {
    await expirarReservas();
    const rsv = await dbGet(`SELECT id, status, expira_em FROM reservas WHERE token=?`, [token]);

    if (!rsv) {
      sseSend(res, "error", { erro: "Reserva não encontrada" });
      return res.end();
    }

    const st = String(rsv.status || "").toLowerCase();
    if (st === "pago") {
      const ag = await dbGet(`SELECT id FROM agendamentos WHERE reserva_id=?`, [rsv.id]);
      sseSend(res, "paid", { ok: true, agendamento_id: ag?.id || null });
      return res.end();
    }

    if (st === "expirada" || st === "cancelado") {
      sseSend(res, "expired", { ok: true, status: st });
      return res.end();
    }

    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch (_) {}
    }, 25000);

    req.on("close", () => {
      clearInterval(ping);
      const set = sseClientsByToken.get(token);
      if (set) {
        set.delete(res);
        if (set.size === 0) sseClientsByToken.delete(token);
      }
    });
  } catch (e) {
    sseSend(res, "error", { erro: e.message || "Falha no stream" });
    return res.end();
  }
});

app.get("/reservas/:token/status", async (req, res) => {
  try {
    const { token } = req.params;
    await expirarReservas();

    const rsv = await dbGet(
      `SELECT id, status, expira_em, valor_sinal, data, horario, servico FROM reservas WHERE token=?`,
      [token]
    );
    if (!rsv) return res.status(404).json({ erro: "Reserva não encontrada" });

    const st = String(rsv.status || "").toLowerCase();
    let agendamento_id = null;

    if (st === "pago") {
      const ag = await dbGet(`SELECT id FROM agendamentos WHERE reserva_id=?`, [rsv.id]);
      agendamento_id = ag?.id || null;
    }

    res.json({
      ok: true,
      status: st,
      expira_em: rsv.expira_em,
      agendamento_id,
      reserva: {
        data: rsv.data,
        horario: rsv.horario,
        servico: rsv.servico,
        valor_sinal: rsv.valor_sinal,
      },
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== CLIENTES ===================== */
app.post("/clientes", async (req, res) => {
  try {
    let { nome, telefone, observacao } = req.body;

    nome = String(nome || "").trim();
    telefone = String(telefone || "").trim();

    if (!nome || !telefone) {
      return res.status(400).json({ erro: "nome e telefone são obrigatórios" });
    }

    const val = validarTelefoneBR(telefone);
    if (!val.ok) {
      return res.status(400).json({ erro: "Telefone inválido. Use DDD + número (somente números)." });
    }

    const tel = val.tel;

    try {
      const r = await dbRun(
        `INSERT INTO clientes (nome, telefone, observacao) VALUES (?, ?, ?)`,
        [nome, tel, observacao || ""]
      );
      return res.status(201).json({ id: r.lastID, nome, telefone: tel });
    } catch (err) {
      if (String(err.message || "").includes("UNIQUE")) {
        return res.status(409).json({ erro: "Já existe um cliente com esse WhatsApp." });
      }
      throw err;
    }
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get("/clientes", async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM clientes ORDER BY id DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.delete("/clientes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const row = await dbGet(`SELECT COUNT(*) as total FROM agendamentos WHERE cliente_id = ?`, [id]);
    if (row?.total > 0) {
      return res.status(409).json({
        erro: "Esse cliente tem agendamentos. Apague os agendamentos antes (ou implemente exclusão em cascata).",
      });
    }

    const r = await dbRun(`DELETE FROM clientes WHERE id = ?`, [id]);
    if (r.changes === 0) return res.status(404).json({ erro: "Cliente não encontrado" });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== AGENDAMENTOS ===================== */
app.post("/agendamentos", async (req, res) => {
  try {
    const { cliente_id, data, horario, servico, observacao } = req.body;

    if (!cliente_id || !data || !horario || !servico) {
      return res.status(400).json({ erro: "Dados obrigatórios faltando" });
    }

    try {
      const r = await dbRun(
        `INSERT INTO agendamentos (cliente_id, data, horario, servico, observacao)
         VALUES (?, ?, ?, ?, ?)`,
        [cliente_id, data, horario, servico, observacao || ""]
      );
      res.status(201).json({ id: r.lastID });
    } catch (_) {
      return res.status(409).json({ erro: "Horário já ocupado" });
    }
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get("/agendamentos", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT a.id, a.data, a.horario, a.servico, a.confirmado, a.observacao,
              c.nome cliente_nome, c.telefone cliente_telefone
       FROM agendamentos a
       JOIN clientes c ON c.id = a.cliente_id
       ORDER BY a.data DESC, a.horario DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/agendamentos/:id/confirmar", async (req, res) => {
  try {
    await dbRun(`UPDATE agendamentos SET confirmado = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.delete("/agendamentos/:id", async (req, res) => {
  try {
    const r = await dbRun(`DELETE FROM agendamentos WHERE id = ?`, [req.params.id]);
    if (r.changes === 0) return res.status(404).json({ erro: "Agendamento não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== PÚBLICO: RESERVAR COM SINAL (R$40) ===================== */
app.post("/public-reservar", async (req, res) => {
  try {
    let { nome, telefone, servico, data, horario } = req.body;

    nome = String(nome || "").trim();
    telefone = String(telefone || "").trim();
    servico = String(servico || "").trim();

    if (!nome || !telefone || !servico || !data || !horario) {
      return res.status(400).json({ erro: "Preencha todos os campos" });
    }

    const val = validarTelefoneBR(telefone);
    if (!val.ok) {
      return res.status(400).json({ erro: "WhatsApp inválido. Use DDD + número (somente números)." });
    }
    const tel = val.tel;

    await expirarReservas();

    const ag = await dbGet(`SELECT id FROM agendamentos WHERE data=? AND horario=?`, [data, horario]);
    if (ag) return res.status(409).json({ erro: "Horário já reservado." });

    const rsvExist = await dbGet(
      `
      SELECT id FROM reservas
      WHERE data=? AND horario=?
        AND lower(status)='pendente'
        AND datetime(expira_em) > datetime('now')
      `,
      [data, horario]
    );
    if (rsvExist) {
      return res.status(409).json({ erro: "Horário em pré-reserva (aguardando pagamento). Tente outro horário." });
    }

    const token = tokenSeguro();

    const r = await dbRun(
      `
      INSERT INTO reservas (
        cliente_id, nome, telefone, servico, data, horario,
        valor_sinal, status, token, criado_em, expira_em
      )
      VALUES (
        NULL, ?, ?, ?, ?, ?,
        ?, 'pendente', ?, datetime('now'), datetime('now', ?)
      )
      `,
      [nome, tel, servico, data, horario, SINAL_VALOR, token, `+${RESERVA_MINUTOS} minutes`]
    );

    const rowExp = await dbGet(`SELECT expira_em FROM reservas WHERE id=?`, [r.lastID]);

    const payloadPix = gerarPixCopiaEColaFixo({
      chave: PIX_CHAVE,
      nome: PIX_NOME,
      cidade: PIX_CIDADE,
      valor: SINAL_VALOR,
      descricao: PIX_DESCRICAO,
    });
    const qrDataUrl = await gerarQRCodeDataURL(payloadPix);

    return res.status(201).json({
      ok: true,
      reserva_id: r.lastID,
      token,
      valor_sinal: SINAL_VALOR,
      expira_em: rowExp?.expira_em,
      pix_copia_e_cola: payloadPix,
      qr_code_data_url: qrDataUrl,
      msg: `Reserva criada. Pague o sinal de R$ ${SINAL_VALOR.toFixed(2).replace(".", ",")} em até ${RESERVA_MINUTOS} min para confirmar.`,
    });
  } catch (e) {
    if (String(e.message || "").includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ erro: "Horário em pré-reserva. Tente outro." });
    }
    res.status(500).json({ erro: e.message || "Falha ao criar reserva" });
  }
});

/* ===================== CONSULTAR RESERVA (opcional) ===================== */
app.get("/reservas/:token", async (req, res) => {
  try {
    const { token } = req.params;
    await expirarReservas();

    const rsv = await dbGet(`SELECT * FROM reservas WHERE token=?`, [token]);
    if (!rsv) return res.status(404).json({ erro: "Reserva não encontrada" });

    res.json(rsv);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== CONFIRMAR PAGAMENTO (MANUAL) ===================== */
app.post("/reservas/:token/confirmar-pagamento", async (req, res) => {
  const { token } = req.params;

  try {
    await expirarReservas();

    const rsv = await dbGet(`SELECT * FROM reservas WHERE token=?`, [token]);
    if (!rsv) return res.status(404).json({ erro: "Reserva não encontrada" });

    const status = String(rsv.status || "").toLowerCase();
    if (status !== "pendente") {
      return res.status(409).json({ erro: `Reserva está como ${rsv.status}` });
    }

    const okRow = await dbGet(
      `SELECT 1 as ok FROM reservas WHERE token=? AND datetime(expira_em) > datetime('now')`,
      [token]
    );
    if (!okRow) return res.status(409).json({ erro: "Reserva expirada" });

    await dbRun("BEGIN TRANSACTION");

    await dbRun(`UPDATE reservas SET status='pago' WHERE token=?`, [token]);

    const nome = rsv.nome;
    const tel = rsv.telefone;

    let cliente = await dbGet(`SELECT id FROM clientes WHERE telefone=?`, [tel]);

    if (!cliente) {
      try {
        const rCli = await dbRun(
          `INSERT INTO clientes (nome, telefone, observacao) VALUES (?, ?, ?)`,
          [nome, tel, "Criado via sinal (link público)"]
        );
        cliente = { id: rCli.lastID };
      } catch (e) {
        if (String(e.message || "").includes("UNIQUE")) {
          cliente = await dbGet(`SELECT id FROM clientes WHERE telefone=?`, [tel]);
        } else {
          throw e;
        }
      }
    }

    const obs = `SINAL PAGO (R$${Number(rsv.valor_sinal || SINAL_VALOR)
      .toFixed(2)
      .replace(".", ",")}) - via link público`;

    const rAg = await dbRun(
      `INSERT INTO agendamentos (
         cliente_id, data, horario, servico, observacao, confirmado, reserva_id
       ) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [cliente.id, rsv.data, rsv.horario, rsv.servico, obs, rsv.id]
    );

    await dbRun("COMMIT");

    notifyToken(token, "paid", { ok: true, agendamento_id: rAg.lastID });

    return res.json({ ok: true, agendamento_id: rAg.lastID });
  } catch (e) {
    try {
      await dbRun("ROLLBACK");
    } catch (_) {}

    if (String(e.message || "").includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ erro: "Horário já ocupado" });
    }
    return res.status(500).json({ erro: e.message || "Falha ao confirmar pagamento" });
  }
});

/* ===================== LINK PÚBLICO (LEGADO) ===================== */
app.post("/public-agendar", (req, res) => {
  if (REQUIRE_SINAL_NO_PUBLICO) {
    return res.status(410).json({
      erro: "Agora é obrigatório pagar o sinal de R$40 para reservar. Use /public-reservar.",
    });
  }
  return res.status(410).json({ erro: "Endpoint desativado." });
});

/* ===================== HORÁRIOS ===================== */
function gerarHorarios(data) {
  const d = new Date(`${data}T12:00:00`);
  const isFds = d.getDay() === 0 || d.getDay() === 6;

  if (!isFds) return ["18:00", "20:00"];

  const lista = [];
  for (let h = 6; h <= 20; h += 2) {
    lista.push(String(h).padStart(2, "0") + ":00");
  }
  return lista;
}

app.get("/horarios-disponiveis", async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.json([]);

    await expirarReservas();

    const horarios = gerarHorarios(data);

    const rows = await dbAll(
      `
      SELECT horario FROM agendamentos WHERE data=?
      UNION
      SELECT horario FROM reservas
      WHERE data=?
        AND lower(status)='pendente'
        AND datetime(expira_em) > datetime('now')
      `,
      [data, data]
    );

    const ocupados = new Set(rows.map((r) => r.horario));
    const livres = horarios.filter((h) => !ocupados.has(h));
    res.json(livres);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get("/horarios-do-dia", async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.json([]);

    await expirarReservas();

    const horarios = gerarHorarios(data);

    const rows = await dbAll(
      `
      SELECT horario FROM agendamentos WHERE data=?
      UNION
      SELECT horario FROM reservas
      WHERE data=?
        AND lower(status)='pendente'
        AND datetime(expira_em) > datetime('now')
      `,
      [data, data]
    );

    const ocupados = new Set(rows.map((r) => r.horario));
    res.json(horarios.map((h) => ({ horario: h, ocupado: ocupados.has(h) })));
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== LEMBRETES ===================== */
app.get("/lembretes-pendentes", async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT a.id,a.data,a.horario,a.servico,c.nome cliente_nome,c.telefone cliente_telefone
       FROM agendamentos a
       JOIN clientes c ON c.id=a.cliente_id
       WHERE a.lembrete_enviado=0 AND a.confirmado=1
       ORDER BY a.data,a.horario`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/lembretes/:id/enviado", async (req, res) => {
  try {
    await dbRun(
      `UPDATE agendamentos
       SET lembrete_enviado=1, lembrete_enviado_em=datetime('now')
       WHERE id=?`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== START (RENDER + LOCAL) ===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT} ✅`));