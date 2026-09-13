const ORDER_STATUSES = Object.freeze({
  PENDING_PAYMENT: "PENDING_PAYMENT",
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
  VOIDED: "VOIDED",
  ERROR: "ERROR",
});

const VALID_ORDER_STATUSES = new Set(Object.values(ORDER_STATUSES));

function isOrderStatus(status) {
  return VALID_ORDER_STATUSES.has(status);
}

function canTransitionOrderStatus(currentStatus, nextStatus) {
  if (!isOrderStatus(currentStatus) || !isOrderStatus(nextStatus)) return false;
  if (currentStatus === nextStatus) return true;
  if (currentStatus === ORDER_STATUSES.PENDING_PAYMENT) return true;
  return false;
}

module.exports = {
  ORDER_STATUSES,
  VALID_ORDER_STATUSES,
  isOrderStatus,
  canTransitionOrderStatus,
};
