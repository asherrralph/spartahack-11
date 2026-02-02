# GapWrap Backend - MEV Listener Service

A real-time MEV (Maximal Extractable Value) detection service that monitors the Ethereum mempool for sandwich attacks on Uniswap trades.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (CommonJS) |
| Web Framework | Express 5.2 |
| Real-time | Socket.io 4.8 |
| Blockchain | Ethers.js 6.16 |
| Blockchain Provider | Alchemy WebSocket API |
| Logging | Winston 3.19 |
| Environment | dotenv |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Alchemy WebSocket                        │
│              (Ethereum Mainnet Mempool)                      │
└─────────────────────────┬───────────────────────────────────┘
                          │ Pending Transactions
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               mempool-listener.js                            │
│  - Connects to Alchemy WebSocket                            │
│  - Filters for Uniswap V2 Router transactions               │
│  - Handles reconnection with exponential backoff            │
└─────────────────────────┬───────────────────────────────────┘
                          │ Raw Tx
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              transaction-decoder.js                          │
│  - Decodes Uniswap swap methods using ethers.js             │
│  - Extracts: tokens, amounts, gas, direction                │
│  - Flags suspicious high-gas transactions                   │
└─────────────────────────┬───────────────────────────────────┘
                          │ Decoded Tx
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               pair-aggregator.js                             │
│  - Groups transactions by trading pair                      │
│  - Calculates pair statistics                               │
│  - Passes to sandwich detector                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              sandwich-detector.js                            │
│  - Detects frontrun/victim/backrun patterns                 │
│  - Calculates confidence score (0-0.95)                     │
│  - Estimates profit extraction                              │
└─────────────────────────┬───────────────────────────────────┘
                          │ Alerts
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              websocket-server.js                             │
│  - Express HTTP server + Socket.io                          │
│  - Client subscriptions per trading pair                    │
│  - Broadcasts updates & sandwich alerts                     │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
backend/listener/
├── src/
│   ├── index.js              # Entry point, orchestrates all modules
│   ├── config.js             # Environment config & validation
│   ├── mempool-listener.js   # Alchemy WebSocket connection
│   ├── transaction-decoder.js # Uniswap tx parsing
│   ├── pair-aggregator.js    # Pair statistics aggregation
│   ├── sandwich-detector.js  # MEV attack detection
│   ├── websocket-server.js   # HTTP API + WebSocket server
│   ├── demo-mode.js          # Mock data for testing
│   └── constants/
│       ├── addresses.js      # Contract addresses (routers, tokens)
│       ├── abis.js           # Uniswap ABI definitions
│       └── tokens.js         # Token metadata helpers
├── tests/                    # Test files for each module
├── .env.example              # Environment template
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- Alchemy API key (free tier works)

### Installation

```bash
cd backend/listener
npm install
```

### Configuration

Copy the example environment file and add your Alchemy API key:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `ALCHEMY_API_KEY` | Your Alchemy API key | **Required** |
| `LISTENER_PORT` | Server port | 3001 |
| `FRONTEND_URL` | CORS origin | http://localhost:5173 |
| `DEMO_MODE` | Enable mock data | false |
| `LOG_LEVEL` | Logging level | info |

### Running

```bash
# Production
npm start

# Development (with hot reload)
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## API Reference

### HTTP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| GET | `/api/pairs` | List active trading pairs |
| GET | `/api/pairs/:pair` | Stats for specific pair |
| GET | `/api/stats` | Global server statistics |

### WebSocket Events

**Server → Client:**

| Event | Description |
|-------|-------------|
| `connection_status` | Connection confirmation |
| `pairs_list` | Available trading pairs |
| `pair_update` | Real-time pair statistics |
| `sandwich_alert` | Sandwich attack detected (per-pair) |
| `global_sandwich_alert` | Broadcast to all clients |
| `server_shutdown` | Graceful shutdown notice |

**Client → Server:**

| Event | Description |
|-------|-------------|
| `subscribe` | Subscribe to a pair's updates |
| `unsubscribe` | Unsubscribe from a pair |
| `get_pairs` | Request pairs list |

## Sandwich Detection Logic

The detector identifies MEV sandwich attacks by:

1. Grouping pending transactions by trading pair
2. Looking for addresses with both BUY and SELL within 15 seconds
3. Identifying victims: other addresses buying with lower gas
4. Validating gas ratio (frontrun must be ≥1.3x victim's gas)
5. Calculating confidence (0.5-0.95) based on gas ratio and trade size
6. Estimating profit (~1% of victim's trade value)

## Monitored Contracts

- **Uniswap V2 Router**: `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`

Supports 9 swap methods:
- `swapExactETHForTokens`
- `swapETHForExactTokens`
- `swapExactTokensForETH`
- `swapTokensForExactETH`
- `swapExactTokensForTokens`
- `swapTokensForExactTokens`
- Plus fee-on-transfer variants

## License

MIT
