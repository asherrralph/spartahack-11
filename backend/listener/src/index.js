// Main entry point for MEV Weather listener service

const { config, logConfig } = require('./config');
const mempoolListener = require('./mempool-listener');
const pairAggregator = require('./pair-aggregator');
const websocketServer = require('./websocket-server');

// Application state
let isShuttingDown = false;
let startTime = null;

// Main initialization function
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║                    Project                            ║');
  console.log('║            Real-Time Trading Conditions                   ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // Log configuration
  logConfig();
  
  console.log(' Starting Project...\n');
  
  startTime = Date.now();
  
  // Step 1: Initialize pair aggregator
  // This initializes the sandwich detector internally
  console.log('Step 1: Initializing pair aggregator...');
  pairAggregator.initialize(
    handlePairUpdate,      // Called when pair stats update
    handleSandwichAlert    // Called when sandwich detected
  );
  
  // Step 2: Initialize WebSocket server
  console.log('Step 2: Initializing WebSocket server...');
  websocketServer.initialize(pairAggregator);
  
  // Step 3: Initialize mempool listener
  // This starts receiving real-time transactions
  console.log('Step 3: Initializing mempool listener...');
  await mempoolListener.initialize(handleTransaction);
  
  // Startup complete
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log(`║     Project IS RUNNING                             ║`);
  console.log('║                                                           ║');
  console.log(`║     Started in ${elapsed} seconds                                  ║`);
  console.log(`║     WebSocket: ws://localhost:${config.server.port}                    ║`);
  console.log(`║     HTTP API:  http://localhost:${config.server.port}                  ║`);
  console.log('║                                                           ║');
  console.log('║     Press Ctrl+C to stop                                  ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // Display monitoring info periodically
  if (config.logging.level === 'debug') {
    setInterval(displayStatus, 30000); // Every 30 seconds
  }
}

// Handle incoming transaction from mempool listener
function handleTransaction(decodedTx) {
  // Pass to pair aggregator for processing
  pairAggregator.processTransaction(decodedTx);
}

// Handle pair update from aggregator
function handlePairUpdate(stats) {
  // Broadcast to WebSocket clients
  websocketServer.broadcastPairUpdate(stats);
}

// Handle sandwich alert from aggregator
function handleSandwichAlert(sandwich) {
  // Broadcast to WebSocket clients
  websocketServer.broadcastSandwichAlert(sandwich);
}

// Display current status (debug mode only)
function displayStatus() {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  const mempoolStats = mempoolListener.getStats();
  const aggregatorStats = pairAggregator.getGlobalStats();
  const serverStats = websocketServer.getServerStats();
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    STATUS UPDATE                          ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  Uptime:              ${uptime}s                              ║`);
  console.log(`║  Connected to Alchemy: ${mempoolStats.connected ? 'Connected' : 'Not Connected'}                               ║`);
  console.log(`║  Transactions seen:    ${mempoolStats.totalTransactionsReceived}                           ║`);
  console.log(`║  Transactions decoded: ${mempoolStats.totalTransactionsDecoded}                           ║`);
  console.log(`║  Sandwiches detected:  ${aggregatorStats.total_sandwiches_detected}                            ║`);
  console.log(`║  Active pairs:         ${aggregatorStats.active_pairs}                             ║`);
  console.log(`║  WebSocket clients:    ${serverStats.currentConnections}                             ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

// Graceful shutdown handler
async function shutdown(signal) {
  // Prevent multiple shutdown calls
  if (isShuttingDown) {
    return;
  }
  
  isShuttingDown = true;
  
  console.log(`\n\n Received ${signal} - shutting down gracefully...`);
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     SHUTTING DOWN                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // Calculate final stats
  const finalUptime = Math.floor((Date.now() - startTime) / 1000);
  const mempoolStats = mempoolListener.getStats();
  const aggregatorStats = pairAggregator.getGlobalStats();
  
  // Display final statistics
  console.log(' Final Statistics:');
  console.log(`   Runtime:              ${finalUptime} seconds`);
  console.log(`   Transactions received: ${mempoolStats.totalTransactionsReceived}`);
  console.log(`   Transactions decoded:  ${mempoolStats.totalTransactionsDecoded}`);
  console.log(`   Sandwiches detected:   ${aggregatorStats.total_sandwiches_detected}`);
  console.log(`   Peak active pairs:     ${aggregatorStats.active_pairs}\n`);
  
  try {
    // Shutdown components in reverse order
    console.log('Shutting down components...');
    
    // 1. Stop receiving new transactions
    console.log('   1/3 Stopping mempool listener...');
    await mempoolListener.shutdown();
    
    // 2. Stop WebSocket server (notify clients)
    console.log('   2/3 Stopping WebSocket server...');
    await websocketServer.shutdown();
    
    // 3. Clean up aggregator
    console.log('   3/3 Stopping pair aggregator...');
    pairAggregator.shutdown();
    
    console.log('\n Shutdown complete. Goodbye!\n');
    
    // Exit cleanly
    process.exit(0);
    
  } catch (error) {
    console.error(`\n Error during shutdown: ${error.message}`);
    console.error('   Forcing exit...\n');
    process.exit(1);
  }
}

// Error handlers
process.on('uncaughtException', (error) => {
  console.error('\n UNCAUGHT EXCEPTION:');
  console.error(error);
  console.error('\nShutting down due to uncaught exception...\n');
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n UNHANDLED REJECTION:');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('\nShutting down due to unhandled rejection...\n');
  shutdown('UNHANDLED_REJECTION');
});

// Shutdown signal handlers
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Kill command

// Start the application
main().catch((error) => {
  console.error('\n FATAL ERROR during startup:');
  console.error(error);
  console.error('\nApplication failed to start.\n');
  process.exit(1);
});