import { ethers } from "ethers";
import { writeFileSync } from "fs";

interface Pool {
  token0: string;
  token1: string;
  pool: string;
}

async function main() {
  const provider = new ethers.JsonRpcProvider("https://kaia.blockpi.network/v1/rpc/public");

  const dex = "neopin";
  const address = "0x1a1F14ec33BF8c2e66731f46D0A706e8025b43e9";
  const abi = ["event PairCreated(address indexed token0, address indexed token1, address pair, uint256)"];

  const contract = new ethers.Contract(address, abi, provider);
  const filter = contract.filters.PairCreated();

  const startBlock = 97092681;
  const endBlock = await provider.getBlockNumber();
  const step = 30000;
  const pools: Pool[] = [];

  console.log(`Fetching events from block ${startBlock} to ${endBlock} in steps of ${step}...`);

  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += step) {
    const toBlock = Math.min(fromBlock + step - 1, endBlock);
    console.log(`Querying events from block ${fromBlock} to ${toBlock}...`);
    const events = await contract.queryFilter(filter, fromBlock, toBlock);

    events.forEach((event) => {
      const { token0, token1, pair, totalPools } = contract.interface.parseLog(event)!.args;
      pools.push({ token0, token1, pool: pair });
    });
  }

  const replacer = (_key: any, value: { toString: () => any }) =>
    typeof value === "bigint" ? value.toString() : value;

  console.log(`Saving ${pools.length} pools to ${dex}-pools.json...`);
  writeFileSync(`${dex}-pools.json`, JSON.stringify(pools, replacer, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
