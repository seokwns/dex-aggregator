import { ethers, network } from "hardhat";

const main = async () => {
  const SousChefFactory = await ethers.getContractFactory("SousChef");

  const sousChef = await SousChefFactory.deploy(
    "0xB32Fa5d2c09c127130B0ba61F0cd15eC283A8fc0",
    ethers.parseEther("1"),
    1717876,
    1933876,
  );
  await sousChef.waitForDeployment();

  console.log(`SousChef deployed to: ${sousChef.target}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
