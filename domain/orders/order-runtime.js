const OrderService = require("./order-service");
const createOrderRepository = require("../../repositories/order-repository-factory");

let service;

function getOrderService() {
  if (!service) {
    const useMemory = Boolean(process.env.NODE_TEST_CONTEXT);
    service = new OrderService({
      repository: createOrderRepository({ useMemory }),
    });
  }
  return service;
}

function resetOrderService() {
  service = undefined;
}

module.exports = { getOrderService, resetOrderService };
