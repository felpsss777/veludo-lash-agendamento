const $ = (id) => document.getElementById(id);

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

function todayISO() {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const dd = String(hoje.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthPrefix() {
  return todayISO().slice(0, 7);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAgendamentoValor(item) {
  const candidatos = [
    item.valor,
    item.valor_total,
    item.preco,
    item.price,
    item.sinal_valor,
    item.sinal,
    item.valor_servico
  ];

  for (const v of candidatos) {
    const num = Number(v);
    if (!Number.isNaN(num) && num > 0) return num;
  }

  return 40;
}

function isConfirmado(item) {
  return (
    Number(item.confirmado) === 1 ||
    item.status === "confirmado" ||
    item.status === "Confirmado"
  );
}

function isPago(item) {
  return (
    Number(item.pago) === 1 ||
    Number(item.sinal_pago) === 1 ||
    item.pagamento_status === "pago" ||
    item.pagamento_status === "Pago" ||
    item.status_pagamento === "pago" ||
    item.status_pagamento === "Pago"
  );
}

function getPagamentoLabel(item) {
  if (isPago(item)) return "Pago";
  if (isConfirmado(item)) return "Confirmado";
  return "Pendente";
}

function sortByDataHora(rows = []) {
  return [...rows].sort((a, b) => {
    const ad = `${a.data || ""} ${a.horario || ""}`;
    const bd = `${b.data || ""} ${b.horario || ""}`;
    return ad.localeCompare(bd);
  });
}

/* =====================
   TABS
===================== */
function setupTabs() {
  const tabs = document.querySelectorAll(".admin-tabs .tab");
  const panes = document.querySelectorAll(".pane");

  if (!tabs.length || !panes.length) return;

  function setActive(name) {
    tabs.forEach((t) => {
      const active = t.dataset.tab === name;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });

    panes.forEach((p) => {
      p.classList.toggle("active", p.dataset.page === name);
    });

    if (name === "financeiro") carregarFinanceiro();
    if (name === "agenda") {
      renderAdminBookingCalendar();
      carregarAgenda();
    }
    if (name === "lembretes") carregarLembretes();
  }

  tabs.forEach((t) => {
    t.addEventListener("click", () => setActive(t.dataset.tab));
  });

  const active = document.querySelector(".admin-tabs .tab.active")?.dataset.tab || "financeiro";
  setActive(active);
}

/* =====================
   CALENDÁRIO DA AGENDA
   mesmo padrão do booking
===================== */
function renderAdminBookingCalendar() {
  const input = $("filtroData");
  if (!input || typeof flatpickr !== "function") return;

  if (input._flatpickr) return;

  flatpickr(input, {
    locale: "pt",
    dateFormat: "Y-m-d",
    disableMobile: true,
    defaultDate: input.value || todayISO(),
    onChange: (_selectedDates, dateStr) => {
      input.value = dateStr;
      carregarAgenda();
    }
  });
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
    const res = await fetch("/agendamentos");
    const rows = await res.json().catch(() => []);

    if (!res.ok) {
      setMsg("Falha ao carregar financeiro.", false);
      return;
    }

    const hoje = todayISO();
    const mesAtual = monthPrefix();

    let totalHoje = 0;
    let totalMes = 0;
    let totalPendentes = 0;
    let totalConfirmados = 0;

    rows.forEach((r) => {
      const valor = getAgendamentoValor(r);
      const pago = isPago(r);
      const confirmado = isConfirmado(r);

      if (confirmado) totalConfirmados += 1;
      if (!pago) totalPendentes += 1;

      if (pago && r.data === hoje) totalHoje += valor;
      if (pago && String(r.data || "").startsWith(mesAtual)) totalMes += valor;
    });

    if (recebidoHoje) recebidoHoje.textContent = formatMoney(totalHoje);
    if (recebidoMes) recebidoMes.textContent = formatMoney(totalMes);
    if (pendentesSinal) pendentesSinal.textContent = String(totalPendentes);
    if (confirmadosTotal) confirmadosTotal.textContent = String(totalConfirmados);

    if (!lista) return;

    if (!rows.length) {
      lista.innerHTML = `
        <div class="financeiro-item">
          <div class="financeiro-info">
            <span>Nenhum agendamento encontrado.</span>
          </div>
        </div>
      `;
      return;
    }

    const ordenados = sortByDataHora(rows);
    lista.innerHTML = "";

    ordenados.forEach((r) => {
      const nome = escapeHtml(r.cliente_nome || "Cliente");
      const telefone = escapeHtml(fmtTel(r.cliente_telefone || ""));
      const servico = escapeHtml(r.servico || "-");
      const data = escapeHtml(r.data || "-");
      const horario = escapeHtml(r.horario || "-");
      const valor = formatMoney(getAgendamentoValor(r));
      const status = getPagamentoLabel(r);
      const mensagem = `Olá ${r.cliente_nome || ""}! Seu agendamento está registrado para ${r.data || "-"} às ${r.horario || "-"} (${r.servico || "-"}) ✨`;

      const card = document.createElement("div");
      card.className = "financeiro-item";
      card.innerHTML = `
        <div class="financeiro-item-top">
          <div class="financeiro-nome">${nome}</div>
          <div class="financeiro-status">${escapeHtml(status)}</div>
        </div>

        <div class="financeiro-info">
          <span><strong>Serviço:</strong> ${servico}</span>
          <span><strong>Data:</strong> ${data}</span>
          <span><strong>Hora:</strong> ${horario}</span>
          <span><strong>WhatsApp:</strong> ${telefone || "-"}</span>
          <span><strong>Valor:</strong> ${valor}</span>
        </div>

        <div class="financeiro-acoes">
          <a class="btn-dourado" target="_blank" rel="noopener noreferrer"
             href="${waLink(r.cliente_telefone, mensagem)}">
             WhatsApp
          </a>
          ${isPago(r) ? "" : `<button class="btn-preto" data-marcar-pago="${r.id}">Marcar como pago</button>`}
        </div>
      `;

      lista.appendChild(card);
    });

    lista.querySelectorAll("[data-marcar-pago]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-marcar-pago");
        if (!confirm("Marcar este agendamento como pago?")) return;

        try {
          let resPago = await fetch(`/agendamentos/${id}/pago`, { method: "POST" });

          if (!resPago.ok) {
            resPago = await fetch(`/agendamentos/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pago: 1, sinal_pago: 1 })
            });
          }

          if (resPago.ok) {
            setMsg("Pagamento marcado com sucesso.");
            carregarFinanceiro();
            carregarAgenda();
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
      const telefone = escapeHtml(fmtTel(r.cliente_telefone || ""));
      const servico = escapeHtml(r.servico || "-");
      const data = escapeHtml(r.data || "-");
      const horario = escapeHtml(r.horario || "-");
      const status = confirmado ? "Confirmado" : "Pendente";
      const textoWa = `Olá ${r.cliente_nome || ""}! Só confirmando seu horário: ${r.data || "-"} às ${r.horario || "-"} (${r.servico || "-"}) ✨`;

      const card = document.createElement("div");
      card.className = "financeiro-item";
      card.innerHTML = `
        <div class="financeiro-item-top">
          <div class="financeiro-nome">${horario} • ${nome}</div>
          <div class="financeiro-status">${status}</div>
        </div>

        <div class="financeiro-info">
          <span><strong>Data:</strong> ${data}</span>
          <span><strong>Serviço:</strong> ${servico}</span>
          <span><strong>WhatsApp:</strong> ${telefone || "-"}</span>
        </div>

        <div class="financeiro-acoes">
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
            carregarAgenda();
            carregarFinanceiro();
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
            carregarAgenda();
            carregarFinanceiro();
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
        <td class="wrapline">${escapeHtml(r.data || "-")}</td>
        <td class="wrapline"><span class="pill ok">${escapeHtml(r.horario || "-")}</span></td>
        <td>${escapeHtml(r.servico || "-")}</td>
        <td>
          <div><b>${escapeHtml(r.cliente_nome || "Cliente")}</b></div>
          <div class="mut">${escapeHtml(fmtTel(r.cliente_telefone || ""))}</div>
        </td>
        <td>
          <div class="actions">
            <a class="btn btn-wa" target="_blank" rel="noopener noreferrer"
               href="${waLink(r.cliente_telefone, texto)}">
               Enviar WhatsApp
            </a>
            <button class="btn-glass" data-enviado="${r.id}">Marcar como enviado</button>
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
            carregarLembretes();
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
   BOTÕES
===================== */
function setupButtons() {
  $("btnAtualizarAgenda")?.addEventListener("click", carregarAgenda);
  $("btnAtualizarLembretes")?.addEventListener("click", carregarLembretes);
  $("btnAtualizarFinanceiro")?.addEventListener("click", carregarFinanceiro);
  $("filtroData")?.addEventListener("change", carregarAgenda);
}

/* =====================
   INIT
===================== */
document.addEventListener("DOMContentLoaded", () => {
  const filtro = $("filtroData");
  if (filtro && !filtro.value) {
    filtro.value = todayISO();
  }

  renderAdminBookingCalendar();
  setupTabs();
  setupButtons();
});