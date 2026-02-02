// Detects sandwich attack patterns in pending transactions

// Configuration
const CONFIG = {
    // Time window to look for sandwich patterns (milliseconds)
    TIME_WINDOW_MS: 15000, // 15 seconds

    // Minimum gas ration (frontrun gas / victim gas)
    MIN_GAS_RATIO: 1.3, // Frontrun must be 30% higher

    // Minimum victim trade size to consider (in ETH equivalent)
    MIN_VICTIM_AMOUNT: 0.1,

    // How often to clean old transactions (milliseconds)
    CLEANUP_INTERVAL_MS: 5000,

    // Maximum transactions to keep per pair
    MAX_TXS_PER_PAIR: 100
};

// State

// Pending transactions group by pair
// Structure: { "PEPE-WETH": [tx1, tx2, tx3, ...]}
const pendingByPair = new Map();

// Recently detected sandwiches (to avoid dupes)
// structure: { "victimTxHash": timestamp }
const recentSandwiches = new Map();

// Callback for when sandwich is detected
let onSandwichCallback = null;

// Cleanup interval reference
let cleanupInterval = null;

// Stats
const stats = {
    totalTransactionsProcessed: 0,
    totalSandwichesDetected: 0,
    sandwichesPerPair: new Map()
};

// Initialize the detector
function initialize(onSandwich) {
    console.log(' Initializing sandwhich detector...');

    // Store callback
    onSandwichCallback = onSandwich;

    // Start cleanup interval
    cleanupInterval = setInterval(cleanupOldTransactions, CONFIG.CLEANUP_INTERVAL_MS);

    console.log(`   Time window: ${CONFIG.TIME_WINDOW_MS / 1000}s`);
    console.log(`   Min gas ratio: ${CONFIG.MIN_GAS_RATIO}x`);
    console.log(`   Sandwich detector ready\n`);
}

// Process a new transaction
// Returns detected sandwich or null
function processTransaction(tx) {
    stats.totalTransactionsProcessed++;

    // Get or create array for this pair
    const pair = tx.pair;
    if (!pendingByPair.has(pair)) {
        pendingByPair.set(pair, []);
    }

    const pairTxs = pendingByPair.get(pair);

    // Add transaction to the pair's list
    pairTxs.push(tx);

    // Enforce maximum size
    if (pairTxs.length > CONFIG.MAX_TXS_PER_PAIR) {
        pairTxs.shift(); // Remove oldest
    }

    // Check for sandwich pattern
    const sandwich = detectSandwich(pair);

    if (sandwich) {
        // Check if we already detected this sandwich (by victim hash)
        if (recentSandwiches.has(sandwich.victim.txHash)) {
            return null; // Already reported
        }

        // Mark as detected
        recentSandwiches.set(sandwich.victim.txHash, Date.now());

        // Update stats
        stats.totalSandwichesDetected++;
        const pairCount = stats.sandwichesPerPair.get(pair) || 0;
        stats.sandwichesPerPair.set(pair, pairCount + 1);

        // Log detection
        logSandwichDetection(sandwich);

        // Call callback
        if (onSandwichCallback) {
            onSandwichCallback(sandwich);
        }

        return sandwich
    }

    return null;
}

