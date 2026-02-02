// tests/listener.test.js
// Test mempool listener

const { initialize, shutdown, getStats, isListenerConnected } = require('../src/mempool-listener');
const { logConfig } = require('../src/config');

// Log configuration first
logConfig();

console.log('Testing mempool-listener.js...');
console.log('This will connect to Alchemy and listen for real Uniswap transactions.');
console.log('Press Ctrl+C to stop.\n');

// Track transactions for testing
let transactionCount = 0;
const startTime = Date.now();

// Callback when we receive a decoded transaction
function onTransaction(decoded) {
  transactionCount++;
  
  // Log some details
  console.log(`\n   ────────────────────────────────────`);
  console.log(`   Transaction #${transactionCount}`);
  console.log(`   Hash: ${decoded.txHash.slice(0, 20)}...`);
  console.log(`   From: ${decoded.from.slice(0, 12)}...`);
  console.log(`   Method: ${decoded.method}`);
  console.log(`   Pair: ${decoded.pair}`);
  console.log(`   Direction: ${decoded.direction}`);
  console.log(`   Amount In: ${decoded.amountIn} ${decoded.tokenIn.symbol}`);
  console.log(`   Gas: ${decoded.gasPriceGwei.toFixed(2)} gwei`);
  console.log(`   Suspicious: ${decoded.isSuspicious}`);
  console.log(`   ────────────────────────────────────\n`);
}

// Print stats every 30 seconds
const statsInterval = setInterval(() => {
  const stats = getStats();
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  
  console.log(`\n📊 Stats (${elapsed}s elapsed):`);
  console.log(`   Connected: ${stats.connected}`);
  console.log(`   Total Received: ${stats.totalTransactionsReceived}`);
  console.log(`   Total Decoded: ${stats.totalTransactionsDecoded}`);
  console.log(`   Txs/min: ${stats.transactionsPerMinute}`);
  console.log(`   Reconnect attempts: ${stats.reconnectAttempts}\n`);
}, 30000);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nReceived SIGINT (Ctrl+C)');
  clearInterval(statsInterval);
  
  // Print final stats
  const stats = getStats();
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  
  console.log(`\n📊 Final Stats:`);
  console.log(`   Runtime: ${elapsed} seconds`);
  console.log(`   Total Received: ${stats.totalTransactionsReceived}`);
  console.log(`   Total Decoded: ${stats.totalTransactionsDecoded}`);
  console.log(`   Transactions seen: ${transactionCount}`);
  
  // Shutdown
  await shutdown();
  
  console.log('\n✅ Test complete!\n');
  process.exit(0);
});

// Start the listener
async function main() {
  try {
    await initialize(onTransaction);
    
    console.log('✅ Listener initialized successfully!');
    console.log('Waiting for Uniswap transactions...');
    console.log('(This may take a few seconds to a minute depending on network activity)\n');
    
  } catch (error) {
    console.error(`\n❌ Failed to initialize: ${error.message}`);
    console.error('\nPossible issues:');
    console.error('  1. Invalid Alchemy API key');
    console.error('  2. Network connectivity problems');
    console.error('  3. Alchemy service issues');
    process.exit(1);
  }
}

main();
