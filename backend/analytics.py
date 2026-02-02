"""Utilities for analyzing execution price versus real market price."""

import json
import requests
from test_data import mock_block

try:
    from config import COINGECKO_API_KEY
except ImportError:
    COINGECKO_API_KEY = "PLACEHOLDER_KEY"

TOKEN_MAP = {"WETH": "ethereum", "PEPE": "pepe"}

# --- FEATURE 1: COINGECKO PRICE FEED ---
def get_real_price(token_symbol):
    """Fetch the real market price for a token symbol in ETH."""
    token_id = TOKEN_MAP.get(token_symbol)
    if not token_id:
        return None

    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": token_id,
        "vs_currencies": "eth",
        "x_cg_demo_api_key": COINGECKO_API_KEY,
    }

    try:
        response = requests.get(url, params=params, timeout=5) # Lower timeout is better for demos
        response.raise_for_status()
        data = response.json()
        return data.get(token_id, {}).get("eth")
    except Exception as e:
        print(f"⚠️ CoinGecko Error: {e}")
        return None

# --- FEATURE 2: TEAMMATE'S RISK API (THE FUSION) ---
def fetch_pair_risk(pair_symbol):
    """Get Bot Activity Score from the Data Engineer's local API."""
    url = f"http://localhost:3001/api/pairs/{pair_symbol}"
    
    try:
        response = requests.get(url, timeout=2)
        response.raise_for_status()
        return response.json()
    except Exception:
        # SERVER DOWN? Use Mock Data so demo doesn't fail.
        return {
            "bot_activity_score": 0.65, # High risk
            "sandwiches_5min": 3
        }

# --- FEATURE 3: ANALYTICS LOGIC ---
def calculate_slippage(execution_price, real_price):
    if not real_price or not execution_price:
        return 0.0

    diff = execution_price - real_price
    percentage = (diff / real_price) * 100
    return round(percentage, 2)

def generate_report(transaction, real_price, risk_data):
    """Generate a combined report using Math + Bot Data."""
    
    # 1. SAFETY CHECK: Handle "unknown" amounts
    raw_amount_out = transaction.get("amountOutMin")
    if raw_amount_out == "unknown":
        return "⚠️ Data Incomplete: Cannot calculate slippage."
        
    amount_in = float(transaction.get("amountIn"))
    amount_out_min = float(raw_amount_out)
    
    # Calculate Price
    if amount_out_min == 0: return "Error: Division by zero"
    execution_price = amount_in / amount_out_min
    
    # Calculate Slippage
    slippage = calculate_slippage(execution_price, real_price)

    # 2. THE FINAL VERDICT (Fusion of Data)
    risk_score = risk_data.get('bot_activity_score', 0)
    
    report = f"Slippage: {slippage}% | Bot Risk: {risk_score}/1.0"
    
    if slippage > 2.0 or risk_score > 0.5:
        return f"🚨 DANGER: {report}. SANDWICH ATTACK LIKELY."
    
    return f"✅ SAFE: {report}."

# --- TEST RUNNER ---
if __name__ == "__main__":
    print("--- STARTING ANALYTICS ENGINE ---")
    for tx in mock_block:
        if tx.get("direction") != "buy":
            continue

        # 1. Get Token Info
        token_symbol = tx.get("tokenOut", {}).get("symbol")
        pair_symbol = f"WETH-{token_symbol}"
        
        # 2. Fetch External Data
        market_price = get_real_price(token_symbol)
        risk_data = fetch_pair_risk(pair_symbol)
        
        # 3. Generate Report
        report = generate_report(tx, market_price, risk_data)
        print(f"Tx {tx.get('txHash')}: {report}")