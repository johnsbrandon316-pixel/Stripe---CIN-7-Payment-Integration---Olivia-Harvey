import { getDb } from '../db';
import logger from '../logger';

export interface PaymentPosting {
  id?: number;
  cin7_sale_id: number;
  stripe_payment_intent_id: string;
  stripe_charge_id?: string;
  amount: number;
  currency: string;
  posted_to_cin7: boolean;
  cin7_response?: string;
  posted_at?: string;
  created_at?: string;
}

export class PaymentPostingRepository {
  /**
   * Create a new payment posting record
   */
  create(posting: Omit<PaymentPosting, 'id' | 'created_at' | 'posted_at'>): number {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO payment_postings 
        (cin7_sale_id, stripe_payment_intent_id, stripe_charge_id, amount, currency, posted_to_cin7, cin7_response)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        posting.cin7_sale_id,
        posting.stripe_payment_intent_id,
        posting.stripe_charge_id || null,
        posting.amount,
        posting.currency,
        posting.posted_to_cin7 ? 1 : 0,
        posting.cin7_response || null
      );
      logger.info({
        msg: 'Created payment posting record',
        cin7_sale_id: posting.cin7_sale_id,
        stripe_payment_intent_id: posting.stripe_payment_intent_id,
      });
      return result.lastInsertRowid as number;
    } catch (error) {
      logger.error({ msg: 'Failed to create payment posting', error });
      throw error;
    }
  }

  /**
   * Check if payment has already been posted to Cin7
   */
  existsForSaleAndIntent(cin7_sale_id: number, stripe_payment_intent_id: string): boolean {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM payment_postings 
      WHERE cin7_sale_id = ? AND stripe_payment_intent_id = ?
    `);
    const result = stmt.get(cin7_sale_id, stripe_payment_intent_id) as { count: number };
    return result.count > 0;
  }

  /**
   * Mark payment as posted to Cin7
   */
  markPosted(cin7_sale_id: number, stripe_payment_intent_id: string, cin7_response: string): void {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE payment_postings 
      SET posted_to_cin7 = 1, cin7_response = ?, posted_at = CURRENT_TIMESTAMP
      WHERE cin7_sale_id = ? AND stripe_payment_intent_id = ?
    `);

    try {
      stmt.run(cin7_response, cin7_sale_id, stripe_payment_intent_id);
      logger.info({
        msg: 'Marked payment as posted to Cin7',
        cin7_sale_id,
        stripe_payment_intent_id,
      });
    } catch (error) {
      logger.error({ msg: 'Failed to mark payment as posted', error });
      throw error;
    }
  }

  /**
   * Get all unposted payments
   */
  findUnposted(): PaymentPosting[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM payment_postings WHERE posted_to_cin7 = 0');
    return stmt.all() as PaymentPosting[];
  }

  /**
   * Find posting by sale and intent
   */
  findBySaleAndIntent(cin7_sale_id: number, stripe_payment_intent_id: string): PaymentPosting | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM payment_postings 
      WHERE cin7_sale_id = ? AND stripe_payment_intent_id = ?
    `);
    const row = stmt.get(cin7_sale_id, stripe_payment_intent_id) as PaymentPosting | undefined;
    return row || null;
  }
}

export const paymentPostingRepository = new PaymentPostingRepository();
