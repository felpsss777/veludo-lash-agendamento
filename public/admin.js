const $ = (id) => document.getElementById(id);

function setMsg(text, ok = true){
  const msg = $("msg");
  if (!msg) return;
  msg.innerHTML = text ? `<span class="badge">${ok ? "✅" : "❌"} ${text}</span>` : "";
}

function onlyDigits(v = ""){
  return String(v).replace(/\D/g, "");
}

function fmtTel(t){
  const d = onlyDigits(t);
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return t || "";
}

function waLink(tel, text){
  const phone = "55" + onlyDigits(tel);
  const msg = encodeURIComponent(text || "");
  return `https://wa.me/${phone}?text=${msg}`;
}

/* =====================
   BLOQUEIO DDD (2) + NUM (9)
===================== */
function setupDDDNum(dddId, numId){
  const ddd = $(dddId);
  const num = $(numId);
  if (!ddd || !num) return;

  ddd.setAttribute("inputmode", "numeric");
  ddd.setAttribute("maxlength", "2");
  num.setAttribute("inputmode", "numeric");
  num.setAttribute("maxlength", "9");
  ddd.setAttribute("autocomplete", "tel-area-code");
  num.setAttribute("autocomplete", "tel-national");

  const lock = () => {
    ddd.value = onlyDigits(ddd.value).slice(0, 2);
    num.value = onlyDigits(num.value).slice(0, 9);
  };

  ddd.addEventListener("input", () => {
    lock();
    if (ddd.value.length === 2) num.focus();
  });

  num.addEventListener("input", lock);

  const smartPaste = (text) => {
    const digits = onlyDigits(text);

    if (digits.length >= 11) {
      ddd.value = digits.slice(0, 2);
      num.value = digits.slice(2, 11);
    } else if (digits.length > 2) {
      ddd.value = digits.slice(0, 2);
      num.value = digits.slice(2);
    } else {
      ddd.value = digits;
    }

    lock();
  };

  ddd.addEventListener("paste", (e) => {
    e.preventDefault();
    smartPaste((e.clipboardData || window.clipboardData).getData("text"));
  });

  num.addEventListener("paste", (e) => {
    e.preventDefault();
    smartPaste((e.clipboardData || window.clipboardData).getData("text"));
  });

  const validate = () => {
    if (ddd.value && ddd.value.length !== 2) {
      setMsg("DDD deve ter 2 dígitos.", false);
      return false;
    }
    if (num.value && num.value.length !== 9) {
      setMsg("Número deve ter 9 dígitos.", false);
      return false;
    }
    return true;
  };

  ddd.addEventListener("blur", validate);
  num.addEventListener("blur", validate);
}

function getTel11FromInputs(){
  const ddd = onlyDigits($("cliDDD")?.value || "");
  const num = onlyDigits($("cliTel")?.value || "");
  return ddd + num;
}

/* =====================
   FOTO DO CLIENTE
===================== */
function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ensureClienteExtras(){
  const pane = $("pane-clientes");
  if (!pane) return;

  // busca
  if (!$("cliBusca")) {
    const buscaWrap = document.createElement("div");
    buscaWrap.className = "row";
    buscaWrap.innerHTML = `
      <input id="cliBusca" placeholder="Buscar cliente pelo nome" autocomplete="off" />
    `;
    const h2 = pane.querySelector("h2");
    if (h2) h2.insertAdjacentElement("afterend", buscaWrap);
  }

  // foto
  if (!$("cliFoto")) {
    const telRow = pane.querySelector(".row.row-tel");
    if (telRow) {
      const fotoWrap = document.createElement("div");
      fotoWrap.className = "row";
      fotoWrap.innerHTML = `
        <input id="cliFoto" type="file" accept="image/*" />
      `;
      telRow.insertAdjacentElement("afterend", fotoWrap);
    }
  }
}

/* =====================
   TABS
===================== */
function setupTabs(){
  const tabs = document.querySelectorAll(".admin-tabs .tab");
  const panes = document.querySelectorAll(".pane");

  if (!tabs.length || !panes.length) return;

  function setActive(name){
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    panes.forEach(p => p.classList.toggle("active", p.dataset.page === name));

    if (name === "agenda") carregarAgenda();
    if (name === "lembretes") carregarLembretes();
    if (name === "clientes") carregarClientes();
  }

  tabs.forEach(t => {
    t.addEventListener("click", () => setActive(t.dataset.tab));
  });

  $("btnRefresh")?.addEventListener("click", () => location.reload());

  const active = document.querySelector(".admin-tabs .tab.active")?.dataset.tab || "clientes";
  setActive(active);
}

