import { ethers } from "hardhat";

async function main() {
  const [deployer, test1] = await ethers.getSigners();

  let churuContract = await ethers.getContractAt("ChuruToken", "0x51514058C31be38068B4781460F31AB9006bDE0A");
  churuContract = churuContract.connect(test1);

  await churuContract.mint("0xD36e9846640E4Ed628AeB20C7c77873EA954445b", ethers.parseEther("900"));

  churuContract = churuContract.connect(deployer);
  await churuContract.approve("0x0E380af4504590AF8D326d951546666F543d20c5", ethers.MaxUint256, {
    gasLimit: 1000000,
    gasPrice: 10000000,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
