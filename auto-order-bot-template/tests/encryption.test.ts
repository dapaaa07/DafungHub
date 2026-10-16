import assert from 'node:assert/strict';
import test from 'node:test';
import { encrypt, decrypt } from '../src/core/encrypt';

test('Template Encryption: Encrypts and decrypts credential strings flawlessly', () => {
  const credential = 'email: user@domain.com | pass: SuperSecretPass123! | pin: 9988';
  const ciphertext = encrypt(credential);
  assert.notStrictEqual(ciphertext, credential, 'Ciphertext must not be plaintext');
  const decrypted = decrypt(ciphertext);
  assert.strictEqual(decrypted, credential, 'Decrypted text must match original');
});

test('Template Encryption: Handles empty string gracefully', () => {
  assert.strictEqual(encrypt(''), '');
  assert.strictEqual(decrypt(''), '');
});
