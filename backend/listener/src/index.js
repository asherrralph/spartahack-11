const { logConfig } = require('./config');
const mempoolListener = require('./mempool-listener');
const websocketServer = require('./websocket-server');
const { analyzeTransaction } = require('./slippage-client');

async function handleDecodedTransaction(decodedTx) {
    websocketServer.emitTransaction(decodedTx);

    const result = await analyzeTransaction(decodedTx);
    websocketServer.emitSlippageResult(decodedTx.txHash, result);
}

async function start() {
    logConfig();

    websocketServer.startServer(() => mempoolListener.getStats());

    await mempoolListener.initialize(handleDecodedTransaction);
}

async function shutdown() {
    await mempoolListener.shutdown();
    await websocketServer.stopServer();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((error) => {
    console.error(`\n Failed to start listener: ${error.message}`);
    process.exit(1);
});
