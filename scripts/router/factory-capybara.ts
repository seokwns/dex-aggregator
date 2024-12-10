import { ethers } from "ethers";
import { writeFileSync } from "fs";

interface Pool {
  token0: string;
  token1: string;
  fee: number;
  tickSpacing: number;
  pool: string;
}

async function main() {
  const provider = new ethers.JsonRpcProvider("https://kaia.blockpi.network/v1/rpc/public");
  const address = "0x7431a23897eca6913d5c81666345d39f27d946a4";
  const abi = [
    "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
  ];

  const contract = new ethers.Contract(address, abi, provider);
  const filter = contract.filters.PoolCreated();

  const startBlock = 145315248;
  const endBlock = await provider.getBlockNumber();
  const step = 500000;
  const pools: Pool[] = [];

  console.log(`Fetching events from block ${startBlock} to ${endBlock} in steps of ${step}...`);

  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += step) {
    const toBlock = Math.min(fromBlock + step - 1, endBlock); // 조회할 끝 블록 계산
    console.log(`Querying events from block ${fromBlock} to ${toBlock}...`);
    const events = await contract.queryFilter(filter, fromBlock, toBlock);

    events.forEach((event) => {
      const { token0, token1, fee, tickSpacing, pool } = contract.interface.parseLog(event)!.args;
      pools.push({ token0, token1, fee, tickSpacing, pool });
    });
  }

  const replacer = (_key: any, value: { toString: () => any }) =>
    typeof value === "bigint" ? value.toString() : value;

  console.log(`Saving ${pools.length} pools to dg-pools.json...`);
  writeFileSync("dg-pools.json", JSON.stringify(pools, replacer, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
