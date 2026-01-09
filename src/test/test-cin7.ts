import { cin7Client } from '../clients/cin7';

/**
 * Simple test to verify Cin7 client configuration and connectivity
 */
async function testCin7Client() {
  try {
    console.log('Testing Cin7 client...');
    
    // Test: Fetch sales with pagination
    const sales = await cin7Client.getSales({ rows: 5 });
    console.log(`✓ Fetched ${sales.length} sales`);
    
    if (sales.length > 0) {
      const firstSale = sales[0];
      console.log(`✓ First sale ID: ${firstSale.id}, Reference: ${firstSale.reference}`);
      
      // Test: Get single sale by ID
      const sale = await cin7Client.getSaleById(firstSale.id);
      console.log(`✓ Fetched sale details for ID ${sale.id}`);
    }
    
    console.log('\n✓ All Cin7 client tests passed!');
  } catch (error: any) {
    console.error('✗ Cin7 client test failed:', error.message);
    process.exit(1);
  }
}

testCin7Client();
