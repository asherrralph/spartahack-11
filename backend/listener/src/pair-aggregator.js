// Aggregates transaction statistics per token pair

const sandwichDetector = require('./sandwich-detector');

// Configuration
const CONFIG = {
  // Time window for statistics (milliseconds)
  STATS_WINDOW_MS: 5 * 60 * 1000,  // 5 minutes
  
  // Time window for activity history (milliseconds)
  HISTORY_WINDOW_MS: 5 * 60 * 1000,  // 5 minutes
  
  // How often to emit updates (milliseconds)
  UPDATE_INTERVAL_MS: 1000,  // Every 1 second
  
  // How often to clean old data (milliseconds)
  CLEANUP_INTERVAL_MS: 10000,  // Every 10 seconds
  
  // Gas threshold for "suspicious" transactions (gwei)
  SUSPICIOUS_GAS_THRESHOLD: 50,
  
  // History bucket size (milliseconds)
  HISTORY_BUCKET_MS: 1000,  // 1 second buckets
  
  // Maximum history buckets to keep
  MAX_HISTORY_BUCKETS: 300,  // 5 minutes of 1-second buckets
  
  // Maximum recent sandwiches to keep per pair
  MAX_RECENT_SANDWICHES: 20
};

// State

// Per-pair data storage
// Structure: Map<pair, PairData>
const pairData = new Map();

// Callbacks
let onPairUpdateCallback = null;
let onSandwichAlertCallback = null;

// Intervals
let updateInterval = null;
let cleanupInterval = null;

// Global statistics
const globalStats = {
  totalTransactionsProcessed: 0,
  totalSandwichesDetected: 0,
  activePairs: 0,
  startTime: null
};

// PairData class - holds all data for a single pair
class PairData {
  constructor(pair) {
    this.pair = pair;
    this.transactions = []; // Recent transactions
    this.activityHistory = []; // Per-second buckets for graph
    this.recentSandwiches = []; // Recent sandwich alerts
    this.lastUpdateTime = Date.now();
    
    // Cached statistics (recalculated periodically)
    this.cachedStats = null;
    this.statsCacheTime = 0;
  }
  
  // Add a transaction
  addTransaction(tx) {
    this.transactions.push(tx);
    this.updateActivityHistory(tx);
    this.invalidateStatsCache();
  }
  
  // Add a detected sandwich
  addSandwich(sandwich) {
    this.recentSandwiches.unshift({
      timestamp: sandwich.timestamp,
      confidence: sandwich.confidence,
      estimatedProfitUsd: sandwich.estimatedProfitUsd,
      attackerAddress: sandwich.attackerAddress,
      victimAddress: sandwich.victim.from,
      victimAmountIn: sandwich.victim.amountIn,
      frontrunHash: sandwich.frontrun.txHash,
      victimHash: sandwich.victim.txHash,
      backrunHash: sandwich.backrun.txHash,
      gasRatio: sandwich.gasRatio
    });
    
    // Limit size
    if (this.recentSandwiches.length > CONFIG.MAX_RECENT_SANDWICHES) {
      this.recentSandwiches.pop();
    }
    
    this.invalidateStatsCache();
  }
  
  // Update activity history (for graph)
  updateActivityHistory(tx) {
    const now = Date.now();
    const bucketTime = Math.floor(now / CONFIG.HISTORY_BUCKET_MS) * CONFIG.HISTORY_BUCKET_MS;
    
    // Find or create bucket
    let bucket = this.activityHistory.find(b => b.timestamp === bucketTime);
    
    if (!bucket) {
      bucket = {
        timestamp: bucketTime,
        txCount: 0,
        suspiciousCount: 0,
        sandwichCount: 0,
        totalGas: 0
      };
      this.activityHistory.push(bucket);
      
      // Sort by timestamp
      this.activityHistory.sort((a, b) => a.timestamp - b.timestamp);
      
      // Limit size
      if (this.activityHistory.length > CONFIG.MAX_HISTORY_BUCKETS) {
        this.activityHistory.shift();
      }
    }
    
    // Update bucket
    bucket.txCount++;
    bucket.totalGas += tx.gasPriceGwei;
    
    if (tx.isSuspicious || tx.gasPriceGwei > CONFIG.SUSPICIOUS_GAS_THRESHOLD) {
      bucket.suspiciousCount++;
    }
  }
  
