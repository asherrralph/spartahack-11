const cors = require('cors');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { config } = require('./config');

let io = null;
let httpServer = null;

function startServer(getStats) {
    const app = express();
    app.use(cors({ origin: config.server.frontendUrl, credentials: true }));
    app.use(express.json());

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    app.get('/stats', (_req, res) => {
        const stats = typeof getStats === 'function' ? getStats() : {};
        res.json(stats);
    });

    httpServer = http.createServer(app);

    io = new Server(httpServer, {
        cors: {
            origin: config.server.frontendUrl,
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log(`\n Client connected: ${socket.id}`);
        socket.on('disconnect', () => {
            console.log(`\n Client disconnected: ${socket.id}`);
        });
    });

    httpServer.listen(config.server.port, () => {
        console.log(`\n WebSocket server listening on port ${config.server.port}`);
    });
}

function emitTransaction(decodedTx) {
    if (!io) return;
    io.emit('transaction', decodedTx);
}

function emitSlippageResult(txHash, result) {
    if (!io) return;
    io.emit('slippage', { txHash, result });
}

async function stopServer() {
    if (io) {
        await io.close();
        io = null;
    }
    if (httpServer) {
        await new Promise((resolve) => httpServer.close(resolve));
        httpServer = null;
    }
}

module.exports = {
    startServer,
    stopServer,
    emitTransaction,
    emitSlippageResult
};
