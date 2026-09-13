const DEFAULT_PRODUCT_CATALOG = Object.freeze({
  "SHADOW PALM TEE": 15000000,
  "HEAT TANK": 11000000,
  "VOID CARGO": 22000000,
  "DARK LINE SHIRT": 16000000,
});

const VALID_SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL"]);
const ITEM_FIELDS = new Set(["name", "size", "quantity"]);

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(message);
  }
}

function validateAmountInCents(amountInCents) {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new TypeError("amount_in_cents debe ser un entero positivo.");
  }
  return amountInCents;
}

function validateCurrency(currency) {
  if (currency !== "COP") throw new TypeError("currency debe ser COP.");
  return currency;
}

function validateItems(items, productCatalog = DEFAULT_PRODUCT_CATALOG) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError("items debe ser un arreglo no vacío.");
  }

  return items.map((item) => {
    assertPlainObject(item, "Cada artículo debe ser un objeto.");
    for (const field of Object.keys(item)) {
      if (!ITEM_FIELDS.has(field)) {
        throw new TypeError(`Campo de artículo no permitido: ${field}.`);
      }
    }

    if (typeof item.name !== "string" || !Object.hasOwn(productCatalog, item.name)) {
      throw new TypeError("Artículo no reconocido.");
    }

    const size = (item.size || "M").toUpperCase();
    if (!VALID_SIZES.has(size)) throw new TypeError("Talla inválida.");

    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      throw new TypeError("Cantidad inválida.");
    }

    return {
      name: item.name,
      size,
      quantity: item.quantity,
      unit_amount_in_cents: validateAmountInCents(productCatalog[item.name]),
    };
  });
}

function validateCustomer(customer) {
  if (customer === undefined) return undefined;
  assertPlainObject(customer, "customer debe ser un objeto.");
  const allowedFields = ["name", "email", "phone", "document", "address"];
  const sanitized = {};
  for (const field of allowedFields) {
    if (customer[field] !== undefined) {
      if (typeof customer[field] !== "string" || customer[field].length > 200) {
        throw new TypeError(`Campo customer inválido: ${field}.`);
      }
      sanitized[field] = customer[field];
    }
  }
  return sanitized;
}

function validatePendingOrderInput(input, productCatalog = DEFAULT_PRODUCT_CATALOG) {
  assertPlainObject(input, "La orden debe ser un objeto.");
  const items = validateItems(input.items, productCatalog);
  const calculatedAmount = items.reduce(
    (total, item) => total + item.unit_amount_in_cents * item.quantity,
    0,
  );

  if (input.amount_in_cents !== undefined) {
    validateAmountInCents(input.amount_in_cents);
    if (input.amount_in_cents !== calculatedAmount) {
      throw new TypeError("El monto no coincide con los productos validados.");
    }
  }

  validateCurrency(input.currency === undefined ? "COP" : input.currency);
  return {
    items,
    amount_in_cents: validateAmountInCents(calculatedAmount),
    currency: "COP",
    customer: validateCustomer(input.customer),
  };
}

function validateTransaction(transaction) {
  assertPlainObject(transaction, "La transacción debe ser un objeto.");
  if (typeof transaction.reference !== "string" || !transaction.reference.trim()) {
    throw new TypeError("La transacción requiere reference.");
  }
  if (typeof transaction.id !== "string" || !transaction.id.trim()) {
    throw new TypeError("La transacción requiere id.");
  }
  if (typeof transaction.status !== "string") throw new TypeError("Status inválido.");
  validateAmountInCents(transaction.amount_in_cents);
  validateCurrency(transaction.currency);
  return {
    reference: transaction.reference,
    id: transaction.id,
    status: transaction.status,
    amount_in_cents: transaction.amount_in_cents,
    currency: transaction.currency,
  };
}

module.exports = {
  DEFAULT_PRODUCT_CATALOG,
  validateAmountInCents,
  validateCurrency,
  validateItems,
  validatePendingOrderInput,
  validateTransaction,
};
