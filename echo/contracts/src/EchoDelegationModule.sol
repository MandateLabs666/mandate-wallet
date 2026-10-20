// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {EchoAuthContext, EchoSwap, EchoPolicy, EchoSession} from "./EchoTypes.sol";
import {EchoIntentDecoder} from "./EchoIntentDecoder.sol";
import {EchoPolicyValidator} from "./EchoPolicyValidator.sol";
import {PolicyRegistry} from "./PolicyRegistry.sol";

/// @notice Echo v2 delegation: signature validation isolated from atomic swap execution.
contract EchoDelegationModule {
    using SafeERC20 for IERC20;
    PolicyRegistry public immutable registry;
    EchoIntentDecoder public immutable decoder;
    EchoPolicyValidator public immutable validator;
    address public immutable entryPoint;
    address public immutable implementation;
    uint256 public immutable deploymentChainId;
    // ERC-7201: erc7201:echo.account.v2
    bytes32 private constant SLOT = 0x8459b3b78e24b7c105c5da8c3ae778dc8658a420247a9c19e31e7beff56bdd00;

    struct Authority {
        address signer;
        address tokenOut;
        uint48 expiry;
        uint64 epoch;
        bool active;
        bytes32 instanceId;
    }

    struct Cache {
        bytes32 instanceId;
        EchoPolicy policy;
        address[] outputs;
        mapping(address => bool) allowed;
        mapping(bytes32 => Authority) sessions;
        bool entered;
    }
    error Unauthorized();
    error InvalidExecution();
    error AssetMismatch();
    event SwapExecuted(
        uint256 indexed nonce,
        bytes32 indexed instanceId,
        bytes32 indexed sessionId,
        address tokenIn,
        address tokenOut,
        uint256 actualInput,
        uint256 actualOutput
    );

    constructor(PolicyRegistry r, EchoIntentDecoder d, EchoPolicyValidator v, address ep) {
        if (address(r) == address(0) || address(d) == address(0) || address(v) == address(0) || ep == address(0)) {
            revert Unauthorized();
        }
        registry = r;
        decoder = d;
        validator = v;
        entryPoint = ep;
        implementation = address(this);
        deploymentChainId = block.chainid;
    }

    function _cache() private pure returns (Cache storage c) {
        bytes32 slot = SLOT;
        assembly ("memory-safe") { c.slot := slot }
    }

    function syncPolicy(bytes32 id, EchoPolicy calldata p, address[] calldata outputs) external {
        if (msg.sender != address(registry) || p.owner != address(this)) revert Unauthorized();
        Cache storage c = _cache();
        for (uint256 i; i < c.outputs.length; i++) {
            delete c.allowed[c.outputs[i]];
        }
        delete c.outputs;
        c.instanceId = id;
        c.policy = p;
        for (uint256 i; i < outputs.length; i++) {
            c.outputs.push(outputs[i]);
            c.allowed[outputs[i]] = true;
        }
    }

    function syncSession(bytes32 id, EchoSession calldata s) external {
        if (msg.sender != address(registry)) revert Unauthorized();
        _cache().sessions[id] = Authority(s.signer, s.tokenOut, s.expiry, s.epoch, s.active, s.instanceId);
    }

    function authorityState()
        external
        view
        returns (bytes32 id, uint64 version, uint64 executeEpoch, address signer, bool paused, uint48 expiry)
    {
        Cache storage c = _cache();
        return
            (
                c.instanceId,
                c.policy.version,
                c.policy.executeEpoch,
                c.policy.executeSigner,
                c.policy.paused,
                c.policy.expiry
            );
    }

    function _authority(EchoAuthContext memory a, EchoSwap memory s, address target)
        private
        view
        returns (address signer, bool ok)
    {
        Cache storage c = _cache();
        EchoPolicy storage p = c.policy;
        ok = block.chainid == deploymentChainId && p.exists && !p.paused && a.instanceId == c.instanceId
            && a.policyVersion == p.version && a.validUntil != 0 && a.validAfter < a.validUntil
            && a.validUntil <= p.expiry && s.deadline <= a.validUntil && s.deadline > a.validAfter
            && s.tokenIn == p.budgetAsset && s.recipient == address(this) && target == p.router && c.allowed[s.tokenOut]
            && s.maxAmountIn <= p.maxPerOp;
        if (a.sessionId == bytes32(0)) {
            signer = p.executeSigner;
            ok = ok && signer != address(0) && a.authorityEpoch == p.executeEpoch;
        } else {
            Authority storage x = c.sessions[a.sessionId];
            signer = x.signer;
            ok = ok && x.active && x.instanceId == a.instanceId && a.authorityEpoch == x.epoch
                && a.validUntil <= x.expiry && s.tokenOut == x.tokenOut;
        }
    }

    function validateUserOp(PackedUserOperation calldata op, bytes32 hash, uint256 missingAccountFunds)
        external
        view
        returns (uint256 data)
    {
        if (msg.sender != entryPoint || op.sender != address(this)) revert Unauthorized();
        try decoder.decodeOuter(op.callData) returns (
            address target, bytes memory, EchoAuthContext memory a, EchoSwap memory s
        ) {
            (address signer, bool ok) = _authority(a, s, target);
            // Never draw ETH from the EOA: only owner-approved EntryPoint deposits pay gas.
            ok = ok && a.nonce == op.nonce && op.nonce >> 64 == 0 && missingAccountFunds == 0;
            bool signed = validator.verify(address(this), entryPoint, implementation, hash, a, signer, op.signature);
            return (uint256(a.validUntil) << 160) | (uint256(a.validAfter) << 208) | (ok && signed ? 0 : 1);
        } catch {
            return 1;
        }
    }

    function execute(bytes32 mode, bytes calldata packed, EchoAuthContext calldata auth) external payable {
        if (msg.sender != entryPoint || msg.value != 0) revert Unauthorized();
        Cache storage c = _cache();
        if (c.entered) revert InvalidExecution();
        c.entered = true;
        // Decode the exact function invocation, including canonical outer encoding.
        (address target, bytes memory inner, EchoAuthContext memory a, EchoSwap memory s) =
            decoder.decodeOuter(msg.data);
        (address signer, bool ok) = _authority(a, s, target);
        signer;
        mode;
        packed;
        auth;
        if (!ok || s.deadline <= block.timestamp) revert InvalidExecution();
        registry.checkExecution(a, s.tokenIn, s.tokenOut, target, s.maxAmountIn);
        IERC20 input = IERC20(s.tokenIn);
        IERC20 output = IERC20(s.tokenOut);
        uint256 beforeIn = input.balanceOf(address(this));
        uint256 beforeOut = output.balanceOf(address(this));
        input.forceApprove(target, s.maxAmountIn);
        (bool success, bytes memory reason) = target.call(inner);
        if (!success) assembly ("memory-safe") { revert(add(reason, 32), mload(reason)) }
        input.forceApprove(target, 0);
        uint256 afterIn = input.balanceOf(address(this));
        uint256 afterOut = output.balanceOf(address(this));
        if (afterIn >= beforeIn || afterOut < beforeOut) revert AssetMismatch();
        uint256 spent = beforeIn - afterIn;
        uint256 received = afterOut - beforeOut;
        if (
            spent > s.maxAmountIn || (!s.exactOutput && spent != s.maxAmountIn)
                || (s.exactOutput ? received != s.outputConstraint : received < s.outputConstraint)
        ) revert AssetMismatch();
        registry.recordSpend(a, s.tokenOut, spent);
        c.entered = false;
        emit SwapExecuted(a.nonce, a.instanceId, a.sessionId, s.tokenIn, s.tokenOut, spent, received);
    }
    receive() external payable {}
}
