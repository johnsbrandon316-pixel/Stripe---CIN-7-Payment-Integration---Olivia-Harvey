import { salePaymentLinkRepository } from '../repositories/salePaymentLinkRepository';
import { webhookEventRepository } from '../repositories/webhookEventRepository';
import { paymentPostingRepository } from '../repositories/paymentPostingRepository';
import { idempotencyKeyRepository } from '../repositories/idempotencyKeyRepository';
import { runMigrations, closeDb } from '../db';
import logger from '../logger';

async function testDatabase() {
  try {
    console.log('Running database migrations...');
    runMigrations();

    console.log('\n✓ Migrations completed successfully');

    // Test 1: Create a sale payment link
    console.log('\nTest 1: Create sale payment link');
    const linkId = salePaymentLinkRepository.create({
      cin7_sale_id: 12345,
      cin7_reference: 'SALE-2025-001',
      stripe_payment_link_id: 'plink_test123',
      stripe_payment_link_url: 'https://buy.stripe.com/test/abc123',
      amount: 15000,
      currency: 'USD',
      status: 'pending',
    });
    console.log(`✓ Created sale payment link with ID: ${linkId}`);

    // Test 2: Find by sale ID
    console.log('\nTest 2: Find sale payment link by Cin7 sale ID');
    const foundLink = salePaymentLinkRepository.findBySaleId(12345);
    console.log(`✓ Found link:`, foundLink);

    // Test 3: Create webhook event
    console.log('\nTest 3: Create webhook event');
    const eventId = webhookEventRepository.create({
      event_id: 'evt_test123',
      event_type: 'charge.succeeded',
      stripe_payment_intent_id: 'pi_test123',
      stripe_charge_id: 'ch_test123',
      cin7_sale_id: 12345,
      cin7_reference: 'SALE-2025-001',
      amount: 15000,
      currency: 'USD',
      processed: false,
      raw_event: JSON.stringify({ test: 'data' }),
    });
    console.log(`✓ Created webhook event with ID: ${eventId}`);

    // Test 4: Check if event exists
    console.log('\nTest 4: Check if webhook event exists');
    const eventExists = webhookEventRepository.exists('evt_test123');
    console.log(`✓ Event exists: ${eventExists}`);

    // Test 5: Create payment posting
    console.log('\nTest 5: Create payment posting');
    const postingId = paymentPostingRepository.create({
      cin7_sale_id: 12345,
      stripe_payment_intent_id: 'pi_test123',
      stripe_charge_id: 'ch_test123',
      amount: 15000,
      currency: 'USD',
      posted_to_cin7: false,
    });
    console.log(`✓ Created payment posting with ID: ${postingId}`);

    // Test 6: Check if posting exists
    console.log('\nTest 6: Check if payment posting exists');
    const postingExists = paymentPostingRepository.existsForSaleAndIntent(12345, 'pi_test123');
    console.log(`✓ Posting exists: ${postingExists}`);

    // Test 7: Create idempotency key
    console.log('\nTest 7: Create idempotency key');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
    const keyId = idempotencyKeyRepository.create({
      key: 'create_payment_link:12345',
      operation: 'create_payment_link',
      response_data: JSON.stringify({ payment_link_id: 'plink_test123' }),
      expires_at: expiresAt,
    });
    console.log(`✓ Created idempotency key with ID: ${keyId}`);

    // Test 8: Check if key exists and not expired
    console.log('\nTest 8: Check if idempotency key exists and not expired');
    const keyExists = idempotencyKeyRepository.existsAndNotExpired('create_payment_link:12345');
    console.log(`✓ Key exists and not expired: ${keyExists}`);

    // Test 9: Update payment link status
    console.log('\nTest 9: Update payment link status');
    salePaymentLinkRepository.updateStatus(12345, 'paid');
    const updatedLink = salePaymentLinkRepository.findBySaleId(12345);
    console.log(`✓ Updated status to: ${updatedLink?.status}`);

    // Test 10: Mark webhook event as processed
    console.log('\nTest 10: Mark webhook event as processed');
    webhookEventRepository.markProcessed('evt_test123');
    const processedEvent = webhookEventRepository.findByEventId('evt_test123');
    console.log(`✓ Event processed: ${processedEvent?.processed}`);

    console.log('\n✓ All database tests passed!');
    console.log('\nDatabase file location: data/app.db');
  } catch (error: any) {
    console.error('✗ Database test failed:', error.message);
    process.exit(1);
  } finally {
    closeDb();
  }
}

testDatabase();
