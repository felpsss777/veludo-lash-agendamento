const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { dbRun, dbGet, dbAll } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ===================== ROTAS PÚBLICAS ===================== */
app.get("/", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "booking.html"));
});

app.get("/booking", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "booking.html"));
});

app.get("/admin", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get(["/index.html", "/agenda.html", "/lembretes.html"], (req, res) => {
  return res.status(404).send("Página removida ✅");
});

app.get("/health", async (req, res) => {
  try {
    await dbGet("SELECT 1 AS ok");
    res.send("API rodando com Postgres ✅");
  } catch (e) {
    res.status(500).send(`Erro no banco: ${e.message}`);
  }
});

/* ===================== CONFIG SINAL ===================== */
const REQUIRE_SINAL_NO_PUBLICO = true;
const SINAL_VALOR = 40.0;
const RESERVA_MINUTOS = 15;

/* ===================== CONFIG PIX ===================== */
const PIX_CHAVE = "vmell.sj@gmail.com";
const PIX_NOME = "VITORIA MELL";
const PIX_CIDADE = "SAO PAULO";
const PIX_DESCRICAO = "SINAL AGENDAMENTO";

/* ===================== CONFIG EMAIL ===================== */
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";

const mailer =
  EMAIL_USER && EMAIL_PASS
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS,
        },
      })
    : null;

if (mailer) {
  mailer.verify()
    .then(() => {
      console.log("SMTP pronto para enviar e-mails ✅");
    })
    .catch((err) => {
      console.error("Erro no SMTP ❌", err?.message || err);
    });
} else {
  console.error("Mailer não configurado: EMAIL_USER/EMAIL_PASS ausentes ❌");
}

