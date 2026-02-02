// tests/constants.test.js
// Test file to verify constants

const { 
  UNISWAP_V2_ROUTER, 
  MONITORED_ROUTERS, 
  TOKENS, 
  ADDRESS_TO_SYMBOL 
} = require('../src/constants/addresses');

const { 
  UNISWAP_V2_ROUTER_ABI, 
  SWAP_METHOD_IDS, 
  isSwapMethod, 
  getMethodName 
} = require('../src/constants/abis');

const { 
  getTokenMetadata, 
  getTokenSymbol, 
  formatTokenAmount, 
  createPairString 
} = require('../src/constants/tokens');

console.log('Testing constants files...\n');

// --------------------------------------------------
// Test addresses.js
// --------------------------------------------------
console.log('📍 addresses.js');
console.log('─────────────────────────────────────');
console.log(`Uniswap V2 Router: ${UNISWAP_V2_ROUTER}`);
console.log(`Monitored routers: ${MONITORED_ROUTERS.length}`);
console.log(`Known tokens: ${Object.keys(TOKENS).length}`);
console.log(`WETH address: ${TOKENS.WETH}`);
console.log(`PEPE symbol from address: ${ADDRESS_TO_SYMBOL[TOKENS.PEPE.toLowerCase()]}`);
console.log('');

// --------------------------------------------------
// Test abis.js
// --------------------------------------------------
console.log('📜 abis.js');
console.log('─────────────────────────────────────');
console.log(`ABI methods defined: ${UNISWAP_V2_ROUTER_ABI.length}`);
console.log(`Swap method IDs defined: ${Object.keys(SWAP_METHOD_IDS).length}`);
console.log(`Is 0x7ff36ab5 a swap? ${isSwapMethod('0x7ff36ab5')}`);
console.log(`Method name for 0x7ff36ab5: ${getMethodName('0x7ff36ab5')}`);
console.log(`Is 0x12345678 a swap? ${isSwapMethod('0x12345678')}`);
console.log('');

// --------------------------------------------------
// Test tokens.js
// --------------------------------------------------
console.log('🪙 tokens.js');
console.log('─────────────────────────────────────');

// Test known token
const wethMeta = getTokenMetadata(TOKENS.WETH);
console.log(`WETH metadata: ${wethMeta.symbol}, ${wethMeta.decimals} decimals`);

// Test USDC (6 decimals)
const usdcMeta = getTokenMetadata(TOKENS.USDC);
console.log(`USDC metadata: ${usdcMeta.symbol}, ${usdcMeta.decimals} decimals`);

// Test unknown token
const unknownMeta = getTokenMetadata('0x1234567890123456789012345678901234567890');
console.log(`Unknown token symbol: ${unknownMeta.symbol}`);

// Test amount formatting
console.log('');
console.log('Amount formatting tests:');
console.log(`1 ETH (raw: 1000000000000000000) = ${formatTokenAmount('1000000000000000000', TOKENS.WETH)} WETH`);
console.log(`1.5 ETH (raw: 1500000000000000000) = ${formatTokenAmount('1500000000000000000', TOKENS.WETH)} WETH`);
console.log(`1 USDC (raw: 1000000) = ${formatTokenAmount('1000000', TOKENS.USDC)} USDC`);
console.log(`100.50 USDC (raw: 100500000) = ${formatTokenAmount('100500000', TOKENS.USDC)} USDC`);

// Test pair creation
console.log('');
console.log('Pair creation tests:');
console.log(`WETH + PEPE = ${createPairString(TOKENS.WETH, TOKENS.PEPE)}`);
console.log(`PEPE + WETH = ${createPairString(TOKENS.PEPE, TOKENS.WETH)}`);  // Should be same as above
console.log(`USDC + WETH = ${createPairString(TOKENS.USDC, TOKENS.WETH)}`);

console.log('\n✅ Constants test complete!\n');
