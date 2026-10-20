// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IAuthorizationAsset {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

/// @notice T2 experimental wallet. No upgradeability, generic execution or generic signature grant.
contract MandateWallet {
    address public immutable owner;
    IAuthorizationAsset public immutable asset;
    uint256 public immutable deploymentChainId;
    uint256 public constant MAX_AUTHORIZATION_SECONDS = 300;
    bytes4 private constant MAGIC = 0x1626ba7e;
    bytes4 private constant INVALID = 0xffffffff;
    bytes32 private constant AUTH_TYPE = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant REGISTER_TYPE = keccak256("RegisterPayment(bytes32 mandateId,bytes32 stepId,bytes32 requestHash,bytes32 quoteHash,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private constant DOMAIN_TYPE = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    struct Mandate {
        address sessionSigner;
        address payTo;
        uint256 budget;
        uint256 maxPerPayment;
        uint256 occupied;
        uint64 expiresAt;
        bool revoked;
        bool exists;
    }

    struct Payment {
        bytes32 mandateId;
        bytes32 stepId;
        bytes32 requestHash;
        bytes32 quoteHash;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }

    struct Commitment {
        bytes32 mandateId;
        bytes32 stepId;
        bytes32 nonce;
        uint256 value;
        uint256 validBefore;
        bool released;
        bool exists;
    }

    mapping(bytes32 => Mandate) private mandates;
    mapping(bytes32 => mapping(bytes32 => bool)) public allowedStep;
    mapping(bytes32 => mapping(bytes32 => bool)) public usedStep;
    mapping(bytes32 => Commitment) private commitments;

    error Unauthorized();
    error InvalidPolicy();
    error InvalidPayment();
    error InvalidSignature();
    error BudgetExceeded();
    error StepAlreadyUsed();
    error UnsafeRelease();

    event MandateCreated(bytes32 indexed mandateId, address sessionSigner, address payTo, uint256 budget, uint256 maxPerPayment, uint64 expiresAt);
    event MandateRevoked(bytes32 indexed mandateId);
    event PaymentRegistered(bytes32 indexed digest, bytes32 indexed mandateId, bytes32 indexed stepId, uint256 value, bytes32 nonce, uint256 validBefore, bytes32 requestHash, bytes32 quoteHash);
    event PaymentReleased(bytes32 indexed digest, uint256 value);

    constructor(address owner_, IAuthorizationAsset asset_) {
        if (owner_ == address(0) || address(asset_) == address(0) || asset_.decimals() != 6) revert InvalidPolicy();
        owner = owner_;
        asset = asset_;
        deploymentChainId = block.chainid;
    }

    function createMandate(bytes32 id, address signer, address payTo, uint256 budget, uint256 maxPerPayment, uint64 expiresAt, bytes32[] calldata steps) external {
        if (msg.sender != owner) revert Unauthorized();
        if (block.chainid != deploymentChainId || id == bytes32(0) || mandates[id].exists || signer == address(0) || payTo == address(0)
            || budget == 0 || maxPerPayment == 0 || maxPerPayment > budget || expiresAt <= block.timestamp || steps.length == 0 || steps.length > 16) revert InvalidPolicy();
        mandates[id] = Mandate(signer, payTo, budget, maxPerPayment, 0, expiresAt, false, true);
        for (uint256 i; i < steps.length; ++i) {
            if (steps[i] == bytes32(0) || allowedStep[id][steps[i]]) revert InvalidPolicy();
            allowedStep[id][steps[i]] = true;
        }
        emit MandateCreated(id, signer, payTo, budget, maxPerPayment, expiresAt);
    }

    function paymentNonce(bytes32 mandateId, bytes32 stepId) public view returns (bytes32) {
        return keccak256(abi.encode(deploymentChainId, address(this), mandateId, stepId));
    }

    function paymentDigest(Payment calldata p) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", asset.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            AUTH_TYPE, address(this), p.to, p.value, p.validAfter, p.validBefore, p.nonce
        ))));
    }

    function registrationDigest(Payment calldata p) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPE, keccak256("MandateM1"), keccak256("1"), block.chainid, address(this)));
        bytes32 message = keccak256(abi.encode(REGISTER_TYPE, p.mandateId, p.stepId, p.requestHash, p.quoteHash, p.to, p.value, p.validAfter, p.validBefore, p.nonce));
        return keccak256(abi.encodePacked("\x19\x01", domain, message));
    }

    function registerPayment(Payment calldata p, bytes calldata registrationSignature) external returns (bytes32 digest) {
        Mandate storage m = mandates[p.mandateId];
        if (block.chainid != deploymentChainId || !m.exists || m.revoked || block.timestamp >= m.expiresAt || !allowedStep[p.mandateId][p.stepId]) revert InvalidPolicy();
        if (usedStep[p.mandateId][p.stepId]) revert StepAlreadyUsed();
        if (p.to != m.payTo || p.value == 0 || p.value > m.maxPerPayment || p.validAfter != 0
            || p.validBefore <= block.timestamp || p.validBefore > m.expiresAt || p.validBefore > block.timestamp + MAX_AUTHORIZATION_SECONDS
            || p.nonce != paymentNonce(p.mandateId, p.stepId) || asset.authorizationState(address(this), p.nonce)) revert InvalidPayment();
        if (p.value > m.budget - m.occupied) revert BudgetExceeded();
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(registrationDigest(p), registrationSignature);
        if (err != ECDSA.RecoverError.NoError || recovered != m.sessionSigner) revert InvalidSignature();
        digest = paymentDigest(p);
        if (commitments[digest].exists) revert StepAlreadyUsed();
        m.occupied += p.value;
        usedStep[p.mandateId][p.stepId] = true;
        commitments[digest] = Commitment(p.mandateId, p.stepId, p.nonce, p.value, p.validBefore, false, true);
        emit PaymentRegistered(digest, p.mandateId, p.stepId, p.value, p.nonce, p.validBefore, p.requestHash, p.quoteHash);
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        Commitment storage c = commitments[digest];
        Mandate storage m = mandates[c.mandateId];
        if (block.chainid != deploymentChainId || !c.exists || c.released || !m.exists || m.revoked
            || block.timestamp >= m.expiresAt || block.timestamp >= c.validBefore || asset.authorizationState(address(this), c.nonce)) return INVALID;
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        return err == ECDSA.RecoverError.NoError && recovered == m.sessionSigner ? MAGIC : INVALID;
    }

    function revokeMandate(bytes32 id) external {
        if (msg.sender != owner) revert Unauthorized();
        if (!mandates[id].exists) revert InvalidPolicy();
        mandates[id].revoked = true;
        emit MandateRevoked(id);
    }

    function releaseExpired(bytes32 digest) external {
        Commitment storage c = commitments[digest];
        if (!c.exists || c.released || block.timestamp <= c.validBefore || asset.authorizationState(address(this), c.nonce)) revert UnsafeRelease();
        c.released = true;
        mandates[c.mandateId].occupied -= c.value;
        emit PaymentReleased(digest, c.value);
    }

    function getMandate(bytes32 id) external view returns (Mandate memory) { return mandates[id]; }
    function getCommitment(bytes32 digest) external view returns (Commitment memory) { return commitments[digest]; }

    function withdrawAsset(address to, uint256 amount) external {
        if (msg.sender != owner || to == address(0)) revert Unauthorized();
        require(asset.transfer(to, amount), "transfer failed");
    }
}
