const $ = (id) => document.getElementById(id);

const SERVICOS_VALORES = {
  "Mega Fox": 175,
  "Brown Fox": 130,
  "Fox eyes tradicional": 130,
  "Mega volume brasileiro": 145,
  "Volume Brasil": 120,
  "Fio a fio": 150
};

const SINAL_PADRAO = 40;
const LIBERAR_RESTANTE_APOS_HORAS = 2;

function setMsg(text, ok = true) {
  const msg = $("msg");
  if (!msg) return;
  msg.innerHTML = text ? `<span class="badge">${ok ? "✅" : "❌"} ${text}</span>` : "";
}

function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}

function fmtTel(t) {
  const d = onlyDigits(t);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || "";
}

function waLink(tel, text) {
  const phone = "55" + onlyDigits(tel);
  const msg = encodeURIComponent(text || "");
  return `https://wa.me/${phone}?text=${msg}`;
}

function formatMoney(v = 0) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDateBR(dateStr = "") {
  if (!dateStr || !dateStr.includes("-")) return dateStr || "-";
  const [ano, mes, dia] = dateStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

function todayISO() {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const dd = String(hoje.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumberSafe(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function getSinalValor(item) {
  const candidatos = [
    item.valor_sinal,
    item.sinal_valor,
    item.sinal,
    item.valor_entrada
  ];

  for (const v of candidatos) {
    const num = Number(v);
    if (!Number.isNaN(num) && num > 0) return num;
  }

  return SINAL_PADRAO;
}

function getValorTotalServico(item) {
  const candidatos = [
    item.valor_total,
    item.valor_servico,
    item.preco,
    item.price,
    item.valor
  ];

  for (const v of candidatos) {
    const num = Number(v);
    if (!Number.isNaN(num) && num > 0) return num;
  }

  if (item.servico && SERVICOS_VALORES[item.servico]) {
    return SERVICOS_VALORES[item.servico];
  }

  return getSinalValor(item);
}

function getRestanteValor(item) {
  return Math.max(0, getValorTotalServico(item) - getSinalValor(item));
}

function isConfirmado(item) {
  const status = String(item.status || item.status_financeiro || "").toLowerCase();

  return (
    Number(item.confirmado) === 1 ||
    status === "confirmado" ||
    status === "confirmada"
  );
}

function isPago(item) {
  const obs = String(item.observacao || "").toUpperCase();
  const status = String(
    item.status_financeiro ||
    item.status ||
    item.pagamento_status ||
    item.status_pagamento ||
    ""
  ).toLowerCase();

  return (
    status === "pago" ||
    Number(item.pago) === 1 ||
    Number(item.sinal_pago) === 1 ||
    obs.includes("SINAL PAGO") ||
    obs.includes("PAGAMENTO MARCADO MANUALMENTE")
  );
}

function isReservaPendente(item) {
  const tipo = String(item.tipo || "").toLowerCase();
  const status = String(item.status_financeiro || item.status || "").toLowerCase();

  return tipo === "reserva" && status === "pendente";
}

function getPagamentoLabel(item) {
  if (isReservaPendente(item)) return "Pendente";
  if (isPago(item)) return "Pago";
  if (isConfirmado(item)) return "Confirmado";
  return "Pendente";
}

function getStatusClass(item) {
  if (isReservaPendente(item)) return "status-pendente";
  if (isPago(item)) return "status-pago";
  if (isConfirmado(item)) return "status-ok";
  return "status-pendente";
}

function sortByDataHora(rows = []) {
  return [...rows].sort((a, b) => {
    const ad = `${a.data || ""} ${a.horario || ""}`;
    const bd = `${b.data || ""} ${b.horario || ""}`;
    return ad.localeCompare(bd);
  });
}

function limparFormularioAgendar() {
  if ($("novoNome")) $("novoNome").value = "";
  if ($("novoDDD")) $("novoDDD").value = "";
  if ($("novoTel")) $("novoTel").value = "";
  if ($("novoServico")) $("novoServico").value = "";
  if ($("novoData")) $("novoData").value = "";

  const alt = document.querySelector("#pane-agendar .flatpickr-input[readonly]");
  if (alt) alt.value = "";

  if ($("novoHorario")) {
    $("novoHorario").innerHTML = `<option value="">Selecione o horário</option>`;
    $("novoHorario").value = "";
  }
}

/* =====================
   DATA / LIBERAÇÃO FINANCEIRA
===================== */
function getAgendamentoDate(item) {
  if (!item?.data || !item?.horario) return null;

  const horario = String(item.horario).slice(0, 5);
  const iso = `${item.data}T${horario}:00`;
  const dt = new Date(iso);

  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getDataLiberacaoValorTotal(item) {
  const base = getAgendamentoDate(item);
  if (!base) return null;

  const dt = new Date(base.getTime());
  dt.setHours(dt.getHours() + LIBERAR_RESTANTE_APOS_HORAS);
  return dt;
}

function jaLiberouValorTotal(item, agora = new Date()) {
  const liberacao = getDataLiberacaoValorTotal(item);
  if (!liberacao) return false;
  return agora.getTime() >= liberacao.getTime();
}

function getValorExibidoFinanceiro(item, agora = new Date()) {
  const sinal = getSinalValor(item);
  const total = getValorTotalServico(item);

  if (!isPago(item) && isReservaPendente(item)) {
    return sinal;
  }

  if (!isPago(item) && !isConfirmado(item)) {
    return sinal;
  }

  if (jaLiberouValorTotal(item, agora)) {
    return total;
  }

  return sinal;
}

function getDataEventoSinal(item) {
  const candidatos = [
    item.pago_em,
    item.pagamento_em,
    item.created_at,
    item.criado_em,
    item.data_criacao,
    item.reservado_em
  ];

  for (const c of candidatos) {
    if (!c) continue;
    const dt = new Date(c);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const ag = getAgendamentoDate(item);
  return ag ? new Date(ag.getTime()) : null;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth()
  );
}

function calcularResumoFinanceiroNoFront(rows = []) {
  const agora = new Date();
  let hoje = 0;
  let mes = 0;
  let pendentes = 0;
  let confirmados = 0;

  rows.forEach((item) => {
    const sinal = getSinalValor(item);
    const restante = getRestanteValor(item);
    const dataSinal = getDataEventoSinal(item);
    const dataLiberacao = getDataLiberacaoValorTotal(item);

    if (isReservaPendente(item)) {
      pendentes += 1;
    }

    if (isConfirmado(item)) {
      confirmados += 1;
    }

    if (!isPago(item) && !isConfirmado(item)) {
      return;
    }

    if (dataSinal) {
      if (isSameDay(dataSinal, agora)) hoje += sinal;
      if (isSameMonth(dataSinal, agora)) mes += sinal;
    }

    if (restante > 0 && dataLiberacao && agora >= dataLiberacao) {
      if (isSameDay(dataLiberacao, agora)) hoje += restante;
      if (isSameMonth(dataLiberacao, agora)) mes += restante;
    }
  });

  return { hoje, mes, pendentes, confirmados };
}

function getValorDescricao(item, agora = new Date()) {
  const sinal = getSinalValor(item);
  const total = getValorTotalServico(item);

  if (jaLiberouValorTotal(item, agora)) {
    return `Total liberado: ${formatMoney(total)}`;
  }

  return `Sinal por enquanto: ${formatMoney(sinal)} • Total libera após o horário + ${LIBERAR_RESTANTE_APOS_HORAS}h`;
}

/* =====================
   ANTI JUMP / SCROLL FIX
===================== */
let lastScrollY = 0;

function saveScrollPosition() {
  lastScrollY = window.scrollY || window.pageYOffset || 0;
}

function restoreScrollPosition() {
  window.scrollTo(0, lastScrollY);
}

function lockScrollForMoment() {
  saveScrollPosition();

  requestAnimationFrame(() => restoreScrollPosition());
  setTimeout(() => restoreScrollPosition(), 0);
  setTimeout(() => restoreScrollPosition(), 60);
  setTimeout(() => restoreScrollPosition(), 140);
}

function activateNoJump() {
  document.body.classList.add("no-jump");
}

function setupNoJumpFocus() {
  const selectors = [
    "input",
    "select",
    "button",
    ".slot-toggle",
    ".tab",
    ".service-card"
  ];

  document.querySelectorAll(selectors.join(",")).forEach((el) => {
    el.addEventListener("touchstart", saveScrollPosition, { passive: true });
    el.addEventListener("mousedown", saveScrollPosition, { passive: true });
    el.addEventListener("focus", () => {
      lockScrollForMoment();
    });
  });
}

function styleCalendarCentered(instance) {
  if (!instance?.calendarContainer) return;

  const cal = instance.calendarContainer;
  cal.style.position = "fixed";
  cal.style.left = "50%";
  cal.style.top = "50%";
  cal.style.right = "auto";
  cal.style.bottom = "auto";
  cal.style.transform = "translate(-50%, -50%)";
  cal.style.zIndex = "99999";
  cal.style.margin = "0";
}

function clearCalendarInlineStyle(instance) {
  if (!instance?.calendarContainer) return;
  const cal = instance.calendarContainer;

  cal.style.position = "";
  cal.style.left = "";
  cal.style.top = "";
  cal.style.right = "";
  cal.style.bottom = "";
  cal.style.transform = "";
  cal.style.zIndex = "";
  cal.style.margin = "";
}

function setupFlatpickrInputLock(instance) {
  const input = instance?.input;
  const altInput = instance?.altInput;

  [input, altInput].forEach((el) => {
    if (!el) return;

    el.addEventListener("touchstart", saveScrollPosition, { passive: true });
    el.addEventListener("mousedown", saveScrollPosition, { passive: true });
    el.addEventListener("focus", () => {
      lockScrollForMoment();
    });
  });
}

/* =====================
   TABS
===================== */
function setupTabs() {
  const tabs = document.querySelectorAll(".admin-tabs .tab");
  const panes = document.querySelectorAll(".pane");

  if (!tabs.length || !panes.length) return;

  async function setActive(name) {
    tabs.forEach((t) => {
      const active = t.dataset.tab === name;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });

    panes.forEach((p) => {
      p.classList.toggle("active", p.dataset.page === name);
    });

    if (name === "financeiro") {
      await carregarFinanceiro();
    }

    if (name === "agenda") {
      renderAdminBookingCalendar();
      await carregarAgenda();
    }

    if (name === "lembretes") {
      await carregarLembretes();
    }

    if (name === "agendar") {
      renderNovoAgendamentoCalendar();
    }

    lockScrollForMoment();
  }

  tabs.forEach((t) => {
    t.addEventListener("click", () => setActive(t.dataset.tab));
  });

  const active = document.querySelector(".admin-tabs .tab.active")?.dataset.tab || "financeiro";
  setActive(active);
}

/* =====================
   CALENDÁRIO DA AGENDA
===================== */
function renderAdminBookingCalendar() {
  const input = $("filtroData");
  if (!input || typeof flatpickr !== "function") return;
  if (input._flatpickr) return;

  const fp = flatpickr(input, {
    locale: "pt",
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d/m/y",
    disableMobile: true,
    defaultDate: input.value || todayISO(),
    position: "below center",
    static: false,
    clickOpens: true,
    onOpen: (_selectedDates, _dateStr, instance) => {
      clearCalendarInlineStyle(instance);
      if (instance.calendarContainer) {
        instance.calendarContainer.style.zIndex = "99999";
      }
      lockScrollForMoment();
    },
    onClose: () => {
      lockScrollForMoment();
    },
    onChange: (_selectedDates, dateStr) => {
      input.value = dateStr;
      lockScrollForMoment();
      carregarAgenda();
    }
  });

  setupFlatpickrInputLock(fp);
}

/* =====================
   CALENDÁRIO NOVO AGENDAMENTO
===================== */
function renderNovoAgendamentoCalendar() {
  const input = $("novoData");
  if (!input || typeof flatpickr !== "function") return;
  if (input._flatpickr) return;

  const fp = flatpickr(input, {
    locale: "pt",
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d/m/y",
    minDate: "today",
    disableMobile: true,
    position: "auto center",
    static: false,
    clickOpens: true,
    onOpen: (_selectedDates, _dateStr, instance) => {
      styleCalendarCentered(instance);
      lockScrollForMoment();
    },
    onClose: (_selectedDates, _dateStr, instance) => {
      clearCalendarInlineStyle(instance);
      lockScrollForMoment();
    },
    onChange: async (_selectedDates, dateStr, instance) => {
      input.value = dateStr;
      styleCalendarCentered(instance);
      lockScrollForMoment();
      await carregarHorariosNovoAgendamento(dateStr);
    }
  });

  setupFlatpickrInputLock(fp);
}

/* =====================
   HORÁRIOS NOVO AGENDAMENTO
===================== */
async function carregarHorariosNovoAgendamento(data) {
  const select = $("novoHorario");
  if (!select) return;

  select.innerHTML = `<option value="">Carregando horários...</option>`;

  if (!data) {
    select.innerHTML = `<option value="">Selecione o horário</option>`;
    return;
  }

  try {
    const res = await fetch(`/horarios-disponiveis?data=${encodeURIComponent(data)}`);
    const rows = await res.json().catch(() => []);

    if (!res.ok) {
      select.innerHTML = `<option value="">Erro ao carregar</option>`;
      return;
    }

    if (!Array.isArray(rows) || !rows.length) {
      select.innerHTML = `<option value="">Sem horários disponíveis</option>`;
      return;
    }

    select.innerHTML = `<option value="">Selecione o horário</option>`;
    rows.forEach((horario) => {
      const opt = document.createElement("option");
      opt.value = horario;
      opt.textContent = horario;
      select.appendChild(opt);
    });

    lockScrollForMoment();
  } catch (e) {
    select.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
}

/* =====================
   FINANCEIRO
===================== */
async function carregarFinanceiro() {
  setMsg("", true);

  const lista = $("financeiroLista");
  const recebidoHoje = $("recebidoHoje");
  const recebidoMes = $("recebidoMes");
  const pendentesSinal = $("pendentesSinal");
  const confirmadosTotal = $("confirmadosTotal");

  if (lista) lista.innerHTML = "";

  try {
    const [resResumo, resLista] = await Promise.all([
      fetch("/financeiro"),
      fetch("/financeiro/lista")
    ]);

    const resumoBackend = await resResumo.json().catch(() => ({}));
    const rows = await resLista.json().catch(() => []);

    if (!resLista.ok) {
      setMsg("Falha ao carregar financeiro.", false);
      return;
    }

    const resumoFront = calcularResumoFinanceiroNoFront(rows);

    if (recebidoHoje) {
      recebidoHoje.textContent = formatMoney(
        resumoFront.hoje || resumoBackend.hoje || 0
      );
    }

    if (recebidoMes) {
      recebidoMes.textContent = formatMoney(
        resumoFront.mes || resumoBackend.mes || 0
      );
    }

    if (pendentesSinal) {
      pendentesSinal.textContent = String(
        resumoFront.pendentes || resumoBackend.pendentes || 0
      );
    }

    if (confirmadosTotal) {
      confirmadosTotal.textContent = String(
        resumoFront.confirmados || resumoBackend.confirmados || 0
      );
    }

    if (!lista) return;

    if (!rows.length) {
      lista.innerHTML = `
        <div class="financeiro-item">
          <div class="financeiro-info">
            <span>Nenhum registro financeiro encontrado.</span>
          </div>
        </div>
      `;
      return;
    }

    const ordenados = sortByDataHora(rows);
    const agora = new Date();
    lista.innerHTML = "";

    ordenados.forEach((r) => {
      const nome = escapeHtml(r.cliente_nome || "Cliente");
      const servico = escapeHtml(r.servico || "-");
      const data = formatDateBR(r.data || "-");
      const horario = escapeHtml(r.horario || "-");
      const valorExibido = formatMoney(getValorExibidoFinanceiro(r, agora));
      const status = getPagamentoLabel(r);
      const statusClass = getStatusClass(r);
      const pago = isPago(r);
      const tipo = String(r.tipo || "").toLowerCase();
      const descricaoValor = getValorDescricao(r, agora);

      const mensagem = tipo === "reserva"
        ? `Olá ${r.cliente_nome || ""}! Sua reserva está pendente de pagamento para ${r.data || "-"} às ${r.horario || "-"} (${r.servico || "-"}) ✨`
        : `Olá ${r.cliente_nome || ""}! Seu agendamento está registrado para ${r.data || "-"} às ${r.horario || "-"} (${r.servico || "-"}) ✨`;

      const acoes = [];

      if (r.cliente_telefone) {
        acoes.push(`
          <a class="btn-dourado" target="_blank" rel="noopener noreferrer"
             href="${waLink(r.cliente_telefone, mensagem)}">
             WhatsApp
          </a>
        `);
      }

      if (!pago && tipo === "agendamento") {
        acoes.push(`
          <button class="btn-preto" data-marcar-pago="${r.id}">
            Marcar como pago
          </button>
        `);
      }

      const card = document.createElement("div");
      card.className = "financeiro-item";
      card.innerHTML = `
        <div class="financeiro-item-top">
          <div class="financeiro-nome">${nome}</div>
          <div class="financeiro-status ${statusClass}">${escapeHtml(status)}</div>
        </div>

        <div class="financeiro-info">
          <span><strong>Data:</strong> ${data}</span>
        </div>

        <div class="lembrete-linha-dupla">
          <span><strong>Serviço:</strong> ${servico}</span>
          <span><strong>Horário:</strong> ${horario}</span>
        </div>

        <div class="financeiro-info" style="margin-top:10px;">
          <span><strong>Valor exibido:</strong> ${valorExibido}</span>
        </div>

        <div class="financeiro-info">
          <span><strong>Regra:</strong> ${escapeHtml(descricaoValor)}</span>
        </div>

        <div class="financeiro-info">
          <span><strong>Tipo:</strong> ${tipo === "reserva" ? "Reserva" : "Agendamento"}</span>
        </div>

        <div class="financeiro-acoes">
          ${acoes.join("")}
        </div>
      `;

      lista.appendChild(card);
    });

    lista.querySelectorAll("[data-marcar-pago]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-marcar-pago");
        if (!confirm("Marcar este agendamento como pago?")) return;

        try {
          const resPago = await fetch(`/agendamentos/${id}/pago`, { method: "POST" });

          if (resPago.ok) {
            setMsg("Pagamento marcado com sucesso.");
            await carregarFinanceiro();
            await carregarAgenda();
          } else {
            setMsg("Não foi possível marcar como pago.", false);
          }
        } catch (e) {
          setMsg("Erro ao marcar pagamento.", false);
        }
      });
    });
  } catch (e) {
    setMsg("Erro ao carregar financeiro.", false);
  }
}

/* =====================
   AGENDA
===================== */
async function carregarAgenda() {
  setMsg("", true);

  const lista = $("agendaLista");
  if (!lista) return;
  lista.innerHTML = "";

  const dataFiltro = $("filtroData")?.value || "";

  try {
    const res = await fetch("/agendamentos");
    const rows = await res.json().catch(() => []);

    if (!res.ok) {
      setMsg("Falha ao carregar agenda.", false);
      return;
    }

    const filtrados = dataFiltro ? rows.filter((r) => r.data === dataFiltro) : rows;

    if (!filtrados.length) {
      lista.innerHTML = `
        <div class="financeiro-item">
          <div class="financeiro-info">
            <span>Nenhum agendamento encontrado para esta data.</span>
          </div>
        </div>
      `;
      return;
    }

    const ordenados = [...filtrados].sort((a, b) => {
      return String(a.horario || "").localeCompare(String(b.horario || ""));
    });

    ordenados.forEach((r) => {
      const confirmado = isConfirmado(r);
      const nome = escapeHtml(r.cliente_nome || "Cliente");
      const servico = escapeHtml(r.servico || "-");
      const data = formatDateBR(r.data || "-");
      const horario = escapeHtml(r.horario || "-");
      const status = confirmado ? "Confirmado" : "Pendente";
      const statusClass = confirmado ? "status-ok" : "status-pendente";
      const textoWa = `Olá ${r.cliente_nome || ""}! Só confirmando seu horário: ${r.data || "-"} às ${r.horario || "-"} (${r.servico || "-"}) ✨`;

      const card = document.createElement("div");
      card.className = "financeiro-item";
      card.innerHTML = `
        <div class="financeiro-item-top">
          <div class="financeiro-nome">${nome}</div>
          <div class="financeiro-status ${statusClass}">${status}</div>
        </div>

        <div class="financeiro-info">
          <span><strong>Data:</strong> ${data}</span>
        </div>

        <div class="lembrete-linha-dupla">
          <span><strong>Serviço:</strong> ${servico}</span>
          <span><strong>Horário:</strong> ${horario}</span>
        </div>

        <div class="financeiro-acoes" style="margin-top:14px;">
          <a class="btn-dourado" target="_blank" rel="noopener noreferrer"
             href="${waLink(r.cliente_telefone, textoWa)}">
             WhatsApp
          </a>
          ${confirmado ? "" : `<button class="btn-preto" data-confirmar="${r.id}">Confirmar</button>`}
          <button class="btn-preto" data-excluir="${r.id}">Excluir</button>
        </div>
      `;

      lista.appendChild(card);
    });

    lista.querySelectorAll("[data-confirmar]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-confirmar");
        if (!confirm("Confirmar este agendamento?")) return;

        try {
          const res = await fetch(`/agendamentos/${id}/confirmar`, { method: "POST" });
          if (res.ok) {
            setMsg("Agendamento confirmado.");
            await carregarAgenda();
            await carregarFinanceiro();
          } else {
            setMsg("Não foi possível confirmar.", false);
          }
        } catch (e) {
          setMsg("Erro ao confirmar agendamento.", false);
        }
      });
    });

    lista.querySelectorAll("[data-excluir]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-excluir");
        if (!confirm("Excluir este agendamento?")) return;

        try {
          const res = await fetch(`/agendamentos/${id}`, { method: "DELETE" });
          if (res.ok) {
            setMsg("Agendamento excluído.");
            await carregarAgenda();
            await carregarFinanceiro();
          } else {
            setMsg("Não foi possível excluir.", false);
          }
        } catch (e) {
          setMsg("Erro ao excluir agendamento.", false);
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
async function carregarLembretes() {
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

    rows.forEach((r) => {
      const texto = `Olá ${r.cliente_nome}! Passando para te lembrar do seu horário: ${r.data} às ${r.horario} (${r.servico}). ✨`;

      const tr = document.createElement("tr");
      tr.className = "rowcard";
      tr.innerHTML = `
        <td colspan="5">
          <div class="financeiro-item">
            <div class="financeiro-item-top">
              <div class="financeiro-nome">${escapeHtml(r.cliente_nome || "Cliente")}</div>
            </div>

            <div class="financeiro-info">
              <span><strong>Data:</strong> ${formatDateBR(r.data || "-")}</span>
            </div>

            <div class="lembrete-linha-dupla">
              <span><strong>Serviço:</strong> ${escapeHtml(r.servico || "-")}</span>
              <span><strong>Horário:</strong> ${escapeHtml(r.horario || "-")}</span>
            </div>

            <div class="financeiro-acoes" style="margin-top:14px;">
              <a class="btn-dourado" target="_blank" rel="noopener noreferrer"
                 href="${waLink(r.cliente_telefone, texto)}">
                 Enviar WhatsApp
              </a>

              <button class="btn-preto" data-enviado="${r.id}">
                Marcar como enviado
              </button>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-enviado]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-enviado");
        if (!confirm("Marcar lembrete como enviado?")) return;

        try {
          const res = await fetch(`/lembretes/${id}/enviado`, { method: "POST" });
          if (res.ok) {
            setMsg("Lembrete marcado como enviado.");
            await carregarLembretes();
          } else {
            setMsg("Não foi possível marcar como enviado.", false);
          }
        } catch (e) {
          setMsg("Erro ao marcar lembrete como enviado.", false);
        }
      });
    });
  } catch (e) {
    setMsg("Erro ao carregar lembretes.", false);
  }
}

/* =====================
   NOVO AGENDAMENTO
===================== */
async function criarAgendamentoManual() {
  const nome = ($("novoNome")?.value || "").trim();
  const ddd = onlyDigits($("novoDDD")?.value || "");
  const tel = onlyDigits($("novoTel")?.value || "");
  const servico = ($("novoServico")?.value || "").trim();
  const data = ($("novoData")?.value || "").trim();
  const horario = ($("novoHorario")?.value || "").trim();

  if (!nome || !ddd || !tel || !servico || !data || !horario) {
    setMsg("Preencha todos os campos do novo agendamento.", false);
    return;
  }

  if (ddd.length !== 2) {
    setMsg("DDD inválido.", false);
    return;
  }

  if (tel.length !== 8 && tel.length !== 9) {
    setMsg("WhatsApp inválido.", false);
    return;
  }

  const telefone = ddd + tel;

  try {
    const res = await fetch("/admin-agendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        nome,
        telefone,
        servico,
        data,
        horario
      })
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMsg(payload.erro || "Não foi possível criar o agendamento.", false);
      return;
    }

    setMsg("Agendamento criado com sucesso.");
    limparFormularioAgendar();
    await carregarAgenda();
    await carregarFinanceiro();
    lockScrollForMoment();
  } catch (e) {
    setMsg("Erro ao criar o agendamento.", false);
  }
}

/* =====================
   BOTÕES
===================== */
function setupButtons() {
  $("btnAtualizarAgenda")?.addEventListener("click", carregarAgenda);
  $("btnAtualizarLembretes")?.addEventListener("click", carregarLembretes);
  $("btnAtualizarFinanceiro")?.addEventListener("click", carregarFinanceiro);
  $("filtroData")?.addEventListener("change", carregarAgenda);

  $("btnCriarAgendamento")?.addEventListener("click", criarAgendamentoManual);

  $("novoDDD")?.addEventListener("input", () => {
    const input = $("novoDDD");
    input.value = onlyDigits(input.value).slice(0, 2);
    if (input.value.length === 2) $("novoTel")?.focus();
  });

  $("novoTel")?.addEventListener("input", () => {
    const input = $("novoTel");
    input.value = onlyDigits(input.value).slice(0, 9);
  });
}

/* =====================
   INIT
===================== */
document.addEventListener("DOMContentLoaded", () => {
  activateNoJump();

  const filtro = $("filtroData");
  if (filtro && !filtro.value) {
    filtro.value = todayISO();
  }

  setupNoJumpFocus();
  renderAdminBookingCalendar();
  renderNovoAgendamentoCalendar();
  setupTabs();
  setupButtons();

  window.addEventListener("scroll", () => {
    lastScrollY = window.scrollY || 0;
  }, { passive: true });
});