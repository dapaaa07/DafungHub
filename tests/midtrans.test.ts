import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreApi } from 'midtrans-client';
import { coreApi, snap, createQrisTransaction } from '../lib/midtrans';

test('Midtrans Client Utility: coreApi and snap clients are initialized', () => {
  assert.ok(coreApi, 'coreApi instance must be defined');
  assert.ok(snap, 'snap instance must be defined');
  assert.ok(typeof coreApi.charge === 'function', 'coreApi must have charge method');
  assert.ok(typeof snap.createTransaction === 'function', 'snap must have createTransaction method');
});

test('Midtrans Client Utility: createQrisTransaction formats request and returns QR code URL/string', async () => {
  interface ChargeParameter {
    payment_type: string;
    transaction_details: {
      order_id: string;
      gross_amount: number;
    };
    customer_details?: {
      email?: string;
    };
  }

  let capturedPayload: ChargeParameter | null = null;

  // Mock CoreApi client
  const mockCoreApi = {
    charge: async (parameter: ChargeParameter) => {
      capturedPayload = parameter;
      return {
        status_code: '201',
        status_message: 'Success, QRIS transaction is created',
        transaction_id: 'txn-mock-uuid-12345',
        order_id: parameter.transaction_details.order_id,
        gross_amount: parameter.transaction_details.gross_amount.toString(),
        payment_type: 'qris',
        transaction_time: '2026-10-11 12:00:00',
        transaction_status: 'pending',
        actions: [
          {
            name: 'generate-qr-code',
            method: 'GET',
            url: 'https://api.sandbox.midtrans.com/v2/qris/txn-mock-uuid-12345/qr-code',
          },
        ],
        qr_string: '00020101021226590014ID.LINKAJA.WWW011893600911002220473202152010830118318353033605802ID5911DAFUNG_HUB6007BANDUNG61054011562210517ORD-10163040000',
      };
    },
  } as unknown as CoreApi;

  const orderId = 'ORDER-TEST-001';
  const amount = 25000;
  const email = 'buyer@example.com';

  const result = await createQrisTransaction(orderId, amount, email, mockCoreApi);

  // Verify parameters sent to Midtrans
  if (!capturedPayload) {
    throw new Error('capturedPayload must not be null');
  }
  const payload: ChargeParameter = capturedPayload;
  assert.strictEqual(payload.payment_type, 'qris');
  assert.strictEqual(payload.transaction_details.order_id, orderId);
  assert.strictEqual(payload.transaction_details.gross_amount, amount);
  assert.strictEqual(payload.customer_details?.email, email);

  // Acceptance: returns QR code URL / string
  const expectedUrl = 'https://api.sandbox.midtrans.com/v2/qris/txn-mock-uuid-12345/qr-code';
  assert.strictEqual(result.qrCodeUrl, expectedUrl);
  assert.strictEqual(result.qrUrl, expectedUrl);
  assert.ok(result.qrString.startsWith('000201'));
  assert.strictEqual(result.orderId, orderId);
  assert.strictEqual(result.grossAmount, amount);
  assert.strictEqual(result.transactionId, 'txn-mock-uuid-12345');

  // Verify it can be used directly as string
  assert.strictEqual(String(result), expectedUrl);
  assert.strictEqual(result.toString(), expectedUrl);
});

test('Midtrans Client Utility: createQrisTransaction validates inputs', async () => {
  await assert.rejects(
    async () => {
      await createQrisTransaction('', 10000);
    },
    /orderId is required/
  );

  await assert.rejects(
    async () => {
      await createQrisTransaction('ORDER-123', 0);
    },
    /grossAmount must be greater than 0/
  );
});