/* =====================
   AGENDA
===================== */
async function carregarAgenda(){
  setMsg("", true);
  const tbody = $("agendaBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const dataFiltro = $("filtroData")?.value || "";

  try {
    const res = await fetch("/agendamentos");
    const rows = await res.json().catch(() => []);

    if (!res.ok) {
      setMsg("Falha ao carregar agenda.", false);
      return;
    }

    const filtrados = dataFiltro
      ? rows.filter(r => r.data === dataFiltro)
      : rows;

    if (!filtrados.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="mut">Nenhum agendamento encontrado.</td></tr>`;
      return;
    }

    filtrados.forEach(r => {
      const confirmado = Number(r.confirmado) === 1;

      const tr = document.createElement("tr");
      tr.className = "rowcard";
      tr.innerHTML = `
        <td class="wrapline">${r.data}</td>
        <td class="wrapline"><span class="pill ${confirmado ? "ok" : ""}">${r.horario}</span></td>
        <td>${r.servico}</td>
        <td>
          <div><b>${r.cliente_nome}</b></div>
          <div class="mut">${fmtTel(r.cliente_telefone)}</div>
        </td>
        <td>
          <span class="pill ${confirmado ? "ok" : ""}">
            ${confirmado ? "Confirmado" : "Pendente"}
          </span>
        </td>
        <td>
          <div class="actions">
            <a class="btn" target="_blank"
               href="${waLink(r.cliente_telefone, `Olá ${r.cliente_nome}! Só confirmando seu horário: ${r.data} às ${r.horario} (${r.servico}).`)}">
               WhatsApp
            </a>
            ${confirmado ? "" : `<button class="btn-glass" data-confirmar="${r.id}">Confirmar</button>`}
            <button class="btn2" data-excluir="${r.id}">Excluir</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-confirmar]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-confirmar");
        if (!confirm("Confirmar este agendamento?")) return;

        const res = await fetch(`/agendamentos/${id}/confirmar`, { method: "POST" });
        if (res.ok) {
          setMsg("Agendamento confirmado.");
          carregarAgenda();
        } else {
          setMsg("Não foi possível confirmar.", false);
        }
      });
    });

    tbody.querySelectorAll("[data-excluir]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-excluir");
        if (!confirm("Excluir este agendamento?")) return;

        const res = await fetch(`/agendamentos/${id}`, { method: "DELETE" });
        if (res.ok) {
          setMsg("Agendamento excluído.");
          carregarAgenda();
        } else {
          setMsg("Não foi possível excluir.", false);
        }
      });
    });
  } catch (e) {
    setMsg("Erro ao carregar agenda.", false);
  }
}

/* =====================
   LEMBRETES
===================== */
async function carregarLembretes(){
  setMsg("", true);
  const tbody = $("lembretesBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  try {
    const res = await fetch("/lembretes-pendentes");
    const rows = await res.json().catch(() => []);

    if (!res.ok) {
      setMsg("Falha ao carregar lembretes.", false);
      return;
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="mut">Nenhum lembrete pendente.</td></tr>`;
      return;
    }

    rows.forEach(r => {
      const texto = `Olá ${r.cliente_nome}! Passando para te lembrar do seu horário: ${r.data} às ${r.horario} (${r.servico}). ✨`;

      const tr = document.createElement("tr");
      tr.className = "rowcard";
      tr.innerHTML = `
        <td class="wrapline">${r.data}</td>
        <td class="wrapline"><span class="pill ok">${r.horario}</span></td>
        <td>${r.servico}</td>
        <td>
          <div><b>${r.cliente_nome}</b></div>
          <div class="mut">${fmtTel(r.cliente_telefone)}</div>
        </td>
        <td>
          <div class="actions">
            <a class="btn" target="_blank" href="${waLink(r.cliente_telefone, texto)}">Enviar WhatsApp</a>
            <button class="btn-glass" data-enviado="${r.id}">Marcar como enviado</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-enviado]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-enviado");
        if (!confirm("Marcar lembrete como enviado?")) return;

        const res = await fetch(`/lembretes/${id}/enviado`, { method: "POST" });
        if (res.ok) {
          setMsg("Lembrete marcado como enviado.");
          carregarLembretes();
        } else {
          setMsg("Não foi possível marcar como enviado.", false);
        }
      });
    });
  } catch (e) {
    setMsg("Erro ao carregar lembretes.", false);
  }
}

