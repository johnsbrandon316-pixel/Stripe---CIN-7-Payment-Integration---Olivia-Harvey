import { stripeClient } from '../clients/stripe';

/**
 * Simple test to verify Stripe client configuration
 */
async function testStripeClient() {
  try {
    console.log('Testing Stripe client...');

    // Test: Verify webhook secret is configured
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.warn('⚠ STRIPE_WEBHOOK_SECRET not set (optional for this test)');
    } else {
      console.log('✓ Stripe webhook secret configured');
    }

    // Test: Create a payment link
    const paymentLink = await stripeClient.createPaymentLink({
      cin7SaleId: 12345,
      cin7Reference: 'SALE-2025-001',
      amount: 15000, // $150.00 in cents
      currency: 'usd',
      customerEmail: 'customer@example.com',
      customerName: 'Test Customer',
      description: 'Test Payment for Integration',
    });

    console.log(`✓ Payment Link created: ${paymentLink.id}`);
    console.log(`✓ URL: ${paymentLink.url}`);

    // Test: Retrieve the payment link
    const retrieved = await stripeClient.retrievePaymentLink(paymentLink.id);
    console.log(`✓ Retrieved Payment Link: ${retrieved.id}`);

    console.log('\n✓ All Stripe client tests passed!');
  } catch (error: any) {
    console.error('✗ Stripe client test failed:', error.message);
    process.exit(1);
  }
}

testStripeClient();
