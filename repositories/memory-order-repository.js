const OrderRepository = require("./order-repository");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class MemoryOrderRepository extends OrderRepository {
  constructor() {
    super();
    this.ordersByReference = new Map();
    this.ordersByNumber = new Map();
    this.transactions = new Map();
    this.statusHistory = new Map();
  }

  async create(order) {
    if (this.ordersByReference.has(order.wompi_reference)) {
      throw new Error("La referencia Wompi ya existe.");
    }
    this.ordersByReference.set(order.wompi_reference, clone(order));
    this.ordersByNumber.set(order.order_number, clone(order));
    this.statusHistory.set(order.order_number, []);
    return clone(order);
  }

  async findByReference(reference) {
    return clone(this.ordersByReference.get(reference));
  }

  async findByTransactionId(transactionId) {
    const reference = this.transactions.get(transactionId);
    return reference ? this.findByReference(reference) : undefined;
  }

  async findByOrderNumber(orderNumber) {
    return clone(this.ordersByNumber.get(orderNumber));
  }

  async isTransactionProcessed(transactionId) {
    return this.transactions.has(transactionId);
  }

  async update(order) {
    if (!this.ordersByReference.has(order.wompi_reference)) {
      throw new Error("La orden no existe.");
    }
    this.ordersByReference.set(order.wompi_reference, clone(order));
    this.ordersByNumber.set(order.order_number, clone(order));
    return clone(order);
  }

  async list({ search, fulfillmentStatus, paymentStatus, limit = 50, offset = 0 } = {}) {
    let orders = [...this.ordersByReference.values()];
    if (search) orders = orders.filter((order) => order.order_number.toLowerCase().includes(search.toLowerCase()));
    if (fulfillmentStatus) orders = orders.filter((order) => order.fulfillment_status === fulfillmentStatus);
    if (paymentStatus) orders = orders.filter((order) => order.status === paymentStatus);
    orders.sort((left, right) => right.created_at.localeCompare(left.created_at));
    return { total: orders.length, orders: orders.slice(offset, offset + limit).map(clone) };
  }

  async updateFulfillmentStatus(orderNumber, nextStatus, actorId, changedAt = new Date().toISOString()) {
    const order = this.ordersByNumber.get(orderNumber);
    if (!order) return undefined;
    const updated = { ...order, fulfillment_status: nextStatus, updated_at: changedAt };
    this.ordersByReference.set(order.wompi_reference, clone(updated));
    this.ordersByNumber.set(orderNumber, clone(updated));
    this.statusHistory.get(orderNumber).push({ order_id: order.id, previous_status: order.fulfillment_status, new_status: nextStatus, changed_by: actorId, created_at: changedAt });
    return clone(updated);
  }

  async getStatusHistory(orderNumber) {
    return clone(this.statusHistory.get(orderNumber) || []);
  }

  async recordTransaction(transactionId, reference) {
    const existingReference = this.transactions.get(transactionId);
    if (existingReference && existingReference !== reference) {
      throw new Error("La transacción ya está asociada a otra orden.");
    }
    this.transactions.set(transactionId, reference);
  }

  get size() {
    return this.ordersByReference.size;
  }
}

module.exports = MemoryOrderRepository;
