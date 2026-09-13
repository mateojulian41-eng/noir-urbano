const test = require("node:test");
const assert = require("node:assert/strict");
const PostgresOrderRepository = require("../repositories/postgres-order-repository");
const createOrderRepository = require("../repositories/order-repository-factory");

const order = {
  id: "order-1",
  order_number: "NU-20260102030405-ABC123",
  wompi_reference: "NOIR-PG-001",
  status: "PENDING_PAYMENT",
  items: [{ name: "SHADOW PALM TEE", size: "M", quantity: 1, unit_amount_in_cents: 15000000 }],
  amount_in_cents: 15000000,
  currency: "COP",
  created_at: "2026-01-02T03:04:05.000Z",
  updated_at: "2026-01-02T03:04:05.000Z",
};

function createSqlMock({ resultFor = () => [], transactionError } = {}) {
  const calls = [];
  const transactions = [];
  function sql(strings, ...values) {
    const query = { text: strings.join(" ? "), values };
    calls.push(query);
    const promise = Promise.resolve(resultFor(query));
    promise.query = query;
    return promise;
  }
  sql.transaction = async (queries) => {
    transactions.push(queries.map((query) => query.query));
    if (transactionError) throw transactionError;
    return Promise.all(queries);
  };
  return { sql, calls, transactions };
}

function orderRow() {
  return { ...order, transaction_id: null, customer: null };
}

test("crea order y order_items en una transacción con parámetros", async () => {
  const mock = createSqlMock({ resultFor: (query) => (
    query.text.includes("INSERT INTO orders") ? [orderRow()] : []
  ) });
  const repository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: mock.sql });

  const saved = await repository.create(order);

  assert.equal(mock.transactions.length, 1);
  assert.equal(mock.transactions[0].length, 2);
  assert.equal(saved.wompi_reference, order.wompi_reference);
  assert.match(mock.transactions[0][0].text, /INSERT INTO orders/);
  assert.ok(mock.transactions[0][0].values.includes(order.wompi_reference));
  assert.equal(mock.transactions[0][0].text.includes(order.wompi_reference), false);
});

test("un error de order_items aborta la transacción y no expone PostgreSQL", async () => {
  const internalError = Object.assign(new Error("secret postgres password"), { code: "23514" });
  const mock = createSqlMock({ transactionError: internalError });
  const repository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: mock.sql });

  await assert.rejects(() => repository.create(order), (error) => {
    assert.equal(error.message, "No se pudo guardar el pedido.");
    assert.equal(error.message.includes("secret"), false);
    return true;
  });
  assert.equal(mock.transactions.length, 1);
  assert.equal(mock.transactions[0].length, 2);
});

test("traduce referencias y transaction_id duplicados", async () => {
  const referenceError = Object.assign(new Error("internal"), {
    code: "23505", constraint: "orders_wompi_reference_key",
  });
  const transactionError = Object.assign(new Error("internal"), {
    code: "23505", constraint: "orders_transaction_id_key",
  });
  const referenceMock = createSqlMock({ transactionError: referenceError });
  const transactionMock = createSqlMock({ resultFor: () => Promise.reject(transactionError) });

  await assert.rejects(
    () => new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: referenceMock.sql }).create(order),
    /referencia Wompi/i,
  );
  await assert.rejects(() => new PostgresOrderRepository({
    databaseUrl: "test-only", sqlClient: transactionMock.sql,
  }).update({ ...order, transaction_id: "txn-1", status: "APPROVED" }), /transacción ya fue procesada/i);
});

test("reconstruye una orden y sus items desde el JOIN", async () => {
  const rows = [{
    ...orderRow(), item_id: 1, item_name: "SHADOW PALM TEE", item_size: "M",
    item_quantity: 1, item_unit_amount_in_cents: 15000000,
  }, {
    ...orderRow(), item_id: 2, item_name: "HEAT TANK", item_size: "L",
    item_quantity: 2, item_unit_amount_in_cents: 11000000,
  }];
  const mock = createSqlMock({ resultFor: () => rows });
  const repository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: mock.sql });

  const found = await repository.findByReference(order.wompi_reference);

  assert.deepEqual(found.items, [
    { name: "SHADOW PALM TEE", size: "M", quantity: 1, unit_amount_in_cents: 15000000 },
    { name: "HEAT TANK", size: "L", quantity: 2, unit_amount_in_cents: 11000000 },
  ]);
  assert.ok(mock.calls[0].values.includes(order.wompi_reference));
});

test("isTransactionProcessed usa una consulta parametrizada", async () => {
  const mock = createSqlMock({ resultFor: () => [{ 1: 1 }] });
  const repository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: mock.sql });

  assert.equal(await repository.isTransactionProcessed("txn-1"), true);
  assert.deepEqual(mock.calls[0].values, ["txn-1"]);
});

test("ausencia de DATABASE_URL produce configuración controlada", async () => {
  const repository = new PostgresOrderRepository({ databaseUrl: "", sqlClient: undefined });

  await assert.rejects(() => repository.findByReference("NOIR-ANY"), /no configurada/i);
  assert.throws(() => createOrderRepository({ env: {} }), /DATABASE_URL/i);
  assert.equal(createOrderRepository({ env: {}, useMemory: true }).constructor.name, "MemoryOrderRepository");
});

test("no persiste tarjetas ni payloads completos", async () => {
  const mock = createSqlMock({ resultFor: (query) => (
    query.text.includes("INSERT INTO orders") ? [orderRow()] : []
  ) });
  const repository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: mock.sql });
  const input = {
    ...order,
    card_number: "4111111111111111",
    cvc: "123",
    payload: { transaction: { secret: "hidden" } },
  };

  await repository.create(input);

  const sqlText = mock.calls.map((call) => call.text).join(" ");
  assert.equal(sqlText.includes("card_number"), false);
  assert.equal(sqlText.includes("payload"), false);
  assert.equal(mock.calls.some((call) => call.values.includes(input.card_number)), false);
  assert.equal(mock.calls.some((call) => call.values.includes(input.cvc)), false);
});