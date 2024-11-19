import csvParser from "csv-parser";
import { createReadStream, createWriteStream, readFileSync } from "fs";

const POINT_DATA_FILE = "data/catalist-point-data.csv";
const POINT_AIRDROP_AMOUNT = 30000000;
const PLANET_NFT_HOLDER_AIRDROP_AMOUNT = 10000000;
const CATALIST_USER_AIRDROP_AMOUNT = 10000000;

interface AirdropInfo {
  point: number;
  planet: number;
  catalist: number;
  total: number;
}

interface PointCSVRow {
  address: string;
  point: number;
  ratio: number;
}

async function readPointData(): Promise<PointCSVRow[]> {
  return new Promise((resolve, reject) => {
    const results: PointCSVRow[] = [];

    createReadStream(POINT_DATA_FILE)
      .pipe(csvParser())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

function saveAirdropResultAsCSV(
  filePath: string,
  data: { address: string; point: number; planet: number; catalist: number; total: number }[],
) {
  const stream = createWriteStream(filePath);
  const headers = ["address", "point", "planet", "catalist", "total"];

  stream.write(headers.join(",") + "\n");

  for (const row of data) {
    const line = [row.address, row.point, row.planet, row.catalist, row.total].join(",");
    stream.write(line + "\n");
  }

  stream.end();
}

async function main() {
  const users: { [address: string]: AirdropInfo } = {};

  const pointData = await readPointData();

  for (const row of pointData) {
    const address = row.address;
    const point = row.point;
    const ratio = row.ratio;

    if (point < 1) {
      continue;
    }

    const amount = POINT_AIRDROP_AMOUNT * ratio;

    users[address] = {
      point: point,
      planet: 0,
      catalist: 0,
      total: Number(amount),
    };
  }

  const planetNftHolderAddresses = readFileSync("data/planet-holder-address.csv")
    .toString()
    .split("\n")
    .map((addr) => addr.trim())
    .filter((addr) => addr);

  const totalPlanetHolder = planetNftHolderAddresses.length;
  const planetAirdropAmount = PLANET_NFT_HOLDER_AIRDROP_AMOUNT / totalPlanetHolder;

  for (const address of planetNftHolderAddresses) {
    if (!users[address.replace(/\"/g, "")]) {
      users[address.replace(/\"/g, "")] = {
        point: 0,
        planet: 0,
        catalist: 0,
        total: 0,
      };
    }

    users[address.replace(/\"/g, "")].planet = planetAirdropAmount;
    users[address.replace(/\"/g, "")].total += planetAirdropAmount;
  }

  const catalistUserAddresses = readFileSync("data/catalist-staker-address.csv")
    .toString()
    .split("\n")
    .map((addr) => addr.trim())
    .filter((addr) => addr);

  const totalCatalistUser = catalistUserAddresses.length;
  const catalistAirdropAmount = CATALIST_USER_AIRDROP_AMOUNT / totalCatalistUser;

  for (const address of catalistUserAddresses) {
    if (!users[address.replace(/\"/g, "")]) {
      users[address.replace(/\"/g, "")] = {
        point: 0,
        planet: 0,
        catalist: 0,
        total: 0,
      };
    }

    users[address.replace(/\"/g, "")].catalist = catalistAirdropAmount;
    users[address.replace(/\"/g, "")].total += catalistAirdropAmount;
  }

  const result = Object.entries(users).map(([address, data]) => ({
    address,
    ...data,
  }));

  saveAirdropResultAsCSV("data/airdrop-result.csv", result);

  console.log("Airdrop data saved successfully.");
}

main().catch(console.error);
