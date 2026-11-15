import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import pool, { query, User, Product } from '../lib/db';
import {
  hashPassword,
  verifyPassword,
  parseIdentifier,
  signCustomerToken,
  verifyCustomerToken,
  registerCustomer,
  loginCustomer,
} from '../lib/customer-auth';
import {
  generateOrderCode,
  resolveWebProduct,
  calculateWebPricing,
  createWebOrder,
} from '../lib/web-order';
import { decrypt, encrypt } from '../lib/encrypt';

let createdTestUserId: string | null = null;
let createdTestOrderCode: string | null = null;

after(async () => {
  // Clean up any test records created
  if (createdTestOrderCode) {
    await query('DELETE FROM orders WHERE order_code = $1', [createdTestOrderCode]).catch(() => {});
  }
  if (createdTestUserId) {
    await query('DELETE FROM users WHERE id = $1', [createdTestUserId]).catch(() => {});
  }
  await pool.end();
});

test('Customer Auth: password hashing with scrypt and verification', () => {
  const password = 'SuperSecret123!';
  const hash = hashPassword(password);

  assert.ok(hash.includes(':'), 'Hash must contain salt and key separated by colon');
  assert.strictEqual(verifyPassword(password, hash), true, 'Correct password must verify');
  assert.strictEqual(verifyPassword('WrongPassword', hash), false, 'Wrong password must fail');
});

test('Customer Auth: parseIdentifier correctly handles Email and Indonesian Phone', () => {
  const emailRes = parseIdentifier('User.Testing@Example.Com');
  assert.strictEqual(emailRes.type, 'email');
  assert.strictEqual(emailRes.value, 'user.testing@example.com');

  const phoneRes1 = parseIdentifier('08123456789');
  assert.strictEqual(phoneRes1.type, 'phone');
  assert.strictEqual(phoneRes1.value, '628123456789');

  const phoneRes2 = parseIdentifier('+62 812-9876-5432');
  assert.strictEqual(phoneRes2.type, 'phone');
  assert.strictEqual(phoneRes2.value, '6281298765432');

  assert.throws(() => parseIdentifier('invalid-identifier'), /Format/);
});

test('Customer Auth: JWT token generation and verification', () => {
  const mockUser: User = {
    id: '11111111-2222-3333-4444-555555555555',
    email: 'test@dafung.id',
    role: 'buyer',
    created_at: new Date(),
  };

  const token = signCustomerToken(mockUser);
  assert.ok(token, 'Signed token should be generated');

  const payload = verifyCustomerToken(token);
  assert.ok(payload, 'Payload must be returned on valid token');
  assert.strictEqual(payload?.sub, mockUser.id);
  assert.strictEqual(payload?.email, mockUser.email);
});

test('Customer Auth: Register and Login flow via Database', async () => {
  const uniqueSuffix = Date.now().toString(36);
  const testEmail = `test_${uniqueSuffix}@dafung-test.com`;
  const testPass = 'Rahasia12345';

  const user = await registerCustomer({
    identifier: testEmail,
    password: testPass,
    name: 'Customer Testing',
  });

  assert.ok(user.id, 'User ID should be generated');
  assert.strictEqual(user.email, testEmail);
  assert.strictEqual(user.name, 'Customer Testing');
  createdTestUserId = user.id;

  // Login successfully
  const loginUser = await loginCustomer({ identifier: testEmail, password: testPass });
  assert.strictEqual(loginUser.id, user.id);

  // Login failure on wrong password
  await assert.rejects(
    async () => {
      await loginCustomer({ identifier: testEmail, password: 'SalahPassword' });
    },
    /Password yang Anda masukkan salah/
  );
});

test('Web Order: generateOrderCode formats ORD-timestamp-RANDOM', () => {
  const code = generateOrderCode();
  assert.ok(code.startsWith('ORD-'));
  const parts = code.split('-');
  assert.strictEqual(parts.length, 3);
});

test('Web Order: resolveWebProduct and pricing calculation', async () => {
  // Fetch an existing active product from database
  const pRes = await query<Product>('SELECT * FROM products WHERE is_active = true LIMIT 1');
  if (pRes.rows.length === 0) return; // Skip if no products seeded

  const product = pRes.rows[0];
  const resolved = await resolveWebProduct(product.id);
  assert.ok(resolved, 'Resolved product must exist');
  assert.strictEqual(resolved?.id, product.id);

  if (createdTestUserId) {
    const qrisPricing = await calculateWebPricing({
      userId: createdTestUserId,
      product: resolved!,
      paymentMethod: 'qris',
    });

    assert.ok(qrisPricing.payableAmount > 0, 'Payable amount must be positive');
    assert.strictEqual(qrisPricing.paymentMethod, 'qris');

    const balPricing = await calculateWebPricing({
      userId: createdTestUserId,
      product: resolved!,
      paymentMethod: 'balance',
    });

    assert.strictEqual(balPricing.paymentMethod, 'balance');
    assert.strictEqual(balPricing.isBalanceDiscountApplied, true, 'Balance discount should be applied');
  }
});

test('Web Order: credential encryption and decryption', () => {
  const sampleKey = 'Email: buyer@example.com | Pass: Premium2026 | Profile: 1 | PIN: 1234';
  const encrypted = encrypt(sampleKey);
  assert.notStrictEqual(encrypted, sampleKey);

  const decrypted = decrypt(encrypted);
  assert.strictEqual(decrypted, sampleKey);
});

test('Web Order: end-to-end balance checkout creates order in DB', async () => {
  if (!createdTestUserId) return;

  // Add 100.000 test balance to user
  await query('UPDATE users SET balance = 100000 WHERE id = $1', [createdTestUserId]);

  const pRes = await query<Product>('SELECT * FROM products WHERE is_active = true AND stock > 0 LIMIT 1');
  if (pRes.rows.length === 0) return;

  const product = pRes.rows[0];
  const orderRes = await createWebOrder({
    userId: createdTestUserId,
    productId: product.id,
    paymentMethod: 'balance',
    customerName: 'Test Buyer',
  });

  assert.strictEqual(orderRes.success, true, 'Checkout should succeed');
  assert.ok(orderRes.orderCode?.startsWith('ORD-'));
  createdTestOrderCode = orderRes.orderCode!;

  // Verify order in database
  const checkDb = await query<{ order_code: string; user_id: string }>(
    'SELECT order_code, user_id FROM orders WHERE order_code = $1',
    [orderRes.orderCode!]
  );
  assert.strictEqual(checkDb.rows.length, 1);
  assert.strictEqual(checkDb.rows[0].user_id, createdTestUserId);
});
