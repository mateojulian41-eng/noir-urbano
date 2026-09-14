const STATUS_LABELS = {
  RECEIVED: "Recibido", PREPARING: "Preparando", SHIPPED: "Enviado", DELIVERED: "Entregado", CANCELLED: "Cancelado",
  PENDING_PAYMENT: "Pago pendiente", APPROVED: "Aprobado", DECLINED: "Rechazado",
};
const OPERATIONAL_STATUSES = ["RECEIVED", "PREPARING", "SHIPPED", "DELIVERED", "CANCELLED"];
const loginPanel = document.querySelector("#login");
const dashboard = document.querySelector("#dashboard");
const ordersElement = document.querySelector("#orders");
const feedback = document.querySelector("#feedback");
const filterForm = document.querySelector("#filters");
let clerk;

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.style.color = isError ? "#873b38" : "";
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

async function token() {
  return clerk.session?.getToken();
}

async function api(path, options = {}) {
  const accessToken = await token();
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la solicitud.");
  return payload;
}

function renderHistory(history) {
  if (!history?.length) return "Sin cambios registrados";
  return history.map((entry) => `${escapeText(STATUS_LABELS[entry.previous_status] || entry.previous_status)} -> ${escapeText(STATUS_LABELS[entry.new_status] || entry.new_status)} · ${new Date(entry.created_at).toLocaleString("es-CO")}`).join("<br>");
}

function renderOrder(order, history = []) {
  const items = (order.items || []).map((item) => `${escapeText(item.quantity)}x ${escapeText(item.name)} / ${escapeText(item.size)}`).join(" · ");
  const statusOptions = OPERATIONAL_STATUSES.map((status) => `<option value="${status}" ${status === order.fulfillment_status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`).join("");
  const element = document.createElement("article");
  element.className = "order";
  element.innerHTML = `
    <div><div class="order-number">${escapeText(order.order_number)}</div><div class="order-meta">${new Date(order.created_at).toLocaleString("es-CO")} · ${escapeText(order.environment)}</div><div class="items">${items}</div></div>
    <div><span class="status status--${escapeText(order.status).toLowerCase()}">${escapeText(STATUS_LABELS[order.status] || order.status)}</span><div class="order-meta">Pago</div></div>
    <div><span class="status status--${escapeText(order.fulfillment_status).toLowerCase()}">${escapeText(STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status)}</span><div class="order-meta">Operación</div></div>
    <div><div class="money">${new Intl.NumberFormat("es-CO", { style: "currency", currency: order.currency }).format(order.amount_in_cents / 100)}</div><form class="status-form"><select name="status" aria-label="Estado operativo">${statusOptions}</select><button class="primary" type="submit">Guardar</button></form></div>
    <div class="history"><strong>Historial</strong><br>${renderHistory(history)}</div>`;
  element.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextStatus = new FormData(event.currentTarget).get("status");
    try {
      const result = await api("/api/admin/order-status", { method: "PATCH", body: JSON.stringify({ order_number: order.order_number, fulfillment_status: nextStatus }) });
      element.replaceWith(renderOrder(result.order, result.history));
      setFeedback("Pedido actualizado.");
    } catch (error) { setFeedback(error.message, true); }
  });
  return element;
}

async function loadOrders() {
  setFeedback("Cargando pedidos...");
  const params = new URLSearchParams(new FormData(filterForm));
  const result = await api(`/api/admin/orders?${params}`);
  ordersElement.replaceChildren(...result.orders.map((order) => renderOrder(order)));
  setFeedback(`${result.total} pedido${result.total === 1 ? "" : "s"}`);
}

async function start() {
  const config = await fetch("/api/admin-config").then((response) => response.json());
  if (!config.publishableKey || !window.Clerk) throw new Error("El acceso administrativo no está configurado.");
  clerk = new window.Clerk(config.publishableKey);
  await clerk.load();
  clerk.addListener(({ user }) => {
    const authenticated = Boolean(user);
    loginPanel.hidden = authenticated;
    dashboard.hidden = !authenticated;
    document.querySelector("#sign-out").hidden = !authenticated;
    if (authenticated) loadOrders().catch((error) => setFeedback(error.message, true));
  });
  document.querySelector("#sign-in").addEventListener("click", () => clerk.openSignIn());
  document.querySelector("#sign-out").addEventListener("click", () => clerk.signOut());
  filterForm.addEventListener("submit", (event) => { event.preventDefault(); loadOrders().catch((error) => setFeedback(error.message, true)); });
  if (clerk.user) { loginPanel.hidden = true; dashboard.hidden = false; await loadOrders(); } else { loginPanel.hidden = false; document.querySelector("#sign-out").hidden = true; }
}

start().catch((error) => { loginPanel.hidden = false; setFeedback(error.message, true); });
