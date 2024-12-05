import { ethers } from "hardhat";

async function transferToken(name: string, symbol: string) {
  const token = await ethers.deployContract("TestToken", [name, symbol]);
  await token.waitForDeployment();

  console.log();
  console.log(`${symbol} token deployed to: ${token.target}`);
}

async function main() {
  const address = "0x2B0a9F2d1A56A6827EE3087c6C518e7263758D10";
  const receipient = "0x26AC28D33EcBf947951d6B7d8a1e6569eE73d076";
  const amount = ethers.parseEther("100");

  const token = await ethers.getContractAt("TestToken", address);
  const tx = await token.mint(receipient, amount);
  await tx.wait();

  console.log(`Minted token ${address} amount ${amount} to ${receipient}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
