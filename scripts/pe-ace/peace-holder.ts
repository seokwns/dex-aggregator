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

  const contract = new ethers.Contract(
    "0xaf8Ef2B180fe7CADe68643705adAe08d1d2791A1",
    ["function ownerAt(uint256 id) external view returns (address)"],
    wallet,
  );

  const totalSupply = 10000;
  console.log(`PeACE Total supply: ${totalSupply.toString()}`);

  const holders: string[] = [];

  for (let i = 0; i <= totalSupply; i++) {
    const owner = await contract.ownerAt(i);
    console.log(`PeACE #${i} owner: ${owner}`);
    if (owner != ethers.ZeroAddress) holders.push(owner);
  }

  console.log(`Total holders: ${holders.length}`);

  try {
    const full_holders = Object.keys(holders);
    const holders_set = new Set(full_holders);

    const results = Array.from(holders_set);

    writeFileSync("PeACE-holder-address.csv", results.join(",\n"));
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
