import { ethers } from "hardhat";

async function main() {
  const poolLocatorAddress = "0x74FCBa35d2Ba95be54Df9Df1344E52e0C1bdcEb2";

  const routeQuoter = await ethers.deployContract("RouteQuoter", [poolLocatorAddress]);
  await routeQuoter.waitForDeployment();

  console.log(`RouteQuoter deployed to: ${routeQuoter.target}`);

  const smartRouter = await ethers.deployContract("SmartRouter", [
    poolLocatorAddress,
    "0x19aac5f612f524b754ca7e7c41cbfa2e981a4432",
  ]);
  await smartRouter.waitForDeployment();

  console.log(`SmartRouter deployed to: ${smartRouter.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
