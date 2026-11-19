const numbersEl = document.getElementById("numbers");
const selectedEl = document.getElementById("selected-number");
const reserveButton = document.getElementById("reserve-button");
const feedback = document.getElementById("feedback");
const loadMessage = document.getElementById("load-message");
let numbers = [];
let selectedNumber = null;
let adminToken = "";

const pad = n => String(n).padStart(2, "0");
const statusLabel = status => ({available:"Disponível", reserved:"Reservado", sold:"Vendido"}[status] || status);

function renderNumbers() {
  numbersEl.innerHTML = "";
  numbers.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `number ${item.status}`;
    if (selectedNumber === item.number && item.status === "available") button.classList.add("selected");
    button.textContent = item.status === "sold" ? `${pad(item.number)} ×` : pad(item.number);
    button.title = `${pad(item.number)} — ${statusLabel(item.status)}`;
    button.disabled = item.status !== "available";
    button.setAttribute("aria-label", `${pad(item.number)}: ${statusLabel(item.status)}`);
    button.addEventListener("click", () => {
      selectedNumber = item.number;
      selectedEl.textContent = pad(item.number);
      reserveButton.disabled = false;
      feedback.textContent = "";
      feedback.className = "feedback";
      renderNumbers();
    });
    numbersEl.appendChild(button);
  });
  if (selectedNumber && !numbers.some(n => n.number === selectedNumber && n.status === "available")) {
    selectedNumber = null;
    selectedEl.textContent = "Nenhum";
    reserveButton.disabled = true;
  }
  loadMessage.textContent = numbers.length ? `${numbers.filter(n=>n.status==="available").length} números disponíveis de 50.` : "Não foi possível carregar os números.";
}

async function loadNumbers() {
  try {
    const response = await fetch("/api/numbers");
    if (!response.ok) throw new Error("Falha ao consultar os números.");
    numbers = await response.json();
    renderNumbers();
  } catch (error) {
    loadMessage.textContent = error.message;
  }
}

document.getElementById("reservation-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!selectedNumber) return;
  const form = new FormData(event.currentTarget);
  reserveButton.disabled = true;
  reserveButton.textContent = "Enviando...";
  feedback.textContent = "";
  try {
    const response = await fetch("/api/reservations", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({number:selectedNumber,name:form.get("name"),phone:form.get("phone")})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível reservar.");
    feedback.textContent = data.message;
    feedback.className = "feedback success";
    event.currentTarget.reset();
    selectedNumber = null;
    selectedEl.textContent = "Nenhum";
    await loadNumbers();
  } catch (error) {
    feedback.textContent = error.message;
    feedback.className = "feedback error";
    reserveButton.disabled = false;
    await loadNumbers();
  } finally {
    reserveButton.textContent = "Solicitar reserva — R$ 15,00";
  }
});

const socket = io();
socket.on("numbers:updated", loadNumbers);

async function loadAdmin() {
  const response = await fetch("/api/admin/numbers", {headers:{Authorization:`Bearer ${adminToken}`}});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Falha no painel.");
  const list = document.getElementById("admin-list");
  list.innerHTML = "";
  data.forEach(item => {
    const row = document.createElement("div");
    row.className = "admin-row";
    const info = document.createElement("div");
    const buyer = item.buyer_name ? ` — ${item.buyer_name} (${item.buyer_phone || "sem telefone"})` : "";
    info.textContent = `${pad(item.number)} · ${statusLabel(item.status)}${buyer}`;
    const actions = document.createElement("div");
    actions.className = "actions";
    if (item.status !== "sold") {
      const sold = document.createElement("button");
      sold.textContent = "Marcar vendido";
      sold.addEventListener("click", () => updateAdminNumber(item.number, "sold"));
      actions.appendChild(sold);
    }
    if (item.status !== "available") {
      const free = document.createElement("button");
      free.className = "secondary";
      free.textContent = "Liberar";
      free.addEventListener("click", () => updateAdminNumber(item.number, "available"));
      actions.appendChild(free);
    }
    row.append(info, actions);
    list.appendChild(row);
  });
  document.getElementById("admin-content").hidden = false;
}

async function updateAdminNumber(number, status) {
  const response = await fetch(`/api/admin/numbers/${number}`, {
    method:"PATCH",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${adminToken}`},
    body:JSON.stringify({status})
  });
  const data = await response.json();
  if (!response.ok) {
    document.getElementById("admin-feedback").textContent = data.error || "Erro ao atualizar.";
    return;
  }
  await loadAdmin();
  await loadNumbers();
}

document.getElementById("admin-login").addEventListener("submit", async event => {
  event.preventDefault();
  adminToken = document.getElementById("admin-token").value;
  try {
    await loadAdmin();
    document.getElementById("admin-feedback").textContent = "Acesso autorizado.";
    document.getElementById("admin-feedback").className = "feedback success";
  } catch (error) {
    document.getElementById("admin-feedback").textContent = error.message;
    document.getElementById("admin-feedback").className = "feedback error";
    document.getElementById("admin-content").hidden = true;
  }
});
document.getElementById("refresh-admin").addEventListener("click", async () => {
  try { await loadAdmin(); } catch (error) {
    document.getElementById("admin-feedback").textContent = error.message;
  }
});

loadNumbers();
