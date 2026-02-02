// Decodes raw Uniswap transaction into redable format
const { ethers } = require('ethers');
const { UNISWAP_V2_ROUTER, MONITORED_ROUTERS, TOKENS } = require('./constants/addresses');
const { UNISWAP_V2_ROUTER_ABI, isSwapMethod, getMethodName } = require('./constants/abis');
const { getTokenSymbol, getTokenDecimals, formatTokenAmount, createPairString } = require('./constants/tokens');

// Create ethers Interface for decoding
// What parses the transaction data
const routerInterface = new ethers.Interface(UNISWAP_V2_ROUTER_ABI)

// Swap method configurations
// Different methods have different parameter structures
const SWAP_CONFIGS = {
    // ETH -> Token (ETH is input)
    swapExactETHForTokens: {
        ethPosition: 'in',
        amountField: 'value',      // Amount comes from tx.value, not input data
        minMaxField: 'amountOutMin'
    },
    swapETHForExactTokens: {
        ethPosition: 'in',
        amountField: 'value',
        minMaxField: 'amountOut'
    },
    swapExactETHForTokensSupportingFeeOnTransferTokens: {
        ethPosition: 'in',
        amountField: 'value',
        minMaxField: 'amountOutMin'
    },

    // Token -> ETH (ETH is output)
    swapExactTokensForETH: {
        ethPosition: 'out',
        amountField: 'amountIn',
        minMaxField: 'amountOutMin'
    },
    swapTokensForExactETH: {
        ethPosition: 'out',
        amountField: 'amountInMax',
        minMaxField: 'amountOut'
    },
    swapExactTokensForETHSupportingFeeOnTransferTokens: {
        ethPosition: 'out',
        amountField: 'amountIn',
        minMaxField: 'amountOutMin'
    },

    // Token -> Token (no ETH involved)
    swapExactTokensForTokens: {
        ethPosition: 'none',
        amountField: 'amountIn',
        minMaxField: 'amountOutMin'
    },
    swapTokensForExactTokens: {
        ethPosition: 'none',
        amountField: 'amountInMax',
        minMaxField: 'amountOut'
    },
    swapExactTokensForTokensSupportingFeeOnTransferTokens: {
        ethPosition: 'none',
        amountField: 'amountIn',
        minMaxField: 'amountOutMin'
    }
};

// Main decode function
function decodeTransaction(tx) {
    try {
        // Validate this is a transaction we care about
        if (!isValidSwapTransaction(tx)) {
            return null;
        }

        // Extract the method ID
        const methodId = tx.input.slice(0, 10);

        // Check if this is a swap method
        if (!isSwapMethod(methodId)) {
            return null;
        }

        // Get the method name
        const methodName = getMethodName(methodId);

        // Decode the transaction input data
        const decoded = decodeInputData(tx.input, methodName);
        if (!decoded) {
            return null;
        }

        // Extract token information from path
        const tokenInfo = extractTokenInfo(decoded.path, methodName, tx.value);
        if (!tokenInfo) {
            return null;
        }

        // Calculate gas price in Gwei
        const gasPriceGwei = calculateGasPriceGwei(tx);

        // Build the final decoded object
        const decodedTx = {
            // Transaction identification
            txHash: tx.hash,
            from: tx.from.toLowerCase(),
            to: tx.to.toLowerCase(),

            // Gas information
            gasPrice: tx.gasPrice || tx.maxFeePerGas,
            gasPriceGwei: gasPriceGwei,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas || null,

            // Swap details
            method: methodName,

            // Token information
            tokenIn: tokenInfo.tokenIn,
            tokenOut: tokenInfo.tokenOut,

            // Amounts
            amountIn: tokenInfo.amountIn,
            amountInRaw: tokenInfo.amountInRaw,
            amountOutMin: tokenInfo.amountOutMin,
            amountOutMinRaw: tokenInfo.amountOutMinRaw,

            // Path (full route)
            path: decoded.path,

            // Trade direction (is this buying or selling the non-WETH token?)
            direction: tokenInfo.direction,

            // Normalized pair string for grouping
            pair: tokenInfo.pair,

            // Recipient
            recipient: decoded.to,

            // Dealdine
            deadline: decoded.deadline ? Number(decoded.deadline) : null,

            // Metadata
            timestamp: Date.now(),

            // Is this potentially suspicious? (high gas often indicates MEV bot)
            isSuspicious: gasPriceGwei > 50
        };

        return decodedTx;
    } catch (error) {
        // Log error but don't crash
        console.error(`Error decoding transaction ${tx.hash}: ${error.message}`);
        return null;
    }
}


// Validate that this transaction is one we care about
function isValidSwapTransaction(tx) {
    // Must have destination address
    if (!tx.to) {
        return false;
    }

    // Must be going to a monitored router
    const toAddress = tx.to.toLowerCase();
    const isMonitored = MONITORED_ROUTERS.some(
        router => router.toLowerCase() === toAddress
    );

    if (!isMonitored) {
        return false;
    }

    // Must have input data (can't decode emtpy)
    if (!tx.input || tx.input === '0x' || tx.input.length < 10) {
        return false;
    }

    return true;
}