  // Increment sandwich count in current bucket
  incrementSandwichCount() {
    const now = Date.now();
    const bucketTime = Math.floor(now / CONFIG.HISTORY_BUCKET_MS) * CONFIG.HISTORY_BUCKET_MS;
    
    const bucket = this.activityHistory.find(b => b.timestamp === bucketTime);
    if (bucket) {
      bucket.sandwichCount++;
    }
  }
  
  // Invalidate cached statistics
  invalidateStatsCache() {
    this.cachedStats = null;
  }
  
  // Calculate and return statistics
  getStats() {
    const now = Date.now();
    
    // Return cached if still valid (less than 500ms old)
    if (this.cachedStats && (now - this.statsCacheTime) < 500) {
      return this.cachedStats;
    }
    
    // Filter to recent transactions
    const windowStart = now - CONFIG.STATS_WINDOW_MS;
    const recentTxs = this.transactions.filter(tx => tx.timestamp > windowStart);
    
    // Calculate statistics
    const stats = this.calculateStats(recentTxs, now);
    
    // Cache the result
    this.cachedStats = stats;
    this.statsCacheTime = now;
    
    return stats;
  }
  
  // Calculate statistics from transactions
  calculateStats(recentTxs, now) {
    const txCount = recentTxs.length;
    
    // Count suspicious transactions
    const suspiciousTxs = recentTxs.filter(
      tx => tx.isSuspicious || tx.gasPriceGwei > CONFIG.SUSPICIOUS_GAS_THRESHOLD
    );
    const suspiciousCount = suspiciousTxs.length;
    
    // Calculate average gas
    let avgGasGwei = 0;
    if (txCount > 0) {
      const totalGas = recentTxs.reduce((sum, tx) => sum + tx.gasPriceGwei, 0);
      avgGasGwei = totalGas / txCount;
    }
    
    // Count recent sandwiches
    const windowStart = now - CONFIG.STATS_WINDOW_MS;
    const recentSandwichCount = this.recentSandwiches.filter(
      s => s.timestamp > windowStart
    ).length;
    
    // Calculate bot activity score (0-1)
    const botActivityScore = this.calculateBotActivityScore(
      txCount,
      suspiciousCount,
      recentSandwichCount,
      avgGasGwei
    );
    
    // Get activity history for graph
    const historyWindowStart = now - CONFIG.HISTORY_WINDOW_MS;
    const activityHistory = this.activityHistory
      .filter(b => b.timestamp > historyWindowStart)
      .map(b => ({
        timestamp: b.timestamp,
        txCount: b.txCount,
        suspiciousCount: b.suspiciousCount,
        sandwichCount: b.sandwichCount,
        avgGas: b.txCount > 0 ? Math.round(b.totalGas / b.txCount) : 0
      }));
    
    // Get recent sandwiches for display
    const recentSandwichesForDisplay = this.recentSandwiches
      .filter(s => s.timestamp > windowStart)
      .slice(0, 10)
      .map(s => ({
        timestamp: s.timestamp,
        confidence: s.confidence,
        estimatedProfitUsd: s.estimatedProfitUsd,
        victimAddress: s.victimAddress,
        victimAmountIn: s.victimAmountIn,
        gasRatio: s.gasRatio,
        etherscanLink: `https://etherscan.io/tx/${s.victimHash}`
      }));
    
    return {
      pair: this.pair,
      timestamp: now,
      
      // Core statistics (used by Role 2)
      transactions_5min: txCount,
      suspicious_tx_count: suspiciousCount,
      sandwiches_5min: recentSandwichCount,
      avg_gas_gwei: Math.round(avgGasGwei * 100) / 100,
      bot_activity_score: Math.round(botActivityScore * 1000) / 1000,
      
      // Activity history (for frontend graph)
      activity_history: activityHistory,
      
      // Recent sandwiches (for frontend display)
      recent_sandwiches: recentSandwichesForDisplay,
      
      // Additional metadata
      last_update: now,
      data_points: activityHistory.length
    };
  }
  
