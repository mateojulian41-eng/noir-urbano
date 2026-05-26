const crypto = require("crypto");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function verifyChecksum(payload, secret) {
  const { timestamp, signature } = payload.meta || {};
  if (!timestamp || !signature?.checksum) return false;

  const properties = payload.meta?.signature?.properties || [];
  const event = payload.data?.transaction || {};

  const values = properties.map((prop) => {
    return prop.split(".").reduce((obj, key) => obj?.[key], event) ?? "";
  });

  const raw = [...values, timestamp, secret].join("");
  const expected = crypto.createHash("sha256").update(raw).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature.checksum, "hex")
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
  if (!eventsSecret) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Wompi events secret no configurado." }));
    return;
  }

  let bodyRaw;
  try {
    bodyRaw = await readBody(req);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "No se pudo leer el cuerpo." }));
    return;
  }

  let payload;
  try {
    payload = JSON.parse(bodyRaw);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "JSON inválido." }));
    return;
  }

  const valid = verifyChecksum(payload, eventsSecret);
  if (!valid) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Checksum inválido." }));
    return;
  }

  const event = payload.event;
  const transaction = payload.data?.transaction;

  // Aquí puedes agregar lógica: guardar en DB, enviar email, etc.
  console.log(`[Wompi Webhook] Evento: ${event} | Ref: ${transaction?.reference} | Status: ${transaction?.status}`);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ received: true }));
};
