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

  async isTransactionProcessed() {
    throw new Error("OrderRepository.isTransactionProcessed debe ser implementado.");
  }

  async update() {
    throw new Error("OrderRepository.update debe ser implementado.");
  }

  async list() {
    throw new Error("OrderRepository.list debe ser implementado.");
  }

  async updateFulfillmentStatus() {
    throw new Error("OrderRepository.updateFulfillmentStatus debe ser implementado.");
  }

  async getStatusHistory() {
    throw new Error("OrderRepository.getStatusHistory debe ser implementado.");
  }

  async recordTransaction() {
    throw new Error("OrderRepository.recordTransaction debe ser implementado.");
  }
}

module.exports = OrderRepository;
