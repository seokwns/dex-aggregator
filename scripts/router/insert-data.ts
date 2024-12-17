import { ethers } from "hardhat";
import { Pool, V2Pool, V3Pool } from "./types";
import { readFileSync } from "fs";

async function main() {
  const routeQuoterAddress = "0x718A983a0612BAc700AE9F46220A6E5C292020B9";
  const routeQuoter = await ethers.getContractAt("RouteQuoter", routeQuoterAddress);

  const dbPools: Pool[] = JSON.parse(readFileSync("dragonswap-pools.json", "utf-8")) as unknown as Pool[];
  const klayswapPools: Pool[] = JSON.parse(readFileSync("klayswap-pools.json", "utf-8")) as unknown as Pool[];
  const neopinPools: Pool[] = JSON.parse(readFileSync("neopin-pools.json", "utf-8")) as unknown as Pool[];

  const pools = [...dbPools, ...klayswapPools, ...neopinPools].sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1));

  const v3Pools = pools.filter((pool) => pool.type === "v3") as V3Pool[];
  // const v2Pools = pools.filter((pool) => pool.type === "v2") as V2Pool[];

  const chunkSize = 100;
  const chunkedV3Pools = Array.from({ length: Math.ceil(v3Pools.length / chunkSize) }, (_, i) =>
    v3Pools.slice(i * chunkSize, i * chunkSize + chunkSize),
  );

  for (const chunk of chunkedV3Pools) {
    const tx = await routeQuoter.insertV3Pools(
      chunk.map((pool) => pool.token0),
      chunk.map((pool) => pool.token1),
      chunk.map((pool) => pool.fee),
      chunk.map((pool) => pool.dex),
      chunk.map((pool) => pool.pool),
      {
        gasLimit: 10000000,
        gasPrice: 25000000000,
      },
    );

    await tx.wait();
    console.log(`Inserted ${chunk.length} V3 pools`);
  }

  // await routeQuoter.insertV2Pools(
  //   v2Pools.map((pool) => pool.token0),
  //   v2Pools.map((pool) => pool.token1),
  //   v2Pools.map((pool) => pool.pool),
  //   {
  //     gasLimit: 10000000,
  //     gasPrice: 25000000000,
  //   },
  // );

  console.log("Insert data completed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
