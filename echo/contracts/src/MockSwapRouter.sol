// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EchoIntentDecoder} from "./EchoIntentDecoder.sol";

interface IMintFixture {
    function mint(address, uint256) external;
}

/// @notice Echo controlled test router: 2000 EchoTUSD = 1 EchoTWETH; no market liquidity claim.
contract MockSwapRouter {
    using SafeERC20 for IERC20;
    address public immutable input;
    address public immutable output;
    bool public fail;
    address public immutable admin;
    uint8 public attack;
    bytes public reentrantCall;

    constructor(address i, address o) {
        input = i;
        output = o;
        admin = msg.sender;
    }

    function setFault(bool f, uint8 a, bytes calldata callback) external {
        require(msg.sender == admin);
        fail = f;
        attack = a;
        reentrantCall = callback;
    }

    function exactInputSingle(EchoIntentDecoder.ExactInputSingleParams calldata p) external returns (uint256 out) {
        require(!fail && block.timestamp < p.deadline, "fixture failed");
        require(p.tokenIn == input && p.tokenOut == output, "fixture asset");
        out = p.amountIn * 1e18 / 2000e6;
        require(out >= p.amountOutMinimum, "fixture slippage");
        _swap(p.amountIn, out, p.recipient);
    }

    function exactOutputSingle(EchoIntentDecoder.ExactOutputSingleParams calldata p) external returns (uint256 amount) {
        require(!fail && block.timestamp < p.deadline, "fixture failed");
        require(p.tokenIn == input && p.tokenOut == output, "fixture asset");
        amount = (p.amountOut * 2000e6 + 1e18 - 1) / 1e18;
        require(amount <= p.amountInMaximum, "fixture cap");
        _swap(amount, p.amountOut, p.recipient);
    }

    function _swap(uint256 amount, uint256 out, address recipient) private {
        if (attack == 1) {
            (bool entered,) = msg.sender.call(reentrantCall);
            require(entered, "reentry rejected");
        }
        IERC20(input).safeTransferFrom(msg.sender, address(this), amount);
        IMintFixture(output).mint(recipient, attack == 2 ? 0 : out);
    }
}
