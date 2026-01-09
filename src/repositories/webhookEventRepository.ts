import { getDb } from '../db';
import logger from '../logger';

export interface WebhookEvent {
  id?: number;
  event_id: string;
  event_type: string;
  stripe_payment_intent_id?: string;
  stripe_charge_id?: string;
  cin7_sale_id?: number;
  cin7_reference?: string;
  amount?: number;
  currency?: string;
  processed: boolean;
  raw_event?: string;
  created_at?: string;
  processed_at?: string;
}

export class WebhookEventRepository {
  /**
   * Create a new webhook event record
   */
  create(event: Omit<WebhookEvent, 'id' | 'created_at' | 'processed_at'>): number {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO webhook_events 
        (event_id, event_type, stripe_payment_intent_id, stripe_charge_id, 
         cin7_sale_id, cin7_reference, amount, currency, processed, raw_event)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        event.event_id,
        event.event_type,
        event.stripe_payment_intent_id || null,
        event.stripe_charge_id || null,
        event.cin7_sale_id || null,
        event.cin7_reference || null,
        event.amount || null,
        event.currency || null,
        event.processed ? 1 : 0,
        event.raw_event || null
      );
      logger.info({
        msg: 'Created webhook event record',
        event_id: event.event_id,
        event_type: event.event_type,
      });
      return result.lastInsertRowid as number;
    } catch (error) {
      logger.error({ msg: 'Failed to create webhook event', error });
      throw error;
    }
  }

  /**
   * Check if event has already been processed
   */
  exists(event_id: string): boolean {
    const db = getDb();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM webhook_events WHERE event_id = ?');
    const result = stmt.get(event_id) as { count: number };
    return result.count > 0;
  }

  /**
   * Mark event as processed
   */
  markProcessed(event_id: string): void {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE webhook_events 
      SET processed = 1, processed_at = CURRENT_TIMESTAMP
      WHERE event_id = ?
    `);

    try {
      stmt.run(event_id);
      logger.info({ msg: 'Marked webhook event as processed', event_id });
    } catch (error) {
      logger.error({ msg: 'Failed to mark webhook event as processed', error });
      throw error;
    }
  }

  /**
   * Get unprocessed events
   */
  findUnprocessed(): WebhookEvent[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM webhook_events WHERE processed = 0 ORDER BY created_at ASC');
    return stmt.all() as WebhookEvent[];
  }

  /**
   * Get event by ID
   */
  findByEventId(event_id: string): WebhookEvent | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM webhook_events WHERE event_id = ?');
    const row = stmt.get(event_id) as WebhookEvent | undefined;
    return row || null;
  }
}

export const webhookEventRepository = new WebhookEventRepository();
