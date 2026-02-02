// ============================================================
// tests/pair-aggregator.test.js
// Test pair aggregator
// ============================================================

const {
    initialize,
    processTransaction,
    getStatsForPair,
    getActivePairs,
    getGlobalStats,
    shutdown
} = require('../src/pair-aggregator');
const { TOKENS } = require('../src/constants/addresses');

console.log('Testing pair-aggregator.js...\n');

// Track updates
const pairUpdates = [];
const sandwichAlerts = [];

// Callbacks
function onPairUpdate(stats) {
    pairUpdates.push(stats);
    // Only log occasionally to avoid spam
    if (pairUpdates.length % 10 === 1) {
        console.log(`   📊 Pair update #${pairUpdates.length}: ${stats.pair} - ${stats.transactions_5min} txs, score: ${stats.bot_activity_score.toFixed(3)}`);
    }
}

function onSandwichAlert(sandwich) {
    sandwichAlerts.push(sandwich);
    console.log(`   🥪 Sandwich alert #${sandwichAlerts.length}: ${sandwich.pair}`);
}

// Initialize
initialize(onPairUpdate, onSandwichAlert);

// --------------------------------------------------
// Test 1: Process multiple transactions
// --------------------------------------------------
console.log('Test 1: Processing multiple transactions');
console.log('─────────────────────────────────────');

const baseTime = Date.now();

// Generate test transactions for PEPE-WETH pair
for (let i = 0; i < 20; i++) {
    const tx = {
        txHash: `0xTEST_${i}_${Math.random().toString(36).substring(7)}`,
        from: `0xUSER_${i % 5}_${'0'.repeat(32)}`.substring(0, 42),
        to: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
        gasPriceGwei: 30 + Math.random() * 40, // 30-70 gwei
        method: 'swapExactETHForTokens',
        tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
        tokenOut: { symbol: 'PEPE', address: TOKENS.PEPE.toLowerCase(), decimals: 18 },
        amountIn: (Math.random() * 5).toFixed(2),
        direction: 'buy',
        pair: 'PEPE-WETH',
        timestamp: baseTime + (i * 100), // 100ms apart
        isSuspicious: Math.random() > 0.7 // 30% are suspicious
    };

    processTransaction(tx);
}

// Generate some transactions for SHIB-WETH pair
for (let i = 0; i < 10; i++) {
    const tx = {
        txHash: `0xSHIB_${i}_${Math.random().toString(36).substring(7)}`,
        from: `0xSHIB_USER_${i}_${'0'.repeat(28)}`.substring(0, 42),
        to: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
        gasPriceGwei: 25 + Math.random() * 20, // 25-45 gwei (calmer)
        method: 'swapExactETHForTokens',
        tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
        tokenOut: { symbol: 'SHIB', address: TOKENS.SHIB.toLowerCase(), decimals: 18 },
        amountIn: (Math.random() * 2).toFixed(2),
        direction: 'buy',
        pair: 'SHIB-WETH',
        timestamp: baseTime + (i * 150),
        isSuspicious: false
    };

    processTransaction(tx);
}

console.log(`   Processed 30 transactions total`);
console.log('');

// --------------------------------------------------
// Test 2: Check pair statistics
// --------------------------------------------------
console.log('Test 2: Checking pair statistics');
console.log('─────────────────────────────────────');

const pepeStats = getStatsForPair('PEPE-WETH');
console.log(`   PEPE-WETH stats:`);
console.log(`   ├─ Transactions (5min): ${pepeStats.transactions_5min}`);
console.log(`   ├─ Suspicious count: ${pepeStats.suspicious_tx_count}`);
console.log(`   ├─ Sandwiches (5min): ${pepeStats.sandwiches_5min}`);
console.log(`   ├─ Avg gas: ${pepeStats.avg_gas_gwei.toFixed(2)} gwei`);
console.log(`   ├─ Bot activity score: ${pepeStats.bot_activity_score.toFixed(3)}`);
console.log(`   └─ History data points: ${pepeStats.activity_history.length}`);

console.log('');

const shibStats = getStatsForPair('SHIB-WETH');
console.log(`   SHIB-WETH stats:`);
console.log(`   ├─ Transactions (5min): ${shibStats.transactions_5min}`);
console.log(`   ├─ Suspicious count: ${shibStats.suspicious_tx_count}`);
console.log(`   ├─ Bot activity score: ${shibStats.bot_activity_score.toFixed(3)}`);
console.log(`   └─ (Should be lower than PEPE due to calmer gas)`);

console.log('');

// --------------------------------------------------
// Test 3: Simulate sandwich attack
// --------------------------------------------------
console.log('Test 3: Simulating sandwich attack');
console.log('─────────────────────────────────────');

const attackerAddress = '0xATTACKER_TEST_' + '0'.repeat(24);
const victimAddress = '0xVICTIM_TEST_' + '0'.repeat(26);

