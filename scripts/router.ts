import { ethers } from "ethers";
import { readFileSync, writeFileSync } from "fs";
import { update } from "./pool-data";
import { DexVersion, MixedSwapParams, MultiPathSwapParams, Path, Pool, RouteWithQuote, V2Pool, V3Pool } from "./types";
import { encodeRoute, getAmountOut, multiPathSwap } from "./call-quote";

const replacer = (_key: any, value: { toString: () => any }) => (typeof value === "bigint" ? value.toString() : value);

/**
 * 스왑이 가능한 모든 풀의 경로를 탐색합니다.
 * @param startToken 입력 토큰
 * @param endToken 출력 토큰
 * @param pools 모든 풀 정보
 * @param maxDepth 최대 홉 수
 * @returns 스왑 가능한 풀의 모든 경로
 */
function findSwapPaths(startToken: string, endToken: string, pools: Pool[], maxDepth: number): Pool[][] {
  const tokenToPools: Map<string, Pool[]> = new Map();

  // 각 토큰별 스왑 가능한 풀 정보 저장
  for (const pool of pools) {
    const { token0, token1 } = pool;
    if (!tokenToPools.has(token0)) tokenToPools.set(token0, []);
    if (!tokenToPools.has(token1)) tokenToPools.set(token1, []);
    tokenToPools.get(token0)!.push(pool);
    tokenToPools.get(token1)!.push(pool);
  }

  const queue: [string, string[], Set<Pool>][] = [[startToken, [startToken], new Set()]];
  const paths: Pool[][] = [];

  // BFS 시작
  while (queue.length > 0) {
    const [currentToken, path, usedPools] = queue.shift()!;

    // 최대 홉(스왑 가능한 횟수) 초과 시 continue
    if (path.length > maxDepth + 1) continue;

    // 도착 토큰에 도달 시 경로 저장, 해당 경로 탐색 중지
    if (currentToken === endToken) {
      paths.push(Array.from(usedPools));
      continue;
    }

    // 현재 토큰에서 스왑 가능한 풀 정보 가져오기
    const connectedPools = tokenToPools.get(currentToken) || [];

    // 다음 토큰으로 이동
    for (const pool of connectedPools) {
      // 이미 사용한 풀이면 continue
      if (usedPools.has(pool)) continue;

      const nextToken = pool.token0 === currentToken ? pool.token1 : pool.token0;

      // 다음 토큰이 이미 경로에 있으면 continue
      if (path.includes(nextToken)) continue;

      // 다음 토큰, 경로, 사용한 풀 정보 저장
      const newUsedPools = new Set(usedPools);
      newUsedPools.add(pool);
      queue.push([nextToken, [...path, nextToken], newUsedPools]);
    }
  }

  return paths;
}

/**
 * @dev 비율에 따른 토큰 수량을 계산합니다. distributionPercent 가 5 라면, 5% ~ 100% 까지 5% 단위로 분배합니다.
 * @param amount 토큰 수량
 * @param distributionPercent 금액 분배 비율
 * @returns 비율에 맞게 분배된 토큰 수량
 */
function getAmountDistribution(amount: bigint, distributionPercent: number = 5): [number[], bigint[]] {
  const percents: number[] = [];
  const amounts: bigint[] = [];

  for (let i = 1; i <= 100 / distributionPercent; i++) {
    percents.push(distributionPercent * i);
    amounts.push((amount * BigInt(distributionPercent) * BigInt(i)) / BigInt(100));
  }

  return [percents, amounts];
}

/**
 * 예상 스왑 금액을 계산합니다.
 * @param amount 입력 토큰 수량
 * @param startToken 입력 토큰
 * @param pools 스왑 가능한 풀 정보
 * @returns 출력 토큰 수량
 */
