import { ethers } from "hardhat";

async function createToken(name: string, symbol: string) {
  const token = await ethers.deployContract("TestToken", [name, symbol]);
  await token.waitForDeployment();

  console.log();
  console.log(`${symbol} token deployed to: ${token.target}`);
}

async function main() {
  await createToken("MK1", "MK1");
  await createToken("MK2", "MK2");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
