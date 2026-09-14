const test = require("node:test");
const assert = require("node:assert/strict");
const PostgresOrderRepository = require("../repositories/postgres-order-repository");
const { classifyListError } = require("../repositories/postgres-order-repository");
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

test("lista sin filtros reconstruye artículos y pagina pedidos, no filas del JOIN", async () => {
  const rows = [{
    ...orderRow(), total_count: 2, item_id: 1, item_name: "SHADOW PALM TEE", item_size: "M",
    item_quantity: 1, item_unit_amount_in_cents: 15000000,
  }, {
    ...orderRow(), total_count: 2, item_id: 2, item_name: "HEAT TANK", item_size: "L",
    item_quantity: 2, item_unit_amount_in_cents: 11000000,
  }];
  const mock = createSqlMock({ resultFor: (query) => query.text.includes("COUNT(*) OVER") ? rows : [] });
  const repository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: mock.sql });

  const result = await repository.list({ limit: 10, offset: 0 });

  assert.equal(result.total, 2);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].items.length, 2);
  assert.equal(result.orders[0].items[1].name, "HEAT TANK");
  assert.match(mock.calls[0].text, /COUNT\(\*\) OVER/);
  assert.match(mock.calls[0].text, /LIMIT\s+CAST\(\s*\?\s+AS integer\)/);
  assert.match(mock.calls[0].text, /OFFSET\s+CAST\(\s*\?\s+AS integer\)/);
  assert.deepEqual(mock.calls[0].values.slice(-2), [10, 0]);
});

test("lista filtros vacíos, filtros combinados y búsqueda sin interpolar valores", async () => {
  const mock = createSqlMock({ resultFor: (query) => query.text.includes("COUNT(*) OVER") ? [] : [] });
  const repository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: mock.sql });

  await repository.list({ search: "", paymentStatus: "", fulfillmentStatus: "", limit: 25, offset: 5 });
  await repository.list({ search: "NU-2026", paymentStatus: "APPROVED", fulfillmentStatus: "PREPARING", limit: 5, offset: 10 });

  assert.equal(mock.calls.length, 2);
  assert.equal(mock.calls[0].values.includes(""), false);
  assert.ok(mock.calls[1].values.includes("NU-2026"));
  assert.ok(mock.calls[1].values.includes("PREPARING"));
  assert.ok(mock.calls[1].values.includes("APPROVED"));
  assert.deepEqual(mock.calls[1].values.slice(-2), [5, 10]);
  assert.equal(mock.calls[1].text.includes("NU-2026"), false);
  assert.equal(mock.calls[1].text.includes("APPROVED"), false);
});

test("lista con parámetros null usa casts explícitos y evita 42P18", async () => {
  const mock = createSqlMock({ resultFor: () => [] });
  const repository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: mock.sql });

  const result = await repository.list({ search: null, paymentStatus: null, fulfillmentStatus: null, limit: 20, offset: 0 });
  const query = mock.calls[0];

  assert.deepEqual(result, { total: 0, orders: [] });
  assert.match(query.text, /CAST\(\s*\?\s+AS text\)/);
  assert.match(query.text, /LIMIT\s+CAST\(\s*\?\s+AS integer\)/);
  assert.match(query.text, /OFFSET\s+CAST\(\s*\?\s+AS integer\)/);
  assert.equal(query.values.filter((value) => value === null).length, 6);
  assert.equal(classifyListError({ code: "42P18" }), "parameter");
  assert.notEqual(classifyListError({ code: "42P18" }), "connection");
});

test("el listado devuelve resultado vacío y convierte errores SQL en error controlable", async () => {
  const emptyMock = createSqlMock({ resultFor: () => [] });
  const emptyRepository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: emptyMock.sql });
  assert.deepEqual(await emptyRepository.list(), { total: 0, orders: [] });

  const sqlError = Object.assign(new Error("internal SQL details"), { code: "42601" });
  const errorMock = createSqlMock({ resultFor: () => Promise.reject(sqlError) });
  const errorRepository = new PostgresOrderRepository({ databaseUrl: "test-only", sqlClient: errorMock.sql });
  await assert.rejects(() => errorRepository.list(), (error) => {
    assert.equal(error.code, "42601");
    assert.equal(error.message, "internal SQL details");
    return true;
  });
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