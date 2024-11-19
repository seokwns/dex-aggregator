// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestToken is ERC20 {
    constructor(string memory name_, string memory symbol_) public ERC20(name_, symbol_) {
        _mint(msg.sender, 100 ether);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
