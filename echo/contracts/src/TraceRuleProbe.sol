// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";

/// @notice Negative-control fixture. Never use for an account holding real assets.
contract TraceRuleProbe {
    address public immutable entryPoint;

    constructor(address ep) {
        entryPoint = ep;
    }

    function validateUserOp(PackedUserOperation calldata, bytes32, uint256) external view returns (uint256) {
        require(msg.sender == entryPoint);
        return block.timestamp == 0 ? 1 : 0;
    }

    function execute() external {
        require(msg.sender == entryPoint);
    }
    receive() external payable {}
}