  // Calculate bot activity score (0-1)
  calculateBotActivityScore(txCount, suspiciousCount, sandwichCount, avgGas) {
    let score = 0;
    
    // Factor 1: Ratio of suspicious transactions (0 - 0.3)
    if (txCount > 0) {
      const suspiciousRatio = suspiciousCount / txCount;
      score += Math.min(suspiciousRatio, 1) * 0.3;
    }
    
    // Factor 2: Sandwich count (0 - 0.35)
    if (sandwichCount >= 5) {
      score += 0.35;
    } else if (sandwichCount >= 3) {
      score += 0.25;
    } else if (sandwichCount >= 1) {
      score += 0.15;
    }
    
    // Factor 3: High average gas (0 - 0.2)
    if (avgGas > 100) {
      score += 0.2;
    } else if (avgGas > 75) {
      score += 0.15;
    } else if (avgGas > 50) {
      score += 0.1;
    }
    
    // Factor 4: Transaction volume (0 - 0.15)
    // High volume can indicate bot activity
    if (txCount > 100) {
      score += 0.15;
    } else if (txCount > 50) {
      score += 0.1;
    } else if (txCount > 20) {
      score += 0.05;
    }
    
    // Clamp to 0-1
    return Math.min(Math.max(score, 0), 1);
  }
  
  // Clean old data
  cleanup(now) {
    const windowStart = now - (CONFIG.STATS_WINDOW_MS * 2);
    
    // Clean transactions
    this.transactions = this.transactions.filter(tx => tx.timestamp > windowStart);
    
    // Clean activity history
    const historyWindowStart = now - (CONFIG.HISTORY_WINDOW_MS * 2);
    this.activityHistory = this.activityHistory.filter(
      b => b.timestamp > historyWindowStart
    );
    
    // Clean recent sandwiches
    this.recentSandwiches = this.recentSandwiches.filter(
      s => s.timestamp > windowStart
    );
    
    this.invalidateStatsCache();
  }
  
  // Check if pair has any recent activity
  hasRecentActivity(now) {
    const windowStart = now - CONFIG.STATS_WINDOW_MS;
    return this.transactions.some(tx => tx.timestamp > windowStart);
  }
}

// Initialize the aggregator
function initialize(onPairUpdate, onSandwichAlert) {
  console.log(' Initializing pair aggregator...');
  
  // Store callbacks
  onPairUpdateCallback = onPairUpdate;
  onSandwichAlertCallback = onSandwichAlert;
  
  // Initialize sandwich detector
  sandwichDetector.initialize(handleSandwichDetected);
  
  // Start update interval (emits stats periodically)
  updateInterval = setInterval(emitAllPairUpdates, CONFIG.UPDATE_INTERVAL_MS);
  
  // Start cleanup interval
  cleanupInterval = setInterval(cleanupOldData, CONFIG.CLEANUP_INTERVAL_MS);
  
  // Record start time
  globalStats.startTime = Date.now();
  
  console.log(`   Stats window: ${CONFIG.STATS_WINDOW_MS / 1000}s`);
  console.log(`   Update interval: ${CONFIG.UPDATE_INTERVAL_MS}ms`);
  console.log(`   Suspicious gas threshold: ${CONFIG.SUSPICIOUS_GAS_THRESHOLD} gwei`);
  console.log('   Pair aggregator ready\n');
}

// Process a new transaction
function processTransaction(tx) {
  globalStats.totalTransactionsProcessed++;
  
  const pair = tx.pair;
  
  // Get or create pair data
  if (!pairData.has(pair)) {
    pairData.set(pair, new PairData(pair));
    globalStats.activePairs = pairData.size;
  }
  
  const data = pairData.get(pair);
  
  // Add transaction to pair data
  data.addTransaction(tx);
  
  // Send to sandwich detector
  sandwichDetector.processTransaction(tx);
}

