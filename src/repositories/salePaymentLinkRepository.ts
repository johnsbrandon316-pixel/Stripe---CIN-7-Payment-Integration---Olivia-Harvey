import { getDb } from '../db';
import logger from '../logger';

export interface SalePaymentLink {
  id?: number;
  cin7_sale_id: number;
  cin7_reference: string;
  stripe_payment_link_id: string;
  stripe_payment_link_url: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  created_at?: string;
  updated_at?: string;
}

export class SalePaymentLinkRepository {
  /**
   * Create a new sale payment link record
   */
  create(link: Omit<SalePaymentLink, 'id' | 'created_at' | 'updated_at'>): number {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO sale_payment_links 
        (cin7_sale_id, cin7_reference, stripe_payment_link_id, stripe_payment_link_url, amount, currency, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        link.cin7_sale_id,
        link.cin7_reference,
        link.stripe_payment_link_id,
        link.stripe_payment_link_url,
        link.amount,
        link.currency,
        link.status
      );
      logger.info({
        msg: 'Created sale payment link record',
        cin7_sale_id: link.cin7_sale_id,
        stripe_payment_link_id: link.stripe_payment_link_id,
      });
      return result.lastInsertRowid as number;
    } catch (error) {
      logger.error({ msg: 'Failed to create sale payment link', error });
      throw error;
    }
  }

  /**
   * Find payment link by Cin7 sale ID
   */
  findBySaleId(cin7_sale_id: number): SalePaymentLink | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM sale_payment_links WHERE cin7_sale_id = ?');
    const row = stmt.get(cin7_sale_id) as SalePaymentLink | undefined;
    return row || null;
  }

  /**
   * Find payment link by Stripe Payment Link ID
   */
  findByStripePaymentLinkId(stripe_payment_link_id: string): SalePaymentLink | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM sale_payment_links WHERE stripe_payment_link_id = ?');
    const row = stmt.get(stripe_payment_link_id) as SalePaymentLink | undefined;
    return row || null;
  }

  /**
   * Update payment link status
   */
  updateStatus(cin7_sale_id: number, status: SalePaymentLink['status']): void {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE sale_payment_links 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE cin7_sale_id = ?
    `);

    try {
      stmt.run(status, cin7_sale_id);
      logger.info({
        msg: 'Updated sale payment link status',
        cin7_sale_id,
        status,
      });
    } catch (error) {
      logger.error({ msg: 'Failed to update sale payment link status', error });
      throw error;
    }
  }

  /**
   * Get all pending payment links
   */
  findPending(): SalePaymentLink[] {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM sale_payment_links WHERE status = 'pending'");
    return stmt.all() as SalePaymentLink[];
  }
}

export const salePaymentLinkRepository = new SalePaymentLinkRepository();
