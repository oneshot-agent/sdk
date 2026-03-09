/**
 * Uniswap V3 ETH→USDC swap helper for Base.
 *
 * Enables agents to pay with ETH by swapping to USDC before signing x402 payments.
 * Uses Uniswap V3 SwapRouter02's `exactOutputSingle` to get the exact USDC amount
 * needed, accepting ETH as input with configurable slippage tolerance.
 *
 * Flow: ETH → SwapRouter02 (auto-wraps to WETH) → WETH/USDC pool → USDC in wallet
 */
import { ethers } from 'ethers';
import type { WalletProvider } from './wallet-provider';

// ============================================================================
// Contract Addresses
// ============================================================================

export interface UniswapAddresses {
  swapRouter: string;
  quoterV2: string;
  weth: string;
  usdc: string;
}

/** Base Mainnet (chain 8453) */
export const BASE_MAINNET_ADDRESSES: UniswapAddresses = {
  swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',  // SwapRouter02
  quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',    // QuoterV2
  weth: '0x4200000000000000000000000000000000000006',          // WETH on Base
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',         // USDC on Base
};

/** Base Sepolia (chain 84532) */
export const BASE_SEPOLIA_ADDRESSES: UniswapAddresses = {
  swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',  // SwapRouter02 on Sepolia
  quoterV2: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',    // QuoterV2 on Sepolia
  weth: '0x4200000000000000000000000000000000000006',          // WETH on Base Sepolia
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',         // USDC on Base Sepolia
};

export function getAddresses(chainId: number): UniswapAddresses {
  switch (chainId) {
    case 8453: return BASE_MAINNET_ADDRESSES;
    case 84532: return BASE_SEPOLIA_ADDRESSES;
    default: throw new Error(`Unsupported chain ${chainId} for ETH→USDC swap`);
  }
}

// ============================================================================
// ABI Fragments
// ============================================================================

const QUOTER_V2_ABI = [
  'function quoteExactOutputSingle(tuple(address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const SWAP_ROUTER_ABI = [
  'function exactOutputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountIn)',
  'function refundETH() external payable',
  'function multicall(bytes[] data) external payable returns (bytes[] results)',
];

// WETH/USDC pool fee tier: 0.05% (500) is the deepest liquidity on Base
const POOL_FEE = 500;

// ============================================================================
// Quote
// ============================================================================

export interface SwapQuote {
  /** USDC amount to receive (in USDC decimals, e.g. "100000" = $0.10) */
  amountOut: bigint;
  /** ETH amount required (in wei) */
  amountIn: bigint;
  /** ETH amount with slippage (in wei) — the max the agent will pay */
  amountInMax: bigint;
  /** Effective ETH/USDC exchange rate */
  rate: number;
  /** Slippage tolerance applied */
  slippage: number;
}

/**
 * Get a quote for swapping ETH → USDC via Uniswap V3.
 *
 * @param provider - JSON-RPC provider for the target chain
 * @param usdcAmount - Amount of USDC needed (human-readable, e.g. "0.10")
 * @param chainId - Chain ID (8453 for Base, 84532 for Base Sepolia)
 * @param slippage - Slippage tolerance (0.01 = 1%)
 */
export async function getSwapQuote(
  provider: ethers.JsonRpcProvider,
  usdcAmount: string,
  chainId: number,
  slippage: number = 0.01,
): Promise<SwapQuote> {
  const addresses = getAddresses(chainId);
  const amountOut = ethers.parseUnits(usdcAmount, 6); // USDC has 6 decimals

  const quoter = new ethers.Contract(addresses.quoterV2, QUOTER_V2_ABI, provider);

  // Use staticCall to simulate the quote (it's a state-changing function used for quoting)
  const [amountIn] = await quoter.quoteExactOutputSingle.staticCall({
    tokenIn: addresses.weth,
    tokenOut: addresses.usdc,
    amount: amountOut,
    fee: POOL_FEE,
    sqrtPriceLimitX96: 0,
  });

  const amountInBigInt = BigInt(amountIn);
  // Add slippage buffer to the input amount
  const slippageBps = BigInt(Math.round(slippage * 10000));
  const amountInMax = amountInBigInt + (amountInBigInt * slippageBps) / 10000n;

  // Calculate effective rate (ETH per USDC)
  const ethAmount = parseFloat(ethers.formatEther(amountInBigInt));
  const usdcAmountFloat = parseFloat(usdcAmount);
  const rate = usdcAmountFloat / ethAmount; // USDC per ETH

  return {
    amountOut,
    amountIn: amountInBigInt,
    amountInMax,
    rate,
    slippage,
  };
}

// ============================================================================
// Execute Swap
// ============================================================================

export interface SwapResult {
  /** Transaction hash of the swap */
  txHash: string;
  /** Actual ETH spent (in wei) */
  ethSpent: bigint;
  /** USDC received (in USDC smallest unit) */
  usdcReceived: bigint;
}

/**
 * Execute an ETH → USDC swap via Uniswap V3 SwapRouter02.
 *
 * Uses `exactOutputSingle` to get exactly the USDC amount needed.
 * Sends ETH as msg.value (router auto-wraps to WETH).
 * Excess ETH is refunded via `refundETH()` in a multicall.
 *
 * @param walletProvider - Wallet provider with sendTransaction support
 * @param provider - JSON-RPC provider for the target chain
 * @param usdcAmount - Amount of USDC needed (human-readable, e.g. "0.10")
 * @param chainId - Chain ID
 * @param slippage - Slippage tolerance (default 1%)
 */
export async function executeSwap(
  walletProvider: WalletProvider,
  provider: ethers.JsonRpcProvider,
  usdcAmount: string,
  chainId: number,
  slippage: number = 0.01,
): Promise<SwapResult> {
  if (!walletProvider.sendTransaction) {
    throw new Error('Wallet provider does not support sendTransaction — required for ETH→USDC swap');
  }

  const addresses = getAddresses(chainId);
  const quote = await getSwapQuote(provider, usdcAmount, chainId, slippage);

  // Check wallet has enough ETH
  if (walletProvider.getBalance) {
    const balance = await walletProvider.getBalance();
    if (balance < quote.amountInMax) {
      const needed = ethers.formatEther(quote.amountInMax);
      const has = ethers.formatEther(balance);
      throw new Error(`Insufficient ETH for swap: need ${needed} ETH, have ${has} ETH`);
    }
  }

  // Build multicall: exactOutputSingle + refundETH
  const routerInterface = new ethers.Interface(SWAP_ROUTER_ABI);

  const swapCalldata = routerInterface.encodeFunctionData('exactOutputSingle', [{
    tokenIn: addresses.weth,
    tokenOut: addresses.usdc,
    fee: POOL_FEE,
    recipient: walletProvider.address,
    amountOut: quote.amountOut,
    amountInMaximum: quote.amountInMax,
    sqrtPriceLimitX96: 0,
  }]);

  const refundCalldata = routerInterface.encodeFunctionData('refundETH');

  const multicallData = routerInterface.encodeFunctionData('multicall', [
    [swapCalldata, refundCalldata],
  ]);

  // Send the swap transaction
  const tx = await walletProvider.sendTransaction({
    to: addresses.swapRouter,
    value: quote.amountInMax,
    data: multicallData,
  });

  const receipt = await tx.wait();
  if (receipt.status !== 1) {
    throw new Error(`Swap transaction failed: ${tx.hash}`);
  }

  return {
    txHash: tx.hash,
    ethSpent: quote.amountIn,       // Approximate — actual may differ slightly
    usdcReceived: quote.amountOut,
  };
}