// Decode the input data using ethers Interface
function decodeInputData(input, methodName) {
    try {
        // Parse the transaction data using our ABI
        const parsed = routerInterface.parseTransaction({ data: input });

        if (!parsed) {
            return null;
        }

        // Extract the arguments
        const args = parsed.args;

        // Build a normalized result object
        // Different methods have arguments in different positions
        const result = {
            path: args.path ? [...args.path] : [],
            to: args.to || null,
            deadline: args.deadline || null
        };

        // Add amount fields based on what's available
        if (args.amountIn !== undefined) {
            result.amountIn = args.amountIn.toString();
        }
        if (args.amountInMax !== undefined) {
            result.amountInMax = args.amountInMax.toString();
        }
        if (args.amountOut !== undefined) {
            result.amountOut = args.amountOut.toString();
        }
        if (args.amountOutMin !== undefined) {
            result.amountOutMin = args.amountOutMin.toString();
        }

        return result;
    } catch (error) {
        console.log(`Error parsing input data: ${error.message}`);
        return null;
    }
}

// Extract token information from the swap path
function extractTokenInfo(path, methodName, txValue) {
    // Path must have at least 2 tokens
    if (!path || path.length < 2) {
        return null;
    }

    // Get swap configuration for this metho
    const config = SWAP_CONFIGS[methodName];
    if (!config) {
        console.error(`Unknown swap method: ${methodName}`);
        return null;
    }

    // First token in path is input, last is output
    const tokenInAddress = path[0].toLowerCase();
    const tokenOutAddress = path[path.length - 1].toLowerCase();

    // Get token metadata
    const tokenInSymbol = getTokenSymbol(tokenInAddress);
    const tokenOutSymbol = getTokenSymbol(tokenOutAddress);
    const tokenInDecimals = getTokenDecimals(tokenInAddress);
    const tokenOutDecimals = getTokenDecimals(tokenOutAddress);

    // Determine amounts based on method type
    let amountInRaw;
    let amountOutMinRaw;

    // For ETH input methods, the amount comes from tx.value
    if (config.ethPosition === 'in') {
        amountInRaw = txValue || '0';
    }

    // Create normalized pair string
    const pair = createPairString(tokenInAddress, tokenOutAddress);

    // Determine trade direction relative to WETH
    // "buy" = buying a token with ETH
    // "sell" = selling a token for ETH
    let direction;
    const wethAddress = TOKENS.WETH.toLowerCase();

    if (tokenInAddress === wethAddress) {
        direction = 'buy'; // Swapping WETH for another token
    } else if (tokenOutAddress === wethAddress) {
        direction = 'sell'; // Swapping a token for WETH
    } else {
        direction = 'swap'; // Token to token (no WETH)
    }

    return {
        tokenIn: {
            address: tokenInAddress,
            symbol: tokenInSymbol,
            decimals: tokenInDecimals
        },
        tokenOut: {
            address: tokenOutAddress,
            symbol: tokenOutSymbol,
            decimals: tokenOutDecimals
        },
        amountIn: amountInRaw ? formatTokenAmount(amountInRaw, tokenInAddress) : 'unknown',
        amountInRaw: amountInRaw || 'unknown',
        amountOutMin: 'unknown', // Would need decoded args for this
        amountOutMinRaw: 'unknown',
        pair: pair,
        direction: direction
    };
}

// Calculate gas price in Gwei
function calculateGasPriceGwei(tx) {
    // Try gasPrice first (legacy transactions)
    if (tx.gasPrice) {
        return parseFloat(ethers.formatUnits(tx.gasPrice, 'gwei'));
    }

    // For EIP-1559 transactions, use maxFeePerGas
    if (tx.maxFeePerGas) {
        return parseFloat(ethers.formatUnits(tx.maxFeePerGas, 'gwei'));
    }

    return 0;
}

// Batch decode multiple transactions
function decodeTransactions(transactions) {
    const decoded = [];

    for (const tx of transactions) {
        const result = decodeTransaction(tx);
        if (result) {
            decoded.push(result);
        }
    }

    return decoded;
}

// Create a summar string for logging
function createTxSummary(decodedTx) {
    if (!decodedTx) {
        return 'Invalid transaction';
    }

    const direction = decodedTx.direction === 'buy' ? '->' : '<-';
    const gasIndicator = decodedTx.isSuspicious ? 'Sus' : '';

    return `${gasIndicator}${decodedTx.from.slice(0, 8)}...${decodedTx.direction} ${decodedTx.amountIn} ${decodedTx.tokenIn.symbol} ${direction} ${decodedTx.tokenOut.symbol} (${decodedTx.gasPriceGwei.toFixed(1)} gwei)`
}

// Exports
module.exports = {
    decodeTransaction,
    decodeTransactions,
    isValidSwapTransaction,
    createTxSummary
};