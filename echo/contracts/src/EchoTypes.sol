// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Echo v2 security repair of MartX-Web3/echo-contracts bf68bec7.
struct EchoAuthContext {
    bytes32 instanceId;
    uint64 policyVersion;
    bytes32 sessionId;
    uint64 authorityEpoch;
    uint48 validAfter;
    uint48 validUntil;
    uint256 nonce;
}

struct EchoSwap {
    address tokenIn;
    address tokenOut;
    address recipient;
    uint256 deadline;
    uint256 maxAmountIn;
    uint256 outputConstraint;
    bool exactOutput;
}

struct EchoPolicyInput {
    address budgetAsset;
    address router;
    address executeSigner;
    address[] outputs;
    uint256 maxPerOp;
    uint256 maxPerDay;
    uint256 totalBudget;
    uint48 expiry;
}

struct EchoPolicy {
    address owner;
    address budgetAsset;
    address router;
    address executeSigner;
    uint256 maxPerOp;
    uint256 maxPerDay;
    uint256 totalBudget;
    uint256 totalSpent;
    uint256 dailySpent;
    uint256 lastDay;
    uint48 expiry;
    uint64 version;
    uint64 executeEpoch;
    bool paused;
    bool exists;
}

struct EchoSession {
    bytes32 instanceId;
    address signer;
    address tokenOut;
    uint256 maxPerOp;
    uint256 totalBudget;
    uint256 totalSpent;
    uint256 maxOpsPerDay;
    uint256 dailyOps;
    uint256 lastDay;
    uint48 expiry;
    uint64 epoch;
    bool active;
}

interface IEchoSync {
    function implementation() external view returns (address);
    function syncPolicy(bytes32 id, EchoPolicy calldata policy, address[] calldata outputs) external;
    function syncSession(bytes32 id, EchoSession calldata session) external;
}
