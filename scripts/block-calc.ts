import { ethers } from "ethers";

async function getFutureBlock(futureDate: string) {
  const provider = new ethers.JsonRpcProvider("https://endurance2-rpc-partner.archivenode.club/");

  const currentBlock = await provider.getBlock("latest");
  const currentBlockNumber = currentBlock!.number;
  const currentTimestamp = currentBlock!.timestamp;

  const futureTimestamp = Math.floor(new Date(futureDate).getTime() / 1000);

  const averageBlockTime = 12;

  const blocksToAdd = Math.ceil((futureTimestamp - currentTimestamp) / averageBlockTime);
  const futureBlockNumber = currentBlockNumber + blocksToAdd;

  console.log();
  console.log(`현재 블록: ${currentBlockNumber}`);
  console.log(`현재 타임스탬프: ${new Date(currentTimestamp * 1000).toISOString()}`);
  console.log(`예상되는 미래 블록 (${futureDate}): ${futureBlockNumber}`);
}

async function main() {
  console.log(ethers.formatUnits("59279350217679189084", 18));
  // await getFutureBlock("2024-11-25T06:00:00Z");
  await getFutureBlock("2024-12-03T06:00:00Z");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
