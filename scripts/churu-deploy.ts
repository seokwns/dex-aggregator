import { ethers } from "hardhat";

async function main() {
  const [, deployer] = await ethers.getSigners();
  // ------------------ Deploy ------------------
  // const ChuruToken = await ethers.getContractFactory("ChuruToken");
  // const churuToken = await ChuruToken.deploy();

  // console.log("Churu Token deployed to:", churuToken.target);

  // ------------------ Mint ------------------

  const amount = 0.001 * 12 * (1933876 - 1717876);
  let churuContract = await ethers.getContractAt("ChuruToken", "0x51514058C31be38068B4781460F31AB9006bDE0A");
  churuContract = churuContract.connect(deployer);

  // await churuContract.mint("0x20a22E6579f6Ed3ffd8DFDe526DF1A967edd0007", ethers.utils.parseEther("5000000"));
  // await churuContract.mint("0x26AC28D33EcBf947951d6B7d8a1e6569eE73d076", ethers.utils.parseEther("5000000"));
  await churuContract.mint("0xff3a3515c7e3dc98fd030167805766269f846c96", ethers.parseEther(amount.toString()), {
    gasLimit: 1000000,
    gasPrice: 10000000,
  });

  // await churuContract.approve("0x284617f7E9B6f443eF6d62159175588A043d362c", ethers.constants.MaxUint256, {
  //   gasLimit: 1000000,
  //   gasPrice: 10000000,
  // });

  // ------------------ Transfer ------------------
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
