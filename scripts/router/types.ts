export enum DexVersion {
  V2 = "v2",
  V3 = "v3",
}

export interface BasePool {
  token0: string;
  token1: string;
  token0Decimals: number;
  token1Decimals: number;
  token0Balance: number;
  token1Balance: number;
  pairName: string;
  type: string;
  liquidity: number;
  tick: number;
  pool: string;
  dex: number;
  dexName: string;
}

export interface V3Pool extends BasePool {
  fee: number;
  tickSpacing: number;
  sqrtPriceX96: string;
}

export interface V2Pool extends BasePool {
  kLast: string;
  reserve0: number;
  reserve1: number;
}

export type Pool = V3Pool | V2Pool;

export interface Path {
  pools: Pool[];
  amountIn: bigint;
}

export interface Quote {
  amountOut: bigint;
  gasEstimate: bigint;
}

export interface Route {
  paths: Path[];
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  percent: number;
}

export interface RouteWithQuote extends Route {
  amountOut: bigint;
  gasEstimate: bigint;
}
