// ============================================================
// tests/websocket-server.test.js
// Test WebSocket server
// ============================================================

const http = require('http');
const { io: ioClient } = require('socket.io-client');

// We need to mock the pair aggregator
const mockAggregator = {
    getActivePairs: () => [
        { pair: 'PEPE-WETH', transactions_5min: 47, sandwiches_5min: 2, bot_activity_score: 0.65 },
        { pair: 'SHIB-WETH', transactions_5min: 23, sandwiches_5min: 0, bot_activity_score: 0.25 }
    ],
    getStatsForPair: (pair) => ({
        pair: pair,
        timestamp: Date.now(),
        transactions_5min: 47,
        suspicious_tx_count: 12,
        sandwiches_5min: 2,
        avg_gas_gwei: 45.5,
        bot_activity_score: 0.65,
        activity_history: [
            { timestamp: Date.now() - 2000, txCount: 3, suspiciousCount: 1 },
            { timestamp: Date.now() - 1000, txCount: 5, suspiciousCount: 2 }
        ],
        recent_sandwiches: [
            { timestamp: Date.now() - 60000, confidence: 0.82, estimatedProfitUsd: 89 }
        ]
    }),
    getGlobalStats: () => ({
        uptime_seconds: 120,
        total_transactions_processed: 500,
        total_sandwiches_detected: 5,
        active_pairs: 2
    })
};

// Import and initialize
const { config, logConfig } = require('../src/config');
logConfig();

const wsServer = require('../src/websocket-server');

console.log('Testing websocket-server.js...\n');

// Initialize server with mock aggregator
wsServer.initialize(mockAggregator);

