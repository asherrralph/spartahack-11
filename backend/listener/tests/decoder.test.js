// tests/decoder.test.js
// Test transaction decoding

const { decodeTransaction, createTxSummary } = require('../src/transaction-decoder');
const { UNISWAP_V2_ROUTER, TOKENS } = require('../src/constants/addresses');

console.log('Testing transaction-decoder.js...\n');

// --------------------------------------------------
// Test 1: swapExactETHForTokens (buying PEPE with ETH)
// --------------------------------------------------
console.log('Test 1: swapExactETHForTokens');
console.log('─────────────────────────────────────');

const mockTx1 = {
  hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  from: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
  to: UNISWAP_V2_ROUTER,
  value: '1500000000000000000', // 1.5 ETH
  gasPrice: '50000000000', // 50 gwei
  input: '0x7ff36ab5' +  // swapExactETHForTokens method ID
    '0000000000000000000000000000000000000000000000000000000000000001' + // amountOutMin
    '0000000000000000000000000000000000000000000000000000000000000080' + // path offset
    '000000000000000000000000abcdef1234567890abcdef1234567890abcdef12' + // to
    '0000000000000000000000000000000000000000000000000000000067a0b5cc' + // deadline
    '0000000000000000000000000000000000000000000000000000000000000002' + // path length
    '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' + // WETH
    '0000000000000000000000006982508145454ce325ddbe47a25d4ec3d2311933'   // PEPE
};

const decoded1 = decodeTransaction(mockTx1);
if (decoded1) {
  console.log(`✅ Decoded successfully`);
  console.log(`   Method: ${decoded1.method}`);
  console.log(`   From: ${decoded1.from.slice(0, 10)}...`);
  console.log(`   Token In: ${decoded1.tokenIn.symbol}`);
  console.log(`   Token Out: ${decoded1.tokenOut.symbol}`);
  console.log(`   Amount In: ${decoded1.amountIn} ${decoded1.tokenIn.symbol}`);
  console.log(`   Direction: ${decoded1.direction}`);
  console.log(`   Pair: ${decoded1.pair}`);
  console.log(`   Gas: ${decoded1.gasPriceGwei} gwei`);
  console.log(`   Suspicious: ${decoded1.isSuspicious}`);
  console.log(`   Summary: ${createTxSummary(decoded1)}`);
} else {
  console.log(`❌ Failed to decode`);
}

console.log('');

// --------------------------------------------------
// Test 2: Invalid transaction (not to Uniswap)
// --------------------------------------------------
console.log('Test 2: Invalid transaction (wrong address)');
console.log('─────────────────────────────────────');

const mockTx2 = {
  hash: '0xabcd...',
  from: '0x1234...',
  to: '0x0000000000000000000000000000000000000000', // Not Uniswap
  value: '1000000000000000000',
  gasPrice: '50000000000',
  input: '0x7ff36ab5...'
};

const decoded2 = decodeTransaction(mockTx2);
if (decoded2) {
  console.log(`❌ Should have returned null`);
} else {
  console.log(`✅ Correctly returned null for non-Uniswap transaction`);
}

console.log('');

// --------------------------------------------------
// Test 3: Invalid transaction (no input data)
// --------------------------------------------------
console.log('Test 3: Invalid transaction (no input data)');
console.log('─────────────────────────────────────');

const mockTx3 = {
  hash: '0xabcd...',
  from: '0x1234...',
  to: UNISWAP_V2_ROUTER,
  value: '1000000000000000000',
  gasPrice: '50000000000',
  input: '0x' // Empty input
};

const decoded3 = decodeTransaction(mockTx3);
if (decoded3) {
  console.log(`❌ Should have returned null`);
} else {
  console.log(`✅ Correctly returned null for empty input`);
}

console.log('');

// --------------------------------------------------
// Test 4: High gas transaction (suspicious)
// --------------------------------------------------
console.log('Test 4: High gas transaction (suspicious)');
console.log('─────────────────────────────────────');

const mockTx4 = {
  hash: '0x5678567856785678567856785678567856785678567856785678567856785678',
  from: '0x9999999999999999999999999999999999999999',
  to: UNISWAP_V2_ROUTER,
  value: '5000000000000000000', // 5 ETH
  gasPrice: '150000000000', // 150 gwei - HIGH!
  input: '0x7ff36ab5' +
    '0000000000000000000000000000000000000000000000000000000000000001' +
    '0000000000000000000000000000000000000000000000000000000000000080' +
    '0000000000000000000000009999999999999999999999999999999999999999' +
    '0000000000000000000000000000000000000000000000000000000067a0b5cc' +
    '0000000000000000000000000000000000000000000000000000000000000002' +
    '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' +
    '0000000000000000000000006982508145454ce325ddbe47a25d4ec3d2311933'
};

const decoded4 = decodeTransaction(mockTx4);
if (decoded4) {
  console.log(`✅ Decoded successfully`);
  console.log(`   Gas: ${decoded4.gasPriceGwei} gwei`);
  console.log(`   Suspicious: ${decoded4.isSuspicious} (should be true)`);
  console.log(`   Summary: ${createTxSummary(decoded4)}`);
} else {
  console.log(`❌ Failed to decode`);
}

console.log('');

// --------------------------------------------------
// Test 5: Transaction with EIP-1559 gas
// --------------------------------------------------
console.log('Test 5: EIP-1559 transaction (maxFeePerGas)');
console.log('─────────────────────────────────────');

const mockTx5 = {
  hash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  from: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  to: UNISWAP_V2_ROUTER,
  value: '2000000000000000000', // 2 ETH
  maxFeePerGas: '75000000000', // 75 gwei
  maxPriorityFeePerGas: '2000000000', // 2 gwei
  input: '0x7ff36ab5' +
    '0000000000000000000000000000000000000000000000000000000000000001' +
    '0000000000000000000000000000000000000000000000000000000000000080' +
    '000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' +
    '0000000000000000000000000000000000000000000000000000000067a0b5cc' +
    '0000000000000000000000000000000000000000000000000000000000000002' +
    '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' +
    '0000000000000000000000006982508145454ce325ddbe47a25d4ec3d2311933'
};

const decoded5 = decodeTransaction(mockTx5);
if (decoded5) {
  console.log(`✅ Decoded successfully`);
  console.log(`   Max Fee Per Gas: ${decoded5.gasPriceGwei} gwei`);
  console.log(`   Max Priority Fee: ${decoded5.maxPriorityFeePerGas}`);
  console.log(`   Summary: ${createTxSummary(decoded5)}`);
} else {
  console.log(`❌ Failed to decode`);
}

console.log('\n✅ Decoder tests complete!\n');