/* ===================== HELPERS ===================== */
function tokenSeguro() {
  return crypto.randomBytes(18).toString("hex");
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

function validarEmail(email = "") {
  const v = String(email || "").trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function formatarDataBR(data = "") {
  if (!data || !data.includes("-")) return data || "-";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function dataUrlParaBuffer(dataUrl = "") {
  const base64 = String(dataUrl).split(",")[1] || "";
  return Buffer.from(base64, "base64");
}

function escaparHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function enviarEmailReservaPix({
  email,
  nome,
  servico,
  data,
  horario,
  valor,
  pixCode,
  qrCodeDataUrl,
  expiraEm,
}) {
  if (!mailer) {
    throw new Error("EMAIL_USER/EMAIL_PASS não configurados");
  }

  const dataFmt = formatarDataBR(data);
  const bufferQr = dataUrlParaBuffer(qrCodeDataUrl);

  const info = await mailer.sendMail({
    from: `"Veludo Lash" <${EMAIL_USER}>`,
    to: email,
    subject: "Seu PIX de reserva • Veludo Lash",
    attachments: [
      {
        filename: "qrcode-pix.png",
        content: bufferQr,
        cid: "qrcodepix",
      },
    ],
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;background:#0f0f12;color:#f3f3f3;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#17171c;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:24px;">
          <h2 style="margin:0 0 12px;color:#d4af37;">Reserva criada 💛</h2>

          <p style="margin:0 0 14px;">Olá, <strong>${escaparHtml(nome)}</strong>!</p>

          <p style="margin:0 0 14px;">
            Sua pré-reserva foi criada com sucesso. Para confirmar o horário, faça o pagamento do sinal.
          </p>

          <div style="margin:16px 0;padding:14px;border-radius:14px;background:#101014;border:1px solid rgba(255,255,255,.08);">
            <p style="margin:0 0 8px;"><strong>Serviço:</strong> ${escaparHtml(servico)}</p>
            <p style="margin:0 0 8px;"><strong>Data:</strong> ${escaparHtml(dataFmt)}</p>
            <p style="margin:0 0 8px;"><strong>Horário:</strong> ${escaparHtml(horario)}</p>
            <p style="margin:0;"><strong>Sinal:</strong> R$ ${Number(valor).toFixed(2).replace(".", ",")}</p>
          </div>

          <div style="text-align:center;margin:22px 0;">
            <img src="cid:qrcodepix" alt="QR Code PIX" style="width:240px;max-width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.08);" />
          </div>

          <p style="margin:0 0 8px;"><strong>PIX copia e cola:</strong></p>
          <div style="word-break:break-all;background:#0d0d10;border:1px solid rgba(255,255,255,.08);padding:12px;border-radius:12px;font-size:12px;line-height:1.5;">
            ${escaparHtml(pixCode)}
          </div>

          <p style="margin:16px 0 0;color:#cfcfcf;font-size:13px;">
            Expiração da reserva: ${expiraEm ? new Date(expiraEm).toLocaleString("pt-BR") : "em breve"}.
          </p>
        </div>
      </div>
    `,
  });

  return info;
}

/* ===================== UPLOAD FOTO CLIENTE ===================== */
const uploadDir = path.join(__dirname, "public", "uploads", "clientes");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    const id = String(req.params.id || "0").replace(/\D/g, "");
    const stamp = Date.now();
    cb(null, `cli_${id}_${stamp}${safeExt}`);
  },
});

const uploadFoto = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Envie uma imagem JPG/PNG/WEBP."), ok);
  },
});

/* ===================== RESERVAS: EXPIRAR ===================== */
async function expirarReservas() {
  await dbRun(
    `
    UPDATE reservas
       SET status = 'expirada'
     WHERE lower(status) = 'pendente'
       AND expira_em IS NOT NULL
       AND expira_em <= NOW()
    `
  );
}

setInterval(() => expirarReservas().catch(() => {}), 60 * 1000);
expirarReservas().catch(() => {});

/* ===================== PIX HELPERS ===================== */
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

/* ===================== ENDPOINT PIX FIXO ===================== */
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

/* ===================== SSE ===================== */
const sseClientsByToken = new Map();

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

    const rsv = await dbGet(
      `SELECT id, status, expira_em FROM reservas WHERE token = $1`,
      [token]
    );

    if (!rsv) {
      sseSend(res, "error", { erro: "Reserva não encontrada" });
      return res.end();
    }

    const st = String(rsv.status || "").toLowerCase();

    if (st === "pago") {
      const ag = await dbGet(`SELECT id FROM agendamentos WHERE reserva_id = $1`, [rsv.id]);
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
      `
      SELECT id, status, expira_em, valor_sinal, data, horario, servico
        FROM reservas
       WHERE token = $1
      `,
      [token]
    );

    if (!rsv) return res.status(404).json({ erro: "Reserva não encontrada" });

    const st = String(rsv.status || "").toLowerCase();
    let agendamento_id = null;

    if (st === "pago") {
      const ag = await dbGet(`SELECT id FROM agendamentos WHERE reserva_id = $1`, [rsv.id]);
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
      return res.status(400).json({
        erro: "Telefone inválido. Use DDD + número (somente números).",
      });
    }

    const tel = val.tel;

    try {
      const r = await dbGet(
        `
        INSERT INTO clientes (nome, telefone, observacao, foto_url)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [nome, tel, observacao || "", ""]
      );

      return res.status(201).json({
        id: r.id,
        nome,
        telefone: tel,
        foto_url: "",
      });
    } catch (err) {
      if (String(err.message || "").toLowerCase().includes("unique")) {
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
    const q = String(req.query.q || "").trim().toLowerCase();

    let rows;
    if (q) {
      rows = await dbAll(
        `
        SELECT *
          FROM clientes
         WHERE lower(nome) LIKE $1
         ORDER BY id DESC
        `,
        [`%${q}%`]
      );
    } else {
      rows = await dbAll(`SELECT * FROM clientes ORDER BY id DESC`);
    }

    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/clientes/:id/foto", uploadFoto.single("foto"), async (req, res) => {
  try {
    const id = Number(String(req.params.id || "").replace(/\D/g, ""));
    if (!id) return res.status(400).json({ erro: "ID inválido" });

    const cli = await dbGet(`SELECT id, foto_url FROM clientes WHERE id = $1`, [id]);
    if (!cli) return res.status(404).json({ erro: "Cliente não encontrado" });

    if (!req.file) return res.status(400).json({ erro: "Envie o arquivo no campo 'foto'." });

    const old = String(cli.foto_url || "");
    if (old.startsWith("/uploads/clientes/")) {
      const oldPath = path.join(__dirname, "public", old);
      fs.unlink(oldPath, () => {});
    }

    const fotoUrl = `/uploads/clientes/${req.file.filename}`;
    await dbRun(`UPDATE clientes SET foto_url = $1 WHERE id = $2`, [fotoUrl, id]);

    res.json({ ok: true, foto_url: fotoUrl });
  } catch (e) {
    res.status(500).json({ erro: e.message || "Falha ao salvar foto" });
  }
});

app.delete("/clientes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const row = await dbGet(
      `SELECT COUNT(*)::int AS total FROM agendamentos WHERE cliente_id = $1`,
      [id]
    );

    if (row?.total > 0) {
      return res.status(409).json({
        erro: "Esse cliente tem agendamentos. Apague os agendamentos antes.",
      });
    }

    const cli = await dbGet(`SELECT foto_url FROM clientes WHERE id = $1`, [id]);
    if (cli?.foto_url?.startsWith("/uploads/clientes/")) {
      const p = path.join(__dirname, "public", cli.foto_url);
      fs.unlink(p, () => {});
    }

    const r = await dbRun(`DELETE FROM clientes WHERE id = $1`, [id]);
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
      const r = await dbGet(
        `
        INSERT INTO agendamentos (cliente_id, data, horario, servico, observacao)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [cliente_id, data, horario, servico, observacao || ""]
      );

      res.status(201).json({ id: r.id });
    } catch (e) {
      if (String(e.message || "").toLowerCase().includes("unique")) {
        return res.status(409).json({ erro: "Horário já ocupado" });
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get("/agendamentos", async (req, res) => {
  try {
    const rows = await dbAll(
      `
      SELECT
        a.id,
        a.data,
        a.horario,
        a.servico,
        a.confirmado,
        a.observacao,
        a.reserva_id,
        c.nome AS cliente_nome,
        c.telefone AS cliente_telefone,
        c.foto_url AS cliente_foto_url
      FROM agendamentos a
      JOIN clientes c ON c.id = a.cliente_id
      ORDER BY a.data DESC, a.horario DESC
      `
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/agendamentos/:id/confirmar", async (req, res) => {
  try {
    await dbRun(`UPDATE agendamentos SET confirmado = 1 WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/agendamentos/:id/pago", async (req, res) => {
  try {
    const { id } = req.params;

    const ag = await dbGet(
      `SELECT id, observacao FROM agendamentos WHERE id = $1`,
      [id]
    );

    if (!ag) {
      return res.status(404).json({ erro: "Agendamento não encontrado" });
    }

    const observacaoAtual = String(ag.observacao || "");
    const complemento = " • PAGAMENTO MARCADO MANUALMENTE";

    const novaObservacao = observacaoAtual.includes("PAGAMENTO MARCADO MANUALMENTE")
      ? observacaoAtual
      : `${observacaoAtual}${complemento}`.trim();

    await dbRun(
      `
      UPDATE agendamentos
         SET observacao = $1,
             confirmado = 1
       WHERE id = $2
      `,
      [novaObservacao, id]
    );

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({
      erro: e.message || "Erro ao marcar pagamento"
    });
  }
});

app.delete("/agendamentos/:id", async (req, res) => {
  try {
    const r = await dbRun(`DELETE FROM agendamentos WHERE id = $1`, [req.params.id]);
    if (r.changes === 0) return res.status(404).json({ erro: "Agendamento não encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== ADMIN: AGENDAR CLIENTE ===================== */
app.post("/admin-agendar", async (req, res) => {
  try {
    let { nome, telefone, email, servico, data, horario } = req.body;

    nome = String(nome || "").trim();
    telefone = String(telefone || "").trim();
    email = String(email || "").trim();
    servico = String(servico || "").trim();
    data = String(data || "").trim();
    horario = String(horario || "").trim();

    if (!nome || !telefone || !servico || !data || !horario) {
      return res.status(400).json({ erro: "Preencha todos os campos obrigatórios." });
    }

    const val = validarTelefoneBR(telefone);
    if (!val.ok) {
      return res.status(400).json({
        erro: "Telefone inválido. Use DDD + número (somente números).",
      });
    }

    const tel = val.tel;

    await expirarReservas();

    const horarioOcupado = await dbGet(
      `
      SELECT id
        FROM agendamentos
       WHERE data = $1
         AND horario = $2
      `,
      [data, horario]
    );

    if (horarioOcupado) {
      return res.status(409).json({ erro: "Esse horário já está ocupado." });
    }

    const reservaPendente = await dbGet(
      `
      SELECT id
        FROM reservas
       WHERE data = $1
         AND horario = $2
         AND lower(status) = 'pendente'
         AND expira_em > NOW()
      `,
      [data, horario]
    );

    if (reservaPendente) {
      return res.status(409).json({
        erro: "Esse horário está em pré-reserva aguardando pagamento.",
      });
    }

    let cliente = await dbGet(
      `SELECT id FROM clientes WHERE telefone = $1`,
      [tel]
    );

    if (!cliente) {
      cliente = await dbGet(
        `
        INSERT INTO clientes (nome, telefone, observacao, foto_url)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          nome,
          tel,
          email ? `E-mail: ${email}` : "Criado manualmente pelo admin",
          ""
        ]
      );
    }

    const agendamento = await dbGet(
      `
      INSERT INTO agendamentos (
        cliente_id, data, horario, servico, observacao, confirmado
      )
      VALUES ($1, $2, $3, $4, $5, 1)
      RETURNING id
      `,
      [
        cliente.id,
        data,
        horario,
        servico,
        email ? `Agendado pelo admin • E-mail: ${email}` : "Agendado pelo admin"
      ]
    );

    return res.status(201).json({
      ok: true,
      id: agendamento.id
    });
  } catch (e) {
    if (String(e.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ erro: "Horário já ocupado." });
    }

    return res.status(500).json({
      erro: e.message || "Erro ao criar agendamento manual."
    });
  }
});

/* ===================== PÚBLICO: RESERVAR COM SINAL ===================== */
app.post("/public-reservar", async (req, res) => {
  try {
    let { nome, telefone, email, servico, data, horario } = req.body;

    nome = String(nome || "").trim();
    telefone = String(telefone || "").trim();
    email = String(email || "").trim();
    servico = String(servico || "").trim();
    data = String(data || "").trim();
    horario = String(horario || "").trim();

    console.log("📌 Iniciando criação de reserva pública...");
    console.log("👤 Nome:", nome);
    console.log("📱 Telefone:", telefone);
    console.log("📧 E-mail:", email || "(não informado)");
    console.log("💼 Serviço:", servico);
    console.log("📅 Data:", data);
    console.log("🕒 Horário:", horario);

    if (!nome || !telefone || !servico || !data || !horario) {
      return res.status(400).json({ erro: "Preencha todos os campos" });
    }

    if (email && !validarEmail(email)) {
      return res.status(400).json({ erro: "E-mail inválido." });
    }

    const val = validarTelefoneBR(telefone);
    if (!val.ok) {
      return res.status(400).json({
        erro: "WhatsApp inválido. Use DDD + número (somente números).",
      });
    }
    const tel = val.tel;

    await expirarReservas();

    const ag = await dbGet(
      `SELECT id FROM agendamentos WHERE data = $1 AND horario = $2`,
      [data, horario]
    );
    if (ag) return res.status(409).json({ erro: "Horário já reservado." });

    const rsvExist = await dbGet(
      `
      SELECT id
        FROM reservas
       WHERE data = $1
         AND horario = $2
         AND lower(status) = 'pendente'
         AND expira_em > NOW()
      `,
      [data, horario]
    );

    if (rsvExist) {
      return res.status(409).json({
        erro: "Horário em pré-reserva (aguardando pagamento). Tente outro horário.",
      });
    }

    const token = tokenSeguro();

    const r = await dbGet(
      `
      INSERT INTO reservas (
        cliente_id, nome, telefone, servico, data, horario,
        valor_sinal, status, token, criado_em, expira_em
      )
      VALUES (
        NULL, $1, $2, $3, $4, $5,
        $6, 'pendente', $7, NOW(), NOW() + ($8 * INTERVAL '1 minute')
      )
      RETURNING id, expira_em
      `,
      [nome, tel, servico, data, horario, SINAL_VALOR, token, RESERVA_MINUTOS]
    );

    const payloadPix = gerarPixCopiaEColaFixo({
      chave: PIX_CHAVE,
      nome: PIX_NOME,
      cidade: PIX_CIDADE,
      valor: SINAL_VALOR,
      descricao: PIX_DESCRICAO,
    });

    console.log("🔗 PIX gerado com sucesso para a reserva:", token);

    const qrCodeDataUrl = await gerarQRCodeDataURL(payloadPix);

    let emailEnviado = false;
    let emailErro = "";

    if (email) {
      try {
        console.log("🚀 Tentando enviar e-mail da reserva para:", email);

        const info = await enviarEmailReservaPix({
          email,
          nome,
          servico,
          data,
          horario,
          valor: SINAL_VALOR,
          pixCode: payloadPix,
          qrCodeDataUrl,
          expiraEm: r.expira_em,
        });

        emailEnviado = true;
        console.log("✅ E-mail enviado com sucesso:", info?.messageId || "(sem messageId)");
      } catch (mailErr) {
        emailErro = mailErr.message || "Falha ao enviar e-mail";
        console.error("❌ Erro ao enviar e-mail da reserva:", emailErro);
      }
    } else {
      console.log("ℹ️ Reserva criada sem e-mail informado.");
    }

    return res.status(201).json({
      ok: true,
      reserva_id: r.id,
      token,
      valor_sinal: SINAL_VALOR,
      expira_em: r.expira_em,
      pix_copia_e_cola: payloadPix,
      qr_code_data_url: qrCodeDataUrl,
      email_enviado: emailEnviado,
      email_erro: emailErro || null,
      msg: `Reserva criada. Pague o sinal de R$ ${SINAL_VALOR.toFixed(2).replace(".", ",")} em até ${RESERVA_MINUTOS} min para confirmar.`,
    });
  } catch (e) {
    console.error("❌ Falha ao criar reserva pública:", e?.message || e);

    if (String(e.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ erro: "Horário em pré-reserva. Tente outro." });
    }
    res.status(500).json({ erro: e.message || "Falha ao criar reserva" });
  }
});

/* ===================== CONSULTAR RESERVA ===================== */
app.get("/reservas/:token", async (req, res) => {
  try {
    const { token } = req.params;
    await expirarReservas();

    const rsv = await dbGet(`SELECT * FROM reservas WHERE token = $1`, [token]);
    if (!rsv) return res.status(404).json({ erro: "Reserva não encontrada" });

    res.json(rsv);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== CONFIRMAR PAGAMENTO MANUAL ===================== */
app.post("/reservas/:token/confirmar-pagamento", async (req, res) => {
  const { token } = req.params;

  try {
    await expirarReservas();

    const rsv = await dbGet(`SELECT * FROM reservas WHERE token = $1`, [token]);
    if (!rsv) return res.status(404).json({ erro: "Reserva não encontrada" });

    const status = String(rsv.status || "").toLowerCase();
    if (status !== "pendente") {
      return res.status(409).json({ erro: `Reserva está como ${rsv.status}` });
    }

    const okRow = await dbGet(
      `
      SELECT 1 AS ok
        FROM reservas
       WHERE token = $1
         AND expira_em > NOW()
      `,
      [token]
    );

    if (!okRow) return res.status(409).json({ erro: "Reserva expirada" });

    await dbRun("BEGIN");

    try {
      await dbRun(`UPDATE reservas SET status = 'pago' WHERE token = $1`, [token]);

      const nome = rsv.nome;
      const tel = rsv.telefone;

      let cliente = await dbGet(`SELECT id FROM clientes WHERE telefone = $1`, [tel]);

      if (!cliente) {
        try {
          cliente = await dbGet(
            `
            INSERT INTO clientes (nome, telefone, observacao, foto_url)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            `,
            [nome, tel, "Criado via sinal (link público)", ""]
          );
        } catch (e) {
          if (String(e.message || "").toLowerCase().includes("unique")) {
            cliente = await dbGet(`SELECT id FROM clientes WHERE telefone = $1`, [tel]);
          } else {
            throw e;
          }
        }
      }

      const obs = `SINAL PAGO (R$${Number(rsv.valor_sinal || SINAL_VALOR)
        .toFixed(2)
        .replace(".", ",")}) - via link público`;

      const rAg = await dbGet(
        `
        INSERT INTO agendamentos (
          cliente_id, data, horario, servico, observacao, confirmado, reserva_id
        )
        VALUES ($1, $2, $3, $4, $5, 1, $6)
        RETURNING id
        `,
        [cliente.id, rsv.data, rsv.horario, rsv.servico, obs, rsv.id]
      );

      await dbRun("COMMIT");

      notifyToken(token, "paid", { ok: true, agendamento_id: rAg.id });

      return res.json({ ok: true, agendamento_id: rAg.id });
    } catch (e) {
      await dbRun("ROLLBACK");
      throw e;
    }
  } catch (e) {
    if (String(e.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ erro: "Horário já ocupado" });
    }
    return res.status(500).json({ erro: e.message || "Falha ao confirmar pagamento" });
  }
});

/* ===================== LINK PÚBLICO LEGADO ===================== */
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
      SELECT horario FROM agendamentos WHERE data = $1
      UNION
      SELECT horario
        FROM reservas
       WHERE data = $2
         AND lower(status) = 'pendente'
         AND expira_em > NOW()
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
      SELECT horario FROM agendamentos WHERE data = $1
      UNION
      SELECT horario
        FROM reservas
       WHERE data = $2
         AND lower(status) = 'pendente'
         AND expira_em > NOW()
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
      `
      SELECT
        a.id,
        a.data,
        a.horario,
        a.servico,
        c.nome AS cliente_nome,
        c.telefone AS cliente_telefone
      FROM agendamentos a
      JOIN clientes c ON c.id = a.cliente_id
      WHERE a.lembrete_enviado = 0
        AND a.confirmado = 1
      ORDER BY a.data, a.horario
      `
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/lembretes/:id/enviado", async (req, res) => {
  try {
    await dbRun(
      `
      UPDATE agendamentos
         SET lembrete_enviado = 1,
             lembrete_enviado_em = NOW()
       WHERE id = $1
      `,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

/* ===================== START ===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} ✅`);
  console.log("Conectado ao Supabase/Postgres ✅");
  console.log("EMAIL_USER configurado:", EMAIL_USER ? "SIM ✅" : "NÃO ❌");
  console.log("EMAIL_PASS configurado:", EMAIL_PASS ? "SIM ✅" : "NÃO ❌");
});