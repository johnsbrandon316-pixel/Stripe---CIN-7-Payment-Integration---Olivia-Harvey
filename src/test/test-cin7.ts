import { cin7Client } from '../clients/cin7';

/**
 * Simple test to verify Cin7 client configuration and connectivity
 */
async function testCin7Client() {
  try {
    console.log('Testing Cin7 client...');
    
    // Test: Fetch company info to verify credentials and connectivity
    const me = await cin7Client.getMe();
    console.log('✓ Cin7 Core company info:', me);
    console.log('\n✓ Cin7 Core API connectivity test passed!');
  } catch (error: any) {
    console.error('✗ Cin7 client test failed:', error.message);
    process.exit(1);
  }
}

testCin7Client();