function getQuote(pools: Pool[], token0: string, amountIn: bigint): bigint {
  let current = token0;
  let quote = amountIn;

  for (const pool of pools) {
    if (pool.type === DexVersion.V2) {
      const { token0, token1, reserve0, reserve1 } = pool as V2Pool;

      if (reserve0 === 0 || reserve1 === 0) return 0n;

      const reserveIn = current === token0 ? reserve0 : reserve1;
      const reserveOut = current === token0 ? reserve1 : reserve0;

      if (reserveIn < quote) return 0n;

      const amountInWithFee = quote * 997n;
      const numerator = amountInWithFee * BigInt(reserveOut);
      const denominator = BigInt(reserveIn) * 1000n + amountInWithFee;

      quote = numerator / denominator;
      current = current === token0 ? token1 : token0;
    } else if (pool.type === DexVersion.V3) {
      const { token0, token1, sqrtPriceX96, token0Decimals, token1Decimals, token0Balance, token1Balance } =
        pool as V3Pool;

      const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
      const price = Math.floor((sqrtPrice ** 2 / (10 ** token1Decimals / 10 ** token0Decimals)) * 10 ** token1Decimals);

      if (current === token0) {
        if (token0Balance <= quote) return 0n;

        quote = BigInt(Math.floor((Number(quote) / 10 ** token0Decimals) * price * 10 ** token0Decimals));
        current = token1;
      } else if (current === token1) {
        if (token1Balance <= quote) return 0n;

        quote = BigInt(Math.floor((Number(quote) / 10 ** token1Decimals / price) * 10 ** token1Decimals));
        current = token0;
      }

      if (quote < 0) return 0n;
    }
  }

  return quote;
}

/**
 * 후보 경로 계산
 * @param amount 입력 토큰 수량
 * @param token0 입력 토큰
 * @param paths 후보 라우팅 경로 정보
 * @returns 경로별 예상 스왑 금액
 */
async function getCandidateRoutes(
  token0: string,
  token1: string,
  amountIn: bigint,
  paths: Pool[][],
): Promise<RouteWithQuote[]> {
  const distributionPercent = 5;
  const [percents, amounts] = getAmountDistribution(amountIn, distributionPercent);

  const routesWithQuote = (
    await Promise.all(
      amounts.flatMap((curAmount, i) =>
        paths.map((_paths) => {
          const quote = getQuote(_paths, token0, curAmount);

          return {
            paths: [{ pools: _paths, amountIn: curAmount } as Path],
            tokenIn: token0,
            tokenOut: token1,
            amountIn: curAmount,
            percent: percents[i],
            amountOut: BigInt(quote),
            gasEstimate: 0n,
          };
        }),
      ),
    )
  ).filter((route): route is RouteWithQuote => route !== null);

  routesWithQuote.sort((a, b) => (a.amountOut > b.amountOut ? -1 : 1));

  routesWithQuote.forEach((route) => {
    if (route.percent < 100) {
      let remainPercent = 100 - route.percent;

      while (remainPercent > 0) {
        const remainRoute = routesWithQuote.find((r) => r.percent <= remainPercent && r.amountOut > 0);
        if (!remainRoute) break;

        remainPercent -= remainRoute.percent;
        route.amountIn += remainRoute.amountIn;
        route.amountOut += remainRoute.amountOut;
        route.paths.push(remainRoute.paths[0]);
        route.percent += remainRoute.percent;
      }
    }
  });

  const filteredRoutes = routesWithQuote.filter((route) => {
    const uniquePaths = new Set(route.paths.map((path) => path.pools.join(",")));
    return uniquePaths.size === route.paths.length;
  });

  return filteredRoutes.filter((route) => route.percent === 100).sort((a, b) => (a.amountOut > b.amountOut ? -1 : 1));
}

async function getRoutesWithQuote(routes: RouteWithQuote[]): Promise<RouteWithQuote[]> {
  return await Promise.all(
    routes.map(async (route) => {
      const { tokenIn, paths } = route;

      let amountOut = 0n;
      let gasEstimate = 0n;

      for (const path of paths) {
        const { pools, amountIn } = path;
        const quote = await getAmountOut(pools, tokenIn, amountIn);
        amountOut += quote.amountOut;
        gasEstimate += quote.gasEstimate;
      }

      return { ...route, amountOut, gasEstimate };
    }),
  );
}

