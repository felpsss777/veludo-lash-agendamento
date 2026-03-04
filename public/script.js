function limpar(str){
  return String(str || "").toLowerCase().trim();
}

async function cadastrarCliente() {
  const nome = document.getElementById("nome").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const observacao = document.getElementById("observacao").value.trim();

  if(!nome || !telefone){
    alert("Preencha nome e telefone.");
    return;
  }

  const res = await fetch("/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, telefone, observacao })
  });

  if(!res.ok){
    const e = await res.json().catch(()=>({}));
    alert("Erro ao cadastrar: " + (e.erro || "verifique o servidor"));
    return;
  }

  document.getElementById("nome").value = "";
  document.getElementById("telefone").value = "";
  document.getElementById("observacao").value = "";

  carregarClientes();
}

async function carregarClientes() {
  const res = await fetch("/clientes");
  const clientes = await res.json();

  const q = limpar(document.getElementById("busca").value);
  const filtrados = clientes.filter(c => {
    const alvo = `${limpar(c.nome)} ${limpar(c.telefone)}`;
    return alvo.includes(q);
  });

  const lista = document.getElementById("lista");
  lista.innerHTML = "";

  filtrados.forEach(c => {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="top">
        <div>
          <div style="font-weight:800;">${c.nome}</div>
          <div class="muted">${c.telefone}</div>
        </div>
        <span class="badge">Cliente</span>
      </div>
      ${c.observacao ? `<div class="small">${c.observacao}</div>` : ``}
    `;
    lista.appendChild(li);
  });
}

carregarClientes();
