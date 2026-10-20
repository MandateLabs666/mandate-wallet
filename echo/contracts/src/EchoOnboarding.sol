// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {EchoPolicyInput} from "./EchoTypes.sol";
import {PolicyRegistry} from "./PolicyRegistry.sol";

contract EchoOnboarding {
    PolicyRegistry public immutable registry;

    constructor(PolicyRegistry r) {
        registry = r;
    }

    function registerInstanceAndEip7702(EchoPolicyInput calldata input) external returns (bytes32) {
        return registry.createPolicyFor(msg.sender, input);
    }
}
