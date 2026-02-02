import asyncio

import httpx

from app.config import config


async def test() -> None:
    print("\n🧪 Testing Integration with Role 1\n")

    async with httpx.AsyncClient() as client:
        print("Test 1: Connecting to Role 1...")
        try:
            response = await client.get(f"{config.LISTENER_URL}/health")
            print(f"   ✅ Role 1 is running: {response.json()}\n")
        except Exception as exc:
            print(f"   ❌ Cannot reach Role 1: {exc}\n")
            return

        print("Test 2: Getting pair statistics...")
        try:
            response = await client.get(f"{config.LISTENER_URL}/api/pairs/PEPE-WETH")
            data = response.json()

            print("   ✅ Got data for PEPE-WETH:")
            print(f"      Bot activity score: {data.get('bot_activity_score')}")
            print(f"      Transactions (5min): {data.get('transactions_5min')}")
            print(f"      Sandwiches (5min): {data.get('sandwiches_5min')}")
            print(f"      Avg gas: {data.get('avg_gas_gwei')} gwei\n")
        except Exception as exc:
            print(f"   ❌ Failed: {exc}\n")
            return

        print("Test 3: Listing active pairs...")
        try:
            response = await client.get(f"{config.LISTENER_URL}/api/pairs")
            data = response.json()

            print(f"   ✅ Found {data.get('count')} active pairs:")
            for pair in data.get("pairs", [])[:5]:
                print(f"      - {pair['pair']}: {pair['transactions_5min']} txs")
            print()
        except Exception as exc:
            print(f"   ❌ Failed: {exc}\n")
            return

    print("✅ All integration tests passed!\n")
    print("You can now build the slippage calculation using Role 1's data.\n")


if __name__ == "__main__":
    asyncio.run(test())
