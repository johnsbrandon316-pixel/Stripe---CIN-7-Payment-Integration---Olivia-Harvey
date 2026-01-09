import express, { Router, Request, Response, raw } from 'express';
import { stripeClient } from '../clients/stripe';
import { cin7Client } from '../clients/cin7';
import logger from '../logger';
import { config } from '../config';
import { webhookEventRepository } from '../repositories/webhookEventRepository';
import { paymentPostingRepository } from '../repositories/paymentPostingRepository';
import { salePaymentLinkRepository } from '../repositories/salePaymentLinkRepository';

export const webhooksRouter = Router();

/**
 * Stripe webhook endpoint
 * Receives webhook events from Stripe, verifies signature, and processes payment completions
 * Uses raw middleware to prevent JSON parsing of the request body (required for signature verification)
 * 
 * Flow:
 * 1. Verify webhook signature
 * 2. Check if event already processed (idempotency via webhook_events table)
 * 3. Return 200 immediately to Stripe
 * 4. Process payment async: extract data, check idempotency, post to Cin7, update statuses
 */
webhooksRouter.post(
  '/api/webhooks/stripe',
  raw({ type: 'application/json' }),
  async (request: Request, response: Response) => {
    try {
      const signature = request.headers['stripe-signature'] as string;

      if (!signature) {
        logger.warn({ msg: 'Webhook signature header missing' });
        return response.status(400).json({ error: 'Missing signature header' });
      }

      // request.body is a Buffer when using raw middleware
      const event = stripeClient.verifyWebhookSignature(
        request.body as Buffer,
        signature
      );

      logger.info({ msg: 'Webhook event received', eventType: event.type, eventId: event.id });

      // Check if event already processed (idempotency)
      const alreadyProcessed = webhookEventRepository.exists(event.id);
      if (alreadyProcessed) {
        logger.info({
          msg: 'Event already processed, skipping',
          eventId: event.id,
          eventType: event.type,
        });
        return response.status(200).json({ received: true, alreadyProcessed: true });
      }

      // Store event immediately for idempotency
      webhookEventRepository.create({
        event_id: event.id,
        event_type: event.type,
        raw_event: JSON.stringify(event),
        processed: false,
      });

      // Return 200 immediately to Stripe (required for idempotent retries)
      response.status(200).json({ received: true });

      // Process webhook asynchronously
      processWebhookAsync(event).catch((error) => {
        logger.error({
          msg: 'Async webhook processing failed',
          eventId: event.id,
          error,
        });
      });
    } catch (error) {
      logger.error({ msg: 'Webhook processing error', error });
      response.status(400).json({ error: 'Webhook error' });
    }
  }
);

/**
 * Process webhook event asynchronously
 * Handles payment completion: post to Cin7 SalePayments, update payment link status
 */
async function processWebhookAsync(event: any): Promise<void> {
  try {
    logger.info({
      msg: 'Starting async webhook processing',
      eventId: event.id,
      eventType: event.type,
    });

    // Extract payment data
    const paymentData = stripeClient.extractPaymentData(event);
    if (!paymentData) {
      logger.warn({
        msg: 'Event has no Cin7 metadata, skipping payment posting',
        eventType: event.type,
        eventId: event.id,
      });
      webhookEventRepository.markProcessed(event.id);
      return;
    }

    logger.info({
      msg: 'Payment data extracted from webhook',
      cin7SaleId: paymentData.cin7SaleId,
      cin7Reference: paymentData.cin7Reference,
      amount: paymentData.amount,
      stripeChargeId: paymentData.stripeChargeId,
      paymentIntentId: paymentData.stripePaymentIntentId,
    });

    // Check if payment already posted to Cin7 (idempotency)
    const alreadyPosted = paymentPostingRepository.existsForSaleAndIntent(
      paymentData.cin7SaleId,
      paymentData.stripePaymentIntentId || paymentData.stripeChargeId
    );

    if (alreadyPosted) {
      logger.info({
        msg: 'Payment already posted to Cin7, skipping',
        cin7SaleId: paymentData.cin7SaleId,
        paymentIntentId: paymentData.stripePaymentIntentId,
      });
      webhookEventRepository.markProcessed(event.id);
      return;
    }

    // Create pending payment posting record (for idempotency)
    paymentPostingRepository.create({
      cin7_sale_id: paymentData.cin7SaleId,
      stripe_payment_intent_id: paymentData.stripePaymentIntentId || paymentData.stripeChargeId,
      stripe_charge_id: paymentData.stripeChargeId,
      amount: paymentData.amount,
      currency: paymentData.currency,
      posted_to_cin7: false,
    });

    // Post to Cin7 SalePayments API (if API key configured)
    if (config.CIN7_API_KEY) {
      try {
        const amountDollars = paymentData.amount / 100; // Convert cents to dollars
        
        const cin7Response = await cin7Client.postPayment({
          saleID: paymentData.cin7SaleId,
          amount: amountDollars,
          paymentDate: new Date().toISOString(),
          reference: paymentData.stripeChargeId, // Non-sensitive transaction reference
          notes: `Stripe Payment Intent: ${paymentData.stripePaymentIntentId || paymentData.stripeChargeId}`,
        });

        logger.info({
          msg: 'Payment posted to Cin7 SalePayments',
          cin7SaleId: paymentData.cin7SaleId,
          amount: amountDollars,
          stripeChargeId: paymentData.stripeChargeId,
        });

        // Mark payment posting as complete
        paymentPostingRepository.markPosted(
          paymentData.cin7SaleId,
          paymentData.stripePaymentIntentId || paymentData.stripeChargeId,
          JSON.stringify(cin7Response)
        );

        // Update payment link status to 'paid'
        const paymentLink = salePaymentLinkRepository.findBySaleId(paymentData.cin7SaleId);
        if (paymentLink && paymentLink.id) {
          salePaymentLinkRepository.updateStatus(paymentLink.id, 'paid');
          logger.info({
            msg: 'Payment link status updated to paid',
            cin7SaleId: paymentData.cin7SaleId,
            paymentLinkId: paymentLink.stripe_payment_link_id,
          });
        }
      } catch (cin7Error) {
        logger.error({
          msg: 'Failed to post payment to Cin7',
          cin7SaleId: paymentData.cin7SaleId,
          error: cin7Error,
        });
        throw cin7Error; // Rethrow to prevent marking event as processed
      }
    } else {
      logger.warn({
        msg: 'CIN7_API_KEY not configured, skipping Cin7 posting',
        cin7SaleId: paymentData.cin7SaleId,
      });
    }

    // Mark webhook event as processed
    webhookEventRepository.markProcessed(event.id);

    logger.info({
      msg: 'Webhook processing complete',
      eventId: event.id,
      cin7SaleId: paymentData.cin7SaleId,
    });
  } catch (error) {
    logger.error({
      msg: 'Error in async webhook processing',
      eventId: event.id,
      error,
    });
    throw error;
  }
}
