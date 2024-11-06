import { ethers } from "hardhat";
import { ChuruToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

async function deployTexture() {
  const [deployer, dex, tester1, tester2] = await ethers.getSigners();

  const churuToken = await ethers.deployContract("ChuruToken", [dex.address]);
  await churuToken.waitForDeployment();

  return { churuToken, deployer, dex, tester1, tester2 };
}

describe("ChuruToken", () => {
  let churuToken: ChuruToken;
  let deployer: HardhatEthersSigner;
  let dex: HardhatEthersSigner;
  let tester1: HardhatEthersSigner;
  let tester2: HardhatEthersSigner;

  before(async () => {
    ({ churuToken, deployer, dex, tester1, tester2 } = await loadFixture(deployTexture));
  });

  it("Should mint total supply to deployer", async () => {
    const mintedSupply = await churuToken.totalSupply();
    const TOTAL_SUPPLY = await churuToken.TOTAL_SUPPLY();
    expect(mintedSupply).to.equal(TOTAL_SUPPLY);

    const deployerBalance = await churuToken.balanceOf(deployer.address);
    expect(deployerBalance).to.equal(TOTAL_SUPPLY);
  });

  it("Should 10% burn if transfer to dex", async () => {
    expect(await churuToken.transfer(dex.address, ethers.parseEther("10"))).to.emit(churuToken, "Transfer");

    const dexBalance = await churuToken.balanceOf(dex.address);
    expect(dexBalance).to.equal(ethers.parseEther("9"));

    const BURNER = await churuToken.BURNER();
    const burnBalance = await churuToken.balanceOf(BURNER);
    expect(burnBalance).to.equal(ethers.parseEther("1"));
  });

  it("Transfer should be successful", async () => {
    const amount = ethers.parseEther("100");
    expect(await churuToken.transfer(tester1.address, amount)).to.emit(churuToken, "Transfer");
  });

  it("Delegate should be successful", async () => {
    expect(await churuToken.connect(tester1).delegate(tester2.address)).to.emit(churuToken, "DelegateChanged");
    const delegate = await churuToken.delegates(tester1.address);
    expect(delegate).to.equal(tester2.address);
  });

  it("Tester1 cannot vote", async () => {
    const currentVotes = await churuToken.getCurrentVotes(tester1.address);
    expect(currentVotes).to.equal(0);
  });

  it("Tester2 have 100 votes", async () => {
    const currentVotes = await churuToken.getCurrentVotes(tester2.address);
    expect(currentVotes).to.equal(ethers.parseEther("100"));
  });
});
