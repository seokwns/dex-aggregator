import { ethers } from "hardhat";

async function main() {
  const [deployer, test1] = await ethers.getSigners();
  // ------------------ Deploy ------------------
  const weth9 = await ethers.deployContract("WETH9");
  await weth9.waitForDeployment();

  console.log();
  console.log(`WETH9 deployed to: ${weth9.target}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
