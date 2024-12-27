// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "@pancakeswap/v3-core/contracts/libraries/SafeCast.sol";
import "@pancakeswap/v3-core/contracts/libraries/TickMath.sol";
import "@pancakeswap/v3-core/contracts/libraries/LowGasSafeMath.sol";
import "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol";
import "@pancakeswap/v3-periphery/contracts/libraries/Path.sol";
import "@pancakeswap/v3-periphery/contracts/base/SelfPermit.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./libraries/PoolTicksCounter.sol";
import "./libraries/Constants.sol";
import "./libraries/TransferHelper.sol";
import "./base/MulticallExtended.sol";
import "./interfaces/IWETH9.sol";
import "./interfaces/IPoolLocator.sol";

contract SmartRouter is ReentrancyGuard, SelfPermit, MulticallExtended {
    using Path for bytes;
    using SafeCast for uint256;
    using LowGasSafeMath for uint256;
    using PoolTicksCounter for IPancakeV3Pool;

    /// @dev Used as the placeholder value for amountInCached, because the computed amount in for an exact output swap
    /// can never actually be this value
    uint256 private constant DEFAULT_AMOUNT_IN_CACHED = type(uint256).max;

    /// @dev Transient storage variable used for returning the computed amount in for an exact output swap.
    uint256 private amountInCached = DEFAULT_AMOUNT_IN_CACHED;

    address public immutable WETH9;

    IPoolLocator public poolLocator;

    constructor(IPoolLocator _poolLocator, address _weth9) {
        poolLocator = _poolLocator;
        WETH9 = _weth9;
    }

    /************************************************** Router V3 ***********************************************/

    struct SwapCallbackData {
        bytes path;
        address payer;
    }

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
        uint256 dex;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint256[] dex;
    }

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
        uint256 dex;
    }

    struct ExactOutputParams {
        bytes path;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint256[] dex;
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata _data) external {
        swapCallbackInternal(amount0Delta, amount1Delta, _data);
    }

    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata _data) external {
        swapCallbackInternal(amount0Delta, amount1Delta, _data);
    }

    function swapCallbackInternal(int256 amount0Delta, int256 amount1Delta, bytes calldata _data) internal {
        require(amount0Delta > 0 || amount1Delta > 0); // swaps entirely within 0-liquidity regions are not supported
        SwapCallbackData memory data = abi.decode(_data, (SwapCallbackData));
        (address tokenIn, address tokenOut, uint24 fee) = data.path.decodeFirstPool();
        // CallbackValidation.verifyCallback(factory, tokenIn, tokenOut, fee);
        poolLocator.verifyPool(tokenIn, tokenOut, fee, msg.sender);

        (bool isExactInput, uint256 amountToPay) = amount0Delta > 0
            ? (tokenIn < tokenOut, uint256(amount0Delta))
            : (tokenOut < tokenIn, uint256(amount1Delta));
        if (isExactInput) {
            pay(tokenIn, data.payer, msg.sender, amountToPay);
        } else {
            // either initiate the next swap or pay
            if (data.path.hasMultiplePools()) {
                data.path = data.path.skipToken();
                exactOutputInternal(amountToPay, msg.sender, 0, data, poolLocator.dexByPool(msg.sender));
            } else {
                amountInCached = amountToPay;
                tokenIn = tokenOut; // swap in/out because exact output swaps are reversed
                pay(tokenIn, data.payer, msg.sender, amountToPay);
            }
        }
    }

    function getV3Pool(bytes memory path, uint256 dex) private view returns (IPancakeV3Pool) {
        (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
        return IPancakeV3Pool(poolLocator.v3pools(tokenIn, tokenOut, fee, dex));
    }

    /// @dev Performs a single exact input swap
    /// @notice `refundETH` should be called at very end of all swaps
    function exactInputInternal(
        uint256 amountIn,
        address recipient,
        uint160 sqrtPriceLimitX96,
        SwapCallbackData memory data,
        uint256 dex
    ) private returns (uint256 amountOut) {
        // find and replace recipient addresses
        if (recipient == Constants.MSG_SENDER) recipient = msg.sender;
        else if (recipient == Constants.ADDRESS_THIS) recipient = address(this);

        (address tokenIn, address tokenOut, ) = data.path.decodeFirstPool();

        bool zeroForOne = tokenIn < tokenOut;

        (int256 amount0, int256 amount1) = getV3Pool(data.path, dex).swap(
            recipient,
            zeroForOne,
            amountIn.toInt256(),
            sqrtPriceLimitX96 == 0
                ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                : sqrtPriceLimitX96,
            abi.encode(data)
        );

        return uint256(-(zeroForOne ? amount1 : amount0));
    }

    function exactInputSingle(
        ExactInputSingleParams memory params
    ) external payable nonReentrant returns (uint256 amountOut) {
        // use amountIn == Constants.CONTRACT_BALANCE as a flag to swap the entire balance of the contract
        bool hasAlreadyPaid;
        if (params.amountIn == Constants.CONTRACT_BALANCE) {
            hasAlreadyPaid = true;
            params.amountIn = IERC20(params.tokenIn).balanceOf(address(this));
        }

        amountOut = exactInputInternal(
            params.amountIn,
            params.recipient,
            params.sqrtPriceLimitX96,
            SwapCallbackData({
                path: abi.encodePacked(params.tokenIn, params.fee, params.tokenOut),
                payer: hasAlreadyPaid ? address(this) : msg.sender
            }),
            params.dex
        );
        require(amountOut >= params.amountOutMinimum);
    }

    function exactInput(ExactInputParams memory params) external payable nonReentrant returns (uint256 amountOut) {
        // use amountIn == Constants.CONTRACT_BALANCE as a flag to swap the entire balance of the contract
        bool hasAlreadyPaid;
        if (params.amountIn == Constants.CONTRACT_BALANCE) {
            hasAlreadyPaid = true;
            (address tokenIn, , ) = params.path.decodeFirstPool();
            params.amountIn = IERC20(tokenIn).balanceOf(address(this));
        }

        address payer = hasAlreadyPaid ? address(this) : msg.sender;

        uint256 i = 0;
        while (true) {
            bool hasMultiplePools = params.path.hasMultiplePools();

            // the outputs of prior swaps become the inputs to subsequent ones
            params.amountIn = exactInputInternal(
                params.amountIn,
                hasMultiplePools ? address(this) : params.recipient, // for intermediate swaps, this contract custodies
                0,
                SwapCallbackData({
                    path: params.path.getFirstPool(), // only the first pool in the path is necessary
                    payer: payer
                }),
                params.dex[i]
            );

            i++;

            // decide whether to continue or terminate
            if (hasMultiplePools) {
                payer = address(this);
                params.path = params.path.skipToken();
            } else {
                amountOut = params.amountIn;
                break;
            }
        }

        require(amountOut >= params.amountOutMinimum);
    }

    function exactOutputInternal(
        uint256 amountOut,
        address recipient,
        uint160 sqrtPriceLimitX96,
        SwapCallbackData memory data,
        uint256 dex
    ) private returns (uint256 amountIn) {
        // find and replace recipient addresses
        if (recipient == Constants.MSG_SENDER) recipient = msg.sender;
        else if (recipient == Constants.ADDRESS_THIS) recipient = address(this);

        (address tokenOut, address tokenIn, ) = data.path.decodeFirstPool();

        bool zeroForOne = tokenIn < tokenOut;

        (int256 amount0Delta, int256 amount1Delta) = getV3Pool(data.path, dex).swap(
            recipient,
            zeroForOne,
            -amountOut.toInt256(),
            sqrtPriceLimitX96 == 0
                ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                : sqrtPriceLimitX96,
            abi.encode(data)
        );

        uint256 amountOutReceived;
        (amountIn, amountOutReceived) = zeroForOne
            ? (uint256(amount0Delta), uint256(-amount1Delta))
            : (uint256(amount1Delta), uint256(-amount0Delta));
        if (sqrtPriceLimitX96 == 0) require(amountOutReceived == amountOut);
    }

    function exactOutput(ExactOutputParams calldata params) external payable nonReentrant returns (uint256 amountIn) {
        exactOutputInternal(
            params.amountOut,
            params.recipient,
            0,
            SwapCallbackData({path: params.path, payer: msg.sender}),
            params.dex[0]
        );

        amountIn = amountInCached;
        require(amountIn <= params.amountInMaximum);
        amountInCached = DEFAULT_AMOUNT_IN_CACHED;
    }

    /// @param token The token to pay
    /// @param payer The entity that must pay
    /// @param recipient The entity that will receive payment
    /// @param value The amount to pay
    function pay(address token, address payer, address recipient, uint256 value) internal {
        if (token == WETH9 && address(this).balance >= value) {
            // pay with WETH9
            IWETH9(WETH9).deposit{value: value}(); // wrap only what is needed to pay
            IWETH9(WETH9).transfer(recipient, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            TransferHelper.safeTransfer(token, recipient, value);
        } else {
            // pull payment
            TransferHelper.safeTransferFrom(token, payer, recipient, value);
        }
    }

    /************************************************** Router V2 ***********************************************/

    function sortTokens(address tokenA, address tokenB) public pure returns (address token0, address token1) {
        require(tokenA != tokenB);
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0));
    }

    function getReserves(
        address tokenA,
        address tokenB,
        uint256 dex
    ) public view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        address pool = poolLocator.v2pools(token0, token1, dex);
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pool).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        require(amountIn > 0, "INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0);
        uint256 amountInWithFee = amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountIn) {
        require(amountOut > 0, "INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0);
        uint256 numerator = reserveIn.mul(amountOut).mul(1000);
        uint256 denominator = reserveOut.sub(amountOut).mul(997);
        amountIn = (numerator / denominator).add(1);
    }

    // performs chained getAmountIn calculations on any number of pairs
    function getAmountsIn(
        uint256 amountOut,
        address[] memory path,
        uint256[] memory dex
    ) public view returns (uint256[] memory amounts) {
        require(path.length >= 2);
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(path[i - 1], path[i], dex[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    function _swapSupportingFeeOnTransferTokens(
        address[] memory path,
        uint256[] memory dex,
        address _to
    ) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = sortTokens(input, output);
            // IUniswapV2Pair pair = IUniswapV2Pair(UniswapV2Library.pairFor(factory, input, output));
            IUniswapV2Pair pair = IUniswapV2Pair(poolLocator.v2pools(input, output, dex[i]));
            uint amountInput;
            uint amountOutput;
            {
                // scope to avoid stack too deep errors
                (uint reserve0, uint reserve1, ) = pair.getReserves();
                (uint reserveInput, uint reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
                amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
                amountOutput = getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
            // address to = i < path.length - 2 ? UniswapV2Library.pairFor(factory, output, path[i + 2]) : _to;
            address to = i < path.length - 2 ? poolLocator.v2pools(output, path[i + 2], dex[i + 1]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        address payer,
        uint amountIn,
        address[] memory path,
        uint256[] memory dex,
        address to
    ) internal returns (uint256 amountOut) {
        // TransferHelper.safeTransferFrom(path[0], msg.sender, poolLocator.v2pools(path[0], path[1], dex[0]), amountIn);
        // TransferHelper.safeTransferFrom(path[0], payer, poolLocator.v2pools(path[0], path[1], dex[0]), amountIn);
        if (payer == address(this)) {
            TransferHelper.safeTransfer(path[0], poolLocator.v2pools(path[0], path[1], dex[0]), amountIn);
        } else {
            TransferHelper.safeTransferFrom(path[0], payer, poolLocator.v2pools(path[0], path[1], dex[0]), amountIn);
        }
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, dex, to);
        amountOut = IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore);
    }

    /************************************************* Router Mixed ***********************************************/

    struct MixedSwapParams {
        address recipient;
        bytes path;
        uint256[] flag;
        uint256[] dex;
        uint256 amountIn;
    }

    struct MultiPathSwapParams {
        MixedSwapParams[] paths;
        uint256 amountOutMinimum;
    }

    function multiPathSwap(
        MultiPathSwapParams memory params
    ) external payable nonReentrant returns (uint256 amountOut) {
        for (uint256 i = 0; i < params.paths.length; i++) {
            amountOut += mixedExactInput(params.paths[i]);
        }

        require(amountOut >= params.amountOutMinimum, "SmartRouter: INSUFFICIENT_OUTPUT_AMOUNT");
    }

    /// @dev v2, v3 풀을 모두 사용하는 스왑
    function mixedExactInput(MixedSwapParams memory params) internal returns (uint256 amountOut) {
        // use amountIn == Constants.CONTRACT_BALANCE as a flag to swap the entire balance of the contract
        bool hasAlreadyPaid;
        if (params.amountIn == Constants.CONTRACT_BALANCE) {
            hasAlreadyPaid = true;
            (address tokenIn, , ) = params.path.decodeFirstPool();
            params.amountIn = IERC20(tokenIn).balanceOf(address(this));
        }

        address payer = hasAlreadyPaid ? address(this) : msg.sender;
        uint256 i = 0;

        while (true) {
            (address tokenIn, address tokenOut, ) = params.path.decodeFirstPool();
            bool hasMultiplePools = params.path.hasMultiplePools();

            address recipient = hasMultiplePools ? address(this) : params.recipient;

            if (params.flag[i] == 0) {
                // v3 풀 스왑
                params.amountIn = exactInputInternal(
                    params.amountIn,
                    recipient,
                    0,
                    SwapCallbackData({path: params.path.getFirstPool(), payer: payer}),
                    params.dex[i]
                );
            } else if (params.flag[i] == 1) {
                // v2 풀 스왑
                address[] memory pathV2 = new address[](2);
                pathV2[0] = tokenIn;
                pathV2[1] = tokenOut;

                uint256[] memory dexV2 = new uint256[](1);
                dexV2[0] = params.dex[i];

                // uint256 amountIn,
                // address[] memory path,
                // uint256[] memory dex,
                // address to
                // params.amountIn = swapExactTokensInternal(payer, params.amountIn, pathV2, dexV2, recipient);
                params.amountIn = swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    payer,
                    params.amountIn,
                    pathV2,
                    dexV2,
                    recipient
                );
            } else {
                revert("INVALID_FLAG");
            }

            i++;

            if (hasMultiplePools) {
                payer = address(this);
                params.path = params.path.skipToken();
            } else {
                amountOut = params.amountIn;
                break;
            }
        }
    }
}
