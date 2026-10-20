// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {EchoAuthContext, EchoPolicyInput, EchoPolicy, EchoSession, IEchoSync} from "./EchoTypes.sol";

/// @notice Echo v2: fixed input-asset budgets; permission mutations atomically update sender cache.
contract PolicyRegistry {
    address public immutable admin;
    address public implementation;
    address public onboarding;
    uint256 private serial;
    mapping(bytes32 => EchoPolicy) private policies;
    mapping(bytes32 => EchoSession) private sessions;
    mapping(bytes32 => address[]) private outputLists;
    mapping(bytes32 => mapping(address => bool)) public allowedOutput;
    error Unauthorized();
    error InvalidPolicy();
    error InvalidContext();
    error BudgetExceeded();
    event InstanceRegistered(
        bytes32 indexed instanceId, address indexed owner, address budgetAsset, uint256 totalBudget
    );
    event PolicyChanged(bytes32 indexed instanceId, uint64 version, uint64 executeEpoch, bool paused);
    event SessionCreated(bytes32 indexed sessionId, bytes32 indexed instanceId, address signer);
    event SessionRevoked(bytes32 indexed sessionId, uint64 epoch);
    event PolicySpendUpdated(
        bytes32 indexed instanceId,
        bytes32 indexed sessionId,
        address budgetAsset,
        uint256 actualInput,
        uint256 totalSpent
    );

    constructor(address a) {
        if (a == address(0)) revert InvalidPolicy();
        admin = a;
    }

    function setImplementation(address a) external {
        if (msg.sender != admin || implementation != address(0) || a == address(0)) revert Unauthorized();
        implementation = a;
    }

    function setOnboarding(address a) external {
        if (msg.sender != admin || onboarding != address(0) || a == address(0)) revert Unauthorized();
        onboarding = a;
    }

    function createPolicy(EchoPolicyInput calldata input) external returns (bytes32) {
        return _create(msg.sender, input);
    }

    function createPolicyFor(address owner, EchoPolicyInput calldata input) external returns (bytes32) {
        if (msg.sender != onboarding) revert Unauthorized();
        return _create(owner, input);
    }

    function _create(address owner, EchoPolicyInput calldata p) private returns (bytes32 id) {
        if (
            p.budgetAsset == address(0) || p.router == address(0) || p.executeSigner == address(0)
                || p.executeSigner == owner || p.maxPerOp == 0 || p.maxPerOp > p.maxPerDay
                || p.maxPerDay > p.totalBudget || p.expiry <= block.timestamp || p.outputs.length == 0
                || p.outputs.length > 16
        ) revert InvalidPolicy();
        bytes memory code = owner.code;
        if (
            implementation == address(0)
                || keccak256(code) != keccak256(abi.encodePacked(bytes3(0xef0100), implementation))
        ) {
            revert InvalidPolicy();
        }
        id = keccak256(abi.encode("echo-v2", block.chainid, owner, ++serial));
        policies[id] = EchoPolicy(
            owner,
            p.budgetAsset,
            p.router,
            p.executeSigner,
            p.maxPerOp,
            p.maxPerDay,
            p.totalBudget,
            0,
            0,
            0,
            p.expiry,
            1,
            1,
            false,
            true
        );
        for (uint256 i; i < p.outputs.length; i++) {
            address token = p.outputs[i];
            if (token == address(0) || token == p.budgetAsset || allowedOutput[id][token]) revert InvalidPolicy();
            allowedOutput[id][token] = true;
            outputLists[id].push(token);
        }
        _sync(id);
        emit InstanceRegistered(id, owner, p.budgetAsset, p.totalBudget);
    }

    function _bound(address owner) private view {
        if (keccak256(owner.code) != keccak256(abi.encodePacked(bytes3(0xef0100), implementation))) {
            revert InvalidPolicy();
        }
    }

    function _sync(bytes32 id) private {
        EchoPolicy storage p = policies[id];
        _bound(p.owner);
        IEchoSync(p.owner).syncPolicy(id, p, outputLists[id]);
    }

    function _owner(bytes32 id) private view {
        if (!policies[id].exists || msg.sender != policies[id].owner) revert Unauthorized();
    }

    function updateLimits(bytes32 id, uint256 perOp, uint256 perDay, uint256 total, uint48 expiry) external {
        _owner(id);
        EchoPolicy storage p = policies[id];
        if (perOp == 0 || perOp > perDay || perDay > total || total < p.totalSpent || expiry <= block.timestamp) revert InvalidPolicy();
        p.maxPerOp = perOp;
        p.maxPerDay = perDay;
        p.totalBudget = total;
        p.expiry = expiry;
        p.version++;
        _sync(id);
        emit PolicyChanged(id, p.version, p.executeEpoch, p.paused);
    }

    function pauseInstance(bytes32 id, bool paused) external {
        _owner(id);
        EchoPolicy storage p = policies[id];
        p.paused = paused;
        p.version++;
        _sync(id);
        emit PolicyChanged(id, p.version, p.executeEpoch, paused);
    }

    function rotateExecuteSigner(bytes32 id, address signer) external {
        _owner(id);
        EchoPolicy storage p = policies[id];
        if (signer == p.owner) revert InvalidPolicy();
        p.executeSigner = signer;
        p.executeEpoch++;
        p.version++;
        _sync(id);
        emit PolicyChanged(id, p.version, p.executeEpoch, p.paused);
    }

    function createSession(
        bytes32 id,
        address signer,
        address tokenOut,
        uint256 maxPerOp,
        uint256 totalBudget,
        uint256 maxOpsPerDay,
        uint48 expiry
    ) external returns (bytes32 sid) {
        _owner(id);
        EchoPolicy storage p = policies[id];
        if (
            signer == address(0) || signer == p.owner || !allowedOutput[id][tokenOut] || maxPerOp == 0
                || maxPerOp > p.maxPerOp || maxPerOp > totalBudget || totalBudget > p.totalBudget - p.totalSpent
                || maxOpsPerDay == 0 || expiry <= block.timestamp || expiry > p.expiry
        ) revert InvalidPolicy();
        sid = keccak256(abi.encode("echo-session-v2", block.chainid, id, ++serial));
        sessions[sid] = EchoSession(id, signer, tokenOut, maxPerOp, totalBudget, 0, maxOpsPerDay, 0, 0, expiry, 1, true);
        _bound(p.owner);
        IEchoSync(p.owner).syncSession(sid, sessions[sid]);
        emit SessionCreated(sid, id, signer);
    }

    function revokeSession(bytes32 sid) external {
        EchoSession storage s = sessions[sid];
        _owner(s.instanceId);
        s.active = false;
        s.epoch++;
        _bound(policies[s.instanceId].owner);
        IEchoSync(policies[s.instanceId].owner).syncSession(sid, s);
        emit SessionRevoked(sid, s.epoch);
    }

    function checkExecution(EchoAuthContext calldata a, address input, address output, address router, uint256 upper)
        public
        view
    {
        EchoPolicy storage p = policies[a.instanceId];
        if (
            !p.exists || msg.sender != p.owner || p.paused || p.version != a.policyVersion
                || block.timestamp >= p.expiry || block.timestamp < a.validAfter || block.timestamp >= a.validUntil
                || a.validUntil > p.expiry || input != p.budgetAsset || router != p.router
                || !allowedOutput[a.instanceId][output]
        ) revert InvalidContext();
        uint256 today = block.timestamp / 1 days;
        uint256 daily = p.lastDay == today ? p.dailySpent : 0;
        if (
            upper == 0 || upper > p.maxPerOp || upper > p.totalBudget - p.totalSpent
                || (daily > p.maxPerDay || upper > p.maxPerDay - daily)
        ) revert BudgetExceeded();
        if (a.sessionId == bytes32(0)) {
            if (p.executeSigner == address(0) || a.authorityEpoch != p.executeEpoch) revert InvalidContext();
        } else {
            EchoSession storage s = sessions[a.sessionId];
            if (
                s.instanceId != a.instanceId || !s.active || s.epoch != a.authorityEpoch || s.tokenOut != output
                    || block.timestamp >= s.expiry || a.validUntil > s.expiry
            ) revert InvalidContext();
            uint256 ops = s.lastDay == today ? s.dailyOps : 0;
            if (upper > s.maxPerOp || upper > s.totalBudget - s.totalSpent || ops >= s.maxOpsPerDay) revert BudgetExceeded();
        }
    }

    function recordSpend(EchoAuthContext calldata a, address output, uint256 amount) external {
        EchoPolicy storage p = policies[a.instanceId];
        checkExecution(a, p.budgetAsset, output, p.router, amount);
        uint256 today = block.timestamp / 1 days;
        if (p.lastDay != today) p.dailySpent = 0;
        p.lastDay = today;
        p.dailySpent += amount;
        p.totalSpent += amount;
        if (a.sessionId != bytes32(0)) {
            EchoSession storage s = sessions[a.sessionId];
            if (s.lastDay != today) s.dailyOps = 0;
            s.lastDay = today;
            s.dailyOps++;
            s.totalSpent += amount;
        }
        emit PolicySpendUpdated(a.instanceId, a.sessionId, p.budgetAsset, amount, p.totalSpent);
    }

    function getPolicy(bytes32 id) external view returns (EchoPolicy memory) {
        return policies[id];
    }

    function getSession(bytes32 id) external view returns (EchoSession memory) {
        return sessions[id];
    }

    function getOutputs(bytes32 id) external view returns (address[] memory) {
        return outputLists[id];
    }
}