// Detect sandwich pattern in a pair's transaction
function detectSandwich(pair) {
    const txs = pendingByPair.get(pair);
    if (!txs || txs.length < 3) {
        return null; // At least 3 transactions
    }

    const now = Date.now();

    // Filter to recent transactions only
    const recentTxs = txs.filter(tx => (now - tx.timestamp) < CONFIG.TIME_WINDOW_MS);

    if (recentTxs.length < 3) {
        return null;
    }

    // Group by sender address
    const txsBySender = new Map();
    for (const tx of recentTxs) {
        const sender = tx.from.toLowerCase();
        if (!txsBySender.has(sender)) {
            txsBySender.set(sender, []);
        }
        txsBySender.get(sender).push(tx);
    }

    // Look for potential attackers (addresses with both BUY and SELL)
    for (const [attackerAddress, attackerTxs] of txsBySender) {
        // Need at least 2 transactions from this address
        if (attackerTxs.length < 2) {
            continue;
        }

        // Find BUY transactions (potential frontruns)
        const buys = attackerTxs.filter(tx => tx.direction === 'buy');

        // Find SELL transactions (potential backruns)
        const sells = attackerTxs.filter(tx => tx.direction === 'sell');

        // Need at least one buy and one sell
        if (buys.length === 0 || sells.length === 0) {
            continue;
        }

        // Check each buy-sell pair for victims in between
        for (const frontrun of buys) {
            for (const backrun of sells) {
                // Find potential victims: Other addresses who bought between frontrun and backrun
                const victims = findVictims(recentTxs, frontrun, backrun, attackerAddress);

                if (victims.length > 0) {
                    // Found a sandwich. Use the highest-value victim
                    const victim = selectPrimaryVictim(victims);

                    // Validate the sandwich pattern
                    if (validateSandwich(frontrun, victim, backrun)) {
                        // Calculate confidence and estimated profit
                        const confidence = calculateConfidence(frontrun, victim, backrun);
                        const estimatedProfitUsd = estimateProfit(frontrun, victim, backrun);

                        return {
                            type: 'SANDWICH_DETECTED',
                            pair: pair,
                            timestamp: Date.now(),
                            confidence: confidence,
                            estimatedProfitUsd: estimatedProfitUsd,

                            frontrun: {
                                txHash: frontrun.txHash,
                                from: frontrun.from,
                                gasPriceGwei: frontrun.gasPriceGwei,
                                amountIn: frontrun.amountIn,
                                tokenIn: frontrun.tokenIn,
                                tokenOut: frontrun.tokenOut,
                                timestamp: frontrun.timestamp
                            },

                            victim: {
                                txHash: victim.txHash,
                                from: victim.from,
                                gasPriceGwei: victim.gasPriceGwei,
                                amountIn: victim.amountIn,
                                tokenIn: victim.tokenIn,
                                tokenOut: victim.tokenOut,
                                timestamp: victim.timestamp
                            },

                            backrun: {
                                txHash: backrun.txHash,
                                from: backrun.from,
                                gasPriceGwei: backrun.gasPriceGwei,
                                amountIn: backrun.amountIn,
                                tokenIn: backrun.tokenIn,
                                tokenOut: backrun.tokenOut,
                                timestamp: backrun.timestamp
                            },

                            // Additional metadata
                            gasRatio: frontrun.gasPriceGwei / victim.gasPriceGwei,
                            attackerAddress: attackerAddress,
                            victimCount: victims.length
                        };
                    }
                }
            }
        }

        return null;
    }
}


// Find potential victims between frontrun and backrun
function findVictims(txs, frontrun, backrun, attackerAddress) {
    const victims = [];

    for (const tx of txs) {
        // Must be from different address
        if (tx.from.toLowerCase() === attackerAddress) {
            continue;
        }

        // Must be a buy (same direction as frontrun)
        if (tx.direction !== 'buy') {
            continue;
        }

        // Must have lower gas than frontrun
        if (tx.gasPriceGwei >= frontrun.gasPriceGwei) {
            continue;
        }

        // Must be within the time window
        const txTime = tx.timestamp;
        const frontrunTime = frontrun.timestamp;
        const backrunTime = backrun.timestamp;

        // Victim should be between frontrun and backrun in time
        // But since these are pending, we mainly check gas ordering
        // Higher gas = likely to execute first

        victims.push(tx);
    }

    return victims;
}

// Select the primary victim (highest value)
function selectPrimaryVictim(victims) {
    if (victims.length === 1) {
        return victims[0];
    }

    // Sort by amount (descending) and return highest
    return victims.sort((a, b) => {
        const amountA = parseFloat(a.amountIn) || 0;
        const amountB = parseFloat(b.amountIn) || 0;
        return amountB - amountA;
    })[0];
}

// Validate that this is likely a real sandwich
function validateSandwich(frontrun, victim, backrun) {
    // Check gas ratio
    const gasRatio = frontrun.gasPriceGwei / victim.gasPriceGwei;
    if (gasRatio < CONFIG.MIN_GAS_RATIO) {
        return false;
    }

    // Backrun should also have high gas
    const backrunRatio = backrun.gasPriceGwei / victim.gasPriceGwei;
    if (backrunRatio < CONFIG.MIN_GAS_RATIO) {
        return false;
    }

    // Frontrun and backrun should have similar gas (both high)
    const attackerGasDiff = Math.abs(frontrun.gasPriceGwei - backrun.gasPriceGwei);
    const avgAttackerGas = (frontrun.gasPriceGwei + backrun.gasPriceGwei) / 2;
    if (attackerGasDiff / avgAttackerGas > 0.3) {
        // More than 30% difference in attacker's gas prices is unusual
        return false;
    }

    // All checks passed
    return true;
}
// --------------------------------------------------
// Calculate confidence score (0-1)
function calculateConfidence(frontrun, victim, backrun) {
    let score = 0.5; // Base confidence

    // Higher gas ratio = more confident
    const gasRatio = frontrun.gasPriceGwei / victim.gasPriceGwei;
    if (gasRatio > 3.0) {
        score += 0.2;
    } else if (gasRatio > 2.0) {
        score += 0.15;
    } else if (gasRatio > 1.5) {
        score += 0.1;
    }

    // Larger victim trade = more confident (worth attacking)
    const victimAmount = parseFloat(victim.amountIn) || 0;
    if (victimAmount > 5) {
        score += 0.15;
    } else if (victimAmount > 1) {
        score += 0.1;
    } else if (victimAmount > 0.5) {
        score += 0.05;
    }

    // Frontrun is marked as suspicious (high gas)
    if (frontrun.isSuspicious) {
        score += 0.1;
    }

    // Cap at 0.95 (never 100% certain)
    return Math.min(score, 0.95);
}

