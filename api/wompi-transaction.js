module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  if (!privateKey) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Wompi no configurado." }));
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const transactionId = url.searchParams.get("id");

  if (!transactionId || !/^[a-zA-Z0-9_-]{4,64}$/.test(transactionId)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "ID de transacción inválido." }));
    return;
  }

  const wompiEnv = process.env.WOMPI_ENV || "sandbox";
  const apiBase =
    wompiEnv === "production"
      ? "https://production.wompi.co/v1"
      : "https://sandbox.wompi.co/v1";

  try {
    const response = await fetch(`${apiBase}/transactions/${transactionId}`, {
      headers: {
        Authorization: `Bearer ${privateKey}`,
      },
    });

    const payload = await response.json();

    res.statusCode = response.status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Error de red al consultar la transacción en Wompi.",
        detail: error.message || "Unknown error",
      }),
    );
  }
};
