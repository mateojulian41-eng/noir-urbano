const crypto = require("node:crypto");
const { neon } = require("@neondatabase/serverless");
const PostgresOrderRepository = require("../repositories/postgres-order-repository");

const databaseUrl = process.env.DATABASE_URL;
const syntheticSuffix = crypto.randomBytes(8).toString("hex").toUpperCase();
const syntheticOrder = {
  id: crypto.randomUUID(),
  order_number: `NU-SMOKE-${syntheticSuffix}`,
  wompi_reference: `NOIR-SMOKE-${syntheticSuffix}`,
  status: "PENDING_PAYMENT",
  items: [{
    name: "SMOKE TEST ITEM",
    size: "M",
    quantity: 1,
    unit_amount_in_cents: 100,
  }],
  amount_in_cents: 100,
  currency: "COP",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let sql;
let connectionEstablished = false;
let creationSuccessful = false;
let articleCount = 0;
let updateSuccessful = false;
let idempotent = false;
let cleanupSuccessful = false;

async function cleanup() {
  if (!sql) return false;
  try {
    await sql`DELETE FROM order_items WHERE order_id = ${syntheticOrder.id}`;
    await sql`DELETE FROM orders WHERE id = ${syntheticOrder.id}`;
    const remainingOrders = await sql`
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE id = ${syntheticOrder.id} OR wompi_reference = ${syntheticOrder.wompi_reference}
    `;
    const remainingItems = await sql`
      SELECT COUNT(*)::int AS count
      FROM order_items
      WHERE order_id = ${syntheticOrder.id} OR product_id = ${syntheticOrder.id}
    `;
    return Number(remainingOrders[0]?.count || 0) === 0
      && Number(remainingItems[0]?.count || 0) === 0;
  } catch {
    return false;
  }
}

async function run() {
  if (!databaseUrl) return;

  sql = neon(databaseUrl);
  try {
    const connectionCheck = await sql`SELECT 1 AS connection_check`;
    connectionEstablished = connectionCheck[0]?.connection_check === 1;
    if (!connectionEstablished) throw new Error("SELECT 1 no confirmó conexión.");

    const repository = new PostgresOrderRepository({ databaseUrl, sqlClient: sql });
    const created = await repository.create(syntheticOrder);
    const found = await repository.findByReference(syntheticOrder.wompi_reference);
    creationSuccessful = created.wompi_reference === syntheticOrder.wompi_reference;
    articleCount = found?.items?.length || 0;

    const approved = await repository.update({
      ...found,
      status: "APPROVED",
      transaction_id: `txn-smoke-${syntheticSuffix}`,
    });
    const reread = await repository.findByTransactionId(approved.transaction_id);
    updateSuccessful = reread?.status === "APPROVED";

    const repeated = await repository.update({
      ...reread,
      status: "APPROVED",
      transaction_id: approved.transaction_id,
    });
    idempotent = repeated.transaction_id === approved.transaction_id
      && repeated.status === approved.status;
  } catch {
    if (!connectionEstablished) connectionEstablished = false;
  } finally {
    cleanupSuccessful = await cleanup();
  }
}

const runningAsTest = Boolean(process.env.NODE_TEST_CONTEXT)
  || process.execArgv.includes("--test")
  || process.argv.includes("--test");

if (!runningAsTest) {
  run().finally(() => {
    console.log(`conexión establecida ${connectionEstablished}`);
    console.log(`creación exitosa ${creationSuccessful}`);
    console.log(`cantidad de artículos ${articleCount}`);
    console.log(`actualización exitosa ${updateSuccessful}`);
    console.log(`idempotencia ${idempotent}`);
    console.log(`limpieza exitosa ${cleanupSuccessful}`);
    if (!connectionEstablished || !creationSuccessful || !cleanupSuccessful) {
      process.exitCode = 1;
    }
  });
}