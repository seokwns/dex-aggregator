import { ethers } from "ethers";
import { writeFileSync } from "fs";
import dgPools from "../../data/dg-pools";
import klayPools from "../../data/klay-pools";
import neopinPools from "../../data/neopin-pools";

const provider = new ethers.JsonRpcProvider("https://kaia.blockpi.network/v1/rpc/public");
const tokenAbi = ["function symbol() view returns (string)"];
const replacer = (_key: any, value: { toString: () => any }) => (typeof value === "bigint" ? value.toString() : value);

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

      if (pools[i].liquidity === 0) {
        console.log(`skip pool ${pool.getAddress()} with 0 liquidity`);
        continue;
      }

      const token0Symbol = await token0.symbol();
      const token1Symbol = await token1.symbol();

      pools[i].type = dex.version!.valueOf();
      pools[i].pairName = `${token0Symbol}-${token1Symbol}`;
      pools[i].dex = dex.name;

      const slot0 = await pool.slot0();
      pools[i].sqrtPriceX96 = slot0[0].toString();
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

      if (pools[i].liquidity === 0) {
        console.log(`skip pool ${pool.getAddress()} with 0 liquidity`);
        continue;
      }

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
