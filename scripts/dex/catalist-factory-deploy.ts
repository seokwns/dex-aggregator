import { ethers } from "hardhat";

async function main() {
  const pancakeFactory = await ethers.getContractFactory("CatalistFactory");
  const FEE_TO_SETTER = "0x239849fFF256b9812e61757Ed02A35D375021083";
  const factory = await pancakeFactory.deploy(FEE_TO_SETTER);

  console.log();
  console.log("CatalistFactory deployed to:", factory.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