async function main() {
  // await update();
  const dbPools: Pool[] = JSON.parse(readFileSync("dragonswap-pools.json", "utf-8")) as unknown as Pool[];
  const klayswapPools: Pool[] = JSON.parse(readFileSync("klayswap-pools.json", "utf-8")) as unknown as Pool[];
  const neopinPools: Pool[] = JSON.parse(readFileSync("neopin-pools.json", "utf-8")) as unknown as Pool[];

  const pools = [...dbPools, ...klayswapPools, ...neopinPools]
    .filter((pool) => pool.liquidity > 0)
    .sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1));

  // WKLAY -> WETH
  // const token0 = "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432";
  // const token1 = "0x98A8345bB9D3DDa9D808Ca1c9142a28F6b0430E1";

  // WKLAY -> WIKEN
  const token0 = "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432";
  const token1 = "0x275F942985503d8CE9558f8377cC526A3aBa3566";

  // BORA -> WETH
  // const token0 = "0x02cbE46fB8A1F579254a9B485788f2D86Cad51aa";
  // const token1 = "0x98A8345bB9D3DDa9D808Ca1c9142a28F6b0430E1";

  // WKAIA -> BORA
  // const token0 = "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432";
  // const token1 = "0x02cbE46fB8A1F579254a9B485788f2D86Cad51aa";

  // sBWPM -> AWM
  // const token0 = "0xF4546E1D3aD590a3c6d178d671b3bc0e8a81e27d";
  // const token1 = "0x3043988Aa54bb3ae4DA60EcB1DC643c630A564F0";

  // 설정
  const amountIn = ethers.parseEther("2");
  const maxHops = 4;

  const allPaths = findSwapPaths(token0, token1, pools, maxHops);
  writeFileSync("all-paths.json", JSON.stringify(allPaths, replacer, 2));
  console.log("all paths:", allPaths.length);

  const routes = await getCandidateRoutes(token0, token1, amountIn, allPaths);
  writeFileSync("routes.json", JSON.stringify(routes, replacer, 2));
  console.log("candidate routes:", routes.length);

  const routesWithQuote = (await getRoutesWithQuote(routes)).sort((a, b) => (a.amountOut > b.amountOut ? -1 : 1));
  writeFileSync("routes-with-quote.json", JSON.stringify(routesWithQuote, replacer, 2));

  const { paths, amountOut, gasEstimate } = routesWithQuote[0];
  const _path = paths
    .map((path) => {
      let currency = token0;
      return path.pools
        .map((pool) => {
          const nextCurrency = currency === pool.token0 ? pool.token1 : pool.token0;
          const sp = pool.pairName.split("_");
          const from = currency === pool.token0 ? 0 : 1;
          const to = ~from & 1;
          const fromToken = sp[from];
          const toToken = sp[to];

          currency = nextCurrency;

          return `${fromToken} -> ${toToken} (${pool.dexName}, ${pool.type}, ${pool.pool})`;
        })
        .join("\n -> ");
    })
    .join("\n");

  console.log();
  console.log(`Route: \n${_path}`);
  console.log(`Out: ${ethers.formatEther(amountOut)}`);
  console.log(`gas: ${gasEstimate}`);

  const PRECISION = 10000n;
  const slippage = 100n;
  const recipient = "0xF783145cf9cb337e1017EA65C6AFd7d8fdB04e6C";
  const params: MultiPathSwapParams = {
    paths: [],
    amountOutMinimum: BigInt((amountOut * (PRECISION - slippage)) / PRECISION),
  };

  for (const path of paths) {
    const { pools, amountIn } = path;
    const encodedPath = encodeRoute(pools, token0);
    const flag = pools.map((pool) => (pool.type === DexVersion.V3 ? 0 : 1));
    const dex = pools.map((pool) => pool.dex);

    params.paths.push({
      recipient,
      path: encodedPath,
      flag,
      dex,
      amountIn,
    } as MixedSwapParams);
  }

  const out = await multiPathSwap(params);

  console.log();
  console.log(`Actual out: ${ethers.formatEther(out)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
