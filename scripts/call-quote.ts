import { ethers } from "ethers";
import { DexVersion, ExactInputParams, MultiPathSwapParams, Pool, Quote, V2Pool, V3Pool } from "./types";

const provider = new ethers.JsonRpcProvider("https://public-en.node.kaia.io");
const wallet = new ethers.Wallet(process.env.TEST_3!, provider);

const routeQuoterAddress = "0x876599b97CD88B8C95ce5495DBf84a2e6B73eF15";
const smartRouterAddress = "0xaC8d77Bc5897C65FdC6a657Cc05136b44d4bEfFd";

const routeQuoter = new ethers.Contract(
  routeQuoterAddress,
  ["function quoteExactInput(bytes, uint[], uint[], uint) public view returns (uint, uint)"],
  wallet,
);

const smartRouter = new ethers.Contract(
  smartRouterAddress,
  [
    {
      inputs: [
        {
          components: [
            { internalType: "bytes", name: "path", type: "bytes" },
            { internalType: "address", name: "recipient", type: "address" },
            { internalType: "uint256", name: "amountIn", type: "uint256" },
            { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
            { internalType: "uint256[]", name: "dex", type: "uint256[]" },
          ],
          internalType: "struct ExactInputParams",
          name: "params",
          type: "tuple",
        },
      ],
      name: "exactInput",
      outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
      stateMutability: "payable",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              components: [
                {
                  internalType: "address",
                  name: "recipient",
                  type: "address",
                },
                {
                  internalType: "bytes",
                  name: "path",
                  type: "bytes",
                },
                {
                  internalType: "uint256[]",
                  name: "flag",
                  type: "uint256[]",
                },
                {
                  internalType: "uint256[]",
                  name: "dex",
                  type: "uint256[]",
                },
                {
                  internalType: "uint256",
                  name: "amountIn",
                  type: "uint256",
                },
              ],
              internalType: "struct SmartRouter.MixedSwapParams[]",
              name: "paths",
              type: "tuple[]",
            },
            {
              internalType: "uint256",
              name: "amountOutMinimum",
              type: "uint256",
            },
          ],
          internalType: "struct SmartRouter.MultiPathSwapParams",
          name: "params",
          type: "tuple",
        },
      ],
      name: "multiPathSwap",
      outputs: [
        {
          internalType: "uint256",
          name: "amountOut",
          type: "uint256",
        },
      ],
      stateMutability: "payable",
      type: "function",
    },
  ],
  wallet,
);

export function encodeRoute(pools: Pool[], tokenIn: string): string {
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

export async function swap(
  pools: Pool[],
  recipient: string,
  tokenIn: string,
  amountIn: bigint,
  amountOutMinimum: bigint,
): Promise<number> {
  const path = encodeRoute(pools, tokenIn);
  const dex = pools.map((pool) => pool.dex);

  const params = {
    path,
    recipient,
    amountIn,
    amountOutMinimum,
    dex,
  } as ExactInputParams;

  const result = await smartRouter.exactInput(params, {
    gasLimit: 1000000,
    gasPrice: 25000000000,
  });

  await result.wait();

  return result[0];
}

export async function multiPathSwap(params: MultiPathSwapParams): Promise<number> {
  const result = await smartRouter.multiPathSwap.staticCall(params, {
    gasLimit: 10000000,
    gasPrice: 25000000000,
  });

  // await result.wait();

  return result;
}
