// ================== HELPERS ==================
function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}

// (11) 99999-9999 ou (11) 9999-9999
function formatTelefoneBR(v = "") {
  const t = onlyDigits(v);

  if (t.length === 11) {
    const ddd = t.slice(0, 2);
    const p1 = t.slice(2, 7);
    const p2 = t.slice(7, 11);
    return `(${ddd}) ${p1}-${p2}`;
  }

  if (t.length === 10) {
    const ddd = t.slice(0, 2);
    const p1 = t.slice(2, 6);
    const p2 = t.slice(6, 10);
    return `(${ddd}) ${p1}-${p2}`;
  }

  // fallback (caso venha algo fora do padrão)
  return v ? String(v) : "";
}

// ================== CLIENTES ==================
async function carregarClientes() {
  const res = await fetch("/clientes");
  const clientes = await res.json();

  const select = document.getElementById("cliente_id");
  select.innerHTML = "";

  if (!clientes.length) {
    const opt = document.createElement("option");
    opt.textContent = "Cadastre um cliente primeiro";
    opt.value = "";
    select.appendChild(opt);
    return;
  }

  clientes.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.id;

    const telFmt = formatTelefoneBR(c.telefone);
    option.textContent = `${c.nome} (${telFmt || c.telefone})`;

    select.appendChild(option);
  });
}

// ================== WHATSAPP ==================
function gerarLinkWhatsApp(nome, data, horario, servico, telefone) {
  const msg = encodeURIComponent(
    `Olá, ${nome}! Só confirmando seu horário em ${data} às ${horario} para ${servico}.`
  );

  // ✅ wa.me precisa de dígitos
  const tel = onlyDigits(telefone);

  // se já vier com 55, não duplica
  const telComPais = tel.startsWith("55") ? tel : `55${tel}`;

  return `https://wa.me/${telComPais}?text=${msg}`;
}

// ================== DROPDOWN HORÁRIOS ==================
function abrirDropdown() {
  const grid = document.getElementById("horarios_grid");
  const chev = document.getElementById("slot_chev");
  grid.classList.remove("hidden");
  chev.classList.add("open");
}

function fecharDropdown() {
  const grid = document.getElementById("horarios_grid");
  const chev = document.getElementById("slot_chev");
  grid.classList.add("hidden");
  chev.classList.remove("open");
}

async function carregarHorariosAgenda() {
  const data = document.getElementById("data").value;
  const grid = document.getElementById("horarios_grid");
  const hidden = document.getElementById("horario");
  const label = document.getElementById("horario_label");

  // limpa
  grid.innerHTML = "";
  hidden.value = "";
  label.textContent = "--:--";
  fecharDropdown();

  if (!data) return;

  const res = await fetch(`/horarios-do-dia?data=${encodeURIComponent(data)}`);
  const itens = await res.json();

  if (!itens.length) {
    label.textContent = "Sem horários";
    return;
  }

  // define primeiro livre como padrão
  const primeiroLivre = itens.find((h) => !h.ocupado);
  if (primeiroLivre) {
    hidden.value = primeiroLivre.horario;
    label.textContent = primeiroLivre.horario;
  } else {
    label.textContent = "Lotado";
  }

  // monta grid
  itens.forEach((i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.textContent = i.horario;

    if (i.ocupado) {
      btn.classList.add("ocupado");
      btn.disabled = true;
    } else {
      if (primeiroLivre && i.horario === primeiroLivre.horario) {
        btn.classList.add("ativo");
      }

      btn.addEventListener("click", () => {
        document
          .querySelectorAll("#horarios_grid .slot")
          .forEach((b) => b.classList.remove("ativo"));
        btn.classList.add("ativo");
        hidden.value = i.horario;
        label.textContent = i.horario;
        fecharDropdown();
      });
    }

    grid.appendChild(btn);
  });
}

