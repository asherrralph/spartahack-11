// tests/config.test.js
// Test file to verify config loading

const { config, logConfig } = require('../src/config');

console.log('Testing config.js...\n');

// This will print the config summary
logConfig();

// Test individual values
console.log('Individual value tests:');
console.log('─────────────────────────────────────');

// Test types
console.log(`port type: ${typeof config.server.port} (should be "number")`);
console.log(`port value: ${config.server.port}`);

console.log(`demoMode type: ${typeof config.features.demoMode} (should be "boolean")`);
console.log(`demoMode value: ${config.features.demoMode}`);

console.log(`wsUrl exists: ${config.alchemy.wsUrl.length > 0}`);
console.log(`wsUrl starts with wss://: ${config.alchemy.wsUrl.startsWith('wss://')}`);

console.log('\n✅ Config test complete!\n');
