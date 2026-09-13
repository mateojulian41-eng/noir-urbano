const crypto = require("node:crypto");

const LOOKUP_TOKEN_BYTES = 32;
const LOOKUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOOKUP_HASH_PATTERN = /^[a-f0-9]{64}$/;

function generateLookupToken() {
  return crypto.randomBytes(LOOKUP_TOKEN_BYTES).toString("base64url");
}

function hashLookupToken(token) {
  if (typeof token !== "string" || !LOOKUP_TOKEN_PATTERN.test(token)) {
    throw new TypeError("Token de consulta inválido.");
  }
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function verifyLookupToken(token, storedHash) {
  if (
    typeof token !== "string" ||
    typeof storedHash !== "string" ||
    !LOOKUP_TOKEN_PATTERN.test(token) ||
    !LOOKUP_HASH_PATTERN.test(storedHash)
  ) return false;

  const receivedHash = Buffer.from(hashLookupToken(token), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");
  return receivedHash.length === expectedHash.length
    && crypto.timingSafeEqual(receivedHash, expectedHash);
}

module.exports = {
  LOOKUP_TOKEN_BYTES,
  LOOKUP_TOKEN_PATTERN,
  LOOKUP_HASH_PATTERN,
  generateLookupToken,
  hashLookupToken,
  verifyLookupToken,
};
