const crypto = require('crypto');

// DEK held in memory for the session lifetime — never written to disk in plaintext
let sessionDEK = null;

/**
 * Derive a Key Encryption Key (KEK) from a password using PBKDF2.
 * @param {string} password
 * @param {Buffer} salt - 32 random bytes
 * @returns {Buffer} 32-byte KEK
 */
function deriveKEK(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256');
}

/**
 * Generate a random 256-bit Data Encryption Key (DEK).
 * @returns {Buffer}
 */
function generateDEK() {
  return crypto.randomBytes(32);
}

/**
 * Wrap (encrypt) the DEK with a KEK using AES-256-GCM.
 * @param {Buffer} dek
 * @param {Buffer} kek
 * @returns {{ iv: string, tag: string, ciphertext: string }} hex-encoded strings
 */
function wrapDEK(dek, kek) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

/**
 * Unwrap (decrypt) the DEK using a KEK.
 * @param {{ iv: string, tag: string, ciphertext: string }} wrapped
 * @param {Buffer} kek
 * @returns {Buffer} DEK
 */
function unwrapDEK(wrapped, kek) {
  const iv = Buffer.from(wrapped.iv, 'hex');
  const tag = Buffer.from(wrapped.tag, 'hex');
  const ciphertext = Buffer.from(wrapped.ciphertext, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypt a plaintext string field using the session DEK (AES-256-GCM).
 * Returns a versioned string: "v1:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 * @param {string} plaintext
 * @returns {string}
 */
function encryptField(plaintext) {
  if (!sessionDEK) {
    throw new Error('Encryption key not available: user not authenticated');
  }
  if (plaintext === null || plaintext === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionDEK, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypt a field encrypted by encryptField().
 * Returns null for null/undefined input.
 * @param {string|null} encrypted
 * @returns {string|null}
 */
function decryptField(encrypted) {
  if (!sessionDEK) {
    throw new Error('Encryption key not available: user not authenticated');
  }
  if (encrypted === null || encrypted === undefined) return null;
  const parts = encrypted.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted field format');
  }
  const [, ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionDEK, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function setSessionDEK(dek) {
  sessionDEK = dek;
}

function clearSessionDEK() {
  sessionDEK = null;
}

function hasSessionDEK() {
  return !!sessionDEK;
}

module.exports = {
  deriveKEK,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  encryptField,
  decryptField,
  setSessionDEK,
  clearSessionDEK,
  hasSessionDEK,
};
