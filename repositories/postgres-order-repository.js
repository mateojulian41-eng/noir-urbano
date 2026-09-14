const OrderRepository = require("./order-repository");

const SAFE_DATABASE_ERROR = "No se pudo guardar el pedido.";
const SAFE_CONFIGURATION_ERROR = "Persistencia de pedidos no configurada.";

function mapOrder(rows) {
  if (!rows || rows.length === 0) return undefined;
  const first = rows[0];
  const items = rows
    .filter((row) => row.item_id !== null && row.item_id !== undefined)
    .map((row) => ({
      name: row.item_name,
      size: row.item_size,
      quantity: row.item_quantity,
      unit_amount_in_cents: row.item_unit_amount_in_cents,
    }));

  const order = {
    id: first.id,
    order_number: first.order_number,
    wompi_reference: first.wompi_reference,
    status: first.status,
    items,
    amount_in_cents: first.amount_in_cents,
    currency: first.currency,
    environment: first.environment,
    lookup_token_hash: first.lookup_token_hash,
    fulfillment_status: first.fulfillment_status,
    paid_at: first.paid_at,
    created_at: first.created_at,
    updated_at: first.updated_at,
  };
  if (first.transaction_id !== null && first.transaction_id !== undefined) {
    order.transaction_id = first.transaction_id;
  }
  return order;
}

function mapOrders(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.order_number)) grouped.set(row.order_number, []);
    grouped.get(row.order_number).push(row);
  }
  return [...grouped.values()].map(mapOrder);
}

function classifyListError(error) {
  const code = String(error?.code || "");
  if (/^42703$/.test(code)) return "column";
  if (/^42P01$/.test(code)) return "relation";
  if (/^42601$/.test(code)) return "syntax";
  if (/^22P02|22023$/.test(code)) return "parameter";
  if (/^42803$/.test(code)) return "aggregation";
  if (/^08|^57P01|^53300$/.test(code)) return "connection";
  return "connection";
}

function reportListError(stage, error) {
  console.info("[admin-orders] list failed", {
    stage,
    code: error?.code || "unknown",
    category: classifyListError(error),
  });
}

function toSafeError(error) {
  const safeError = new Error(SAFE_DATABASE_ERROR);
  if (error?.code === "23505") {
    if (String(error.constraint || "").includes("wompi_reference")) {
      safeError.message = "La referencia Wompi ya existe.";
      return safeError;
    }
    if (String(error.constraint || "").includes("transaction_id")) {
      safeError.message = "La transacción ya fue procesada.";
      return safeError;
    }
    safeError.message = "El pedido ya existe.";
    return safeError;
  }
  return safeError;
}

class PostgresOrderRepository extends OrderRepository {
  constructor({ databaseUrl = process.env.DATABASE_URL, sqlClient } = {}) {
    super();
    this.databaseUrl = databaseUrl;
    this.sqlClient = sqlClient;
  }

  getClient() {
    if (this.sqlClient) return this.sqlClient;
    if (!this.databaseUrl) throw new Error(SAFE_CONFIGURATION_ERROR);
    const { neon } = require("@neondatabase/serverless");
    this.sqlClient = neon(this.databaseUrl);
    return this.sqlClient;
  }

  async create(order) {
    const sql = this.getClient();
    const orderQuery = sql`
      INSERT INTO orders
        (id, order_number, wompi_reference, status, amount_in_cents, currency,
         environment, lookup_token_hash, fulfillment_status, created_at, updated_at)
      VALUES
        (${order.id}, ${order.order_number}, ${order.wompi_reference}, ${order.status},
         ${order.amount_in_cents}, ${order.currency}, ${order.environment},
         ${order.lookup_token_hash || null}, ${order.fulfillment_status},
         ${order.created_at}, ${order.updated_at})
      RETURNING id, order_number, wompi_reference, transaction_id, status,
        amount_in_cents, currency, environment, lookup_token_hash,
        fulfillment_status, paid_at, created_at, updated_at
    `;
    const itemQueries = order.items.map((item) => sql`
      INSERT INTO order_items
        (product_id, order_id, product_name, size, quantity, unit_price_in_cents)
      VALUES
        (${item.product_id || order.id}, ${order.id}, ${item.name}, ${item.size}, ${item.quantity}, ${item.unit_amount_in_cents})
    `);

    try {
      const results = await sql.transaction([orderQuery, ...itemQueries]);
      const saved = results[0]?.[0];
      return saved ? mapOrder([saved, ...order.items.map((item, index) => ({
        item_id: index,
        item_name: item.name,
        item_size: item.size,
        item_quantity: item.quantity,
        item_unit_amount_in_cents: item.unit_amount_in_cents,
      }))]) : order;
    } catch (error) {
      throw toSafeError(error);
    }
  }

  async findByReference(reference) {
    return this.findOne("wompi_reference", reference);
  }

  async findByTransactionId(transactionId) {
    return this.findOne("transaction_id", transactionId);
  }

  async findByOrderNumber(orderNumber) {
    return this.findOne("order_number", orderNumber);
  }

