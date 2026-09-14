const crypto = require("node:crypto");
const {
  ORDER_STATUSES,
  canTransitionOrderStatus,
  isOrderStatus,
} = require("./order-status");
const {
  DEFAULT_PRODUCT_CATALOG,
  validatePendingOrderInput,
  validateTransaction,
} = require("./order-validation");
const { LOOKUP_HASH_PATTERN, verifyLookupToken } = require("./order-access");

const WOMPI_STATUS_MAP = Object.freeze({
  PENDING: ORDER_STATUSES.PENDING_PAYMENT,
  APPROVED: ORDER_STATUSES.APPROVED,
  DECLINED: ORDER_STATUSES.DECLINED,
  VOIDED: ORDER_STATUSES.VOIDED,
  ERROR: ORDER_STATUSES.ERROR,
});

const FULFILLMENT_TRANSITIONS = Object.freeze({
  RECEIVED: new Set(["RECEIVED", "PREPARING", "CANCELLED"]),
  PREPARING: new Set(["PREPARING", "SHIPPED", "CANCELLED"]),
  SHIPPED: new Set(["SHIPPED", "DELIVERED"]),
  DELIVERED: new Set(["DELIVERED"]),
  CANCELLED: new Set(["CANCELLED"]),
});

class OrderService {
  constructor({ repository, productCatalog = DEFAULT_PRODUCT_CATALOG, clock = () => new Date() } = {}) {
    if (!repository) throw new TypeError("OrderService requiere un repositorio.");
    this.repository = repository;
    this.productCatalog = productCatalog;
    this.clock = clock;
  }

