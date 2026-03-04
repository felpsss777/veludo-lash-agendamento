const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

let sock;

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") {
      console.log("✅ WhatsApp conectado (Baileys)!");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log("⚠️ WhatsApp desconectou. Reconnect:", shouldReconnect);

      if (shouldReconnect) connectWhatsApp();
      else console.log("❌ Deslogado. Vai precisar escanear o QR de novo.");
    }
  });
}

function toJid(brPhone) {
  const tel = String(brPhone).replace(/\D/g, "");
  return `${tel}@s.whatsapp.net`; // aqui você já deve passar com 55
}

async function sendToStudio(studioPhone55, text) {
  if (!sock) throw new Error("WhatsApp ainda não conectou");
  const jid = toJid(studioPhone55);
  await sock.sendMessage(jid, { text });
}

module.exports = { connectWhatsApp, sendToStudio };
