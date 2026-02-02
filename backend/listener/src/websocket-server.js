// WebSocket server for real-time updates + HTTP API for Role 2

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { config } = require('./config');

// State
let app = null;
let server = null;
let io = null;

// Track client subscriptions: Map<socketId, Set<pair>>
const clientSubscriptions = new Map();

// Track pair subscribers: Map<pair, Set<socketId>>
const pairSubscribers = new Map();

// Reference to pair aggregator (set during initialization)
let pairAggregator = null;

// Statistics
const serverStats = {
  startTime: null,
  totalConnections: 0,
  currentConnections: 0,
  totalPairUpdates: 0,
  totalSandwichAlerts: 0
};

// Initialize the server
function initialize(aggregator) {
  console.log(' Initializing WebSocket server...');
  
  // Store reference to aggregator
  pairAggregator = aggregator;
  
  // Create Express app
  app = express();
  
  // Middleware
  app.use(cors({
    origin: config.server.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true
  }));
  app.use(express.json());
  
  // Set up HTTP routes
  setupHttpRoutes();
  
  // Create HTTP server
  server = http.createServer(app);
  
  // Create Socket.io server
  io = new Server(server, {
    cors: {
      origin: config.server.frontendUrl,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  // Set up Socket.io event handlers
  setupSocketHandlers();
  
  // Start listening
  const port = config.server.port;
  server.listen(port, () => {
    serverStats.startTime = Date.now();
    console.log(`   HTTP server listening on port ${port}`);
    console.log(`   WebSocket server ready`);
    console.log(`   CORS origin: ${config.server.frontendUrl}`);
    console.log(`    WebSocket server ready\n`);
  });
}

// Set up HTTP routes (for Role 2 and health checks)
function setupHttpRoutes() {
  // Health check endpoint
  app.get('/health', (req, res) => {
    const uptime = serverStats.startTime 
      ? Math.floor((Date.now() - serverStats.startTime) / 1000)
      : 0;
    
    res.json({
      status: 'healthy',
      uptime_seconds: uptime,
      current_connections: serverStats.currentConnections,
      total_pair_updates: serverStats.totalPairUpdates,
      total_sandwich_alerts: serverStats.totalSandwichAlerts
    });
  });
  
  // Get list of active pairs
  app.get('/api/pairs', (req, res) => {
    if (!pairAggregator) {
      return res.status(503).json({ error: 'Aggregator not initialized' });
    }
    
    const pairs = pairAggregator.getActivePairs();
    res.json({
      count: pairs.length,
      pairs: pairs
    });
  });
  
  // Get stats for a specific pair (used by Role 2)
  app.get('/api/pairs/:pair', (req, res) => {
    if (!pairAggregator) {
      return res.status(503).json({ error: 'Aggregator not initialized' });
    }
    
    const pair = req.params.pair.toUpperCase();
    const stats = pairAggregator.getStatsForPair(pair);
    
    res.json(stats);
  });
  
  // Get global statistics
  app.get('/api/stats', (req, res) => {
    if (!pairAggregator) {
      return res.status(503).json({ error: 'Aggregator not initialized' });
    }
    
    const globalStats = pairAggregator.getGlobalStats();
    
    res.json({
      server: {
        uptime_seconds: serverStats.startTime 
          ? Math.floor((Date.now() - serverStats.startTime) / 1000)
          : 0,
        current_connections: serverStats.currentConnections,
        total_connections: serverStats.totalConnections,
        total_pair_updates: serverStats.totalPairUpdates,
        total_sandwich_alerts: serverStats.totalSandwichAlerts
      },
      aggregator: globalStats
    });
  });
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ 
      error: 'Not found',
      available_endpoints: [
        'GET /health',
        'GET /api/pairs',
        'GET /api/pairs/:pair',
        'GET /api/stats'
      ]
    });
  });
}

// Set up Socket.io event handlers
function setupSocketHandlers() {
  io.on('connection', (socket) => {
    handleClientConnect(socket);
    
    // Handle subscription requests
    socket.on('subscribe', (data) => {
      handleSubscribe(socket, data);
    });
    
    // Handle unsubscription requests
    socket.on('unsubscribe', (data) => {
      handleUnsubscribe(socket, data);
    });
    
    // Handle request for pairs list
    socket.on('get_pairs', () => {
      handleGetPairs(socket);
    });
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      handleClientDisconnect(socket, reason);
    });
    
    // Handle errors
    socket.on('error', (error) => {
      console.error(`    Socket error (${socket.id}): ${error.message}`);
    });
  });
}

// Handle new client connection
function handleClientConnect(socket) {
  serverStats.totalConnections++;
  serverStats.currentConnections++;
  
  // Initialize subscription tracking for this client
  clientSubscriptions.set(socket.id, new Set());
  
  console.log(`   Client connected: ${socket.id.slice(0, 8)}... (${serverStats.currentConnections} active)`);
  
  // Send connection status
  socket.emit('connection_status', {
    connected: true,
    socketId: socket.id,
    serverTime: Date.now(),
    message: 'Connected to MEV Weather server'
  });
  
  // Send list of available pairs
  if (pairAggregator) {
    const pairs = pairAggregator.getActivePairs();
    socket.emit('pairs_list', {
      count: pairs.length,
      pairs: pairs
    });
  }
}

