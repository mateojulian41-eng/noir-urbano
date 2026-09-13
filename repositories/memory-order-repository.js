const OrderRepository = require("./order-repository");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class MemoryOrderRepository extends OrderRepository {
  constructor() {
    super();
    this.ordersByReference = new Map();
    this.transactions = new Map();
  }

  async create(order) {
    if (this.ordersByReference.has(order.wompi_reference)) {
      throw new Error("La referencia Wompi ya existe.");
    }
    this.ordersByReference.set(order.wompi_reference, clone(order));
    return clone(order);
  }

  async findByReference(reference) {
    return clone(this.ordersByReference.get(reference));
  }

  async findByTransactionId(transactionId) {
    const reference = this.transactions.get(transactionId);
    return reference ? this.findByReference(reference) : undefined;
  }

  async update(order) {
    if (!this.ordersByReference.has(order.wompi_reference)) {
      throw new Error("La orden no existe.");
    }
    this.ordersByReference.set(order.wompi_reference, clone(order));
    return clone(order);
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
