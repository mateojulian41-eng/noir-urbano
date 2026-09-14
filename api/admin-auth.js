const { verifyToken } = require("@clerk/backend");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function getAdminIds() {
  return new Set(String(process.env.CLERK_ADMIN_USER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean));
}

async function requireAdmin(req) {
  const authorization = req.headers?.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { status: 401, error: "No autorizado." };
  if (!process.env.CLERK_SECRET_KEY || getAdminIds().size === 0) {
    return { status: 503, error: "Servicio administrativo no disponible." };
  }

  try {
    const claims = await verifyToken(match[1], { secretKey: process.env.CLERK_SECRET_KEY });
    const userId = claims.sub;
    if (!userId || !getAdminIds().has(userId)) return { status: 403, error: "Acceso denegado." };
    return { userId };
  } catch {
    return { status: 401, error: "No autorizado." };
  }
}

module.exports = { requireAdmin, sendJson };
