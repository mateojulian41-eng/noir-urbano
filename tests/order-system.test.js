const test = require("node:test");
const assert = require("node:assert/strict");
const OrderService = require("../domain/orders/order-service");
const { ORDER_STATUSES } = require("../domain/orders/order-status");
const MemoryOrderRepository = require("../repositories/memory-order-repository");

function buildService() {
  let tick = 0;
  const repository = new MemoryOrderRepository();
  const service = new OrderService({
    repository,
    clock: () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5 + tick++)),
  });
  return { repository, service };
}

function pendingInput(reference = "NOIR-REF-001") {
  return {
    wompi_reference: reference,
    currency: "COP",
    items: [{ name: "SHADOW PALM TEE", size: "M", quantity: 1 }],
  };
}

function transaction(order, status = "APPROVED", id = "txn-001") {
  return {
    id,
    reference: order.wompi_reference,
    status,
    amount_in_cents: order.amount_in_cents,
    currency: order.currency,
  };
}

function webhook(order, status = "APPROVED", id = "txn-001") {
  return {
    event: "transaction.updated",
    data: {
      transaction: {
        id,
        reference: order.wompi_reference,
        status,
        amount_in_cents: order.amount_in_cents,
        currency: order.currency,
      },
    },
  };
}

test("crea un pedido pendiente con número de orden y valores del catálogo", async () => {
  const { service } = buildService();
  const order = await service.createPendingOrder(pendingInput());

  assert.equal(order.status, ORDER_STATUSES.PENDING_PAYMENT);
  assert.match(order.order_number, /^NU-20260102030405-/);
  assert.equal(order.amount_in_cents, 15000000);
  assert.equal(order.items[0].unit_amount_in_cents, 15000000);
});

test("rechaza referencia duplicada", async () => {
  const { service } = buildService();
  await service.createPendingOrder(pendingInput());
  await assert.rejects(() => service.createPendingOrder(pendingInput()), /referencia/i);
});

test("valida monto, moneda y artículos, y rechaza precios del cliente", async () => {
  const { service } = buildService();
  await assert.rejects(
    () => service.createPendingOrder({ ...pendingInput("NOIR-AMOUNT"), amount_in_cents: 1 }),
    /monto/i,
  );
  await assert.rejects(
    () => service.createPendingOrder({ ...pendingInput("NOIR-CURRENCY"), currency: "USD" }),
    /currency|COP/i,
  );
  await assert.rejects(
    () => service.createPendingOrder({ ...pendingInput("NOIR-ITEMS"), items: [] }),
    /items|vacío/i,
  );
  await assert.rejects(
    () => service.createPendingOrder({
      ...pendingInput("NOIR-PRICE"),
      items: [{ name: "SHADOW PALM TEE", size: "M", quantity: 1, price: 1 }],
    }),
    /campo|permitido|precio/i,
  );
});

test("actualiza a APPROVED y luego rechaza volver a PENDING_PAYMENT", async () => {
  const { service } = buildService();
  const created = await service.createPendingOrder(pendingInput());
  const approved = await service.updateOrderFromTransaction(transaction(created));

  assert.equal(approved.status, ORDER_STATUSES.APPROVED);
  assert.equal(approved.transaction_id, "txn-001");
  await assert.rejects(
    () => service.updateOrderFromTransaction(transaction(approved, "PENDING_PAYMENT", "txn-002")),
    /inválida|status/i,
  );
});

test("actualiza a DECLINED y permite consultar el pedido sin duplicarlo", async () => {
  const { service } = buildService();
  const created = await service.createPendingOrder(pendingInput());
  const declined = await service.updateOrderFromTransaction(transaction(created, "DECLINED"));

  assert.equal(declined.status, ORDER_STATUSES.DECLINED);
  assert.equal((await service.getOrderByReference(created.wompi_reference)).status, "DECLINED");
});

test("una transacción ya procesada no se aplica dos veces", async () => {
  const { service } = buildService();
  const created = await service.createPendingOrder(pendingInput());
  const first = await service.updateOrderFromTransaction(transaction(created));
  const second = await service.updateOrderFromTransaction(transaction(created));

  assert.deepEqual(second, first);
  assert.equal(await service.isTransactionAlreadyProcessed("txn-001"), true);
});

test("dos webhooks iguales producen la misma orden sin duplicarla", async () => {
  const { repository, service } = buildService();
  const created = await service.createPendingOrder(pendingInput());
  const first = await service.processWebhookEvent(webhook(created));
  const second = await service.processWebhookEvent(webhook(created));

  assert.deepEqual(second, first);
  assert.equal(repository.size, 1);
});

test("dos eventos APPROVED iguales son idempotentes y una transición válida actualiza updated_at", async () => {
  const { service } = buildService();
  const created = await service.createPendingOrder(pendingInput());
  const first = await service.processWebhookEvent(webhook(created, "APPROVED", "txn-approved"));
  const second = await service.processWebhookEvent(webhook(created, "APPROVED", "txn-approved"));

  assert.deepEqual(second, first);
  assert.notEqual(first.updated_at, created.updated_at);
});

test("la respuesta pública no expone cliente, tarjeta ni payload del proveedor", async () => {
  const { service } = buildService();
  const order = await service.createPendingOrder({
    ...pendingInput(),
    customer: { name: "Cliente de prueba", email: "test@example.com" },
  });

  assert.equal("customer" in order, false);
  assert.equal("card_number" in order, false);
  assert.equal("cvc" in order, false);
  assert.equal("payload" in order, false);
});

test("el repositorio en memoria clona datos y no almacena payloads completos", async () => {
  const { repository, service } = buildService();
  const order = await service.createPendingOrder(pendingInput());
  const stored = await repository.findByReference(order.wompi_reference);
  stored.items[0].quantity = 99;

  const reread = await repository.findByReference(order.wompi_reference);
  assert.equal(reread.items[0].quantity, 1);
  assert.equal(Object.keys(reread).includes("payload"), false);
});
