import { ethers, network } from "hardhat";

const main = async () => {
  const SousChefFactory = await ethers.getContractFactory("SousChef");

  const sousChef = await SousChefFactory.deploy(
    "0x51514058C31be38068B4781460F31AB9006bDE0A",
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
