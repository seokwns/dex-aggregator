import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://hashkeychain-testnet.alt.technology");
  const address = "0x71687911709789d9cb74705e4fD0e772b8d20cFF";
  const abi = [
    "event SwapData(address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, address payerIsUser)",
    "event SwapParam(address recipient, bool zeroForOne, uint256 amount, uint160 sqrtPriceLimitX96, bytes data)",
    "event PoolParam(address tokenIn, uint24 fee, address tokenOut)",
    "event PoolAddress(address pool)",
  ];

  const contract = new ethers.Contract(address, abi, provider);
  const filter = contract.filters.SwapParam();
  const events = await contract.queryFilter(filter);

  events.forEach((event) => {
    // const { recipient, amountIn, amountOutMin, path, payerIsUser } = contract.interface.parseLog(event)!.args;
    // console.log(
    //   `Recipient: ${recipient}, AmountIn: ${amountIn}, AmountOutMin: ${amountOutMin}, Path: ${path}, PayerIsUser: ${payerIsUser}`,
    // );
    //
    const { recipient, zeroForOne, amount, sqrtPriceLimitX96, data } = contract.interface.parseLog(event)!.args;
    console.log(
      `Recipient: ${recipient}, ZeroForOne: ${zeroForOne}, Amount: ${amount}, SqrtPriceLimitX96: ${sqrtPriceLimitX96}, Data: ${data}`,
    );
    //
    // const { tokenIn, fee, tokenOut } = contract.interface.parseLog(event)!.args;
    // console.log(`TokenIn: ${tokenIn}, Fee: ${fee}, TokenOut: ${tokenOut}`);
    //
    // const { pool } = contract.interface.parseLog(event)!.args;
    // console.log(`Pool: ${pool}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
