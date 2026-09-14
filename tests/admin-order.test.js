const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const OrderService = require("../domain/orders/order-service");
const MemoryOrderRepository = require("../repositories/memory-order-repository");
const adminOrdersHandler = require("../api/admin-orders");

function createRes() {
  return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(payload) { this.payload = payload; } };
}

function createReq(method, body = "") {
  const req = new PassThrough();
  req.method = method;
  req.url = "/api/admin-orders";
  req.headers = { host: "localhost:4173" };
  process.nextTick(() => req.end(body));
  return req;
}

test("API administrativa rechaza acceso sin sesión", async () => {
  const res = createRes();
  await adminOrdersHandler(createReq("GET"), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(JSON.parse(res.payload), { error: "No autorizado." });
});

test("admin puede listar, cambiar operación y consultar historial", async () => {
  const repository = new MemoryOrderRepository();
  const service = new OrderService({ repository, clock: () => new Date("2026-01-02T03:04:05.000Z") });
  const order = await service.createPendingOrder({
    wompi_reference: "NOIR-ADMIN-001",
    currency: "COP",
    items: [{ name: "SHADOW PALM TEE", size: "M", quantity: 1 }],
  });

  const listed = await service.listAdminOrders({ fulfillmentStatus: "RECEIVED" });
  assert.equal(listed.total, 1);
  assert.equal(listed.orders[0].items[0].name, "SHADOW PALM TEE");

  await service.updateOrderFromTransaction({
    id: "txn-admin-001",
    reference: order.wompi_reference,
    status: "APPROVED",
    amount_in_cents: order.amount_in_cents,
    currency: order.currency,
  });
  const updated = await service.updateAdminFulfillmentStatus(order.order_number, "PREPARING", "user_admin");
  assert.equal(updated.fulfillment_status, "PREPARING");
  const history = await service.getAdminStatusHistory(order.order_number);
  assert.deepEqual(history[0], { previous_status: "RECEIVED", new_status: "PREPARING", changed_by: "user_admin", created_at: "2026-01-02T03:04:05.000Z" });
  assert.equal("id" in updated, false);
  assert.equal("transaction_id" in updated, false);
  assert.equal("wompi_reference" in updated, false);
  await service.updateAdminFulfillmentStatus(order.order_number, "PREPARING", "user_admin");
  assert.equal((await service.getAdminStatusHistory(order.order_number)).length, 1);
  await assert.rejects(() => service.updateAdminFulfillmentStatus(order.order_number, "DELIVERED", "user_admin"), /Transición/);
});

test("solo pedidos aprobados avanzan y las transiciones operativas válidas se conservan", async () => {
  const repository = new MemoryOrderRepository();
  const service = new OrderService({ repository, clock: () => new Date("2026-01-02T03:04:05.000Z") });
  const create = async (reference) => service.createPendingOrder({
    wompi_reference: reference, currency: "COP", items: [{ name: "SHADOW PALM TEE", size: "M", quantity: 1 }],
  });
  const approve = (order, id) => service.updateOrderFromTransaction({
    id, reference: order.wompi_reference, status: "APPROVED", amount_in_cents: order.amount_in_cents, currency: order.currency,
  });

  const pending = await create("NOIR-ADMIN-PENDING");
  await assert.rejects(() => service.updateAdminFulfillmentStatus(pending.order_number, "PREPARING", "admin"), /aprobados/);

  const shipped = await create("NOIR-ADMIN-SHIPPED");
  await approve(shipped, "txn-admin-shipped");
  await service.updateAdminFulfillmentStatus(shipped.order_number, "PREPARING", "admin");
  await service.updateAdminFulfillmentStatus(shipped.order_number, "SHIPPED", "admin");
  await service.updateAdminFulfillmentStatus(shipped.order_number, "DELIVERED", "admin");
  await assert.rejects(() => service.updateAdminFulfillmentStatus(shipped.order_number, "SHIPPED", "admin"), /Transición/);

  const receivedCancel = await create("NOIR-ADMIN-CANCEL-1");
  await service.updateAdminFulfillmentStatus(receivedCancel.order_number, "CANCELLED", "admin");
  await assert.rejects(() => service.updateAdminFulfillmentStatus(receivedCancel.order_number, "RECEIVED", "admin"), /Transición/);

  const preparingCancel = await create("NOIR-ADMIN-CANCEL-2");
  await approve(preparingCancel, "txn-admin-cancel");
  await service.updateAdminFulfillmentStatus(preparingCancel.order_number, "PREPARING", "admin");
  await service.updateAdminFulfillmentStatus(preparingCancel.order_number, "CANCELLED", "admin");
  await assert.rejects(() => service.updateAdminFulfillmentStatus(preparingCancel.order_number, "PREPARING", "admin"), /Transición/);
});
