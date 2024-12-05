import { ethers } from "hardhat";

async function main() {
  const pancakeRouterFactory = await ethers.getContractFactory("CatalistRouter");
  const pancakeRouter = await pancakeRouterFactory.deploy(
    "0x97fFe1169794DE7549227f15608597cD02663155",
    "0xA0F15E49C19648D49769920cFD58d47b18F52be8",
  );

  console.log();
  console.log("CatalistRouter deployed to:", pancakeRouter.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
