import { ethers } from "ethers";
import { DexVersion, Pool, Quote, V2Pool, V3Pool } from "./types";

const provider = new ethers.JsonRpcProvider("https://public-en.node.kaia.io");
const wallet = new ethers.Wallet(process.env.TEST_1!, provider);
const routeQuoterAddress = "0x718A983a0612BAc700AE9F46220A6E5C292020B9";
const routeQuoter = new ethers.Contract(
  routeQuoterAddress,
  ["function quoteExactInput(bytes, uint[], uint[], uint) public view returns (uint, uint)"],
  wallet,
);

function encodeRoute(pools: Pool[], tokenIn: string): string {
  let data = ethers.getBytes("0x");

  data = ethers.getBytes(ethers.concat([data, ethers.getBytes(tokenIn)]));

  let input = tokenIn;
  let output = "";

  for (const pool of pools) {
    if (pool.type === DexVersion.V3) {
      const { token0, token1, fee } = pool as V3Pool;

      if (input === token0) {
        output = token1;
      } else {
        output = token0;
      }

      const feeBytes = ethers.zeroPadBytes(ethers.toBeHex(fee, 3), 3);
      const outputBytes = ethers.getBytes(output);
      data = ethers.getBytes(ethers.concat([data, feeBytes, outputBytes]));
    } else if (pool.type === DexVersion.V2) {
      const { token0, token1 } = pool as V2Pool;

      if (input === token0) {
        output = token1;
      } else {
        output = token0;
      }

      const feeBytes = ethers.zeroPadBytes(ethers.toBeHex(0, 3), 3);
      const outputBytes = ethers.getBytes(output);
      data = ethers.getBytes(ethers.concat([data, feeBytes, outputBytes]));
    }

    input = output;
  }

  return ethers.toBeHex(ethers.hexlify(data));
}

export async function getAmountOut(pools: Pool[], tokenIn: string, amountIn: bigint): Promise<Quote> {
  const path = encodeRoute(pools, tokenIn);
  const flag = pools.map((pool) => (pool.type === DexVersion.V3 ? 0 : 1));
  const dex = pools.map((pool) => pool.dex);

  try {
    const result = await routeQuoter.quoteExactInput.staticCall(path, flag, dex, amountIn, {
      gasLimit: 1000000,
      gasPrice: 25000000000,
    });

    return {
      amountOut: result[0],
      gasEstimate: result[1],
    };
  } catch (error) {
    return {
      amountOut: 0n,
      gasEstimate: 0n,
    };
  }
}

// async function main() {
//   const swapRoute = [
//     {
//       token0: "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432",
//       token1: "0x5C13E303a62Fc5DEdf5B52D66873f2E59fEdADC2",
//       fee: "500",
//       tickSpacing: "10",
//       pool: "0xb64BA987eD3BD9808dBCc19EE3C2A3C79A977E66",
//       liquidity: "19085490598521496226",
//       token0Decimals: "18",
//       token1Decimals: "6",
//       token0Balance: "8967645749206703607691066",
//       token1Balance: "1210593111678",
//       type: "v3",
//       pairName: "WKLAY_USDT",
//       dex: "dragonswap",
//       sqrtPriceX96: "40994638695492254582899",
//       tick: "-289503",
//     },
//     {
//       token0: "0x5C13E303a62Fc5DEdf5B52D66873f2E59fEdADC2",
//       token1: "0x98A8345bB9D3DDa9D808Ca1c9142a28F6b0430E1",
//       fee: "1000",
//       tickSpacing: "20",
//       pool: "0xAb9270593dBc94b13F76C960496865Dd87C06489",
//       liquidity: "214092285338070472",
//       token0Decimals: "6",
//       token1Decimals: "18",
//       token0Balance: "2191672795753",
//       token1Balance: "258540857280273582990",
//       type: "v3",
//       pairName: "USDT_WETH",
//       dex: "dragonswap",
//       sqrtPriceX96: "1271238128745334098071738706812528",
//       tick: "193673",
//     },
//   ];

//   const amountIn = ethers.parseEther("1");
//   const tokenIn = "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432";
//   const quote = await getAmountOut(swapRoute as unknown as Pool[], tokenIn, amountIn);
//   console.log(quote);

//   console.log(`Amount out: ${quote.amountOut}`);
//   console.log(`Gas estimate: ${quote.gasEstimate}`);
// }

// main().catch((error) => {
//   console.error(error);
//   process.exitCode = 1;
// });