// Estimate profit from the sandwich
function estimateProfit(frontrun, victim, backrun) {
    // This is a rough estimate
    // Actual profit depends on pool liquidity, price impact, etc.

    const victimAmount = parseFloat(victim.amountIn) || 0;

    // Assume ETH price of $2000 for estimation
    const ethPrice = 2000;
    const victimValueUsd = victimAmount * ethPrice;

    // Typical extraction is 0.5% - 2% of victim's trade
    // Higher for low-liquidity pairs, lower for high-liquidity
    const extractionRate = 0.01; // Assume 1% average

    const estimatedProfit = victimValueUsd * extractionRate;

    // Round to 2 decimal places
    return Math.round(estimatedProfit * 100) / 100;
}

// Log sandwich detection
function logSandwichDetection(sandwich) {
    console.log(`\n  SANDWICH DETECTED!`);
    console.log(`   Pair: ${sandwich.pair}`);
    console.log(`   Confidence: ${(sandwich.confidence * 100).toFixed(1)}%`);
    console.log(`   Estimated Profit: $${sandwich.estimatedProfitUsd}`);
    console.log(`   `);
    console.log(`   Attacker: ${sandwich.attackerAddress.slice(0, 10)}...`);
    console.log(`   ├─ FRONTRUN: ${sandwich.frontrun.amountIn} ${sandwich.frontrun.tokenIn.symbol} → ${sandwich.frontrun.tokenOut.symbol} (${sandwich.frontrun.gasPriceGwei.toFixed(1)} gwei)`);
    console.log(`   │`);
    console.log(`   └─ BACKRUN:  ${sandwich.backrun.amountIn} ${sandwich.backrun.tokenIn.symbol} → ${sandwich.backrun.tokenOut.symbol} (${sandwich.backrun.gasPriceGwei.toFixed(1)} gwei)`);
    console.log(`   `);
    console.log(`   Victim: ${sandwich.victim.from.slice(0, 10)}...`);
    console.log(`   └─ TRADE:    ${sandwich.victim.amountIn} ${sandwich.victim.tokenIn.symbol} → ${sandwich.victim.tokenOut.symbol} (${sandwich.victim.gasPriceGwei.toFixed(1)} gwei)`);
    console.log(`   `);
    console.log(`    Gas Ratio: ${sandwich.gasRatio.toFixed(2)}x`);
}

// Clean up old transactions
function cleanupOldTransactions() {
    const now = Date.now();
    const expiry = CONFIG.TIME_WINDOW_MS * 2; // Keep for 2x the window

    // Clean pending transactions
    for (const [pair, txs] of pendingByPair) {
        const filtered = txs.filter(tx => (now - tx.timestamp) < expiry);
        if (filtered.length === 0) {
            pendingByPair.delete(pair);
        } else {
            pendingByPair.set(pair, filtered);
        }
    }

    // Clean recent sandwiches tracker
    for (const [hash, timestamp] of recentSandwiches) {
        if ((now - timestamp) > expiry) {
            recentSandwiches.delete(hash);
        }
    }
}

// Get current statistics
function getStats() {
    return {
        totalTransactionsProcessed: stats.totalTransactionsProcessed,
        totalSandwichesDetected: stats.totalSandwichesDetected,
        sandwichesPerPair: Object.fromEntries(stats.sandwichesPerPair),
        activePairs: pendingByPair.size,
        pendingTransactions: Array.from(pendingByPair.values()).reduce((sum, txs) => sum + txs.length, 0)
    };
}

// Get pending transactions for a specific pair
function getPendingForPair(pair) {
    return pendingByPair.get(pair) || [];
}

// Shutdown the detector
function shutdown() {
    console.log(' Shutting down sandwich detector...');

    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }

    pendingByPair.clear();
    recentSandwiches.clear();

    console.log('   Sandwich detector shut down');
}

// Exports
module.exports = {
    initialize,
    processTransaction,
    getStats,
    getPendingForPair,
    shutdown,
    // Export config for testing
    CONFIG
};