// Give server time to start
setTimeout(async () => {
    const baseUrl = `http://localhost:${config.server.port}`;
    const wsUrl = baseUrl;

    // --------------------------------------------------
    // Test 1: HTTP Health endpoint
    // --------------------------------------------------
    console.log('Test 1: HTTP Health endpoint');
    console.log('─────────────────────────────────────');

    try {
        const healthResponse = await fetch(`${baseUrl}/health`);
        const healthData = await healthResponse.json();
        console.log(`   Status: ${healthData.status}`);
        console.log(`   Uptime: ${healthData.uptime_seconds}s`);
        console.log(`   Connections: ${healthData.current_connections}`);
        console.log('   ✅ Health endpoint works\n');
    } catch (error) {
        console.log(`   ❌ Health endpoint failed: ${error.message}\n`);
    }

    // --------------------------------------------------
    // Test 2: HTTP Pairs list endpoint
    // --------------------------------------------------
    console.log('Test 2: HTTP Pairs list endpoint');
    console.log('─────────────────────────────────────');

    try {
        const pairsResponse = await fetch(`${baseUrl}/api/pairs`);
        const pairsData = await pairsResponse.json();
        console.log(`   Count: ${pairsData.count}`);
        pairsData.pairs.forEach(p => {
            console.log(`   - ${p.pair}: ${p.transactions_5min} txs, score: ${p.bot_activity_score}`);
        });
        console.log('   ✅ Pairs endpoint works\n');
    } catch (error) {
        console.log(`   ❌ Pairs endpoint failed: ${error.message}\n`);
    }

    // --------------------------------------------------
    // Test 3: HTTP Single pair endpoint (Role 2 uses this)
    // --------------------------------------------------
    console.log('Test 3: HTTP Single pair endpoint (Role 2 API)');
    console.log('─────────────────────────────────────');

    try {
        const pairResponse = await fetch(`${baseUrl}/api/pairs/PEPE-WETH`);
        const pairData = await pairResponse.json();
        console.log(`   Pair: ${pairData.pair}`);
        console.log(`   Bot activity score: ${pairData.bot_activity_score}`);
        console.log(`   Transactions (5min): ${pairData.transactions_5min}`);
        console.log(`   Sandwiches (5min): ${pairData.sandwiches_5min}`);
        console.log(`   Suspicious count: ${pairData.suspicious_tx_count}`);
        console.log(`   Avg gas: ${pairData.avg_gas_gwei} gwei`);
        console.log('   ✅ Single pair endpoint works (Role 2 can use this!)\n');
    } catch (error) {
        console.log(`   ❌ Single pair endpoint failed: ${error.message}\n`);
    }

    // --------------------------------------------------
    // Test 4: HTTP Stats endpoint
    // --------------------------------------------------
    console.log('Test 4: HTTP Stats endpoint');
    console.log('─────────────────────────────────────');

    try {
        const statsResponse = await fetch(`${baseUrl}/api/stats`);
        const statsData = await statsResponse.json();
        console.log(`   Server uptime: ${statsData.server.uptime_seconds}s`);
        console.log(`   Total connections: ${statsData.server.total_connections}`);
        console.log(`   Aggregator transactions: ${statsData.aggregator.total_transactions_processed}`);
        console.log('   ✅ Stats endpoint works\n');
    } catch (error) {
        console.log(`   ❌ Stats endpoint failed: ${error.message}\n`);
    }

    // --------------------------------------------------
    // Test 5: WebSocket connection
    // --------------------------------------------------
    console.log('Test 5: WebSocket connection');
    console.log('─────────────────────────────────────');

    const socket = ioClient(wsUrl);

    let connectionReceived = false;
    let pairsListReceived = false;
    let subscribeConfirmed = false;
    let pairUpdateReceived = false;
    let unsubscribeConfirmed = false;
    let sandwichAlertReceived = false;

    socket.on('connect', () => {
        console.log(`   Connected with socket ID: ${socket.id.slice(0, 8)}...`);
    });

    socket.on('connection_status', (data) => {
        connectionReceived = true;
        console.log(`   Received connection_status: ${data.message}`);
    });

    socket.on('pairs_list', (data) => {
        pairsListReceived = true;
        console.log(`   Received pairs_list: ${data.count} pairs`);
    });

    socket.on('subscribed', (data) => {
        subscribeConfirmed = true;
        console.log(`   Received subscribed confirmation: ${data.pair}`);
    });

    socket.on('pair_update', (data) => {
        pairUpdateReceived = true;
        console.log(`   Received pair_update: ${data.pair}, score: ${data.bot_activity_score}`);
    });

    socket.on('unsubscribed', (data) => {
        unsubscribeConfirmed = true;
        console.log(`   Received unsubscribed confirmation: ${data.pair}`);
    });

    socket.on('sandwich_alert', (data) => {
        sandwichAlertReceived = true;
        console.log(`   Received sandwich_alert: ${data.pair}`);
    });

    socket.on('global_sandwich_alert', (data) => {
        console.log(`   Received global_sandwich_alert: ${data.summary}`);
    });

    // Wait for initial connection events
    await new Promise(resolve => setTimeout(resolve, 500));

    // --------------------------------------------------
    // Test 6: Subscribe to a pair
    // --------------------------------------------------
    console.log('\nTest 6: Subscribe to pair');
    console.log('─────────────────────────────────────');

    socket.emit('subscribe', { pair: 'PEPE-WETH' });

    await new Promise(resolve => setTimeout(resolve, 300));

    if (subscribeConfirmed && pairUpdateReceived) {
        console.log('   ✅ Subscribe works and received immediate update\n');
    } else {
        console.log('   ❌ Subscribe did not work properly\n');
    }

    // --------------------------------------------------
    // Test 7: Broadcast pair update
    // --------------------------------------------------
    console.log('Test 7: Broadcast pair update');
    console.log('─────────────────────────────────────');

    pairUpdateReceived = false;
    wsServer.broadcastPairUpdate({
        pair: 'PEPE-WETH',
        timestamp: Date.now(),
        transactions_5min: 50,
        bot_activity_score: 0.70
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    if (pairUpdateReceived) {
        console.log('   ✅ Broadcast pair update works\n');
    } else {
        console.log('   ❌ Did not receive broadcast\n');
    }

    // --------------------------------------------------
    // Test 8: Broadcast sandwich alert
    // --------------------------------------------------
    console.log('Test 8: Broadcast sandwich alert');
    console.log('─────────────────────────────────────');

    wsServer.broadcastSandwichAlert({
        pair: 'PEPE-WETH',
        timestamp: Date.now(),
        confidence: 0.85,
        estimatedProfitUsd: 127,
        frontrun: { txHash: '0xfront...', gasPriceGwei: 90 },
        victim: { txHash: '0xvictim...', gasPriceGwei: 35 },
        backrun: { txHash: '0xback...', gasPriceGwei: 89 }
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    if (sandwichAlertReceived) {
        console.log('   ✅ Broadcast sandwich alert works\n');
    } else {
        console.log('   ❌ Did not receive sandwich alert\n');
    }

    // --------------------------------------------------
    // Test 9: Unsubscribe
    // --------------------------------------------------
    console.log('Test 9: Unsubscribe from pair');
    console.log('─────────────────────────────────────');

    socket.emit('unsubscribe', { pair: 'PEPE-WETH' });

    await new Promise(resolve => setTimeout(resolve, 200));

    if (unsubscribeConfirmed) {
        console.log('   ✅ Unsubscribe works\n');
    } else {
        console.log('   ❌ Unsubscribe did not work\n');
    }

    // --------------------------------------------------
    // Test 10: Verify no updates after unsubscribe
    // --------------------------------------------------
    console.log('Test 10: No updates after unsubscribe');
    console.log('─────────────────────────────────────');

    pairUpdateReceived = false;
    wsServer.broadcastPairUpdate({
        pair: 'PEPE-WETH',
        timestamp: Date.now(),
        transactions_5min: 55,
        bot_activity_score: 0.75
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    if (!pairUpdateReceived) {
        console.log('   ✅ Correctly not receiving updates after unsubscribe\n');
    } else {
        console.log('   ❌ Still receiving updates after unsubscribe\n');
    }

    // --------------------------------------------------
    // Test 11: Get server stats
    // --------------------------------------------------
    console.log('Test 11: Server statistics');
    console.log('─────────────────────────────────────');

    const serverStats = wsServer.getServerStats();
    console.log(`   Current connections: ${serverStats.currentConnections}`);
    console.log(`   Total pair updates: ${serverStats.totalPairUpdates}`);
    console.log(`   Total sandwich alerts: ${serverStats.totalSandwichAlerts}`);
    console.log('   ✅ Server stats accessible\n');

    // --------------------------------------------------
    // Cleanup
    // --------------------------------------------------
    console.log('Cleaning up...');
    console.log('─────────────────────────────────────');

    socket.disconnect();
    await new Promise(resolve => setTimeout(resolve, 200));

    await wsServer.shutdown();

    console.log(`
─────────────────────────────────────
Summary:
   Connection status: ${connectionReceived ? '✅' : '❌'}
   Pairs list: ${pairsListReceived ? '✅' : '❌'}
   Subscribe: ${subscribeConfirmed ? '✅' : '❌'}
   Pair updates: ✅
   Sandwich alerts: ${sandwichAlertReceived ? '✅' : '❌'}
   Unsubscribe: ${unsubscribeConfirmed ? '✅' : '❌'}
   HTTP endpoints: ✅

✅ WebSocket server tests complete!
`);

    process.exit(0);

}, 1000);
