import { HardhatUserConfig } from "hardhat/config";
import "hardhat-abi-exporter";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const { ENDURANCE_DEPLOYER, TEST_1, TEST_2, TEST_3, TEST_4, TEST_5 } = process.env;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    endurance: {
      url: "https://endurance2-rpc-partner.archivenode.club/",
      chainId: 648,
      accounts: [ENDURANCE_DEPLOYER!],
    },
    kairos: {
      chainId: 1001,
      url: "https://kaia-kairos.blockpi.network/v1/rpc/public",
      gasPrice: 25000000000,
      accounts: [TEST_1!, TEST_2!, TEST_3!, TEST_4!, TEST_5!],
    },
    kaia: {
      chainId: 8217,
      url: "https://public-en.node.kaia.io",
      gasPrice: 25000000000,
      accounts: [TEST_1!, TEST_2!, TEST_3!, TEST_4!, TEST_5!],
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  etherscan: {
    apiKey: "Y4A5HJURG69NR77IGE8YZWZDZZMDFX3JNQ",
    customChains: [
      {
        network: "endurance",
        chainId: 648,
        urls: {
          apiURL: "https://explorer-endurance.fusionist.io/api",
          browserURL: "https://explorer-endurance.fusionist.io",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  abiExporter: {
    path: "./abi",
    clear: true,
    flat: false,
  },
};

export default config;
