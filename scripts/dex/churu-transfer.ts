import { ethers } from "hardhat";

async function main() {
  const [deployer, test1] = await ethers.getSigners();

  const churu = await ethers.getContractAt("ChuruToken", "0xbD079ed7e48B89d64A23D57A9A75f29174907BDD");
  const balance = await churu.balanceOf(deployer.address);
  await churu.transfer("0xE4958fB732a21809607B9468734e0156b956C4cf", balance);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
