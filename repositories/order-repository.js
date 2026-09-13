class OrderRepository {
  async create() {
    throw new Error("OrderRepository.create debe ser implementado.");
  }

  async findByReference() {
    throw new Error("OrderRepository.findByReference debe ser implementado.");
  }

  async findByTransactionId() {
    throw new Error("OrderRepository.findByTransactionId debe ser implementado.");
  }

  async update() {
    throw new Error("OrderRepository.update debe ser implementado.");
  }

  async recordTransaction() {
    throw new Error("OrderRepository.recordTransaction debe ser implementado.");
  }
}

module.exports = OrderRepository;
