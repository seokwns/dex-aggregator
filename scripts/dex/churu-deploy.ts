import { ethers } from "hardhat";

async function main() {
  const [deployer, test1] = await ethers.getSigners();

  // ------------------ Deploy ------------------
  const churuToken = await ethers.deployContract("ChuruToken");
  await churuToken.waitForDeployment();

  console.log(`ChuruToken deployed to: ${churuToken.target}`);

  // ------------------ Mint ------------------
  // const amount = ethers.parseEther("1000");
  // let churuContract = await ethers.getContractAt("ChuruToken", "0x51514058C31be38068B4781460F31AB9006bDE0A");

  // churuContract = churuContract.connect(test1);
  // await churuContract.mint("0xaF1B782356a270AdE014cd8540153DAA3fbec1D6", ethers.parseEther("20000000"));

  // await churuContract.approve("0xaF1B782356a270AdE014cd8540153DAA3fbec1D6", ethers.MaxUint256, {
  //   gasLimit: 1000000,
  //   gasPrice: 10000000,
  // });

  // ------------------ Transfer ------------------
  // await churuContract.transfer(test1.address, amount);
  // const balance = await churuContract.balanceOf(test1.address);
  // console.log("Transfered to test1:", test1.address);
  // console.log("Balance of test1:", ethers.formatEther(balance));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
