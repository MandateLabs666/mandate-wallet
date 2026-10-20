// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Public test fixture, never a native USDC claim. Anyone may mint.
contract MockInputToken is ERC20 {
    constructor() ERC20("Echo Test USD", "EchoTUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockOutputToken is ERC20 {
    constructor() ERC20("Echo Test Wrapped ETH", "EchoTWETH") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
