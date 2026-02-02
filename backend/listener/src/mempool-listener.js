// Connects to Alchemy WebSocket and streams pending transactions
const { ethers } = require('ethers');
const { config } = require('./config');
const { MONITORED_ROUTERS } = require('./constants/addresses');
const { decodeTransaction, createTxSummary } = require('./transaction-decoder');

// Listener state
let provider = null;
let isConnected = false;
let reconnectAttempts = 0;
let subscription = null;

// Statistics
const stats = {
    connected: false,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    totalTransactionsReceived: 0,
    totalTransactionsDecoded: 0,
    transactionsPerMinute: 0,
    reconnectAttempts: 0
};

// Transaction rate tracking
let transactionsInLastMinute = 0;
let rateResetInterval = null;

// Callback for when transaction are decoded
let onTransactionCallback = null;

// Configuration
const RECONNECT_DELAY_BASE = 1000; // Start with 1 second
const RECONNECT_DELAY_MAX = 30000; // Max 30 seconds
const RECONNECT_MAX_ATTEMPTS = 50; // Give up after 50 attempts

// Initialize the mempool listener
async function initialize(onTransaction) {
    console.log('\n Initializing mempool listener...');

    // Store the callbacks
    onTransactionCallback = onTransaction;

    // Start rate tracking
    startRateTracking();

    // Connect to Alchemy
    await connect();
}

// Connect to Alchemy WebSocket
async function connect() {
    try {
        console.log(`  Connecting to Alchemy WebSocket...`);
        console.log(`  URL: ${config.alchemy.wsUrlBase}[API_KEY]`);

        // Create WebSocket provider
        provider = new ethers.WebSocketProvider(config.alchemy.wsUrl);

        // Set up event handlers
        setupProviderEvents();

        // Wait for connection to be established
        await provider.ready;

        // Subscribe to pending transactions
        await subscribeToPendingTransactions();

        // Update state
        isConnected = true;
        reconnectAttempts = 0;
        stats.connected = true;
        stats.lastConnectedAt = new Date().toISOString();
        stats.reconnectAttempts = 0;

        console.log(`  Connected to Alchemy WebSocket`);
        console.log(`  Listening for Uniswap transaction...\n`);
    } catch (error) {
        console.error(`  Connection failed: ${error.message}`);
        handleDisconnect();
    }
}

// Set up provider event handlers
function setupProviderEvents() {
    if (!provider) return;

    // Handle WebSocket errors
    provider.websocket.on('error', (error) => {
        console.log(`\n WebSocket closed (code: ${code}`);
        handleDisconnect();
    });
}

// Subscribe to pending transactions
async function subscribeToPendingTransactions() {
    console.log('  Subscribing to pending transactions...');
    console.log(`  Filtering for routers: ${MONITORED_ROUTERS.length} address(es)`);

    // Use Alchemy's pending transaction subscription with filter
    // This is more efficient than receiving all pending txs
    subscription = await provider.send('eth_subscribe', [
        'alchemy_pendingTransactions',
        {
            toAddress: MONITORED_ROUTERS,
            hashesOnly: false // Get full transaction data
        }
    ]);

    console.log(`   Subscription ID: ${subscription}`);

    // Listen for pending transaction events
    provider.on('pending', handlePendingTransaction);

    // Also listen via the websocket message directly for Alchemy format
    provider.websocket.on('message', (data) => {
        try {
            const parsed = JSON.parse(data);

            // Check if this is a subscription result
            if (parsed.method === 'eth_subscription' && parsed.params) {
                const tx = parsed.params.result;
                if (tx && tx.hash) {
                    handlePendingTransaction(tx);
                }
            }
        } catch (error) {
            // Ignore parse errors for non-JSON messages
        }
    });
}

// Handle incoming pending transaction
function handlePendingTransaction(tx) {
    try {
        // Update stats
        stats.totalTransactionsReceived++;
        transactionsInLastMinute++;

        // Handle both hash-only and full transaction formats
        if (typeof tx === 'string') {
            // This is just a hash, we'd need to fetch the full tx
            // For Alchemy with hashesOnly: false, we shouldn't get this
            console.log(`  Received hash only: ${tx.slice(0, 10)}...`);
            return;
        }

        // Decode the transaction
        const decoded = decodeTransaction(tx);

        if (decoded) {
            // Update stats
            stats.totalTransactionsDecoded++;

            // Log the transaction
            const summary = createTxSummary(decoded);
            console.log(`  ${summary}`);

            // Call the callback with decoded transaction
            if (onTransactionCallback) {
                onTransactionCallback(decoded);
            }
        }

    } catch (error) {
        console.error(`  Error handling transaction: ${error.message}`);
    }
}

// Handle Disconnection
function handleDisconnect() {
    // Update state
    isConnected = false;
    stats.connected = false;
    stats.lastDisconnectedAt = new Date().toISOString();

    // Clean up old provider
    if (provider) {
        try {
            provider.removeAllListeners();
            provider.destroy();
        } catch (error) {
            // Ignore cleanup errors
        }
        provider = null;
    }

    // Attempt reconnection
    scheduleReconnect();
}


// Schedule a reconnection attempt
function scheduleReconnect() {
    reconnectAttempts++;
    stats.reconnectAttempts = reconnectAttempts;

    if (reconnectAttempts > RECONNECT_MAX_ATTEMPTS) {
        console.error(`\n Max reconnection attempts (${RECONNECT_MAX_ATTEMPTS}) reached. Giving up.`);
        console.error(' Please check your Alchemy API key and network connection.');
        return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
        RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1),
        RECONNECT_DELAY_MAX
    );

    console.log(`\n Reconnecting in ${delay / 1000} seconds... (attempt ${reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})`);

    setTimeout(async () => {
        console.log(`\n Reconnection attempt ${reconnectAttempts}...`);
        await connect();
    }, delay);
}

// Start Rate tracking
// Calculates transactions per minute
function startRateTracking() {
    // Reset counter very minute
    rateResetInterval = setInterval(() => {
        stats.transactionsPerMinute = transactionsInLastMinute;
        transactionsInLastMinute = 0;
    }, 60000);
}

// Stop rate tracking
function stopRateTracking() {
    if (rateResetInterval) {
        clearInterval(rateResetInterval);
        rateResetInterval = null;
    }
}

// Get current statistics
function getStats() {
    return {
        ...stats,
        currentTransactionsPerMinute: transactionsInLastMinute
    };
}

// Check if listener is connected
function isListenerConnected() {
    return isConnected;
}

// Graceful shutdown
async function shutdown() {
    console.log('\n Shutting down mempool listener...');

    // Stop rate tracking
    stopRateTracking();

    // Unsubscribe if we have an active subscription
    if (subscription && provider) {
        try {
            await provider.send('eth_unsubscribe', [subscription]);
            console.log('   Unsubscribe from pending transactions');
        } catch (error) {
            // Ignore unsubscribe errors during shutdown
        }
    }

    // Clean up provider
    if (provider) {
        try {
            provider.removeAllListeners();
            provider.destroy();
        } catch (error) {
            // Ignore cleanup errors
        }
        provider = null;
    }

    isConnected = false;
    stats.connected = false;

    console.log('   Mempool listener shut down');
}

// Export
module.exports = {
    initialize,
    shutdown,
    getStats,
    isListenerConnected
};