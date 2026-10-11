import assert from 'node:assert/strict';
import test from 'node:test';
import { encrypt, decrypt } from '../lib/encrypt';

test('Encryption Utility: Acceptance Test - encrypt lalu decrypt kembalikan string asli', () => {
  const original = 'user@example.com:password123';
  const encrypted = encrypt(original);

  assert.notStrictEqual(encrypted, original, 'Ciphertext must not match original plaintext');
  assert.ok(encrypted.length > 0, 'Ciphertext must not be empty');

  const decrypted = decrypt(encrypted);
  assert.strictEqual(decrypted, original, 'Decrypted string must match original string exactly');
});

test('Encryption Utility: Handles complex credentials and multiline text', () => {
  const complexData = `Spotify Family Slot:
Username: john_doe_vip
Password: P@ssw0rd!#2026_🔥
License: ABC-1234-XYZ-5678`;

  const ciphertext = encrypt(complexData);
  assert.notStrictEqual(ciphertext, complexData);

  const recovered = decrypt(ciphertext);
  assert.strictEqual(recovered, complexData);
});

test('Encryption Utility: Handles special characters and Unicode', () => {
  const specialText = '✨ Produk Digital: Lisensi #1234! @dafung_bot [SUCCESS] 日本語 🚀';
  const ciphertext = encrypt(specialText);
  const decrypted = decrypt(ciphertext);
  assert.strictEqual(decrypted, specialText);
});

test('Encryption Utility: Produces different ciphertexts for consecutive encryptions due to random salt', () => {
  const text = 'test_random_salt';
  const cipher1 = encrypt(text);
  const cipher2 = encrypt(text);

  // CryptoJS AES adds a random salt by default, so ciphertexts should differ
  assert.notStrictEqual(cipher1, cipher2);
  assert.strictEqual(decrypt(cipher1), text);
  assert.strictEqual(decrypt(cipher2), text);
});