// Handle sandwich detection
function handleSandwichDetected(sandwich) {
  globalStats.totalSandwichesDetected++;
  
  const pair = sandwich.pair;
  
  // Add to pair data
  if (pairData.has(pair)) {
    const data = pairData.get(pair);
    data.addSandwich(sandwich);
    data.incrementSandwichCount();
  }
  
  // Emit sandwich alert
  if (onSandwichAlertCallback) {
    onSandwichAlertCallback(sandwich);
  }
}

// Emit updates for all active pairs
function emitAllPairUpdates() {
  if (!onPairUpdateCallback) return;
  
  const now = Date.now();
  
  for (const [pair, data] of pairData) {
    // Only emit if pair has recent activity
    if (data.hasRecentActivity(now)) {
      const stats = data.getStats();
      onPairUpdateCallback(stats);
    }
  }
}

// Clean old data from all pairs
function cleanupOldData() {
  const now = Date.now();
  const pairsToDelete = [];
  
  for (const [pair, data] of pairData) {
    data.cleanup(now);
    
    // Mark for deletion if no recent activity
    if (!data.hasRecentActivity(now) && data.transactions.length === 0) {
      pairsToDelete.push(pair);
    }
  }
  
  // Delete inactive pairs
  for (const pair of pairsToDelete) {
    pairData.delete(pair);
  }
  
  globalStats.activePairs = pairData.size;
}

// Get statistics for a specific pair
// Used by Role 2's HTTP API
function getStatsForPair(pair) {
  if (!pairData.has(pair)) {
    // Return empty stats for unknown pair
    return {
      pair: pair,
      timestamp: Date.now(),
      transactions_5min: 0,
      suspicious_tx_count: 0,
      sandwiches_5min: 0,
      avg_gas_gwei: 0,
      bot_activity_score: 0,
      activity_history: [],
      recent_sandwiches: [],
      last_update: Date.now(),
      data_points: 0
    };
  }
  
  return pairData.get(pair).getStats();
}

// Get list of all active pairs
function getActivePairs() {
  const now = Date.now();
  const activePairs = [];
  
  for (const [pair, data] of pairData) {
    if (data.hasRecentActivity(now)) {
      const stats = data.getStats();
      activePairs.push({
        pair: pair,
        transactions_5min: stats.transactions_5min,
        sandwiches_5min: stats.sandwiches_5min,
        bot_activity_score: stats.bot_activity_score
      });
    }
  }
  
  // Sort by transaction count (descending)
  activePairs.sort((a, b) => b.transactions_5min - a.transactions_5min);
  
  return activePairs;
}

// Get global statistics
function getGlobalStats() {
  const now = Date.now();
  const uptimeMs = globalStats.startTime ? (now - globalStats.startTime) : 0;
  
  // Get sandwich detector stats
  const detectorStats = sandwichDetector.getStats();
  
  return {
    uptime_seconds: Math.floor(uptimeMs / 1000),
    total_transactions_processed: globalStats.totalTransactionsProcessed,
    total_sandwiches_detected: globalStats.totalSandwichesDetected,
    active_pairs: globalStats.activePairs,
    detector_stats: detectorStats
  };
}

// Subscribe to updates for a specific pair
// Returns current stats immediately, then callback receives updates
function subscribeToBar(pair, callback) {
  // Return current stats immediately
  const currentStats = getStatsForPair(pair);
  callback(currentStats);
  
  // Note: The periodic emitAllPairUpdates will send future updates
  // The WebSocket server handles routing to the right subscribers
}

// Shutdown the aggregator
function shutdown() {
  console.log('📊 Shutting down pair aggregator...');
  
  // Stop intervals
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  
  // Shutdown sandwich detector
  sandwichDetector.shutdown();
  
  // Clear data
  pairData.clear();
  
  console.log('   Pair aggregator shut down');
}

// Exports
module.exports = {
  initialize,
  processTransaction,
  getStatsForPair,
  getActivePairs,
  getGlobalStats,
  shutdown,
  // Export config for testing
  CONFIG
};