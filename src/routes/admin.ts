import express, { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config';
import logger from '../logger';
import { webhookEventRepository } from '../repositories/webhookEventRepository';
import { paymentPostingRepository } from '../repositories/paymentPostingRepository';
import { salePaymentLinkRepository } from '../repositories/salePaymentLinkRepository';
import { idempotencyKeyRepository } from '../repositories/idempotencyKeyRepository';
import { cin7Client } from '../clients/cin7';

export const adminRouter = Router();

/**
 * Middleware: Authenticate admin requests with token
 */
const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const adminToken = req.headers['x-admin-token'] as string;

  if (!adminToken || !config.ADMIN_TOKEN || adminToken !== config.ADMIN_TOKEN) {
    logger.warn({
      msg: 'Unauthorized admin access attempt',
      path: req.path,
      method: req.method,
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

// Apply auth middleware to all admin routes
adminRouter.use(adminAuthMiddleware);

/**
 * POST /api/admin/webhooks/replay
 * Manually replay a stored webhook event
 */
adminRouter.post('/api/admin/webhooks/replay', (req: Request, res: Response) => {
  try {
    const { event_id, force } = req.body;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    logger.info({
      msg: 'Admin webhook replay requested',
      event_id,
      force: force || false,
    });

    // Find event in database
    const event = webhookEventRepository.findByEventId(event_id);
    if (!event) {
      return res.status(404).json({
        error: 'Event not found',
        event_id,
      });
    }

    // Check if already processed
    if (event.processed && !force) {
      logger.warn({
        msg: 'Event already processed, use force=true to replay',
        event_id,
      });
      return res.status(409).json({
        error: 'Event already processed. Use force=true to force replay.',
        event_id,
        processed: true,
      });
    }

    // Mark as unprocessed to allow reprocessing
    // Delete the processed flag by updating
    const db = require('../db').getDb();
    const stmt = db.prepare(`
      UPDATE webhook_events 
      SET processed = 0, processed_at = NULL
      WHERE event_id = ?
    `);
    stmt.run(event_id);

    logger.info({
      msg: 'Admin webhook marked for replay',
      event_id,
      old_status: event.processed ? 'processed' : 'unprocessed',
      new_status: 'unprocessed',
    });

    res.status(200).json({
      success: true,
      event_id,
      message: 'Event marked for replay. Webhook handler will process on next trigger or manual request.',
      processed: false,
    });
  } catch (error) {
    logger.error({
      msg: 'Error in admin webhook replay',
      error,
    });
    res.status(500).json({
      error: 'Failed to replay webhook',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/admin/payments/unposted
 * List payments not yet posted to Cin7
 */
adminRouter.get('/api/admin/payments/unposted', (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    logger.info({
      msg: 'Admin fetching unposted payments',
      limit,
      offset,
    });

    const unposteds = paymentPostingRepository.findUnposted();
    const paginated = unposteds.slice(offset, offset + limit);

    res.status(200).json({
      total: unposteds.length,
      limit,
      offset,
      count: paginated.length,
      payments: paginated.map((p) => ({
        id: p.id,
        cin7_sale_id: p.cin7_sale_id,
        stripe_payment_intent_id: p.stripe_payment_intent_id,
        stripe_charge_id: p.stripe_charge_id,
        amount: p.amount,
        currency: p.currency,
        created_at: p.created_at,
        posted_to_cin7: p.posted_to_cin7,
      })),
    });
  } catch (error) {
    logger.error({
      msg: 'Error fetching unposted payments',
      error,
    });
    res.status(500).json({
      error: 'Failed to fetch unposted payments',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/admin/payments/retry
 * Retry a failed payment posting
 */
adminRouter.post('/api/admin/payments/retry', async (req: Request, res: Response) => {
  try {
    const { payment_posting_id, force } = req.body;

    if (!payment_posting_id) {
      return res.status(400).json({ error: 'payment_posting_id is required' });
    }

    logger.info({
      msg: 'Admin payment retry requested',
      payment_posting_id,
      force: force || false,
    });

    // Find payment posting
    const posting = paymentPostingRepository.findById(payment_posting_id);
    if (!posting) {
      return res.status(404).json({
        error: 'Payment posting not found',
        payment_posting_id,
      });
    }

    // Check if already posted
    if (posting.posted_to_cin7 && !force) {
      logger.warn({
        msg: 'Payment already posted to Cin7, use force=true to force retry',
        payment_posting_id,
      });
      return res.status(409).json({
        error: 'Payment already posted to Cin7. Use force=true to force retry.',
        payment_posting_id,
        posted_to_cin7: true,
      });
    }

    // Retry posting to Cin7
    if (!config.CIN7_API_KEY) {
      return res.status(400).json({
        error: 'CIN7_API_KEY not configured',
        payment_posting_id,
      });
    }

    const amountDollars = posting.amount / 100;

    try {
      const cin7Response = await cin7Client.postPayment({
        saleID: posting.cin7_sale_id,
        amount: amountDollars,
        paymentDate: new Date().toISOString(),
        reference: posting.stripe_charge_id || 'unknown',
        notes: `Stripe Payment Intent: ${posting.stripe_payment_intent_id} (admin retry)`,
      });

      // Mark as posted
      paymentPostingRepository.markPosted(
        posting.cin7_sale_id,
        posting.stripe_payment_intent_id,
        JSON.stringify(cin7Response)
      );

      logger.info({
        msg: 'Admin payment retry successful',
        payment_posting_id,
        cin7_sale_id: posting.cin7_sale_id,
      });

      res.status(200).json({
        success: true,
        payment_posting_id,
        cin7_sale_id: posting.cin7_sale_id,
        amount: amountDollars,
        message: 'Payment successfully posted to Cin7',
      });
    } catch (cin7Error) {
      logger.error({
        msg: 'Admin payment retry failed - Cin7 error',
        payment_posting_id,
        error: cin7Error,
      });
      res.status(502).json({
        error: 'Failed to post payment to Cin7',
        payment_posting_id,
        details: cin7Error instanceof Error ? cin7Error.message : String(cin7Error),
      });
    }
  } catch (error) {
    logger.error({
      msg: 'Error in admin payment retry',
      error,
    });
    res.status(500).json({
      error: 'Failed to retry payment',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/admin/payments/reconcile
 * Compare Stripe vs Cin7 payment state
 */
adminRouter.get('/api/admin/payments/reconcile', (req: Request, res: Response) => {
  try {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    logger.info({
      msg: 'Admin payment reconciliation requested',
      start_date: startDate,
      end_date: endDate,
    });

    const db = require('../db').getDb();

    // Get all webhook events in date range
    const eventsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM webhook_events
      WHERE event_type IN ('charge.succeeded', 'payment_intent.succeeded')
        AND created_at >= ? AND created_at <= ?
    `);
    const stripePayments = (eventsStmt.get(startDate || '2000-01-01', endDate || '2100-01-01') as { count: number }).count;

    // Get posted payments
    const postedStmt = db.prepare(`
      SELECT COUNT(*) as count FROM payment_postings
      WHERE posted_to_cin7 = 1
        AND posted_at >= ? AND posted_at <= ?
    `);
    const cin7Postings = (postedStmt.get(startDate || '2000-01-01', endDate || '2100-01-01') as { count: number }).count;

    // Get unposted payments
    const unpostedStmt = db.prepare(`
      SELECT COUNT(*) as count FROM payment_postings
      WHERE posted_to_cin7 = 0
        AND created_at >= ? AND created_at <= ?
    `);
    const unposted = (unpostedStmt.get(startDate || '2000-01-01', endDate || '2100-01-01') as { count: number }).count;

    res.status(200).json({
      stripe_payments: stripePayments,
      cin7_postings: cin7Postings,
      unposted,
      reconciliation_rate: stripePayments > 0 ? ((cin7Postings / stripePayments) * 100).toFixed(2) + '%' : 'N/A',
      date_range: {
        start: startDate || 'all',
        end: endDate || 'all',
      },
    });
  } catch (error) {
    logger.error({
      msg: 'Error in admin payment reconciliation',
      error,
    });
    res.status(500).json({
      error: 'Failed to reconcile payments',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/admin/payment-links/status
 * Force update payment link status
 */
adminRouter.post('/api/admin/payment-links/status', (req: Request, res: Response) => {
  try {
    const { payment_link_id, status, reason } = req.body;

    if (!payment_link_id || !status) {
      return res.status(400).json({
        error: 'payment_link_id and status are required',
      });
    }

    const validStatuses = ['pending', 'paid', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    logger.info({
      msg: 'Admin payment link status override requested',
      payment_link_id,
      new_status: status,
      reason: reason || 'not provided',
    });

    // Find payment link
    const link = salePaymentLinkRepository.findById(payment_link_id);
    if (!link) {
      return res.status(404).json({
        error: 'Payment link not found',
        payment_link_id,
      });
    }

    const oldStatus = link.status;

    // Update status
    salePaymentLinkRepository.updateStatus(payment_link_id, status);

    logger.info({
      msg: 'Admin payment link status override completed',
      payment_link_id,
      old_status: oldStatus,
      new_status: status,
      reason: reason || 'not provided',
    });

    res.status(200).json({
      success: true,
      payment_link_id,
      cin7_sale_id: link.cin7_sale_id,
      old_status: oldStatus,
      new_status: status,
      reason: reason || 'not provided',
      message: 'Payment link status updated',
    });
  } catch (error) {
    logger.error({
      msg: 'Error in admin payment link status override',
      error,
    });
    res.status(500).json({
      error: 'Failed to update payment link status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/admin/idempotency-keys/expired
 * Find expired idempotency keys
 */
adminRouter.get('/api/admin/idempotency-keys/expired', (req: Request, res: Response) => {
  try {
    logger.info({
      msg: 'Admin querying expired idempotency keys',
    });

    const db = require('../db').getDb();
    const stmt = db.prepare(`
      SELECT key, expires_at FROM idempotency_keys
      WHERE expires_at < CURRENT_TIMESTAMP
      ORDER BY expires_at DESC
      LIMIT 100
    `);

    const expiredKeys = stmt.all() as Array<{ key: string; expires_at: string }>;

    res.status(200).json({
      expired_count: expiredKeys.length,
      keys: expiredKeys.map((k) => ({
        key: k.key,
        expires_at: k.expires_at,
      })),
    });
  } catch (error) {
    logger.error({
      msg: 'Error querying expired idempotency keys',
      error,
    });
    res.status(500).json({
      error: 'Failed to query expired keys',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/admin/idempotency-keys/cleanup
 * Delete expired idempotency keys
 */
adminRouter.post('/api/admin/idempotency-keys/cleanup', (req: Request, res: Response) => {
  try {
    logger.info({
      msg: 'Admin idempotency key cleanup requested',
    });

    const db = require('../db').getDb();

    // Count expired keys before deletion
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM idempotency_keys
      WHERE expires_at < CURRENT_TIMESTAMP
    `);
    const countResult = countStmt.get() as { count: number };
    const deletedCount = countResult.count;

    // Delete expired keys
    idempotencyKeyRepository.deleteExpired();

    logger.info({
      msg: 'Admin idempotency key cleanup completed',
      deleted_count: deletedCount,
    });

    res.status(200).json({
      success: true,
      deleted_count: deletedCount,
      message: `${deletedCount} expired keys deleted`,
    });
  } catch (error) {
    logger.error({
      msg: 'Error in admin idempotency key cleanup',
      error,
    });
    res.status(500).json({
      error: 'Failed to cleanup idempotency keys',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/admin/health
 * Admin endpoint health check
 */
adminRouter.get('/api/admin/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'admin-routes',
    timestamp: new Date().toISOString(),
  });
});