  async list({ search, fulfillmentStatus, paymentStatus, limit = 50, offset = 0 } = {}) {
    const sql = this.getClient();
    let rows;
    try {
      rows = await sql`
        SELECT o.id, o.order_number, o.wompi_reference, o.transaction_id, o.status,
          o.amount_in_cents, o.currency, o.environment, o.lookup_token_hash,
          o.fulfillment_status, o.paid_at, o.created_at, o.updated_at,
          i.id AS item_id, i.product_name AS item_name, i.size AS item_size,
          i.quantity AS item_quantity, i.unit_price_in_cents AS item_unit_amount_in_cents,
          o.total_count
        FROM (
          SELECT id, order_number, wompi_reference, transaction_id, status,
            amount_in_cents, currency, environment, lookup_token_hash,
            fulfillment_status, paid_at, created_at, updated_at,
            COUNT(*) OVER () AS total_count
          FROM orders
          WHERE (${search || null} IS NULL OR order_number ILIKE ${search ? `%${search}%` : null})
            AND (${fulfillmentStatus || null} IS NULL OR fulfillment_status = ${fulfillmentStatus || null})
            AND (${paymentStatus || null} IS NULL OR status = ${paymentStatus || null})
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        ) o
        LEFT JOIN order_items i ON i.order_id = o.id
        ORDER BY o.created_at DESC, i.id
      `;
    } catch (error) {
      reportListError("query", error);
      throw error;
    }

    try {
      const orders = mapOrders(rows);
      return { total: Number(rows[0]?.total_count || 0), orders };
    } catch (error) {
      reportListError("map", error);
      throw error;
    }
  }

  async updateFulfillmentStatus(orderNumber, nextStatus, actorId, changedAt = new Date().toISOString()) {
    const sql = this.getClient();
    const result = await sql.transaction([
      sql`
        INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, created_at)
        SELECT id, fulfillment_status, ${nextStatus}, ${actorId}, ${changedAt}
        FROM orders WHERE order_number = ${orderNumber}
      `,
      sql`
        UPDATE orders
        SET fulfillment_status = ${nextStatus}, updated_at = ${changedAt}
        WHERE order_number = ${orderNumber}
        RETURNING id, order_number, wompi_reference, transaction_id, status,
          amount_in_cents, currency, environment, lookup_token_hash,
          fulfillment_status, paid_at, created_at, updated_at
      `,
    ]);
    return result[1]?.[0] ? mapOrder([result[1][0]]) : undefined;
  }

  async getStatusHistory(orderNumber) {
    const sql = this.getClient();
    return sql`
      SELECT h.order_id, h.previous_status, h.new_status, h.changed_by, h.created_at
      FROM order_status_history h
      JOIN orders o ON o.id = h.order_id
      WHERE o.order_number = ${orderNumber}
      ORDER BY h.created_at DESC
    `;
  }

  async findOne(column, value) {
    const sql = this.getClient();
    try {
      const result = column === "wompi_reference"
        ? await sql`
            SELECT o.id, o.order_number, o.wompi_reference, o.transaction_id, o.status,
              o.amount_in_cents, o.currency, o.environment, o.lookup_token_hash,
              o.fulfillment_status, o.paid_at, o.created_at, o.updated_at,
              i.id AS item_id, i.product_name AS item_name, i.size AS item_size,
              i.quantity AS item_quantity, i.unit_price_in_cents AS item_unit_amount_in_cents
            FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
            WHERE o.wompi_reference = ${value}
            ORDER BY i.id
          `
        : column === "order_number"
          ? await sql`
            SELECT o.id, o.order_number, o.wompi_reference, o.transaction_id, o.status,
              o.amount_in_cents, o.currency, o.environment, o.lookup_token_hash,
              o.fulfillment_status, o.paid_at, o.created_at, o.updated_at,
              i.id AS item_id, i.product_name AS item_name, i.size AS item_size,
              i.quantity AS item_quantity, i.unit_price_in_cents AS item_unit_amount_in_cents
            FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
            WHERE o.order_number = ${value}
            ORDER BY i.id
          `
          : await sql`
            SELECT o.id, o.order_number, o.wompi_reference, o.transaction_id, o.status,
              o.amount_in_cents, o.currency, o.environment, o.lookup_token_hash,
              o.fulfillment_status, o.paid_at, o.created_at, o.updated_at,
              i.id AS item_id, i.product_name AS item_name, i.size AS item_size,
              i.quantity AS item_quantity, i.unit_price_in_cents AS item_unit_amount_in_cents
            FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
            WHERE o.transaction_id = ${value}
            ORDER BY i.id
          `;
      return mapOrder(result);
    } catch (error) {
      throw toSafeError(error);
    }
  }

  async update(order) {
    const sql = this.getClient();
    try {
      const result = await sql`
        UPDATE orders
        SET transaction_id = ${order.transaction_id || null}, status = ${order.status},
          paid_at = COALESCE(orders.paid_at, ${order.paid_at || null})
        WHERE wompi_reference = ${order.wompi_reference}
        RETURNING id, order_number, wompi_reference, transaction_id, status,
          amount_in_cents, currency, environment, lookup_token_hash,
          fulfillment_status, paid_at, created_at, updated_at
      `;
      if (result.length === 0) throw new Error("Orden no encontrada.");
      return { ...order, ...result[0] };
    } catch (error) {
      if (error.message === "Orden no encontrada.") throw error;
      throw toSafeError(error);
    }
  }

  async recordTransaction(transactionId, reference) {
    const sql = this.getClient();
    try {
      await sql`
        UPDATE orders
        SET transaction_id = ${transactionId}
        WHERE wompi_reference = ${reference}
          AND (transaction_id IS NULL OR transaction_id = ${transactionId})
      `;
    } catch (error) {
      throw toSafeError(error);
    }
  }

  async isTransactionProcessed(transactionId) {
    const sql = this.getClient();
    try {
      const result = await sql`
        SELECT 1 FROM orders WHERE transaction_id = ${transactionId} LIMIT 1
      `;
      return result.length > 0;
    } catch (error) {
      throw toSafeError(error);
    }
  }
}

module.exports = PostgresOrderRepository;
module.exports.toSafeError = toSafeError;