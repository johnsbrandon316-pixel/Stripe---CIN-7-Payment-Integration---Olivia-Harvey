import { saleDiscoveryWorker } from '../workers/saleDiscoveryWorker';
import logger from '../logger';

/**
 * Test the sale discovery worker manually
 * This will run one cycle of the worker without starting the polling interval
 */
async function testWorker() {
  try {
    console.log('Testing sale discovery worker...\n');

    // Check configuration
    console.log('Worker configuration:');
    console.log(`- Poll interval: ${process.env.WORKER_POLL_INTERVAL_MS || 60000}ms`);
    console.log(`- Batch size: ${process.env.WORKER_BATCH_SIZE || 10}`);
    console.log(`- Enabled: ${process.env.WORKER_ENABLED !== 'false'}\n`);

    // Check if Cin7 API key is configured
    if (!process.env.CIN7_API_KEY) {
      console.warn('⚠ CIN7_API_KEY not configured - worker will skip sale discovery');
      console.log('Set CIN7_API_KEY in .env to test the full worker flow\n');
    }

    // Check if Stripe API key is configured
    if (!process.env.STRIPE_API_KEY) {
      console.error('✗ STRIPE_API_KEY not configured');
      process.exit(1);
    }

    console.log('Starting worker test (will run one cycle)...\n');

    // Access the private processNewSales method via a test-only approach
    // In production, the worker runs on an interval
    // For testing, we'll start and immediately stop to trigger one cycle
    saleDiscoveryWorker.start();

    // Wait 5 seconds for the first cycle to complete
    await new Promise((resolve) => setTimeout(resolve, 5000));

    saleDiscoveryWorker.stop();

    console.log('\n✓ Worker test completed');
    console.log('Check logs above for processing details');
  } catch (error: any) {
    console.error('✗ Worker test failed:', error.message);
    process.exit(1);
  }
}

testWorker();
