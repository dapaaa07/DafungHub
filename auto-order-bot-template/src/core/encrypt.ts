import CryptoJS from 'crypto-js';

const SECRET_KEY =
  process.env.ENCRYPTION_SECRET ||
  'default-bot-template-secure-key-32chars!!';

/**
 * Encrypt sensitive credential text with AES-256
 */
export function encrypt(text: string): string {
  if (!text) return '';
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

/**
 * Decrypt ciphertext back to original credential text
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error('[Encryption] Failed to decrypt ciphertext:', err);
    return '';
  }
}
