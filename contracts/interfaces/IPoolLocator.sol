interface IPoolLocator {
    function v3pools(address, address, uint24, uint256) external view returns (address);
    function v2pools(address, address, uint256) external view returns (address);
    function dexByPool(address) external view returns (uint256);

    function verifyPool(address tokenIn, address tokenOut, uint24 fee, address sender) external view;

    function getV3Pool(address tokenIn, address tokenOut, uint24 fee, address pool) external view returns (address);
}