// Handle client disconnection
function handleClientDisconnect(socket, reason) {
  serverStats.currentConnections--;
  
  console.log(`    Client disconnected: ${socket.id.slice(0, 8)}... (reason: ${reason})`);
  
  // Get client's subscriptions
  const subscriptions = clientSubscriptions.get(socket.id);
  
  if (subscriptions) {
    // Remove client from all pair subscriber lists
    for (const pair of subscriptions) {
      const subscribers = pairSubscribers.get(pair);
      if (subscribers) {
        subscribers.delete(socket.id);
        
        // Clean up empty subscriber sets
        if (subscribers.size === 0) {
          pairSubscribers.delete(pair);
        }
      }
    }
    
    // Remove client's subscription tracking
    clientSubscriptions.delete(socket.id);
  }
}

// Handle subscribe request
function handleSubscribe(socket, data) {
  if (!data || !data.pair) {
    socket.emit('error', { message: 'Invalid subscribe request: missing pair' });
    return;
  }
  
  const pair = data.pair.toUpperCase();
  
  // Add to client's subscriptions
  const clientSubs = clientSubscriptions.get(socket.id);
  if (clientSubs) {
    clientSubs.add(pair);
  }
  
  // Add to pair's subscribers
  if (!pairSubscribers.has(pair)) {
    pairSubscribers.set(pair, new Set());
  }
  pairSubscribers.get(pair).add(socket.id);
  
  console.log(`    ${socket.id.slice(0, 8)}... subscribed to ${pair}`);
  
  // Send confirmation
  socket.emit('subscribed', { 
    pair: pair,
    message: `Subscribed to ${pair} updates`
  });
  
  // Send current stats immediately
  if (pairAggregator) {
    const stats = pairAggregator.getStatsForPair(pair);
    socket.emit('pair_update', stats);
  }
}

// Handle unsubscribe request
function handleUnsubscribe(socket, data) {
  if (!data || !data.pair) {
    socket.emit('error', { message: 'Invalid unsubscribe request: missing pair' });
    return;
  }
  
  const pair = data.pair.toUpperCase();
  
  // Remove from client's subscriptions
  const clientSubs = clientSubscriptions.get(socket.id);
  if (clientSubs) {
    clientSubs.delete(pair);
  }
  
  // Remove from pair's subscribers
  const subscribers = pairSubscribers.get(pair);
  if (subscribers) {
    subscribers.delete(socket.id);
    
    // Clean up empty subscriber sets
    if (subscribers.size === 0) {
      pairSubscribers.delete(pair);
    }
  }
  
  console.log(`    ${socket.id.slice(0, 8)}... unsubscribed from ${pair}`);
  
  // Send confirmation
  socket.emit('unsubscribed', { 
    pair: pair,
    message: `Unsubscribed from ${pair} updates`
  });
}

// Handle get_pairs request
function handleGetPairs(socket) {
  if (!pairAggregator) {
    socket.emit('pairs_list', { count: 0, pairs: [] });
    return;
  }
  
  const pairs = pairAggregator.getActivePairs();
  socket.emit('pairs_list', {
    count: pairs.length,
    pairs: pairs
  });
}

// Broadcast pair update to subscribers
// Called by pair-aggregator when stats change
function broadcastPairUpdate(stats) {
  serverStats.totalPairUpdates++;
  
  const pair = stats.pair;
  const subscribers = pairSubscribers.get(pair);
  
  if (!subscribers || subscribers.size === 0) {
    return; // No one is subscribed to this pair
  }
  
  // Send to all subscribers
  for (const socketId of subscribers) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('pair_update', stats);
    }
  }
}

// Broadcast sandwich alert
// Called by pair-aggregator when sandwich is detected
function broadcastSandwichAlert(sandwich) {
  serverStats.totalSandwichAlerts++;
  
  const pair = sandwich.pair;
  const subscribers = pairSubscribers.get(pair);
  
  // Log the broadcast
  console.log(`    Broadcasting sandwich alert for ${pair} to ${subscribers ? subscribers.size : 0} subscribers`);
  
  // Send to pair subscribers
  if (subscribers && subscribers.size > 0) {
    for (const socketId of subscribers) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('sandwich_alert', sandwich);
      }
    }
  }
  
  // Also broadcast to all connected clients (global alert)
  io.emit('global_sandwich_alert', {
    pair: sandwich.pair,
    timestamp: sandwich.timestamp,
    confidence: sandwich.confidence,
    estimatedProfitUsd: sandwich.estimatedProfitUsd,
    summary: `Sandwich detected on ${sandwich.pair}: ~$${sandwich.estimatedProfitUsd} extracted`
  });
}

// Broadcast pairs list update to all clients
// Called periodically to update available pairs
function broadcastPairsList() {
  if (!pairAggregator) return;
  
  const pairs = pairAggregator.getActivePairs();
  io.emit('pairs_list', {
    count: pairs.length,
    pairs: pairs
  });
}

// Get server statistics
function getServerStats() {
  return {
    ...serverStats,
    uptime_seconds: serverStats.startTime 
      ? Math.floor((Date.now() - serverStats.startTime) / 1000)
      : 0,
    subscriptions: {
      total_pairs_tracked: pairSubscribers.size,
      pairs: Array.from(pairSubscribers.entries()).map(([pair, subs]) => ({
        pair: pair,
        subscriber_count: subs.size
      }))
    }
  };
}

// Shutdown the server
async function shutdown() {
  console.log(' Shutting down WebSocket server...');
  
  // Notify all clients
  io.emit('server_shutdown', {
    message: 'Server is shutting down',
    timestamp: Date.now()
  });
  
  // Close all socket connections
  const sockets = await io.fetchSockets();
  for (const socket of sockets) {
    socket.disconnect(true);
  }
  
  // Close the server
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('   WebSocket server shut down');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Exports
module.exports = {
  initialize,
  broadcastPairUpdate,
  broadcastSandwichAlert,
  broadcastPairsList,
  getServerStats,
  shutdown
};