  generateOrderNumber(date = this.clock()) {
    const timestamp = date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    return `NU-${timestamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  }

  async createPendingOrder(input, { lookupTokenHash } = {}) {
    const validated = validatePendingOrderInput(input, this.productCatalog);
    if (typeof input.wompi_reference !== "string" || !input.wompi_reference.trim()) {
      throw new TypeError("wompi_reference es obligatorio.");
    }
    if (lookupTokenHash !== undefined && !LOOKUP_HASH_PATTERN.test(lookupTokenHash)) {
      throw new TypeError("Hash de consulta inválido.");
    }

    const now = this.clock().toISOString();
    const order = {
      id: crypto.randomUUID(),
      order_number: this.generateOrderNumber(new Date(now)),
      wompi_reference: input.wompi_reference,
      status: ORDER_STATUSES.PENDING_PAYMENT,
      items: validated.items,
      amount_in_cents: validated.amount_in_cents,
      currency: validated.currency,
      environment: input.environment || "sandbox",
      fulfillment_status: input.fulfillment_status || "RECEIVED",
      created_at: now,
      updated_at: now,
    };

    if (lookupTokenHash) order.lookup_token_hash = lookupTokenHash;
    if (validated.customer !== undefined) order.customer = validated.customer;
    return this.sanitizeOrderForResponse(await this.repository.create(order));
  }

  async getOrderByReference(reference) {
    if (typeof reference !== "string" || !reference.trim()) return undefined;
    const order = await this.repository.findByReference(reference);
    return order ? this.sanitizeOrderForResponse(order) : undefined;
  }

  async getOrderByNumber(number) {
    if (typeof number !== "string" || !/^[A-Za-z0-9-]{4,80}$/.test(number)) return undefined;
    return this.repository.findByOrderNumber(number);
  }

  async listAdminOrders(filters) {
    const result = await this.repository.list(filters);
    return { total: result.total, orders: result.orders.map((order) => this.sanitizeOrderForAdmin(order)) };
  }

  async getAdminOrderByNumber(number) {
    const order = await this.repository.findByOrderNumber(number);
    return order ? this.sanitizeOrderForAdmin(order) : undefined;
  }

  async updateAdminFulfillmentStatus(orderNumber, nextStatus, actorId) {
    const order = await this.repository.findByOrderNumber(orderNumber);
    if (!order) return undefined;
    if (order.fulfillment_status === nextStatus) return this.sanitizeOrderForAdmin(order);
    if (!FULFILLMENT_TRANSITIONS[order.fulfillment_status]?.has(nextStatus)) {
      throw new Error("Transición operativa inválida.");
    }
    if (["PREPARING", "SHIPPED", "DELIVERED"].includes(nextStatus) && order.status !== ORDER_STATUSES.APPROVED) {
      throw new Error("Solo los pedidos aprobados pueden avanzar operativamente.");
    }
    const updated = await this.repository.updateFulfillmentStatus(orderNumber, nextStatus, actorId, this.clock().toISOString());
    return this.sanitizeOrderForAdmin(updated);
  }

  async getAdminStatusHistory(orderNumber) {
    const history = await this.repository.getStatusHistory(orderNumber);
    return history.map(({ previous_status, new_status, created_at }) => ({
      previous_status, new_status, created_at,
    })).sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
  }

  async getPublicOrderByNumberAndToken(number, token) {
    const order = await this.getOrderByNumber(number);
    if (!order || !verifyLookupToken(token, order.lookup_token_hash)) return undefined;
    return this.sanitizeOrderForTracking(order);
  }

  async isTransactionAlreadyProcessed(transactionId) {
    if (typeof transactionId !== "string" || !transactionId.trim()) return false;
    if (typeof this.repository.isTransactionProcessed === "function") {
      return this.repository.isTransactionProcessed(transactionId);
    }
    return Boolean(await this.repository.findByTransactionId(transactionId));
  }

  async updateOrderFromTransaction(transaction) {
    const validated = validateTransaction(transaction);
    const alreadyProcessed = await this.repository.findByTransactionId(validated.id);
    if (alreadyProcessed) {
      if (alreadyProcessed.wompi_reference !== validated.reference) {
        throw new Error("La transacción ya está asociada a otra orden.");
      }
      return this.sanitizeOrderForResponse(alreadyProcessed);
    }

    const order = await this.repository.findByReference(validated.reference);
    if (!order) throw new Error("Orden no encontrada.");
    if (order.amount_in_cents !== validated.amount_in_cents || order.currency !== validated.currency) {
      throw new Error("El monto o moneda de la transacción no coincide.");
    }

    const nextStatus = validated.status;
    if (!isOrderStatus(nextStatus)) throw new TypeError("Status de orden inválido.");
    if (!canTransitionOrderStatus(order.status, nextStatus)) {
      throw new Error(`Transición inválida: ${order.status} -> ${nextStatus}.`);
    }

    if (order.status === nextStatus) {
      await this.repository.recordTransaction(validated.id, order.wompi_reference);
      return this.sanitizeOrderForResponse(order);
    }

    const updated = {
      ...order,
      status: nextStatus,
      updated_at: this.clock().toISOString(),
      transaction_id: validated.id,
    };
    if (nextStatus === ORDER_STATUSES.APPROVED && !order.paid_at) {
      updated.paid_at = updated.updated_at;
    }
    await this.repository.update(updated);
    await this.repository.recordTransaction(validated.id, order.wompi_reference);
    return this.sanitizeOrderForResponse(updated);
  }

  async processWebhookEvent(event) {
    if (!event || typeof event !== "object" || !event.data || typeof event.data !== "object") {
      throw new TypeError("Evento de webhook inválido.");
    }
    const source = event.data.transaction;
    if (!source || typeof source !== "object") throw new TypeError("Evento sin transacción.");
    const status = WOMPI_STATUS_MAP[source.status];
    if (!status) throw new TypeError("Estado Wompi no soportado.");

    return this.updateOrderFromTransaction({
      id: source.id,
      reference: source.reference,
      status,
      amount_in_cents: source.amount_in_cents,
      currency: source.currency,
    });
  }

  sanitizeOrderForResponse(order) {
    if (!order) return undefined;
    return {
      id: order.id,
      order_number: order.order_number,
      wompi_reference: order.wompi_reference,
      transaction_id: order.transaction_id,
      status: order.status,
      items: order.items.map(({ name, size, quantity, unit_amount_in_cents }) => ({
        name,
        size,
        quantity,
        unit_amount_in_cents,
      })),
      amount_in_cents: order.amount_in_cents,
      currency: order.currency,
      environment: order.environment,
      fulfillment_status: order.fulfillment_status,
      paid_at: order.paid_at,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };
  }

  sanitizeOrderForAdmin(order) {
    if (!order) return undefined;
    return {
      order_number: order.order_number,
      status: order.status,
      items: order.items.map(({ name, size, quantity, unit_amount_in_cents }) => ({
        name, size, quantity, unit_amount_in_cents,
      })),
      amount_in_cents: order.amount_in_cents,
      currency: order.currency,
      environment: order.environment,
      fulfillment_status: order.fulfillment_status,
      paid_at: order.paid_at,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };
  }

  sanitizeOrderForTracking(order) {
    return {
      order_number: order.order_number,
      payment_status: order.status,
      fulfillment_status: order.fulfillment_status,
      amount_in_cents: order.amount_in_cents,
      currency: order.currency,
      items: order.items.map(({ name, size, quantity }) => ({
        product_name: name,
        size,
        quantity,
      })),
      created_at: order.created_at,
      paid_at: order.paid_at || null,
    };
  }
}

module.exports = OrderService;
