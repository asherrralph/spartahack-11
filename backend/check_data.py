from test_data import mock_block

print("--- DATA CHECK ---")
print(f"Transactions loaded: {len(mock_block)}")
print(f"First Tx Gas: {mock_block[0]['gasPriceGwei']} Gwei")
print(f"Victim Tx Gas: {mock_block[1]['gasPriceGwei']} Gwei")

if mock_block[0]['gasPriceGwei'] > mock_block[1]['gasPriceGwei']:
    print("✅ SUCCESS: Bot gas is higher than Victim gas.")
else:
    print("❌ ERROR: Data logic is wrong.")