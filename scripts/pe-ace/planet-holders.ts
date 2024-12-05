import { ethers } from "ethers";
import { writeFileSync } from "fs";
import { writeFile } from "fs/promises";

const { ENDURANCE_DEPLOYER } = process.env;

interface Attribute {
  trait_type: string;
  value: string;
}

interface Metadata {
  name: string;
  description: string;
  image: string;
  attributes: Attribute[];
  external_url: string;
  background_color: string;
}

interface ErrorData {
  tokenId: string;
  owner: string;
  tokenURI: string;
}

async function fetchTokenURI(uri: string): Promise<Metadata> {
  try {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata from ${uri}`);
    }

    const data = await response.json();
    return data as Metadata;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider("https://endurance2-rpc-partner.archivenode.club/");
  const wallet = new ethers.Wallet(ENDURANCE_DEPLOYER!, provider);

  console.log(`Wallet address: ${wallet.address}`);

  const planet = new ethers.Contract(
    "0x7Db2EE56b2C19EA0758631C24415ce3A5ec498F5",
    [
      "function ownerOf(uint256 tokenId) external view returns (address owner)",
      "function totalSupply() external view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
      "function tokenByIndex(uint256 index) external view returns (uint256)",
      "function tokenURI(uint256 tokenId) external view returns (string memory)",
    ],
    wallet,
  );

  const totalSupply = await planet.totalSupply();
  console.log(`FusionistPlanet Total supply: ${totalSupply.toString()}`);

  const holders: { [owner: string]: { count: number; data: Metadata[] } } = {};
  const errors: ErrorData[] = [];

  const tasks = [];
  for (let i = 0; i < totalSupply; i++) {
    tasks.push(
      (async () => {
        const tokenId = await planet.tokenByIndex(i);
        const owner = await planet.ownerOf(tokenId);
        console.log(`Token ID: ${tokenId.toString()} Owner: ${owner}`);

        const tokenURI = await planet.tokenURI(tokenId);
        try {
          const metadata = await fetchTokenURI(tokenURI);

          if (holders[owner]) {
            holders[owner].count++;
            holders[owner].data.push(metadata);
          } else {
            holders[owner] = { count: 1, data: [metadata] };
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for token ID ${tokenId}`);
          errors.push({ tokenId: tokenId.toString(), owner, tokenURI } as ErrorData);
        }
      })(),
    );
  }

  await Promise.all(tasks);

  console.log(`Total holders: ${Object.keys(holders).length}`);

  try {
    await writeFileSync("holders.json", JSON.stringify(holders));
    console.log("Holders data saved successfully.");

    await writeFileSync("errors.json", JSON.stringify(errors));
    console.log("Errors data saved successfully.");

    const error_holders = errors.map((error) => error.owner);
    const full_holders = Object.keys(holders).concat(error_holders);
    const holders_set = new Set(full_holders);

    const results = Array.from(holders_set).map((holder) => {
      address: holder;
      planet_airdrop: 2025.5215718047;
    });
    writeFileSync("holder-address.csv", results.join("\n"));
    console.log(`Holder addresses saved successfully, total: ${holders_set.size}`);
  } catch (error) {
    console.error("Error writing files:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
