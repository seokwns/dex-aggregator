import { ethers } from "ethers";
import { writeFileSync } from "fs";

interface V3Pool {
  token0: string;
  token1: string;
  fee: number;
  tickSpacing: number;
  pool: string;
}

interface V2Pool {
  token0: string;
  token1: string;
  lpToken: string;
  borrowFactor: number;
  liquidationFactor: number;
  borrowable0: boolean;
  borrowable1: boolean;
  pool: string;
}

const replacer = (_key: any, value: { toString: () => any }) => (typeof value === "bigint" ? value.toString() : value);

async function getV3Pools(): Promise<V3Pool[]> {
  const provider = new ethers.JsonRpcProvider("https://kaia.blockpi.network/v1/rpc/public");
  const address = "0xa15be7e90df29a4aead0c7fc86f7a9fbe6502ac9";
  const abi = [
    "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool, uint256 exid)",
  ];

  const contract = new ethers.Contract(address, abi, provider);
  const filter = contract.filters.PoolCreated();

  const startBlock = 124342981;
  const endBlock = await provider.getBlockNumber();
  const step = 100000;
  const pools: V3Pool[] = [];

  console.log(`Fetching events from block ${startBlock} to ${endBlock} in steps of ${step}...`);

  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += step) {
    const toBlock = Math.min(fromBlock + step - 1, endBlock);
    console.log(`Querying events from block ${fromBlock} to ${toBlock}...`);
    const events = await contract.queryFilter(filter, fromBlock, toBlock);

    events.forEach((event) => {
      const { token0, token1, fee, tickSpacing, pool, exid } = contract.interface.parseLog(event)!.args;
      pools.push({ token0, token1, fee, tickSpacing, pool });
    });
  }

  return pools;
}

async function getV2Pools(): Promise<V2Pool[]> {
  const provider = new ethers.JsonRpcProvider("https://kaia.blockpi.network/v1/rpc/public");
  const address = "0x01431f2a0d8c25646d1995e9ad345581d523341d";
  const abi = [
    "event CreatePool(address tokenA, address tokenB, address lpToken, uint borrowFactor, uint liquidationFactor, bool borrowableA, bool borrowableB, address poolAddress, uint exid)",
  ];

  const contract = new ethers.Contract(address, abi, provider);
  const filter = contract.filters.CreatePool();

  const startBlock = 78705176;
  // const endBlock = await provider.getBlockNumber();
  const endBlock = 143073049;
  const step = 100000;
  const pools: V2Pool[] = [];

  console.log(`Fetching events from block ${startBlock} to ${endBlock} in steps of ${step}...`);

  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += step) {
    const toBlock = Math.min(fromBlock + step - 1, endBlock);
    console.log(`Querying events from block ${fromBlock} to ${toBlock}...`);
    const events = await contract.queryFilter(filter, fromBlock, toBlock);

    events.forEach((event) => {
      const { tokenA, tokenB, lpToken, borrowFactor, liquidationFactor, borrowableA, borrowableB, poolAddress, exid } =
        contract.interface.parseLog(event)!.args;
      pools.push({
        token0: tokenA,
        token1: tokenB,
        lpToken,
        borrowFactor,
        liquidationFactor,
        borrowable0: borrowableA,
        borrowable1: borrowableB,
        pool: poolAddress,
      });
    });
  }

  return pools;
}

async function main() {
  // const v3Pools = await getV3Pools();
  // console.log(`Saving ${v3Pools.length} pools to klayswap-pools-v3.json...`);
  // writeFileSync("klayswap-pools-v3.json", JSON.stringify(v3Pools, replacer, 2));

  const v2Pools = await getV2Pools();
  console.log(`Saving ${v2Pools.length} pools to klayswap-pools-v2.json...`);
  writeFileSync("klayswap-pools-v2.json", JSON.stringify(v2Pools, replacer, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