// Frontrun
const frontrun = {
    txHash: '0xFRONTRUN_' + '0'.repeat(54),
    from: attackerAddress.toLowerCase(),
    gasPriceGwei: 95,
    direction: 'buy',
    pair: 'PEPE-WETH',
    tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'PEPE', address: TOKENS.PEPE.toLowerCase(), decimals: 18 },
    amountIn: '3.0',
    timestamp: Date.now(),
    isSuspicious: true
};

// Victim
const victim = {
    txHash: '0xVICTIM_' + '0'.repeat(56),
    from: victimAddress.toLowerCase(),
    gasPriceGwei: 35,
    direction: 'buy',
    pair: 'PEPE-WETH',
    tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'PEPE', address: TOKENS.PEPE.toLowerCase(), decimals: 18 },
    amountIn: '2.0',
    timestamp: Date.now() + 100,
    isSuspicious: false
};

// Backrun
const backrun = {
    txHash: '0xBACKRUN_' + '0'.repeat(55),
    from: attackerAddress.toLowerCase(),
    gasPriceGwei: 94,
    direction: 'sell',
    pair: 'PEPE-WETH',
    tokenIn: { symbol: 'PEPE', address: TOKENS.PEPE.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    amountIn: '1000000',
    timestamp: Date.now() + 200,
    isSuspicious: true
};

console.log('   Sending frontrun...');
processTransaction(frontrun);

console.log('   Sending victim...');
processTransaction(victim);

console.log('   Sending backrun...');
processTransaction(backrun);

// Give time for detection
setTimeout(() => {
    console.log('');

    // Check updated stats
    const updatedPepeStats = getStatsForPair('PEPE-WETH');
    console.log(`   Updated PEPE-WETH stats after sandwich:`);
    console.log(`   ├─ Transactions (5min): ${updatedPepeStats.transactions_5min}`);
    console.log(`   ├─ Sandwiches (5min): ${updatedPepeStats.sandwiches_5min}`);
    console.log(`   ├─ Bot activity score: ${updatedPepeStats.bot_activity_score.toFixed(3)}`);
    console.log(`   └─ Recent sandwiches: ${updatedPepeStats.recent_sandwiches.length}`);

    if (updatedPepeStats.recent_sandwiches.length > 0) {
        const recentSandwich = updatedPepeStats.recent_sandwiches[0];
        console.log('');
        console.log(`   Most recent sandwich details:`);
        console.log(`   ├─ Confidence: ${(recentSandwich.confidence * 100).toFixed(1)}%`);
        console.log(`   ├─ Estimated profit: $${recentSandwich.estimatedProfitUsd}`);
        console.log(`   └─ Etherscan: ${recentSandwich.etherscanLink.slice(0, 50)}...`);
    }

    console.log('');

    // --------------------------------------------------
    // Test 4: Get active pairs
    // --------------------------------------------------
    console.log('Test 4: Getting active pairs');
    console.log('─────────────────────────────────────');

    const activePairs = getActivePairs();
    console.log(`   Active pairs: ${activePairs.length}`);
    activePairs.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.pair}: ${p.transactions_5min} txs, score: ${p.bot_activity_score.toFixed(3)}`);
    });

    console.log('');

    // --------------------------------------------------
    // Test 5: Global statistics
    // --------------------------------------------------
    console.log('Test 5: Global statistics');
    console.log('─────────────────────────────────────');

    const globalStats = getGlobalStats();
    console.log(`   Uptime: ${globalStats.uptime_seconds}s`);
    console.log(`   Total transactions: ${globalStats.total_transactions_processed}`);
    console.log(`   Total sandwiches: ${globalStats.total_sandwiches_detected}`);
    console.log(`   Active pairs: ${globalStats.active_pairs}`);

    console.log('');

    // --------------------------------------------------
    // Test 6: Unknown pair stats
    // --------------------------------------------------
    console.log('Test 6: Unknown pair returns empty stats');
    console.log('─────────────────────────────────────');

    const unknownStats = getStatsForPair('UNKNOWN-PAIR');
    console.log(`   UNKNOWN-PAIR stats:`);
    console.log(`   ├─ Transactions: ${unknownStats.transactions_5min}`);
    console.log(`   ├─ Bot activity score: ${unknownStats.bot_activity_score}`);
    console.log(`   └─ (Should all be zero)`);

    if (unknownStats.transactions_5min === 0 && unknownStats.bot_activity_score === 0) {
        console.log('   ✅ Correctly returns empty stats for unknown pair');
    }

    console.log('');

    // Cleanup
    shutdown();

    console.log('─────────────────────────────────────');
    console.log('Summary:');
    console.log(`   Pair updates received: ${pairUpdates.length}`);
    console.log(`   Sandwich alerts received: ${sandwichAlerts.length}`);
    console.log('');
    console.log('✅ Pair aggregator tests complete!\n');

    process.exit(0);

}, 500);
