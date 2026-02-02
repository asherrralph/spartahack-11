// ============================================================
// tests/sandwich-detector.test.js
// Test sandwich detection
// ============================================================

const {
    initialize,
    processTransaction,
    getStats,
    shutdown,
    CONFIG
} = require('../src/sandwich-detector');
const { TOKENS } = require('../src/constants/addresses');

console.log('Testing sandwich-detector.js...\n');

// Track detected sandwiches
const detectedSandwiches = [];

// Callback when sandwich is detected
function onSandwich(sandwich) {
    detectedSandwiches.push(sandwich);
}

// Initialize detector
initialize(onSandwich);

// --------------------------------------------------
// Test 1: Basic sandwich pattern
// --------------------------------------------------
console.log('Test 1: Basic sandwich pattern');
console.log('─────────────────────────────────────');

const now = Date.now();
const attackerAddress = '0xATTACKER1234567890ATTACKER1234567890ATTA';
const victimAddress = '0xVICTIM1234567890VICTIM1234567890VICTIM12';

// Simulate a sandwich attack
const frontrun = {
    txHash: '0xFRONTRUN_HASH_1234567890FRONTRUN_HASH_1234567890FRONTRUN',
    from: attackerAddress.toLowerCase(),
    to: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
    gasPriceGwei: 90,
    method: 'swapExactETHForTokens',
    tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'PEPE', address: TOKENS.PEPE.toLowerCase(), decimals: 18 },
    amountIn: '3.0',
    direction: 'buy',
    pair: 'PEPE-WETH',
    timestamp: now,
    isSuspicious: true
};

const victim = {
    txHash: '0xVICTIM_HASH_1234567890VICTIM_HASH_1234567890VICTIM_HA',
    from: victimAddress.toLowerCase(),
    to: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
    gasPriceGwei: 30,
    method: 'swapExactETHForTokens',
    tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'PEPE', address: TOKENS.PEPE.toLowerCase(), decimals: 18 },
    amountIn: '2.5',
    direction: 'buy',
    pair: 'PEPE-WETH',
    timestamp: now + 500,
    isSuspicious: false
};

const backrun = {
    txHash: '0xBACKRUN_HASH_1234567890BACKRUN_HASH_1234567890BACKRUN',
    from: attackerAddress.toLowerCase(), // Same as frontrun!
    to: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
    gasPriceGwei: 89,
    method: 'swapExactTokensForETH',
    tokenIn: { symbol: 'PEPE', address: TOKENS.PEPE.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    amountIn: '1000000',
    direction: 'sell',
    pair: 'PEPE-WETH',
    timestamp: now + 1000,
    isSuspicious: true
};

// Process transactions in order
console.log('   Processing frontrun...');
let result = processTransaction(frontrun);
console.log(`   Result: ${result ? 'SANDWICH DETECTED' : 'No sandwich yet'}`);

console.log('   Processing victim...');
result = processTransaction(victim);
console.log(`   Result: ${result ? 'SANDWICH DETECTED' : 'No sandwich yet'}`);

console.log('   Processing backrun...');
result = processTransaction(backrun);
console.log(`   Result: ${result ? 'SANDWICH DETECTED' : 'No sandwich yet'}`);

if (detectedSandwiches.length > 0) {
    console.log(`\n   ✅ Sandwich detected successfully!`);
    console.log(`   Confidence: ${(detectedSandwiches[0].confidence * 100).toFixed(1)}%`);
    console.log(`   Estimated profit: $${detectedSandwiches[0].estimatedProfitUsd}`);
    console.log(`   Gas ratio: ${detectedSandwiches[0].gasRatio.toFixed(2)}x`);
} else {
    console.log(`\n   ❌ No sandwich detected (unexpected)`);
}

console.log('');

// --------------------------------------------------
// Test 2: Not a sandwich (no backrun)
// --------------------------------------------------
console.log('Test 2: Not a sandwich (different addresses)');
console.log('─────────────────────────────────────');

// Clear detected sandwiches
detectedSandwiches.length = 0;

const tx1 = {
    txHash: '0xTX1_' + Math.random().toString(36).substring(7),
    from: '0xADDRESS_A_' + '0'.repeat(30),
    gasPriceGwei: 80,
    direction: 'buy',
    pair: 'SHIB-WETH',
    tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'SHIB', address: TOKENS.SHIB.toLowerCase(), decimals: 18 },
    amountIn: '1.0',
    timestamp: Date.now(),
    isSuspicious: true
};

