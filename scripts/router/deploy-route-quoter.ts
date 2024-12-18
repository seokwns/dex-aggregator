import { ethers } from "hardhat";

async function main() {
  const poolLocator = await ethers.deployContract("PoolLocator");
  await poolLocator.waitForDeployment();

  console.log(`PoolLocator deployed to: ${poolLocator.target}`);

  const routeQuoter = await ethers.deployContract("RouteQuoter");
  await routeQuoter.waitForDeployment();

  console.log(`RouteQuoter deployed to: ${routeQuoter.target}`);

  const smartRouter = await ethers.deployContract("SmartRouter", [
    poolLocator.target,
    "0x19aac5f612f524b754ca7e7c41cbfa2e981a4432",
  ]);
  await smartRouter.waitForDeployment();

  console.log(`SmartRouter deployed to: ${smartRouter.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
