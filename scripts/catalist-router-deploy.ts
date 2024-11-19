import { ethers } from "hardhat";

async function main() {
  const pancakeRouterFactory = await ethers.getContractFactory("CatalistRouter");
  const pancakeRouter = await pancakeRouterFactory.deploy(
    "0x9a9401ba69A0BEB644591F570C039Ef0e1Ce6529",
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