const tx2 = {
    txHash: '0xTX2_' + Math.random().toString(36).substring(7),
    from: '0xADDRESS_B_' + '0'.repeat(30),  // Different address
    gasPriceGwei: 30,
    direction: 'buy',
    pair: 'SHIB-WETH',
    tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'SHIB', address: TOKENS.SHIB.toLowerCase(), decimals: 18 },
    amountIn: '0.5',
    timestamp: Date.now() + 500,
    isSuspicious: false
};

const tx3 = {
    txHash: '0xTX3_' + Math.random().toString(36).substring(7),
    from: '0xADDRESS_C_' + '0'.repeat(30),  // Different address again!
    gasPriceGwei: 75,
    direction: 'sell',
    pair: 'SHIB-WETH',
    tokenIn: { symbol: 'SHIB', address: TOKENS.SHIB.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    amountIn: '1000000',
    timestamp: Date.now() + 1000,
    isSuspicious: true
};

processTransaction(tx1);
processTransaction(tx2);
processTransaction(tx3);

if (detectedSandwiches.length === 0) {
    console.log(`   ✅ Correctly identified as NOT a sandwich`);
    console.log(`   (Frontrun and backrun from different addresses)`);
} else {
    console.log(`   ❌ False positive - detected sandwich when there wasn't one`);
}

console.log('');

// --------------------------------------------------
// Test 3: Not a sandwich (gas ratio too low)
// --------------------------------------------------
console.log('Test 3: Not a sandwich (gas ratio too low)');
console.log('─────────────────────────────────────');

detectedSandwiches.length = 0;

const sameSenderAddress = '0xSAME_SENDER_' + '0'.repeat(28);

const lowGasFrontrun = {
    txHash: '0xLOW_FRONT_' + Math.random().toString(36).substring(7),
    from: sameSenderAddress.toLowerCase(),
    gasPriceGwei: 35,  // Only slightly higher
    direction: 'buy',
    pair: 'LINK-WETH',
    tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'LINK', address: TOKENS.LINK.toLowerCase(), decimals: 18 },
    amountIn: '2.0',
    timestamp: Date.now(),
    isSuspicious: false
};

const lowGasVictim = {
    txHash: '0xLOW_VICTIM_' + Math.random().toString(36).substring(7),
    from: '0xRANDOM_VICTIM_' + '0'.repeat(26),
    gasPriceGwei: 30,  // Only 1.17x difference (below 1.3 threshold)
    direction: 'buy',
    pair: 'LINK-WETH',
    tokenIn: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'LINK', address: TOKENS.LINK.toLowerCase(), decimals: 18 },
    amountIn: '1.0',
    timestamp: Date.now() + 500,
    isSuspicious: false
};

const lowGasBackrun = {
    txHash: '0xLOW_BACK_' + Math.random().toString(36).substring(7),
    from: sameSenderAddress.toLowerCase(),
    gasPriceGwei: 34,
    direction: 'sell',
    pair: 'LINK-WETH',
    tokenIn: { symbol: 'LINK', address: TOKENS.LINK.toLowerCase(), decimals: 18 },
    tokenOut: { symbol: 'WETH', address: TOKENS.WETH.toLowerCase(), decimals: 18 },
    amountIn: '100',
    timestamp: Date.now() + 1000,
    isSuspicious: false
};

processTransaction(lowGasFrontrun);
processTransaction(lowGasVictim);
processTransaction(lowGasBackrun);

if (detectedSandwiches.length === 0) {
    console.log(`   ✅ Correctly identified as NOT a sandwich`);
    console.log(`   (Gas ratio 1.17x is below ${CONFIG.MIN_GAS_RATIO}x threshold)`);
} else {
    console.log(`   ❌ False positive - gas ratio should have failed validation`);
}

console.log('');

// --------------------------------------------------
// Print final stats
// --------------------------------------------------
console.log('Final Statistics:');
console.log('─────────────────────────────────────');
const stats = getStats();
console.log(`   Transactions processed: ${stats.totalTransactionsProcessed}`);
console.log(`   Sandwiches detected: ${stats.totalSandwichesDetected}`);
console.log(`   Active pairs tracked: ${stats.activePairs}`);
console.log(`   Pending transactions: ${stats.pendingTransactions}`);

// Shutdown
shutdown();

console.log('\n✅ Sandwich detector tests complete!\n');
