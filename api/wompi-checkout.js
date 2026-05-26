const crypto = require("crypto");

const ALLOWED_PRODUCTS = {
  "SHADOW PALM TEE": 150000,
  "HEAT TANK": 110000,
  "VOID CARGO": 220000,
  "DARK LINE SHIRT": 160000,
};

const VALID_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function signIntegrity(reference, amountInCents, currency, secret) {
  const raw = `${reference}${amountInCents}${currency}${secret}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function validateOrder(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    throw new Error("El carrito está vacío.");
  }

  let total = 0;

  for (const item of order.items) {
    const allowed = ALLOWED_PRODUCTS[item.name];
    if (!allowed) throw new Error(`Producto no reconocido: ${item.name}`);

    const size = (item.size || "M").toUpperCase();
    if (!VALID_SIZES.includes(size)) throw new Error(`Talla inválida: ${item.size}`);

    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
      throw new Error(`Cantidad inválida para ${item.name}`);
    }

    total += allowed * qty;
  }

  return total;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  const wompiEnv = process.env.WOMPI_ENV || "sandbox";

  if (!publicKey || !integritySecret) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Wompi no configurado en el servidor." }));
    return;
  }

  let order;
  try {
    order = await readBody(req);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  let total;
  try {
    total = validateOrder(order);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  const amountInCents = total * 100;
  const currency = "COP";
  const reference = `NOIR-${Date.now().toString(36).toUpperCase()}`;

  const redirectUrl =
    process.env.WOMPI_REDIRECT_URL ||
    `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}/?pago=wompi`;

  const signatureIntegrity = signIntegrity(reference, amountInCents, currency, integritySecret);

  const baseUrl =
    wompiEnv === "production"
      ? "https://checkout.wompi.co/p/"
      : "https://checkout.wompi.co/p/";

  const params = new URLSearchParams({
    "public-key": publicKey,
    currency,
    "amount-in-cents": String(amountInCents),
    reference,
    "signature:integrity": signatureIntegrity,
    "redirect-url": redirectUrl,
  });

  const checkoutUrl = `${baseUrl}?${params.toString()}`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      checkoutUrl,
      reference,
      amountInCents,
      currency,
      publicKey,
      signatureIntegrity,
      redirectUrl,
    })
  );
};
