import { cin7Client } from '../clients/cin7';
import { stripeClient } from '../clients/stripe';
import { salePaymentLinkRepository } from '../repositories/salePaymentLinkRepository';
import { idempotencyKeyRepository } from '../repositories/idempotencyKeyRepository';
import logger from '../logger';
import { config } from '../config';

export interface WorkerConfig {
  pollIntervalMs: number;
  batchSize: number;
  enabled: boolean;
}

export class SaleDiscoveryWorker {
  private config: WorkerConfig;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(config: WorkerConfig) {
    this.config = config;
  }

  /**
   * Start the worker with polling interval
   */
  start(): void {
    if (this.isRunning) {
      logger.warn({ msg: 'Sale discovery worker already running' });
      return;
    }

    if (!this.config.enabled) {
      logger.info({ msg: 'Sale discovery worker is disabled' });
      return;
    }

    this.isRunning = true;
    logger.info({
      msg: 'Starting sale discovery worker',
      pollIntervalMs: this.config.pollIntervalMs,
      batchSize: this.config.batchSize,
    });

    // Run immediately on start
    this.processNewSales().catch((error) => {
      logger.error({ msg: 'Error in initial worker run', error });
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.processNewSales().catch((error) => {
        logger.error({ msg: 'Error in worker interval', error });
      });
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info({ msg: 'Stopping sale discovery worker' });
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
  }

  /**
   * Process new sales and generate payment links
   */
  private async processNewSales(): Promise<void> {
    const startTime = Date.now();
    logger.info({ msg: 'Starting sale discovery cycle' });

    try {
      // Check if Cin7 API key is available
      if (!config.CIN7_API_KEY) {
        logger.warn({ msg: 'CIN7_API_KEY not configured, skipping sale discovery' });
        return;
      }

      // Fetch recent sales from Cin7
      const sales = await cin7Client.getSales({
        limit: this.config.batchSize,
        modifiedSince: this.getModifiedSinceDate(),
      });

      logger.info({
        msg: 'Fetched sales from Cin7',
        count: sales.length,
      });

      if (sales.length === 0) {
        logger.info({ msg: 'No new sales to process' });
        return;
      }

      let processed = 0;
      let skipped = 0;
      let failed = 0;

      for (const sale of sales) {
        try {
          await this.processSale(sale);
          processed++;
        } catch (error) {
          logger.error({
            msg: 'Failed to process sale',
            cin7_sale_id: sale.ID,
            error,
          });
          failed++;
        }
      }

      const duration = Date.now() - startTime;
      logger.info({
        msg: 'Sale discovery cycle completed',
        processed,
        skipped,
        failed,
        durationMs: duration,
      });
    } catch (error) {
      logger.error({ msg: 'Failed to fetch sales from Cin7', error });
    }
  }

  /**
   * Process a single sale
   */
  private async processSale(sale: any): Promise<void> {
    const cin7SaleId = sale.ID;
    const cin7Reference = sale.SaleOrderNumber || `SALE-${cin7SaleId}`;

    // Check if payment link already exists
    const existingLink = salePaymentLinkRepository.findBySaleId(cin7SaleId);
    if (existingLink) {
      logger.debug({
        msg: 'Payment link already exists for sale',
        cin7_sale_id: cin7SaleId,
        status: existingLink.status,
      });
      return;
    }

    // Check if sale is eligible for payment link generation
    if (!this.isSaleEligible(sale)) {
      logger.debug({
        msg: 'Sale not eligible for payment link',
        cin7_sale_id: cin7SaleId,
        status: sale.Status,
      });
      return;
    }

    // Use idempotency key to prevent duplicate link creation
    const idempotencyKey = `create_payment_link:${cin7SaleId}`;
    if (idempotencyKeyRepository.existsAndNotExpired(idempotencyKey)) {
      logger.debug({
        msg: 'Idempotency key exists, skipping duplicate creation',
        cin7_sale_id: cin7SaleId,
      });
      return;
    }

    // Create idempotency key (expires in 24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    idempotencyKeyRepository.create({
      key: idempotencyKey,
      operation: 'create_payment_link',
      expires_at: expiresAt,
    });

    // Get sale total amount
    const amount = this.calculateSaleAmount(sale);
    if (amount <= 0) {
      logger.warn({
        msg: 'Sale has invalid amount, skipping',
        cin7_sale_id: cin7SaleId,
        amount,
      });
      return;
    }

    logger.info({
      msg: 'Creating payment link for sale',
      cin7_sale_id: cin7SaleId,
      amount,
    });

    // Create Stripe Payment Link
    const paymentLink = await stripeClient.createPaymentLink({
      cin7SaleId,
      cin7Reference,
      amount,
      currency: sale.Currency || 'usd',
      description: `Payment for ${cin7Reference}`,
    });

    // Persist payment link
    salePaymentLinkRepository.create({
      cin7_sale_id: cin7SaleId,
      cin7_reference: cin7Reference,
      stripe_payment_link_id: paymentLink.id,
      stripe_payment_link_url: paymentLink.url,
      amount,
      currency: (sale.Currency || 'USD').toUpperCase(),
      status: 'pending',
    });

    // Update idempotency key with response
    idempotencyKeyRepository.updateResponseData(
      idempotencyKey,
      JSON.stringify({ payment_link_id: paymentLink.id, url: paymentLink.url })
    );

    // Write payment link back to Cin7 sale
    try {
      await this.writePaymentLinkToCin7(cin7SaleId, paymentLink.url);
    } catch (error) {
      logger.error({
        msg: 'Failed to write payment link back to Cin7',
        cin7_sale_id: cin7SaleId,
        error,
      });
      // Don't fail the whole operation if writing back fails
    }

    logger.info({
      msg: 'Payment link created successfully',
      cin7_sale_id: cin7SaleId,
      stripe_payment_link_id: paymentLink.id,
      url: paymentLink.url,
    });
  }

