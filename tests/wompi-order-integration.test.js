const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { PassThrough } = require("node:stream");
const checkoutHandler = require("../api/wompi-checkout");
const webhookHandler = require("../api/wompi-webhook");
const { getOrderService, resetOrderService } = require("../domain/orders/order-runtime");

function createReq(body) {
  const req = new PassThrough();
  req.method = "POST";
  req.url = "/api/wompi";
  req.headers = { host: "localhost:4173" };
  process.nextTick(() => req.end(JSON.stringify(body)));
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

test("checkout crea una orden y webhook actualiza la misma orden", async () => {
  process.env.WOMPI_ENV = "sandbox";
  process.env.WOMPI_PUBLIC_KEY = "test-public";
  process.env.WOMPI_INTEGRITY_SECRET = "test-secret";
  process.env.WOMPI_EVENTS_SECRET = "event-secret";
  resetOrderService();

  const checkoutRes = createRes();
  await checkoutHandler(createReq({
    items: [{ name: "SHADOW PALM TEE", size: "M", quantity: 1, price: 1 }],
  }), checkoutRes);

  assert.equal(checkoutRes.statusCode, 200);
  const checkout = JSON.parse(checkoutRes.payload);
  const internalOrder = await getOrderService().getOrderByNumber(checkout.order_number);
  const timestamp = "123456";
  const transaction = {
    id: "txn-integration-001",
    reference: internalOrder.wompi_reference,
    status: "APPROVED",
    amount_in_cents: checkout.amountInCents,
    currency: checkout.currency,
  };
  const properties = ["transaction.status"];
  const values = properties.map((property) => property.split(".").slice(1).reduce(
    (value, key) => value[key],
    transaction,
  ));
  const checksum = crypto.createHash("sha256")
    .update([...values, timestamp, "event-secret"].join(""))
    .digest("hex");
  const webhookRes = createRes();
  await webhookHandler(createReq({
    event: "transaction.updated",
    data: { transaction },
    meta: { timestamp, signature: { checksum, properties } },
  }), webhookRes);

  assert.equal(webhookRes.statusCode, 200);
  const saved = await getOrderService().getOrderByReference(internalOrder.wompi_reference);
  assert.equal(saved.status, "APPROVED");
  assert.equal(saved.transaction_id, transaction.id);
});
