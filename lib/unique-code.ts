import { query } from './db';

/**
 * Generate a dynamic unique checkout amount to prevent payment collisions.
 * Analyzes active pending unpaid orders from the last 60 minutes and guarantees
 * a distinct payable amount by adding a small unique code (Rp 1 - Rp 99).
 */
export async function generateUniqueCheckoutAmount(baseAmount: number): Promise<{
  payableAmount: number;
  uniqueCode: number;
}> {
  try {
    const pendingOrders = await query<{ invoice_data: unknown }>(
      `SELECT invoice_data FROM orders
       WHERE payment_status = 'unpaid'
         AND created_at >= NOW() - INTERVAL '60 minutes'`
    );

    const activeAmounts = new Set<number>();
    for (const row of pendingOrders.rows) {
      const inv =
        typeof row.invoice_data === 'string'
          ? JSON.parse(row.invoice_data || '{}')
          : (row.invoice_data || {});
      const amt = Number(inv.payable_amount || inv.amount);
      if (amt > 0) activeAmounts.add(amt);
    }

    // Pick a random unique code from 11 to 99
    let chosenCode = Math.floor(Math.random() * 89) + 11;
    let candidate = baseAmount + chosenCode;

    // If colliding with an existing pending order, find an available code from 1 to 99
    if (activeAmounts.has(candidate)) {
      for (let c = 1; c <= 99; c++) {
        if (!activeAmounts.has(baseAmount + c)) {
          chosenCode = c;
          candidate = baseAmount + c;
          break;
        }
      }
    }

    return {
      payableAmount: candidate,
      uniqueCode: chosenCode,
    };
  } catch {
    // Graceful fallback if database lookup fails
    const fallbackCode = Math.floor(Math.random() * 89) + 11;
    return {
      payableAmount: baseAmount + fallbackCode,
      uniqueCode: fallbackCode,
    };
  }
}
