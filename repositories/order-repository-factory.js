const MemoryOrderRepository = require("./memory-order-repository");
const PostgresOrderRepository = require("./postgres-order-repository");

function createOrderRepository({ env = process.env, useMemory = false, sqlClient } = {}) {
  if (useMemory) return new MemoryOrderRepository();
  if (env.DATABASE_URL) {
    return new PostgresOrderRepository({ databaseUrl: env.DATABASE_URL, sqlClient });
  }
  throw new Error("DATABASE_URL es obligatoria para la persistencia de pedidos.");
}

module.exports = createOrderRepository;