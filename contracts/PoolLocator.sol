// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

contract PoolLocator {
    mapping(address => mapping(address => mapping(uint256 => address))) public v2pools;
    mapping(address => mapping(address => mapping(uint24 => mapping(uint256 => address)))) public v3pools;
    mapping(address => uint256) public dexByPool;

    function insertV3Pools(
        address[] memory token0,
        address[] memory token1,
        uint24[] memory fee,
        uint256[] memory dex,
        address[] memory poolAddress
    ) public {
        require(
            token0.length == token1.length &&
                token1.length == fee.length &&
                fee.length == dex.length &&
                dex.length == poolAddress.length,
            "Invalid input"
        );

        for (uint256 i = 0; i < token0.length; i++) {
            v3pools[token0[i]][token1[i]][fee[i]][dex[i]] = poolAddress[i];
            v3pools[token1[i]][token0[i]][fee[i]][dex[i]] = poolAddress[i];
            dexByPool[poolAddress[i]] = dex[i];
        }
    }

    function insertV2Pools(
        address[] memory token0,
        address[] memory token1,
        uint256[] memory dex,
        address[] memory poolAddress
    ) public {
        require(
            token0.length == token1.length && token1.length == dex.length && dex.length == poolAddress.length,
            "Invalid input"
        );

        for (uint256 i = 0; i < token0.length; i++) {
            v2pools[token0[i]][token1[i]][dex[i]] = poolAddress[i];
            v2pools[token1[i]][token0[i]][dex[i]] = poolAddress[i];
            dexByPool[poolAddress[i]] = dex[i];
        }
    }

    function verifyPool(address tokenIn, address tokenOut, uint24 fee, address sender) public view {
        require(v3pools[tokenIn][tokenOut][fee][dexByPool[sender]] == sender, "Invalid pool");
    }

    function getV3Pool(address tokenIn, address tokenOut, uint24 fee, address pool) public view returns (address) {
        return v3pools[tokenIn][tokenOut][fee][dexByPool[pool]];
    }
}
