// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "@pancakeswap/v3-periphery/contracts/libraries/Path.sol";
import "@pancakeswap/v3-core/contracts/libraries/SafeCast.sol";
import "@pancakeswap/v3-core/contracts/libraries/TickMath.sol";
import "@pancakeswap/v3-core/contracts/libraries/TickBitmap.sol";
import "@pancakeswap/v3-core/contracts/libraries/LowGasSafeMath.sol";
import "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "./libraries/PoolTicksCounter.sol";

contract RouteQuoter {
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
    }

    struct QuoteExactInputSingleV2Params {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
    }

    struct QuoteExactInputSingleStableParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 flag;
    }

    mapping(address => mapping(address => address)) public v2pools;
    mapping(address => mapping(address => mapping(uint24 => address))) public v3pools;

    constructor() {}

    function insertV3Pools(
        address[] memory token0,
        address[] memory token1,
        uint24[] memory fee,
        address[] memory poolAddress
    ) public {
        for (uint256 i = 0; i < token0.length; i++) {
            v3pools[token0[i]][token1[i]][fee[i]] = poolAddress[i];
            v3pools[token1[i]][token0[i]][fee[i]] = poolAddress[i];
        }
    }

    function insertV2Pools(address[] memory token0, address[] memory token1, address[] memory poolAddress) public {
        for (uint256 i = 0; i < token0.length; i++) {
            v2pools[token0[i]][token1[i]] = poolAddress[i];
            v2pools[token1[i]][token0[i]] = poolAddress[i];
        }
    }

    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes memory path) external view {
        require(amount0Delta > 0 || amount1Delta > 0); // swaps entirely within 0-liquidity regions are not supported
        (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
        // SmartRouterHelper.verifyCallback(deployer, tokenIn, tokenOut, fee);

        (bool isExactInput, uint256 amountReceived) = amount0Delta > 0
            ? (tokenIn < tokenOut, uint256(-amount1Delta))
            : (tokenOut < tokenIn, uint256(-amount0Delta));

        // IPancakeV3Pool pool = SmartRouterHelper.getPool(deployer, tokenIn, tokenOut, fee);
        address poolAddress = v3pools[tokenIn][tokenOut][fee];
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
            /// since we don't support exactOutput, revert here
            revert("Exact output quote not supported");
        }
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes memory path) external view {
        require(amount0Delta > 0 || amount1Delta > 0); // swaps entirely within 0-liquidity regions are not supported
        (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
        // SmartRouterHelper.verifyCallback(deployer, tokenIn, tokenOut, fee);

        (bool isExactInput, uint256 amountReceived) = amount0Delta > 0
            ? (tokenIn < tokenOut, uint256(-amount1Delta))
            : (tokenOut < tokenIn, uint256(-amount0Delta));

        // IPancakeV3Pool pool = SmartRouterHelper.getPool(deployer, tokenIn, tokenOut, fee);
        address poolAddress = v3pools[tokenIn][tokenOut][fee];
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
            /// since we don't support exactOutput, revert here
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

    function getReserves(address tokenA, address tokenB) public view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        address pool = v2pools[token0][token1];
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
        uint256 amountInWithFee = amountIn.mul(9975);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(10000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    /// @dev Fetch an exactIn quote for a V2 pair on chain
    function quoteExactInputSingleV2(
        QuoteExactInputSingleV2Params memory params
    ) public view returns (uint256 amountOut) {
        (uint256 reserveIn, uint256 reserveOut) = getReserves(params.tokenIn, params.tokenOut);
        amountOut = getAmountOut(params.amountIn, reserveIn, reserveOut);
    }

    /************************************************** Stable **************************************************/

    /// @dev Fetch an exactIn quote for a Stable pair on chain
    // function quoteExactInputSingleStable(
    //     QuoteExactInputSingleStableParams memory params
    // ) public view returns (uint256 amountOut) {
    //     (uint256 i, uint256 j, address swapContract) = SmartRouterHelper.getStableInfo(
    //         factoryStable,
    //         params.tokenIn,
    //         params.tokenOut,
    //         params.flag
    //     );
    //     amountOut = IStableSwap(swapContract).get_dy(i, j, params.amountIn);
    // }

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

        // ICatalistPool pool = SmartRouterHelper.getPool(deployer, params.tokenIn, params.tokenOut, params.fee);
        // (address token0, address token1) = sortTokens(params);
        IPancakeV3Pool pool = IPancakeV3Pool(v3pools[params.tokenIn][params.tokenOut][params.fee]);

        uint256 gasBefore = gasleft();
        try
            pool.swap(
                address(this), // address(0) might cause issues with some tokens
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
    function quoteExactInput(
        bytes memory path,
        uint256[] memory flag,
        uint256 amountIn
    )
        public
        returns (
            uint256 amountOut,
            uint160[] memory v3SqrtPriceX96AfterList,
            uint32[] memory v3InitializedTicksCrossedList,
            uint256 v3SwapGasEstimate
        )
    {
        v3SqrtPriceX96AfterList = new uint160[](path.numPools());
        v3InitializedTicksCrossedList = new uint32[](path.numPools());

        uint256 i = 0;
        while (true) {
            (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();

            if (flag[i] == 1) {
                amountIn = quoteExactInputSingleV2(
                    QuoteExactInputSingleV2Params({tokenIn: tokenIn, tokenOut: tokenOut, amountIn: amountIn})
                );
            } else if (flag[i] == 0) {
                /// the outputs of prior swaps become the inputs to subsequent ones
                (
                    uint256 _amountOut,
                    uint160 _sqrtPriceX96After,
                    uint32 _initializedTicksCrossed,
                    uint256 _gasEstimate
                ) = quoteExactInputSingleV3(
                        QuoteExactInputSingleV3Params({
                            tokenIn: tokenIn,
                            tokenOut: tokenOut,
                            fee: fee,
                            amountIn: amountIn,
                            sqrtPriceLimitX96: 0
                        })
                    );
                v3SqrtPriceX96AfterList[i] = _sqrtPriceX96After;
                v3InitializedTicksCrossedList[i] = _initializedTicksCrossed;
                v3SwapGasEstimate += _gasEstimate;
                amountIn = _amountOut;
            } else {
                revert("Unsupported flag");
            }

            i++;

            /// decide whether to continue or terminate
            if (path.hasMultiplePools()) {
                path = path.skipToken();
            } else {
                return (amountIn, v3SqrtPriceX96AfterList, v3InitializedTicksCrossedList, v3SwapGasEstimate);
            }
        }
    }
}
