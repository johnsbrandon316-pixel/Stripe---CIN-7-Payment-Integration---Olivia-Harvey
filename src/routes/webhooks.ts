import express, { Router, Request, Response, raw } from 'express';
import { stripeClient } from '../clients/stripe';
import logger from '../logger';

export const webhooksRouter = Router();

/**
 * Stripe webhook endpoint
 * Receives webhook events from Stripe, verifies signature, and logs the event data
 * Uses raw middleware to prevent JSON parsing of the request body (required for signature verification)
 */
webhooksRouter.post(
  '/api/webhooks/stripe',
  raw({ type: 'application/json' }),
  (request: Request, response: Response) => {
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

    // Extract payment data
    const paymentData = stripeClient.extractPaymentData(event);
    if (paymentData) {
      logger.info({
        msg: 'Payment completed',
        cin7SaleId: paymentData.cin7SaleId,
        amount: paymentData.amount,
        stripeChargeId: paymentData.stripeChargeId,
      });
      // TODO: Post to Cin7 SalePayments API once we have the API key
    } else {
      logger.warn({
        msg: 'Event received but no Cin7 metadata found',
        eventType: event.type,
      });
    }

    // Return 200 immediately to acknowledge receipt
    response.status(200).json({ received: true });
  } catch (error) {
    logger.error({ msg: 'Webhook processing error', error });
    response.status(400).json({ error: 'Webhook error' });
  }
});