  /**
   * Check if sale is eligible for payment link generation
   */
  private isSaleEligible(sale: any): boolean {
    // Check if sale status is appropriate
    // Common Cin7 sale statuses: DRAFT, AUTHORISED, INVOICED, PAID
    const status = sale.Status?.toUpperCase();
    if (!status) {
      return false;
    }

    // Generate payment links for authorized/invoiced sales that are not yet paid
    const eligibleStatuses = ['AUTHORISED', 'INVOICED'];
    return eligibleStatuses.includes(status);
  }

  /**
   * Calculate total amount for sale (in cents)
   */
  private calculateSaleAmount(sale: any): number {
    // Try different fields that might contain the total
    const total = sale.Total || sale.TotalBeforeTax || sale.GrandTotal || 0;
    
    // Convert to cents and round
    return Math.round(total * 100);
  }

  /**
   * Get the modified since date for filtering sales (last 7 days)
   */
  private getModifiedSinceDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 7); // Last 7 days
    return date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
  }

  /**
   * Write payment link back to Cin7 sale
   * TODO: Confirm with Olivia/Sam which field to use (custom field or notes)
   */
  private async writePaymentLinkToCin7(cin7SaleId: number, paymentLinkUrl: string): Promise<void> {
    logger.info({
      msg: 'Writing payment link to Cin7 sale',
      cin7_sale_id: cin7SaleId,
      url: paymentLinkUrl,
    });

    // Option 1: Write to Notes field
    const noteText = `Payment Link: ${paymentLinkUrl}`;
    
    try {
      await cin7Client.updateSale(cin7SaleId, {
        Note: noteText,
      });
      
      logger.info({
        msg: 'Payment link written to Cin7 sale notes',
        cin7_sale_id: cin7SaleId,
      });
    } catch (error) {
      logger.error({
        msg: 'Failed to write payment link to Cin7',
        cin7_sale_id: cin7SaleId,
        error,
      });
      throw error;
    }
  }
}

// Export singleton instance with default config
export const saleDiscoveryWorker = new SaleDiscoveryWorker({
  pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '60000', 10),
  batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '10', 10),
  enabled: process.env.WORKER_ENABLED !== 'false', // Enabled by default
});