/* =====================
   CLIENTES
===================== */
async function carregarClientes(){
  setMsg("", true);
  const tbody = $("clientesBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const termo = ($("cliBusca")?.value || "").trim();
  const url = termo ? `/clientes?q=${encodeURIComponent(termo)}` : "/clientes";

  try {
    const res = await fetch(url);
    const rows = await res.json().catch(() => []);

    if (!res.ok) {
      setMsg("Falha ao carregar clientes.", false);
      return;
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="mut">Nenhum cliente cadastrado.</td></tr>`;
      return;
    }

    rows.forEach(c => {
      const foto = c.foto_url
        ? `<img src="${c.foto_url}" alt="${c.nome}" class="cli-foto">`
        : `<div class="cli-foto cli-foto--empty"></div>`;

      const tr = document.createElement("tr");
      tr.className = "rowcard";
      tr.innerHTML = `
        <td>
          <div class="cli-nome-wrap">
            ${foto}
            <div>
              <b>${c.nome}</b>
            </div>
          </div>
        </td>
        <td class="wrapline">${fmtTel(c.telefone)}</td>
        <td>
          <div class="actions">
            <a class="btn" target="_blank" href="${waLink(c.telefone, `Olá ${c.nome}! 😊`)}">WhatsApp</a>
            <button class="btn2" data-delcli="${c.id}">Excluir</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-delcli]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delcli");
        if (!confirm("Excluir este cliente? (se tiver agendamentos, vai bloquear)")) return;

        const res = await fetch(`/clientes/${id}`, { method: "DELETE" });
        const payload = await res.json().catch(() => ({}));

        if (res.ok) {
          setMsg("Cliente excluído.");
          carregarClientes();
        } else {
          setMsg(payload.erro || "Não foi possível excluir.", false);
        }
      });
    });
  } catch (e) {
    setMsg("Erro ao carregar clientes.", false);
  }
}

/* =====================
   UPLOAD FOTO CLIENTE
===================== */
async function enviarFotoCliente(id){
  const inputFoto = $("cliFoto");
  const file = inputFoto?.files?.[0];
  if (!file) return true;

  const fd = new FormData();
  fd.append("foto", file);

  const res = await fetch(`/clientes/${id}/foto`, {
    method: "POST",
    body: fd
  });

  return res.ok;
}

/* =====================
   BOTÕES
===================== */
function setupButtons(){
  $("btnAtualizarAgenda")?.addEventListener("click", carregarAgenda);
  $("btnAtualizarLembretes")?.addEventListener("click", carregarLembretes);

  $("btnCriarCliente")?.addEventListener("click", async () => {
    const nome = ($("cliNome")?.value || "").trim();
    const tel11 = getTel11FromInputs();

    if (!nome) {
      setMsg("Preencha o nome.", false);
      return;
    }

    if (tel11.length !== 11) {
      setMsg("Preencha DDD (2) e número (9) corretamente.", false);
      return;
    }

    const res = await fetch("/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, telefone: tel11, observacao: "" })
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMsg(payload.erro || "Não foi possível cadastrar.", false);
      return;
    }

    const clienteId = payload.id;
    const okFoto = await enviarFotoCliente(clienteId);

    $("cliNome").value = "";
    $("cliDDD").value = "";
    $("cliTel").value = "";
    if ($("cliFoto")) $("cliFoto").value = "";

    if (okFoto) {
      setMsg("Cliente cadastrado!");
    } else {
      setMsg("Cliente cadastrado, mas a foto não foi enviada.", false);
    }

    carregarClientes();
  });

  $("cliBusca")?.addEventListener("input", () => {
    carregarClientes();
  });
}

/* =====================
   INIT
===================== */
document.addEventListener("DOMContentLoaded", () => {
  ensureClienteExtras();

  const filtro = $("filtroData");
  if (filtro) {
    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const dd = String(hoje.getDate()).padStart(2, "0");
    filtro.value = `${yyyy}-${mm}-${dd}`;
  }

  setupDDDNum("cliDDD", "cliTel");
  setupTabs();
  setupButtons();

  carregarClientes();
});