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

function getNestedValue(source, path) {
  if (!source || typeof source !== "object") return undefined;
  const parts = String(path).split(".");
  let current = source;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }

  return current;
}

function asChecksumValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(asChecksumValue).join("");
  return String(value);
}

function normalizeChecksum(value) {
  return String(value || "").trim().toLowerCase();
}

function verifyChecksum(payload, secret, headers = {}) {
  const meta = payload?.meta || {};
  const signature = meta.signature || payload?.signature || {};
  const timestamp = meta.timestamp ?? payload?.timestamp;
  const properties = Array.isArray(signature.properties)
    ? signature.properties
    : Array.isArray(payload?.properties)
      ? payload.properties
      : [];

  if (!timestamp || !Array.isArray(properties) || properties.length === 0) {
    return false;
  }

  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};

  const values = [];
  for (const property of properties) {
    if (typeof property !== "string" || !property.trim()) return false;
    const value = getNestedValue(source, property);
    if (value === undefined) return false;
    values.push(asChecksumValue(value));
  }

  const raw = [...values, String(timestamp), String(secret)].join("");
  const expected = crypto.createHash("sha256").update(raw).digest("hex");

  const candidateChecksums = [
    normalizeChecksum(signature.checksum),
    normalizeChecksum(headers["x-event-checksum"]),
    normalizeChecksum(headers["X-Event-Checksum"]),
  ].filter(Boolean);

  if (candidateChecksums.length === 0) return false;

  const expectedBuffer = Buffer.from(expected, "hex");

  for (const candidate of candidateChecksums) {
    const actualBuffer = Buffer.from(candidate, "hex");
    if (expectedBuffer.length !== actualBuffer.length) continue;
    if (crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return true;
  }

  return false;
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

  if (!bodyRaw.trim()) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Body vacío." }));
    return;
  }

  const valid = verifyChecksum(payload, eventsSecret, req.headers);
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
