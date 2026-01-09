import Stripe from 'stripe';
import { config } from '../config';
import logger from '../logger';
import crypto from 'crypto';

export interface StripePaymentLinkInput {
  cin7SaleId: number;
  cin7Reference: string;
  amount: number;
  currency?: string;
  customerEmail?: string;
  customerName?: string;
  description?: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      amount?: number;
      currency?: string;
      metadata?: Record<string, string>;
      payment_link?: string;
      [key: string]: any;
    };
  };
}

export interface PaymentCompletedData {
  cin7SaleId: number;
  cin7Reference: string;
  stripeChargeId: string;
  stripePaymentIntentId?: string;
  amount: number;
  currency: string;
  timestamp: string;
}

export class StripeClient {
  private stripe: Stripe;

  constructor() {
    if (!config.STRIPE_API_KEY) {
      throw new Error('STRIPE_API_KEY is required');
    }

    this.stripe = new Stripe(config.STRIPE_API_KEY, {
      apiVersion: '2023-10-16',
      typescript: true,
    });
  }

  /**
   * Create a Stripe Payment Link for a sale
   */
  async createPaymentLink(input: StripePaymentLinkInput): Promise<Stripe.PaymentLink> {
    try {
      logger.info({
        msg: 'Creating Stripe Payment Link',
        cin7SaleId: input.cin7SaleId,
        amount: input.amount,
      });

      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: input.currency || 'usd',
              product_data: {
                name: input.description || `Sale #${input.cin7Reference}`,
              },
              unit_amount: input.amount,
            } as any,
            quantity: 1,
          },
        ],
        metadata: {
          cin7_sale_id: String(input.cin7SaleId),
          cin7_reference: input.cin7Reference,
        },
      } as any);

      logger.info({
        msg: 'Payment Link created successfully',
        paymentLinkId: paymentLink.id,
        cin7SaleId: input.cin7SaleId,
      });

      return paymentLink;
    } catch (error) {
      logger.error({
        msg: 'Failed to create Payment Link',
        cin7SaleId: input.cin7SaleId,
        error,
      });
      throw error;
    }
  }

  /**
   * Retrieve a Payment Link by ID
   */
  async retrievePaymentLink(paymentLinkId: string): Promise<Stripe.PaymentLink> {
    try {
      logger.info({ msg: 'Retrieving Payment Link', paymentLinkId });
      const paymentLink = await this.stripe.paymentLinks.retrieve(paymentLinkId);
      return paymentLink;
    } catch (error) {
      logger.error({ msg: 'Failed to retrieve Payment Link', paymentLinkId, error });
      throw error;
    }
  }

  /**
   * Verify webhook signature and return the event
   */
  verifyWebhookSignature(body: string | Buffer, signature: string): StripeWebhookEvent {
    if (!config.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required for webhook verification');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        config.STRIPE_WEBHOOK_SECRET
      ) as StripeWebhookEvent;

      logger.info({ msg: 'Webhook signature verified', eventType: event.type });
      return event;
    } catch (error) {
      logger.error({ msg: 'Webhook signature verification failed', error });
      throw error;
    }
  }

  /**
   * Extract payment completion data from a webhook event
   * Handles charge.succeeded and payment_intent.succeeded events
   */
  extractPaymentData(event: StripeWebhookEvent): PaymentCompletedData | null {
    const metadata = event.data.object.metadata || {};
    const cin7SaleId = metadata.cin7_sale_id ? parseInt(metadata.cin7_sale_id, 10) : null;
    const cin7Reference = metadata.cin7_reference;

    if (!cin7SaleId || !cin7Reference) {
      logger.warn({
        msg: 'Webhook event missing Cin7 metadata',
        eventType: event.type,
        metadata,
      });
      return null;
    }

    const stripeChargeId =
      event.type === 'charge.succeeded' ? event.data.object.id : null;
    const stripePaymentIntentId =
      event.type === 'payment_intent.succeeded' ? event.data.object.id : null;

    const paymentData: PaymentCompletedData = {
      cin7SaleId,
      cin7Reference,
      stripeChargeId: stripeChargeId || '',
      stripePaymentIntentId: stripePaymentIntentId || undefined,
      amount: event.data.object.amount || 0,
      currency: (event.data.object.currency || 'usd').toUpperCase(),
      timestamp: new Date().toISOString(),
    };

    logger.info({
      msg: 'Extracted payment data from webhook',
      cin7SaleId,
      amount: paymentData.amount,
      eventType: event.type,
    });

    return paymentData;
  }
}

export const stripeClient = new StripeClient();
