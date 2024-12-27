// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "@pancakeswap/v3-core/contracts/libraries/SafeCast.sol";
import "@pancakeswap/v3-core/contracts/libraries/TickMath.sol";
import "@pancakeswap/v3-core/contracts/libraries/LowGasSafeMath.sol";
import "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol";
import "@pancakeswap/v3-periphery/contracts/libraries/Path.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./libraries/PoolTicksCounter.sol";
import "./interfaces/IPoolLocator.sol";

contract RouteQuoter is ReentrancyGuard {
    using Path for bytes;
    using SafeCast for uint256;
    using LowGasSafeMath for uint256;
    using PoolTicksCounter for IPancakeV3Pool;

    struct QuoteExactInputSingleV3Params {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
        uint256 dex;
    }

    struct QuoteExactInputSingleV2Params {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 dex;
    }

    struct QuoteExactInputSingleStableParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 flag;
    }

    IPoolLocator public poolLocator;

    constructor(IPoolLocator _poolLocator) {
        poolLocator = _poolLocator;
    }

    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes memory path) external view {
        swapCallbackInternal(amount0Delta, amount1Delta, path);
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes memory path) external view {
        swapCallbackInternal(amount0Delta, amount1Delta, path);
    }

    function swapCallbackInternal(int256 amount0Delta, int256 amount1Delta, bytes memory path) internal view {
        require(amount0Delta > 0 || amount1Delta > 0);
        (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();

        (bool isExactInput, uint256 amountReceived) = amount0Delta > 0
            ? (tokenIn < tokenOut, uint256(-amount1Delta))
            : (tokenOut < tokenIn, uint256(-amount0Delta));

        address poolAddress = poolLocator.getV3Pool(tokenIn, tokenOut, fee, msg.sender);
        require(poolAddress != address(0), "pool not found");
        IPancakeV3Pool pool = IPancakeV3Pool(poolAddress);
        (uint160 v3SqrtPriceX96After, int24 tickAfter, , , , , ) = pool.slot0();

        if (isExactInput) {
            assembly {
                let ptr := mload(0x40)
                mstore(ptr, amountReceived)
                mstore(add(ptr, 0x20), v3SqrtPriceX96After)
                mstore(add(ptr, 0x40), tickAfter)
                revert(ptr, 0x60)
            }
        } else {
            revert("Exact output quote not supported");
        }
    }

    function parseRevertReason(
        bytes memory reason
    ) private pure returns (uint256 amount, uint160 sqrtPriceX96After, int24 tickAfter) {
        if (reason.length != 0x60) {
            if (reason.length < 0x44) revert("Unexpected error");
            assembly {
                reason := add(reason, 0x04)
            }
            revert(abi.decode(reason, (string)));
        }
        return abi.decode(reason, (uint256, uint160, int24));
    }

    function handleV3Revert(
        bytes memory reason,
        IPancakeV3Pool pool,
        uint256 gasEstimate
    ) private view returns (uint256 amount, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256) {
        int24 tickBefore;
        int24 tickAfter;
        (, tickBefore, , , , , ) = pool.slot0();
        (amount, sqrtPriceX96After, tickAfter) = parseRevertReason(reason);

        initializedTicksCrossed = pool.countInitializedTicksCrossed(tickBefore, tickAfter);

        return (amount, sqrtPriceX96After, initializedTicksCrossed, gasEstimate);
    }

    /************************************************** V2 **************************************************/

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

    function quoteExactInputSingleV2(
        QuoteExactInputSingleV2Params memory params
    ) public view returns (uint256 amountOut) {
        (uint256 reserveIn, uint256 reserveOut) = getReserves(params.tokenIn, params.tokenOut, params.dex);
        amountOut = getAmountOut(params.amountIn, reserveIn, reserveOut);
    }

    /************************************************** Mixed **************************************************/

    function sortTokens(
        QuoteExactInputSingleV3Params memory params
    ) public pure returns (address token0, address token1) {
        require(params.tokenIn != params.tokenOut);
        (token0, token1) = params.tokenIn < params.tokenOut
            ? (params.tokenIn, params.tokenOut)
            : (params.tokenOut, params.tokenIn);
        require(token0 != address(0));
    }

    function quoteExactInputSingleV3(
        QuoteExactInputSingleV3Params memory params
    )
        public
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
    {
        bool zeroForOne = params.tokenIn < params.tokenOut;

        IPancakeV3Pool pool = IPancakeV3Pool(
            poolLocator.v3pools(params.tokenIn, params.tokenOut, params.fee, params.dex)
        );

        uint256 gasBefore = gasleft();
        try
            pool.swap(
                address(this),
                zeroForOne,
                params.amountIn.toInt256(),
                params.sqrtPriceLimitX96 == 0
                    ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                    : params.sqrtPriceLimitX96,
                abi.encodePacked(params.tokenIn, params.fee, params.tokenOut)
            )
        {} catch (bytes memory reason) {
            gasEstimate = gasBefore - gasleft();
            return handleV3Revert(reason, pool, gasEstimate);
        }
    }

    /// @dev Get the quote for an exactIn swap between an array of Stable, V2 and/or V3 pools
    /// @param flag 0 for V3, 1 for V2, 2 for 2pool, 3 for 3pool
    /// @param dex 0 for dragonswap, 1 for klayswap, 2 for neopin
    function quoteExactInput(
        bytes memory path,
        uint256[] memory flag,
        uint256[] memory dex,
        uint256 amountIn
    ) public returns (uint256 amountOut, uint256 v3SwapGasEstimate) {
        uint256 i = 0;
        while (true) {
            (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();

            if (flag[i] == 1) {
                amountIn = quoteExactInputSingleV2(
                    QuoteExactInputSingleV2Params({
                        tokenIn: tokenIn,
                        tokenOut: tokenOut,
                        amountIn: amountIn,
                        dex: dex[i]
                    })
                );
            } else if (flag[i] == 0) {
                (uint256 _amountOut, , , uint256 _gasEstimate) = quoteExactInputSingleV3(
                    QuoteExactInputSingleV3Params({
                        tokenIn: tokenIn,
                        tokenOut: tokenOut,
                        fee: fee,
                        amountIn: amountIn,
                        sqrtPriceLimitX96: 0,
                        dex: dex[i]
                    })
                );
                v3SwapGasEstimate += _gasEstimate;
                amountIn = _amountOut;
            } else {
                revert("Unsupported flag");
            }

            i++;

            if (path.hasMultiplePools()) {
                path = path.skipToken();
            } else {
                return (amountIn, v3SwapGasEstimate);
            }
        }
    }
}