// ================== AGENDAR ==================
async function agendar() {
  const cliente_id = document.getElementById("cliente_id").value;
  const data = document.getElementById("data").value;
  const horario = document.getElementById("horario").value;
  const servico = document.getElementById("servico").value.trim();
  const observacao = document.getElementById("obs").value.trim();

  // ✅ bloqueia datas passadas (segurança extra além do calendário)
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dSel = new Date(data + "T00:00:00");
  if (isNaN(dSel.getTime())) {
    alert("Selecione uma data válida.");
    return;
  }
  if (dSel < hoje) {
    alert("Não é possível agendar em datas que já passaram.");
    return;
  }

  if (!cliente_id || !data || !horario || !servico) {
    alert("Preencha cliente, data, horário e serviço.");
    return;
  }

  const res = await fetch("/agendamentos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cliente_id, data, horario, servico, observacao }),
  });

  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    alert("Erro: " + (erro.erro || "não foi possível agendar"));
    return;
  }

  // limpa
  document.getElementById("servico").value = "";
  document.getElementById("obs").value = "";

  fecharDropdown();
  await carregarHorariosAgenda();
  carregarAgendamentos();
}

// ================== CONFIRMAR ==================
async function confirmar(id) {
  const res = await fetch(`/agendamentos/${id}/confirmar`, { method: "POST" });
  if (!res.ok) {
    alert("Não foi possível confirmar.");
    return;
  }
  carregarAgendamentos();
}

// ================== EXCLUIR AGENDAMENTO ==================
async function excluirAgendamento(id) {
  if (!confirm("Excluir esse agendamento?")) return;

  const res = await fetch(`/agendamentos/${id}`, { method: "DELETE" });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    alert(e.erro || "Não foi possível excluir.");
    return;
  }

  await carregarHorariosAgenda();
  carregarAgendamentos();
}

// ================== LISTAR AGENDAMENTOS ==================
async function carregarAgendamentos() {
  const res = await fetch("/agendamentos");
  if (!res.ok) return;

  let ag = await res.json();

  const filtro = document.getElementById("filtroData").value;
  if (filtro) ag = ag.filter((a) => a.data === filtro);

  const lista = document.getElementById("lista_agenda");
  lista.innerHTML = "";

  if (!ag.length) {
    const li = document.createElement("li");
    li.className = "item glass";
    li.innerHTML = `<div style="font-weight:800;">Nenhum agendamento encontrado.</div>`;
    lista.appendChild(li);
    return;
  }

  ag.forEach((a) => {
    const li = document.createElement("li");
    li.className = "item glass";

    const telFmt = formatTelefoneBR(a.cliente_telefone);

    const link = gerarLinkWhatsApp(
      a.cliente_nome,
      a.data,
      a.horario,
      a.servico,
      a.cliente_telefone
    );

    const status = a.confirmado
      ? `<span class="badge" style="background:#d4edda;color:#155724;">Confirmado</span>`
      : `<span class="badge" style="background:#fff3cd;color:#856404;">Pendente</span>`;

    const btnConfirmar = !a.confirmado
      ? `<button class="btn-glass gold" onclick="confirmar(${a.id})">Confirmar</button>`
      : ``;

    const btnExcluir = `<button class="btn2" onclick="excluirAgendamento(${a.id})">Excluir</button>`;

    li.innerHTML = `
      <div class="top">
        <div>
          <div style="font-weight:800;">${a.data} • ${a.horario}</div>
          <div class="muted">${a.cliente_nome} • ${telFmt || a.cliente_telefone}</div>
        </div>
        ${status}
      </div>

      <div class="small">${a.servico}${a.observacao ? " • " + a.observacao : ""}</div>

      <div style="margin-top:10px;" class="row">
        <a class="btn" href="${link}" target="_blank">WhatsApp</a>
        ${btnConfirmar}
        ${btnExcluir}
      </div>
    `;

    lista.appendChild(li);
  });
}

// ================== FILTRO ==================
function limparFiltroData() {
  document.getElementById("filtroData").value = "";
  carregarAgendamentos();
}

// ================== INIT ==================
document.addEventListener("DOMContentLoaded", async () => {
  const btn = document.getElementById("slot_toggle");
  const grid = document.getElementById("horarios_grid");

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    grid.classList.contains("hidden") ? abrirDropdown() : fecharDropdown();
  });

  document.addEventListener("click", () => fecharDropdown());
  grid.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("data").addEventListener("change", carregarHorariosAgenda);

  await carregarClientes();
  await carregarHorariosAgenda();
  carregarAgendamentos();
});