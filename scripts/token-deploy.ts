import { ethers } from "hardhat";

async function main() {
  const [deployer, test1] = await ethers.getSigners();
  // ------------------ Deploy ------------------
  const usdc = await ethers.deployContract("TestToken", ["USDC", "USDC"]);
  await usdc.waitForDeployment();

  console.log();
  console.log(`USDC deployed to: ${usdc.target}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
