// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAuthorizationAsset {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    function decimals() external view returns (uint8);
}

/// @notice Fixed-owner, fixed-asset purchase account. ERC-1271 only approves reserved payments.
/// @dev occupied includes paid, pending and consumed-unknown authorizations; it is not paid spend.
contract MandateAccount is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable owner;
    IAuthorizationAsset public immutable asset;
    uint256 public immutable deploymentChainId;
    bytes32 public immutable tokenDomain;
    uint256 public constant MAX_PAYMENT_SECONDS = 300;
    uint256 public constant MAX_MERCHANTS = 32;
    uint256 public constant MAX_STEPS = 64;
    bytes4 private constant MAGIC = 0x1626ba7e;
    bytes4 private constant INVALID = 0xffffffff;
    bytes32 private constant AUTH_TYPE = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant REGISTER_TYPE = keccak256(
        "RegisterPayment(bytes32 mandateId,uint64 policyVersion,bytes32 sessionId,uint64 sessionEpoch,bytes32 stepId,bytes32 merchantId,bytes32 requestHash,bytes32 quoteHash,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant QUOTE_TYPE = keccak256(
        "MerchantQuote(bytes32 mandateId,uint64 policyVersion,bytes32 stepId,bytes32 requestHash,bytes32 quoteHash,address to,uint256 value,uint256 validBefore)"
    );

    struct Limits {
        uint256 budget;
        uint256 maxPerPayment;
        uint64 expiresAt;
    }

    struct Merchant {
        bytes32 id;
        address payTo;
        address quoteSigner;
    }

    struct Step {
        bytes32 id;
        bytes32 merchantId;
        bytes32 requestHash;
    }

    struct Policy {
        bytes32 taskHash;
        uint256 budget;
        uint256 maxPerPayment;
        uint256 occupied;
        uint64 expiresAt;
        uint64 version;
        bool paused;
        bool revoked;
        bool exists;
    }

    struct Session {
        address signer;
        uint256 budget;
        uint256 maxPerPayment;
        uint256 occupied;
        uint64 expiresAt;
        uint64 policyVersion;
        uint64 epoch;
        bool revoked;
        bool exists;
    }

    struct Payment {
        bytes32 mandateId;
        uint64 policyVersion;
        bytes32 sessionId;
        uint64 sessionEpoch;
        bytes32 stepId;
        bytes32 merchantId;
        bytes32 requestHash;
        bytes32 quoteHash;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }

    struct Commitment {
        Payment payment;
        bool released;
        bool exists;
    }
    mapping(bytes32 => Policy) private policies;
    mapping(bytes32 => mapping(bytes32 => Session)) private sessions;
    mapping(bytes32 => mapping(uint64 => mapping(bytes32 => Merchant))) private merchants;
    mapping(bytes32 => mapping(uint64 => mapping(bytes32 => Step))) private steps;
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => bool))) public sessionStep;
    mapping(bytes32 => mapping(bytes32 => bool)) public usedStep;
    mapping(bytes32 => Commitment) private commitments;

    error Unauthorized();
    error InvalidPolicy();
    error InvalidSession();
    error InvalidPayment();
    error InvalidSignature();
    error BudgetExceeded();
    error StepAlreadyUsed();
    error UnsafeRelease();
    error UnsupportedAsset();
    event PolicyChanged(
        bytes32 indexed mandateId,
        uint64 version,
        bytes32 taskHash,
        uint256 budget,
        uint256 maxPerPayment,
        uint64 expiresAt
    );
    event PauseChanged(bytes32 indexed mandateId, bool paused, uint64 version);
    event MandateRevoked(bytes32 indexed mandateId, uint64 version);
    event SessionGranted(
        bytes32 indexed mandateId,
        bytes32 indexed sessionId,
        address signer,
        uint64 version,
        uint64 epoch,
        uint256 budget
    );
    event SessionRevoked(bytes32 indexed mandateId, bytes32 indexed sessionId, uint64 epoch);
    event PaymentRegistered(
        bytes32 indexed digest,
        bytes32 indexed mandateId,
        bytes32 indexed stepId,
        bytes32 sessionId,
        uint256 value,
        bytes32 nonce,
        uint256 validBefore,
        bytes32 requestHash,
        bytes32 quoteHash
    );
    event PaymentReleased(bytes32 indexed digest, bytes32 indexed mandateId, bytes32 sessionId, uint256 value);
    event OwnerWithdrawal(address indexed to, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, IAuthorizationAsset asset_) EIP712("MandateWallet", "2") {
        if (owner_ == address(0) || address(asset_).code.length == 0 || asset_.decimals() != 6) {
            revert UnsupportedAsset();
        }
        owner = owner_;
        asset = asset_;
        deploymentChainId = block.chainid;
        tokenDomain = asset_.DOMAIN_SEPARATOR();
        if (tokenDomain == bytes32(0)) revert UnsupportedAsset();
    }

    function _limits(Limits calldata l, uint256 occupied) private view {
        if (
            block.chainid != deploymentChainId || l.budget == 0 || l.budget < occupied || l.maxPerPayment == 0
                || l.maxPerPayment > l.budget || l.expiresAt <= block.timestamp
        ) revert InvalidPolicy();
    }

    function _scope(bytes32 id, uint64 version, Merchant[] calldata ms, Step[] calldata ss) private {
        if (ms.length == 0 || ms.length > MAX_MERCHANTS || ss.length == 0 || ss.length > MAX_STEPS) {
            revert InvalidPolicy();
        }
        for (uint256 i; i < ms.length; ++i) {
            Merchant calldata m = ms[i];
            if (m.id == bytes32(0) || m.payTo == address(0) || merchants[id][version][m.id].id != bytes32(0)) {
                revert InvalidPolicy();
            }
            merchants[id][version][m.id] = m;
        }
        for (uint256 i; i < ss.length; ++i) {
            Step calldata s = ss[i];
            if (
                s.id == bytes32(0) || s.requestHash == bytes32(0)
                    || merchants[id][version][s.merchantId].id == bytes32(0)
                    || steps[id][version][s.id].id != bytes32(0)
            ) revert InvalidPolicy();
            steps[id][version][s.id] = s;
        }
    }

    function createMandate(
        bytes32 id,
        bytes32 taskHash,
        Limits calldata limits,
        Merchant[] calldata ms,
        Step[] calldata ss
    ) external onlyOwner {
        if (id == bytes32(0) || taskHash == bytes32(0) || policies[id].exists) {
            revert InvalidPolicy();
        }
        _limits(limits, 0);
        policies[id] = Policy(taskHash, limits.budget, limits.maxPerPayment, 0, limits.expiresAt, 1, false, false, true);
        _scope(id, 1, ms, ss);
        emit PolicyChanged(id, 1, taskHash, limits.budget, limits.maxPerPayment, limits.expiresAt);
    }

    function replacePolicy(bytes32 id, Limits calldata limits, Merchant[] calldata ms, Step[] calldata ss)
        external
        onlyOwner
    {
        Policy storage p = policies[id];
        if (!p.exists || p.revoked) revert InvalidPolicy();
        _limits(limits, p.occupied);
        ++p.version;
        p.budget = limits.budget;
        p.maxPerPayment = limits.maxPerPayment;
        p.expiresAt = limits.expiresAt;
        _scope(id, p.version, ms, ss);
        emit PolicyChanged(id, p.version, p.taskHash, p.budget, p.maxPerPayment, p.expiresAt);
    }

    function setPaused(bytes32 id, bool paused) external onlyOwner {
        Policy storage p = policies[id];
        if (!p.exists || p.revoked || p.paused == paused) revert InvalidPolicy();
        p.paused = paused;
        ++p.version;
        // Scope remains intentionally empty in the new version. Resume requires owner replacement.
        emit PauseChanged(id, paused, p.version);
    }

    function revokeMandate(bytes32 id) external onlyOwner {
        Policy storage p = policies[id];
        if (!p.exists || p.revoked) revert InvalidPolicy();
        p.revoked = true;
        ++p.version;
        emit MandateRevoked(id, p.version);
    }

    function grantSession(
        bytes32 id,
        bytes32 sessionId,
        address signer,
        uint256 budget,
        uint256 maxPerPayment,
        uint64 expiresAt,
        bytes32[] calldata stepIds
    ) external onlyOwner {
        Policy storage p = policies[id];
        if (!p.exists || p.revoked || p.paused || block.timestamp >= p.expiresAt || block.chainid != deploymentChainId) revert InvalidPolicy();
        if (
            sessionId == bytes32(0) || sessions[id][sessionId].exists || signer == address(0) || budget == 0
                || budget > p.budget || maxPerPayment == 0 || maxPerPayment > budget || maxPerPayment > p.maxPerPayment
                || expiresAt <= block.timestamp || expiresAt > p.expiresAt || stepIds.length == 0
                || stepIds.length > MAX_STEPS
        ) revert InvalidSession();
        for (uint256 i; i < stepIds.length; ++i) {
            if (steps[id][p.version][stepIds[i]].id == bytes32(0) || sessionStep[id][sessionId][stepIds[i]]) {
                revert InvalidSession();
            }
            sessionStep[id][sessionId][stepIds[i]] = true;
        }
        sessions[id][sessionId] = Session(signer, budget, maxPerPayment, 0, expiresAt, p.version, 1, false, true);
        emit SessionGranted(id, sessionId, signer, p.version, 1, budget);
    }

    function revokeSession(bytes32 id, bytes32 sessionId) external onlyOwner {
        Session storage s = sessions[id][sessionId];
        if (!s.exists || s.revoked) revert InvalidSession();
        s.revoked = true;
        ++s.epoch;
        emit SessionRevoked(id, sessionId, s.epoch);
    }

    function paymentNonce(bytes32 id, bytes32 stepId) public view returns (bytes32) {
        return keccak256(abi.encode(deploymentChainId, address(this), id, stepId));
    }

    function paymentDigest(Payment calldata p) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                tokenDomain,
                keccak256(abi.encode(AUTH_TYPE, address(this), p.to, p.value, p.validAfter, p.validBefore, p.nonce))
            )
        );
    }

    function registrationDigest(Payment calldata p) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REGISTER_TYPE,
                    p.mandateId,
                    p.policyVersion,
                    p.sessionId,
                    p.sessionEpoch,
                    p.stepId,
                    p.merchantId,
                    p.requestHash,
                    p.quoteHash,
                    p.to,
                    p.value,
                    p.validAfter,
                    p.validBefore,
                    p.nonce
                )
            )
        );
    }

    function quoteDigest(Payment calldata p) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    QUOTE_TYPE,
                    p.mandateId,
                    p.policyVersion,
                    p.stepId,
                    p.requestHash,
                    p.quoteHash,
                    p.to,
                    p.value,
                    p.validBefore
                )
            )
        );
    }

    function _validSigner(bytes32 digest, bytes calldata sig, address expected) private pure returns (bool) {
        if (sig.length != 65) return false;
        (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, sig);
        return error == ECDSA.RecoverError.NoError && signer == expected;
    }

    function _live(Payment memory payment) private view returns (bool) {
        Policy storage p = policies[payment.mandateId];
        Session storage s = sessions[payment.mandateId][payment.sessionId];
        return block.chainid == deploymentChainId && p.exists && !p.paused && !p.revoked
            && p.version == payment.policyVersion && block.timestamp < p.expiresAt && s.exists && !s.revoked
            && s.policyVersion == p.version && s.epoch == payment.sessionEpoch && block.timestamp < s.expiresAt;
    }

    function registerPayment(
        Payment calldata payment,
        bytes calldata registrationSignature,
        bytes calldata quoteSignature
    ) external nonReentrant returns (bytes32 digest) {
        if (!_live(payment)) revert InvalidSession();
        Policy storage p = policies[payment.mandateId];
        Session storage s = sessions[payment.mandateId][payment.sessionId];
        Step storage step = steps[payment.mandateId][p.version][payment.stepId];
        Merchant storage merchant = merchants[payment.mandateId][p.version][payment.merchantId];
        if (usedStep[payment.mandateId][payment.stepId]) revert StepAlreadyUsed();
        if (
            step.id == bytes32(0) || !sessionStep[payment.mandateId][payment.sessionId][payment.stepId]
                || payment.merchantId != step.merchantId || payment.requestHash != step.requestHash
                || payment.quoteHash == bytes32(0) || merchant.id == bytes32(0) || payment.to != merchant.payTo
                || payment.value == 0 || payment.value > p.maxPerPayment || payment.value > s.maxPerPayment
                || payment.validAfter != 0 || payment.validBefore <= block.timestamp
                || payment.validBefore > block.timestamp + MAX_PAYMENT_SECONDS || payment.validBefore > p.expiresAt
                || payment.validBefore > s.expiresAt || payment.nonce != paymentNonce(payment.mandateId, payment.stepId)
                || asset.DOMAIN_SEPARATOR() != tokenDomain || asset.authorizationState(address(this), payment.nonce)
        ) revert InvalidPayment();
        if (payment.value > p.budget - p.occupied || payment.value > s.budget - s.occupied) revert BudgetExceeded();
        if (!_validSigner(registrationDigest(payment), registrationSignature, s.signer)) revert InvalidSignature();
        if (
            merchant.quoteSigner != address(0)
                && !_validSigner(quoteDigest(payment), quoteSignature, merchant.quoteSigner)
        ) revert InvalidSignature();
        digest = paymentDigest(payment);
        if (commitments[digest].exists) revert StepAlreadyUsed();
        p.occupied += payment.value;
        s.occupied += payment.value;
        usedStep[payment.mandateId][payment.stepId] = true;
        commitments[digest] = Commitment(payment, false, true);
        emit PaymentRegistered(
            digest,
            payment.mandateId,
            payment.stepId,
            payment.sessionId,
            payment.value,
            payment.nonce,
            payment.validBefore,
            payment.requestHash,
            payment.quoteHash
        );
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        Commitment storage c = commitments[digest];
        if (
            !c.exists || c.released || !_live(c.payment) || block.timestamp <= c.payment.validAfter
                || block.timestamp >= c.payment.validBefore || asset.DOMAIN_SEPARATOR() != tokenDomain
                || asset.authorizationState(address(this), c.payment.nonce)
        ) return INVALID;
        return
            _validSigner(digest, signature, sessions[c.payment.mandateId][c.payment.sessionId].signer) ? MAGIC : INVALID;
    }

    function releaseExpired(bytes32 digest) external nonReentrant {
        Commitment storage c = commitments[digest];
        if (
            block.chainid != deploymentChainId || !c.exists || c.released || block.timestamp <= c.payment.validBefore
                || asset.authorizationState(address(this), c.payment.nonce)
        ) revert UnsafeRelease();
        c.released = true;
        policies[c.payment.mandateId].occupied -= c.payment.value;
        sessions[c.payment.mandateId][c.payment.sessionId].occupied -= c.payment.value;
        emit PaymentReleased(digest, c.payment.mandateId, c.payment.sessionId, c.payment.value);
    }

    function getPolicy(bytes32 id) external view returns (Policy memory) {
        return policies[id];
    }

    function getSession(bytes32 id, bytes32 sessionId) external view returns (Session memory) {
        return sessions[id][sessionId];
    }

    function getStep(bytes32 id, uint64 version, bytes32 stepId) external view returns (Step memory) {
        return steps[id][version][stepId];
    }

    function getMerchant(bytes32 id, uint64 version, bytes32 merchantId) external view returns (Merchant memory) {
        return merchants[id][version][merchantId];
    }

    function getCommitment(bytes32 digest) external view returns (Commitment memory) {
        return commitments[digest];
    }

    function ownerWithdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0) || block.chainid != deploymentChainId) revert Unauthorized();
        IERC20(address(asset)).safeTransfer(to, amount);
        emit OwnerWithdrawal(to, amount);
    }
}
