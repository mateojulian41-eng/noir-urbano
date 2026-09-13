const { getOrderService } = require("../domain/orders/order-runtime");
const { LOOKUP_TOKEN_PATTERN } = require("../domain/orders/order-access");

const MAX_ORDER_NUMBER_LENGTH = 80;
const MAX_TOKEN_LENGTH = 128;
const NOT_FOUND_MESSAGE = "Pedido no encontrado.";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function isValidOrderNumber(value) {
  return typeof value === "string"
    && value.length <= MAX_ORDER_NUMBER_LENGTH
    && /^[A-Za-z0-9-]{4,80}$/.test(value);
}

function isValidToken(value) {
  return typeof value === "string"
    && value.length <= MAX_TOKEN_LENGTH
    && LOOKUP_TOKEN_PATTERN.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const orderNumber = url.searchParams.get("order_number");
  const token = url.searchParams.get("token");

  if (!isValidOrderNumber(orderNumber) || !isValidToken(token)) {
    sendJson(res, 400, { error: "Parámetros inválidos." });
    return;
  }

  try {
    const order = await getOrderService().getPublicOrderByNumberAndToken(orderNumber, token);
    if (!order) {
      sendJson(res, 404, { error: NOT_FOUND_MESSAGE });
      return;
    }
    sendJson(res, 200, order);
  } catch (error) {
    if (error?.message === "DATABASE_URL es obligatoria para la persistencia de pedidos.") {
      sendJson(res, 503, { error: "Servicio de pedidos no disponible." });
      return;
    }
    sendJson(res, 503, { error: "No se pudo consultar el pedido." });
  }
};

module.exports.isValidOrderNumber = isValidOrderNumber;
module.exports.isValidToken = isValidToken;
