function gerarLinkWhatsApp(nome, data, horario, servico, telefone) {
  const msg = encodeURIComponent(
    `Olá, ${nome}! ✨ Passando para lembrar do seu horário amanhã (${data}) às ${horario} para ${servico}.`
  );
  const tel = String(telefone || "").replace(/\D/g, "");
  return `https://wa.me/55${tel}?text=${msg}`;
}

async function carregarLembretes() {
  const res = await fetch("/lembretes-pendentes");
  const lembretes = await res.json();

  const lista = document.getElementById("lista_lembretes");
  lista.innerHTML = "";

  if (!lembretes.length) {
    const li = document.createElement("li");
    li.className = "item glass";
    li.innerHTML = `<div style="font-weight:800;">Nenhum lembrete pendente ✅</div>`;
    lista.appendChild(li);
    return;
  }

  lembretes.forEach(l => {
    const li = document.createElement("li");
    li.className = "item glass";

    const link = gerarLinkWhatsApp(l.cliente_nome, l.data, l.horario, l.servico, l.cliente_telefone);

    li.innerHTML = `
      <div class="top">
        <div>
          <div style="font-weight:900;">${l.data} • ${l.horario}</div>
          <div class="muted">${l.cliente_nome} • ${l.cliente_telefone}</div>
        </div>
        <span class="badge" style="background:#fff3cd;color:#856404;">Pendente</span>
      </div>

      <div class="small">${l.servico}</div>

      <div style="margin-top:10px;" class="row">
        <a class="btn" href="${link}" target="_blank">Abrir WhatsApp</a>
        <button class="btn-glass gold" onclick="marcarEnviado(${l.id})">Marcar como enviado</button>
      </div>
    `;

    lista.appendChild(li);
  });
}

async function marcarEnviado(id) {
  const res = await fetch(`/lembretes/${id}/enviado`, { method: "POST" });
  if (!res.ok) {
    alert("Não foi possível marcar como enviado.");
    return;
  }
  carregarLembretes();
}

carregarLembretes();
