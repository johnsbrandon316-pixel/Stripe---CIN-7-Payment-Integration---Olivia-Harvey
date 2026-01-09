import { getDb } from '../db';
import logger from '../logger';

export interface IdempotencyKey {
  id?: number;
  key: string;
  operation: string;
  response_data?: string;
  created_at?: string;
  expires_at: string;
}

export class IdempotencyKeyRepository {
  /**
   * Create a new idempotency key
   */
  create(key: Omit<IdempotencyKey, 'id' | 'created_at'>): number {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO idempotency_keys (key, operation, response_data, expires_at)
      VALUES (?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        key.key,
        key.operation,
        key.response_data || null,
        key.expires_at
      );
      logger.info({
        msg: 'Created idempotency key',
        key: key.key,
        operation: key.operation,
      });
      return result.lastInsertRowid as number;
    } catch (error) {
      logger.error({ msg: 'Failed to create idempotency key', error });
      throw error;
    }
  }

  /**
   * Find idempotency key by key string
   */
  findByKey(key: string): IdempotencyKey | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM idempotency_keys WHERE key = ?');
    const row = stmt.get(key) as IdempotencyKey | undefined;
    return row || null;
  }

  /**
   * Check if key exists and is not expired
   */
  existsAndNotExpired(key: string): boolean {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM idempotency_keys 
      WHERE key = ? AND expires_at > datetime('now')
    `);
    const result = stmt.get(key) as { count: number };
    return result.count > 0;
  }

  /**
   * Get response data for an idempotency key
   */
  getResponseData(key: string): string | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT response_data 
      FROM idempotency_keys 
      WHERE key = ? AND expires_at > datetime('now')
    `);
    const row = stmt.get(key) as { response_data: string | null } | undefined;
    return row?.response_data || null;
  }

  /**
   * Update response data for an idempotency key
   */
  updateResponseData(key: string, response_data: string): void {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE idempotency_keys 
      SET response_data = ? 
      WHERE key = ?
    `);

    try {
      stmt.run(response_data, key);
      logger.info({ msg: 'Updated idempotency key response data', key });
    } catch (error) {
      logger.error({ msg: 'Failed to update idempotency key response data', error });
      throw error;
    }
  }

  /**
   * Delete expired keys (cleanup)
   */
  deleteExpired(): number {
    const db = getDb();
    const stmt = db.prepare("DELETE FROM idempotency_keys WHERE expires_at <= datetime('now')");

    try {
      const result = stmt.run();
      const deletedCount = result.changes;
      if (deletedCount > 0) {
        logger.info({ msg: 'Deleted expired idempotency keys', count: deletedCount });
      }
      return deletedCount;
    } catch (error) {
      logger.error({ msg: 'Failed to delete expired idempotency keys', error });
      throw error;
    }
  }
}

export const idempotencyKeyRepository = new IdempotencyKeyRepository();
