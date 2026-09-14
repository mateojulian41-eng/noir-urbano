const { getOrderService } = require("../domain/orders/order-runtime");
const { requireAdmin, sendJson } = require("./admin-auth");

const FULFILLMENT_STATUSES = new Set(["RECEIVED", "PREPARING", "SHIPPED", "DELIVERED", "CANCELLED"]);
const MAX_LIMIT = 100;

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) reject(new Error("body"));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("json")); }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (!["GET", "PATCH"].includes(req.method)) {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const auth = await requireAdmin(req);
  if (auth.error) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const service = getOrderService();
  try {
    if (req.method === "GET") {
      const exactOrderNumber = url.searchParams.get("order_number")?.trim();
      if (req.adminRoute === "detail" && !exactOrderNumber) {
        sendJson(res, 400, { error: "order_number es obligatorio." });
        return;
      }
      if (exactOrderNumber) {
        const order = await service.getAdminOrderByNumber(exactOrderNumber);
        if (!order) { sendJson(res, 404, { error: "Pedido no encontrado." }); return; }
        sendJson(res, 200, { order, history: await service.getAdminStatusHistory(exactOrderNumber) });
        return;
      }
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), MAX_LIMIT);
      const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
      const result = await service.listAdminOrders({
        search: url.searchParams.get("search")?.trim() || undefined,
        fulfillmentStatus: url.searchParams.get("fulfillment_status") || undefined,
        paymentStatus: url.searchParams.get("payment_status") || undefined,
        limit, offset,
      });
      sendJson(res, 200, result);
      return;
    }

    const body = await parseBody(req);
    const orderNumber = String(body.order_number || "").trim();
    const nextStatus = String(body.fulfillment_status || "").trim();
    if (!/^[A-Za-z0-9-]{4,80}$/.test(orderNumber) || !FULFILLMENT_STATUSES.has(nextStatus)) {
      sendJson(res, 400, { error: "Pedido o estado inválido." });
      return;
    }
    const order = await service.updateAdminFulfillmentStatus(orderNumber, nextStatus, auth.userId);
    if (!order) {
      sendJson(res, 404, { error: "Pedido no encontrado." });
      return;
    }
    sendJson(res, 200, { order, history: await service.getAdminStatusHistory(orderNumber) });
  } catch (error) {
    if (error.message === "Transición operativa inválida." || error.message === "Solo los pedidos aprobados pueden avanzar operativamente.") {
      sendJson(res, 400, { error: error.message });
      return;
    }
    if (error.message === "Persistencia de pedidos no configurada.") {
      sendJson(res, 503, { error: "Servicio de pedidos no disponible." });
      return;
    }
    sendJson(res, 503, { error: "No se pudo gestionar el pedido." });
  }
};

module.exports.FULFILLMENT_STATUSES = FULFILLMENT_STATUSES;
