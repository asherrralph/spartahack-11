from typing import List, Dict, Any

# A list of transactions (like a snapshot of a block)
mock_block: List[Dict[str, Any]] = [
    {
        "txHash": "0xbotbuy",
        "from": "0xbot",          # The Attacker
        "to": "0xrouter",         # Uniswap Router (where trades happen)
        "gasPriceGwei": 100.0,    # HIGH GAS: This bribe ensures they go first!
        "method": "swapExactETHForTokens",
        "tokenIn": {"address": "0xC02...", "symbol": "WETH", "decimals": 18},
        "tokenOut": {"address": "0x698...", "symbol": "PEPE", "decimals": 18},
        "amountIn": "2.0",        # Bot bets 2 ETH
        "amountOutMin": "2000",   # Expecting ~2000 PEPE
        "direction": "buy",       # Helper field from your engineer (makes logic easy)
        "timestamp": 1738368245123,
    },

    # TRANSACTION 2: THE VICTIM (The "Meat")
    {
        "txHash": "0xvictimbuy",
        "from": "0xvictim",       # Innocent User
        "to": "0xrouter",
        "gasPriceGwei": 50.0,     # NORMAL GAS: Lower than the bot, so they go second.
        "method": "swapExactETHForTokens",
        # Also buying PEPE with WETH (Same direction as bot)
        "tokenIn": {"address": "0xC02...", "symbol": "WETH", "decimals": 18},
        "tokenOut": {"address": "0x698...", "symbol": "PEPE", "decimals": 18},
        "amountIn": "1.0",        # Victim buying 1 ETH worth
        "amountOutMin": "900",    # Getting less PEPE because Bot pushed price up
        "direction": "buy",
        "timestamp": 1738368246123,
    },

    # TRANSACTION 3: THE BOT BACK-RUN (The "Bottom Bread")
    {
        "txHash": "0xbotsell",
        "from": "0xbot",          # The SAME Attacker
        "to": "0xrouter",
        "gasPriceGwei": 90.0,     # Lower than front-run, but higher than general noise
        "method": "swapExactTokensForETH",
        # SELLING the PEPE they just bought back to WETH
        "tokenIn": {"address": "0x698...", "symbol": "PEPE", "decimals": 18},
        "tokenOut": {"address": "0xC02...", "symbol": "WETH", "decimals": 18},
        "amountIn": "2000",       # Selling the 2000 PEPE
        "amountOutMin": "1.9",    # Converting back to ETH (Profit logic happens here)
        "direction": "sell",
        "timestamp": 1738368247123,
    },
]