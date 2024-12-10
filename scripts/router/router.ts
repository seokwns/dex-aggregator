import { ethers } from "ethers";
import { readFileSync } from "fs";
import { update } from "./pool-data";

enum DexVersion {
  V2 = "v2",
  V3 = "v3",
}

interface BasePool {
  token0: string;
  token1: string;
  pairName: string;
  type: string;
  liquidity: number;
  pool: string;
  dex: string;
}

interface V3Pool extends BasePool {
  fee: number;
  tickSpacing: number;
  sqrtPriceX96: string;
}

interface V2Pool extends BasePool {
  kLast: string;
  reserve0: number;
  reserve1: number;
}

type Pool = V3Pool | V2Pool;

function findSwapPaths(startToken: string, endToken: string, pools: Pool[], maxDepth: number): Pool[][] {
  const queue: [string, string[], Pool[]][] = [[startToken, [startToken], []]];
  const visitedPools = new Set<Pool>();
  const paths: Pool[][] = [];

  while (queue.length > 0) {
    const [currentToken, path, usedPools] = queue.shift()!;

    if (path.length > maxDepth) continue;

    if (currentToken === endToken) {
      paths.push(usedPools);
      continue;
    }

    for (const pool of pools) {
      if (visitedPools.has(pool)) continue;
      const { token0, token1 } = pool;

      if (currentToken === token0 && !path.includes(token1)) {
        visitedPools.add(pool);
        queue.push([token1, [...path, token1], [...usedPools, pool]]);
      } else if (currentToken === token1 && !path.includes(token0)) {
        visitedPools.add(pool);
        queue.push([token0, [...path, token0], [...usedPools, pool]]);
      }
    }
  }

  return paths;
}

function getAmountDistribution(amount: bigint, distributionPercent: number = 5): [number[], bigint[]] {
  const percents: number[] = [];
  const amounts: bigint[] = [];

  for (let i = 1; i <= 100 / distributionPercent; i++) {
    percents.push(distributionPercent * i);
    amounts.push((amount * BigInt(distributionPercent) * BigInt(i)) / BigInt(100));
  }

  return [percents, amounts];
}

function getQuote(amount: bigint, startToken: string, pools: Pool[]): number {
  let current = startToken;
  let quote = Number(amount);

  for (const pool of pools) {
    if (pool.type === DexVersion.V2) {
      const { token0, token1, reserve0, reserve1 } = pool as V2Pool;

      if (reserve0 === 0 || reserve1 === 0) return 0;

      const reserveIn = current === token0 ? reserve0 : reserve1;
      const reserveOut = current === token0 ? reserve1 : reserve0;

      if (reserveIn < quote) return 0;

      const amountInWithFee = quote * 9975;
      const numerator = amountInWithFee * reserveOut;
      const denominator = reserveIn * 10000 + amountInWithFee;

      quote = numerator / denominator;
      current = current === token0 ? token1 : token0;
    } else if (pool.type === DexVersion.V3) {
      const { token0, token1, liquidity, sqrtPriceX96, fee } = pool as V3Pool;
      const sqrtPrice = Number(sqrtPriceX96) ** 2 / 2 ** 192;

      if (+liquidity === 0 || sqrtPrice === 0) return 0;

      if (current === token0) {
        quote = quote * (1 - fee / 1000000) * sqrtPrice;
        current = token1;
      } else if (current === token1) {
        quote = (quote * (1 - fee / 1000000)) / sqrtPrice;
        current = token0;
      }
    }
  }

  return quote;
}

function getRoutesWithQuote(
  amount: bigint,
  token0: string,
  paths: Pool[][],
): { path: Pool[]; out: number; percent: number } {
  const distributionPercent = 5;
  const [percents, amounts] = getAmountDistribution(amount, distributionPercent);

  const routesWithQuote = amounts.reduce(
    (acc, curAmount, i) => [
      ...acc,
      ...paths
        .map((path) => {
          const quote = getQuote(curAmount, token0, path);
          const out = +ethers.formatEther(Math.round(quote));

          if (out === 0) return null;
          return { path, out, percent: percents[i] };
        })
        .filter((route) => route !== null),
    ],
    [] as any[],
  );

  routesWithQuote.sort((a, b) => (a.out > b.out ? -1 : 1));

  routesWithQuote.forEach((route) => {
    if (route.percent < 100) {
      let remainPercent = 100 - route.percent;

      while (remainPercent > 0) {
        const remainRoute = routesWithQuote.find((r) => r.percent <= remainPercent);
        remainPercent -= remainRoute!.percent;
        route.out += remainRoute!.out;
        route.path = [...route.path, ...remainRoute!.path];
      }
    }
  });

  return routesWithQuote.filter((route) => route.percent === 100).sort((a, b) => (a.out > b.out ? -1 : 1))[0];
}

async function main() {
  // await update();
  const dbPools: Pool[] = JSON.parse(readFileSync("dragonswap-pools.json", "utf-8")) as unknown as Pool[];
  const klayswapPools: Pool[] = JSON.parse(readFileSync("klayswap-pools.json", "utf-8")) as unknown as Pool[];
  const neopinPools: Pool[] = JSON.parse(readFileSync("neopin-pools.json", "utf-8")) as unknown as Pool[];

  const pools = [...dbPools, ...klayswapPools, ...neopinPools].sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1));

  // WKLAY -> WETH
  const token0 = "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432";
  const token1 = "0x98A8345bB9D3DDa9D808Ca1c9142a28F6b0430E1";
  const amount = ethers.parseEther("100");
  const maxHops = 5;

  const paths = findSwapPaths(token0, token1, pools, maxHops);
  const route = getRoutesWithQuote(amount, token0, paths);

  const { path, out, percent } = route;
  const _path = path.map((pool) => pool.pairName).join(" -> ");
  console.log();
  console.log(`Route: ${_path}`);
  console.log(`Out: ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
