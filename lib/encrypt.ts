import CryptoJS from 'crypto-js';

// Auto-load .env for standalone scripts / bot runners outside Next.js runtime
if (!process.env.AES_SECRET_KEY) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

function getSecretKey(): string {
  const secretKey = process.env.AES_SECRET_KEY;
  if (!secretKey) {
    throw new Error('AES_SECRET_KEY is not defined in environment variables');
  }
  return secretKey;
}

/**
 * Encrypt plaintext using AES-256 with the secret key from AES_SECRET_KEY.
 *
 * @param plaintext The text to encrypt
 * @returns The encrypted ciphertext string (Base64 encoded)
 */
export function encrypt(plaintext: string): string {
  const secretKey = getSecretKey();
  return CryptoJS.AES.encrypt(plaintext, secretKey).toString();
}

/**
 * Decrypt ciphertext using AES-256 with the secret key from AES_SECRET_KEY.
 *
 * @param ciphertext The encrypted string to decrypt
 * @returns The original decrypted plaintext string
 */
export function decrypt(ciphertext: string): string {
  const secretKey = getSecretKey();
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${(error as Error).message}`);
  }
}
