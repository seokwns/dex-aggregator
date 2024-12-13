import { ethers } from "hardhat";

async function main() {
  const routeQuoter = await ethers.deployContract("RouteQuoter");
  await routeQuoter.waitForDeployment();

  console.log(`RouteQuoter deployed to: ${routeQuoter.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
