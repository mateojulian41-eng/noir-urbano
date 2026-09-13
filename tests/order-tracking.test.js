const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const {
  generateLookupToken,
  hashLookupToken,
  verifyLookupToken,
} = require("../domain/orders/order-access");
const { getOrderService, resetOrderService } = require("../domain/orders/order-runtime");
const orderStatusHandler = require("../api/order-status");

function createReq(method, query = "") {
  const req = new PassThrough();
  req.method = method;
  req.url = `/api/order-status${query}`;
  req.headers = { host: "localhost:4173" };
  process.nextTick(() => req.end());
  return req;
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(payload) { this.payload = payload; },
  };
}

async function createTrackedOrder() {
  resetOrderService();
  const service = getOrderService();
  const token = generateLookupToken();
  const order = await service.createPendingOrder({
    wompi_reference: `NOIR-TRACK-${Date.now()}`,
    items: [{ name: "SHADOW PALM TEE", size: "M", quantity: 1 }],
    currency: "COP",
  }, { lookupTokenHash: hashLookupToken(token) });
  return { service, order, token };
}

test("genera token URL-safe con entropía y hash SHA-256 hexadecimal", () => {
  const token = generateLookupToken();
  const hash = hashLookupToken(token);
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]+$/);
  assert.equal(verifyLookupToken(token, hash), true);
  assert.equal(verifyLookupToken(`${token}x`, hash), false);
  assert.equal(verifyLookupToken(token, hash.slice(0, 10)), false);
});

test("pedido guarda hash y no token, y APPROVED fija paid_at una sola vez", async () => {
  const { service, order, token } = await createTrackedOrder();
  const internal = await service.getOrderByNumber(order.order_number);
  assert.equal(internal.lookup_token_hash, hashLookupToken(token));
  assert.equal("lookup_token" in internal, false);

  const approved = await service.updateOrderFromTransaction({
    id: "txn-track-1",
    reference: internal.wompi_reference,
    status: "APPROVED",
    amount_in_cents: internal.amount_in_cents,
    currency: "COP",
  });
  const repeated = await service.updateOrderFromTransaction({
    id: "txn-track-1",
    reference: internal.wompi_reference,
    status: "APPROVED",
    amount_in_cents: internal.amount_in_cents,
    currency: "COP",
  });
  assert.ok(approved.paid_at);
  assert.equal(repeated.paid_at, approved.paid_at);
});

test("order-status rechaza método, parámetros y formatos inválidos", async () => {
  const postRes = createRes();
  await orderStatusHandler(createReq("POST"), postRes);
  assert.equal(postRes.statusCode, 405);

  const missingRes = createRes();
  await orderStatusHandler(createReq("GET"), missingRes);
  assert.equal(missingRes.statusCode, 400);

  const invalidRes = createRes();
  await orderStatusHandler(createReq("GET", "?order_number=bad%20value&token=bad"), invalidRes);
  assert.equal(invalidRes.statusCode, 400);
});

test("order-status responde 404 uniforme para orden inexistente y token incorrecto", async () => {
  const { order, token } = await createTrackedOrder();
  const wrongToken = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  const wrongRes = createRes();
  await orderStatusHandler(createReq("GET", `?order_number=${order.order_number}&token=${wrongToken}`), wrongRes);

  const missingRes = createRes();
  await orderStatusHandler(createReq("GET", `?order_number=NU-MISSING-001&token=${token}`), missingRes);

  assert.equal(wrongRes.statusCode, 404);
  assert.equal(missingRes.statusCode, 404);
  assert.equal(wrongRes.payload, missingRes.payload);
});

test("consulta válida devuelve solo información pública sanitizada", async () => {
  const { order, token } = await createTrackedOrder();
  const res = createRes();
  await orderStatusHandler(createReq("GET", `?order_number=${order.order_number}&token=${token}`), res);
  const payload = JSON.parse(res.payload);

  assert.equal(res.statusCode, 200);
  assert.equal(payload.order_number, order.order_number);
  assert.equal(payload.payment_status, "PENDING_PAYMENT");
  assert.equal(payload.fulfillment_status, "RECEIVED");
  assert.equal(payload.items[0].product_name, "SHADOW PALM TEE");
  for (const field of ["id", "transaction_id", "wompi_reference", "lookup_token", "lookup_token_hash", "unit_price_in_cents"]) {
    assert.equal(field in payload, false);
  }
});

test("sin DATABASE_URL la creación del runtime productivo falla de forma controlada", () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  resetOrderService();
  assert.throws(() => getOrderService(), /DATABASE_URL es obligatoria/i);
  if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
  else process.env.NODE_TEST_CONTEXT = previous;
  resetOrderService();
});

test("order-status devuelve 503 seguro si la persistencia no está disponible", async () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  resetOrderService();
  const res = createRes();
  const token = generateLookupToken();
  await orderStatusHandler(createReq("GET", `?order_number=NU-TRACK-001&token=${token}`), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.includes("DATABASE_URL"), false);
  if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
  else process.env.NODE_TEST_CONTEXT = previous;
  resetOrderService();
});

test("server enruta order-status y frontend conserva solo el acceso permitido", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const scriptSource = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
  assert.match(serverSource, /\/api\/order-status/);
  assert.match(scriptSource, /noir_urbano_order_access/);
  assert.match(scriptSource, /order_number/);
  assert.match(scriptSource, /lookup_token/);
  assert.match(scriptSource, /Pago pendiente/);
  assert.match(scriptSource, /Pedido recibido/);
  assert.match(scriptSource, /localStorage\.setItem\(ORDER_ACCESS_STORAGE_KEY/);
  assert.equal(scriptSource.includes("localStorage.setItem(\"transaction_id\""), false);
});
