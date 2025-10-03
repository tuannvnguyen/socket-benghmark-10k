#!/usr/bin/env node

// Simple test script to demonstrate disconnection tracking
const { ConnectionTester } = require('./dist/client.js');

async function testDisconnectionTracking() {
  console.log('🧪 Testing Disconnection Tracking Functionality\n');

  const config = {
    targetConnections: 5,
    connectionRate: 5,
    testDuration: 15,
    messageInterval: 2000,
    messageSize: 1024,
    message: 'Test message',
    serverHost: 'localhost',
    serverPort: 3000,
    maxRetries: 2,
    retryDelay: 500,
    companyId: '11110000',
    token: 'test_token'
  };

  const tester = new ConnectionTester(config);

  try {
    console.log('Step 1: Starting connection test...');
    const results = await tester.testConnections();

    console.log('\nStep 2: Initial connection stats:');
    const initialStats = tester.getConnectionStats();
    console.log(`  Total: ${initialStats.total}`);
    console.log(`  Successful: ${initialStats.successful}`);
    console.log(`  Active: ${initialStats.active}`);
    console.log(`  Disconnected: ${initialStats.disconnected}`);

    if (initialStats.active > 0) {
      console.log('\nStep 3: Simulating random disconnections...');
      tester.simulateRandomDisconnections(40); // Disconnect 40% of connections

      // Wait a bit for disconnections to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('\nStep 4: Updated connection stats after simulated disconnections:');
      const finalStats = tester.getConnectionStats();
      console.log(`  Total: ${finalStats.total}`);
      console.log(`  Successful: ${finalStats.successful}`);
      console.log(`  Active: ${finalStats.active}`);
      console.log(`  Disconnected: ${finalStats.disconnected}`);
      console.log(`  Spontaneous Disconnections: ${finalStats.spontaneousDisconnections}`);
    }

    console.log('\nStep 5: Final summary:');
    tester.printSummary();

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testDisconnectionTracking().catch(console.error);