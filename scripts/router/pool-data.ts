import { ethers } from "ethers";
import { writeFileSync } from "fs";
import dgPools from "../../data/dg-pools";
import klayPools from "../../data/klay-pools";
import neopinPools from "../../data/neopin-pools";
import { DexVersion, V2Pool, V3Pool } from "./types";

const provider = new ethers.JsonRpcProvider("https://kaia.blockpi.network/v1/rpc/public");
const tokenAbi = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint)",
  "function balanceOf(address) view returns (uint)",
];
const replacer = (_key: any, value: { toString: () => any }) => (typeof value === "bigint" ? value.toString() : value);

const v3Dexes = [
  {
    name: "dragonswap",
    pools: dgPools as unknown as V3Pool[],
    version: DexVersion.V3,
  },
  {
    name: "klayswap",
    pools: klayPools as unknown as V3Pool[],
    version: DexVersion.V3,
  },
];

const v2Dexes = [
  {
    name: "neopin",
    pools: neopinPools as unknown as V2Pool[],
    version: DexVersion.V2,
  },
];

async function getV3PoolData(): Promise<void> {
  const v3PoolAbi = [
    "function liquidity() view returns (uint)",
    "function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)",
  ];

  for (const dex of v3Dexes) {
    const pools = dex.pools;
    for (let i = 0; i < pools.length; i++) {
      const token0 = new ethers.Contract(pools[i].token0, tokenAbi, provider);
      const token1 = new ethers.Contract(pools[i].token1, tokenAbi, provider);

      const pool = new ethers.Contract(pools[i].pool, v3PoolAbi, provider);
      pools[i].liquidity = await pool.liquidity();

      if (BigInt(pools[i].liquidity) === 0n) {
        console.log(`skip pool ${pools[i].pool} with 0 liquidity`);
        continue;
      }

      const token0Symbol = await token0.symbol();
      const token1Symbol = await token1.symbol();

      const token0Decimals = await token0.decimals();
      const token1Decimals = await token1.decimals();

      const token0Balance = await token0.balanceOf(pools[i].pool);
      const token1Balance = await token1.balanceOf(pools[i].pool);

      pools[i].token0Decimals = token0Decimals;
      pools[i].token1Decimals = token1Decimals;

      pools[i].token0Balance = token0Balance;
      pools[i].token1Balance = token1Balance;

      pools[i].type = dex.version!.valueOf();
      pools[i].pairName = `${token0Symbol}_${token1Symbol}`;
      pools[i].dex = dex.name;

      const slot0 = await pool.slot0();
      pools[i].sqrtPriceX96 = slot0[0].toString();
      pools[i].tick = slot0[1];
    }

    console.log(`Saving ${pools.length} pools to ${dex.name}-pools.json...`);
    writeFileSync(`${dex.name}-pools.json`, JSON.stringify(pools, replacer, 2));
  }
}

async function getV2PoolData(): Promise<void> {
  const v2PoolAbi = [
    "function kLast() view returns (uint)",
    "function getReserves() public view returns (uint, uint, uint)",
  ];

  for (const dex of v2Dexes) {
    const pools = dex.pools;
    for (let i = 0; i < pools.length; i++) {
      const token0 = new ethers.Contract(pools[i].token0, tokenAbi, provider);
      const token1 = new ethers.Contract(pools[i].token1, tokenAbi, provider);

      const token0Symbol = await token0.symbol();
      const token1Symbol = await token1.symbol();

      const pool = new ethers.Contract(pools[i].pool, v2PoolAbi, provider);
      const [reserve0, reserve1] = await pool.getReserves();

      pools[i].reserve0 = reserve0;
      pools[i].reserve1 = reserve1;
      pools[i].liquidity = Math.sqrt(Number(reserve0 * reserve1));

      if (BigInt(Math.floor(pools[i].liquidity)) === 0n) {
        console.log(`skip pool ${pools[i].pool} with 0 liquidity`);
        continue;
      }

      const token0Decimals = await token0.decimals();
      const token1Decimals = await token1.decimals();

      pools[i].token0Decimals = token0Decimals;
      pools[i].token1Decimals = token1Decimals;

      pools[i].type = dex.version!.valueOf();
      pools[i].pairName = `${token0Symbol}-${token1Symbol}`;
      pools[i].dex = dex.name;
      pools[i].kLast = await pool.kLast();
    }

    console.log(`Saving ${pools.length} pools to ${dex.name}-pools.json...`);
    writeFileSync(`${dex.name}-pools.json`, JSON.stringify(pools, replacer, 2));
  }
}

export async function update(): Promise<void> {
  await getV3PoolData();
  await getV2PoolData();
}

async function main(): Promise<void> {
  await update();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
