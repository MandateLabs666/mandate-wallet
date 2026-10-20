// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {MandateAccount, IAuthorizationAsset} from "../src/MandateAccount.sol";
import {MandateFactory} from "../src/MandateFactory.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract MandateAccountTest is Test {
    MandateAccount internal wallet;
    TestUSDC internal token;
    address internal owner;
    address internal merchant;
    uint256 internal constant KEY_A = 0x402a;
    uint256 internal constant KEY_B = 0x402b;
    uint256 internal constant QUOTE_KEY = 0x402c;
    bytes32 internal constant ID = keccak256("task");
    bytes32 internal constant SESSION_A = keccak256("agent-a");
    bytes32 internal constant SESSION_B = keccak256("agent-b");
    bytes32 internal constant MERCHANT = keccak256("merchant");
    bytes32 internal constant STEP_A = keccak256("step-a");
    bytes32 internal constant STEP_B = keccak256("step-b");
    bytes32 internal constant REQUEST = keccak256("GET:/data?symbol=ETH");
    bytes4 internal constant INVALID = 0xffffffff;

    function setUp() public {
        vm.warp(1000);
        owner = makeAddr("owner");
        merchant = makeAddr("merchant");
        token = new TestUSDC();
        wallet = new MandateAccount(owner, IAuthorizationAsset(address(token)));
        token.mint(address(wallet), 1000000);
        _create(address(0));
        _grant(SESSION_A, KEY_A, 150000, _ids());
        _grant(SESSION_B, KEY_B, 150000, _ids());
    }

    function _ids() internal pure returns (bytes32[] memory ids) {
        ids = new bytes32[](2);
        ids[0] = STEP_A;
        ids[1] = STEP_B;
    }

    function _scope(address quoteSigner)
        internal
        view
        returns (MandateAccount.Merchant[] memory ms, MandateAccount.Step[] memory ss)
    {
        ms = new MandateAccount.Merchant[](1);
        ms[0] = MandateAccount.Merchant(MERCHANT, merchant, quoteSigner);
        ss = new MandateAccount.Step[](2);
        ss[0] = MandateAccount.Step(STEP_A, MERCHANT, REQUEST);
        ss[1] = MandateAccount.Step(STEP_B, MERCHANT, REQUEST);
    }

    function _create(address quoteSigner) internal {
        (MandateAccount.Merchant[] memory ms, MandateAccount.Step[] memory ss) = _scope(quoteSigner);
        vm.prank(owner);
        wallet.createMandate(ID, keccak256("task-description"), MandateAccount.Limits(150000, 100000, 3000), ms, ss);
    }

    function _replace(uint256 budget, address quoteSigner) internal {
        (MandateAccount.Merchant[] memory ms, MandateAccount.Step[] memory ss) = _scope(quoteSigner);
        vm.prank(owner);
        wallet.replacePolicy(ID, MandateAccount.Limits(budget, 100000, 3000), ms, ss);
    }

    function _grant(bytes32 sid, uint256 key, uint256 budget, bytes32[] memory ids) internal {
        vm.prank(owner);
        wallet.grantSession(ID, sid, vm.addr(key), budget, 100000, 2900, ids);
    }

    function _payment(bytes32 step, bytes32 sid, uint256 value) internal view returns (MandateAccount.Payment memory) {
        MandateAccount.Policy memory p = wallet.getPolicy(ID);
        MandateAccount.Session memory s = wallet.getSession(ID, sid);
        return MandateAccount.Payment(
            ID,
            p.version,
            sid,
            s.epoch,
            step,
            MERCHANT,
            REQUEST,
            keccak256("quote"),
            merchant,
            value,
            0,
            block.timestamp + 300,
            wallet.paymentNonce(ID, step)
        );
    }

    function _sign(bytes32 digest, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _register(MandateAccount.Payment memory p, uint256 key) internal returns (bytes32) {
        return wallet.registerPayment(p, _sign(wallet.registrationDigest(p), key), "");
    }

    function _settle(MandateAccount.Payment memory p, uint256 key) internal {
        token.transferWithAuthorization(
            address(wallet), p.to, p.value, p.validAfter, p.validBefore, p.nonce, _sign(wallet.paymentDigest(p), key)
        );
    }

    function test_normalTwoAgentsShareRootBudgetAndActualTokenTransfer() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        MandateAccount.Payment memory b = _payment(STEP_B, SESSION_B, 50000);
        bytes32 d = _register(a, KEY_A);
        _register(b, KEY_B);
        _settle(a, KEY_A);
        _settle(b, KEY_B);
        assertEq(wallet.getPolicy(ID).occupied, 150000);
        assertEq(wallet.getSession(ID, SESSION_A).occupied, 100000);
        assertEq(wallet.getSession(ID, SESSION_B).occupied, 50000);
        assertEq(token.balanceOf(merchant), 150000);
        assertEq(token.balanceOf(address(wallet)), 850000);
        assertEq(wallet.isValidSignature(d, _sign(d, KEY_A)), INVALID);
        assertEq(token.allowance(address(wallet), merchant), 0);
    }

    function test_twoPointOneRequestsReserveAtMostOne() public {
        _register(_payment(STEP_A, SESSION_A, 100000), KEY_A);
        MandateAccount.Payment memory b = _payment(STEP_B, SESSION_B, 100000);
        bytes memory sig = _sign(wallet.registrationDigest(b), KEY_B);
        vm.expectRevert(MandateAccount.BudgetExceeded.selector);
        wallet.registerPayment(b, sig, "");
        assertEq(wallet.getPolicy(ID).occupied, 100000);
        assertFalse(wallet.usedStep(ID, STEP_B));
    }

    function test_duplicateAcrossAgentsVersionsAndReleaseNeverReusesStep() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes32 d = _register(a, KEY_A);
        _replace(150000, address(0));
        _grant(keccak256("v2"), KEY_B, 150000, _ids());
        assertEq(wallet.paymentNonce(ID, STEP_A), a.nonce);
        assertEq(wallet.getPolicy(ID).occupied, 100000);
        MandateAccount.Payment memory again = _payment(STEP_A, keccak256("v2"), 100000);
        bytes memory sig = _sign(wallet.registrationDigest(again), KEY_B);
        vm.expectRevert(MandateAccount.StepAlreadyUsed.selector);
        wallet.registerPayment(again, sig, "");
        vm.warp(a.validBefore + 1);
        wallet.releaseExpired(d);
        assertEq(wallet.getPolicy(ID).occupied, 0);
        assertEq(wallet.getSession(ID, SESSION_A).occupied, 0);
        assertTrue(wallet.usedStep(ID, STEP_A));
        again = _payment(STEP_A, keccak256("v2"), 100000);
        sig = _sign(wallet.registrationDigest(again), KEY_B);
        vm.expectRevert(MandateAccount.StepAlreadyUsed.selector);
        wallet.registerPayment(again, sig, "");
        vm.expectRevert(MandateAccount.UnsafeRelease.selector);
        wallet.releaseExpired(d);
    }

    function test_pauseResumeAndVersionReplacementDoNotRevivePayment() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes32 d = _register(a, KEY_A);
        bytes memory sig = _sign(d, KEY_A);
        assertEq(wallet.isValidSignature(d, sig), bytes4(0x1626ba7e));
        vm.prank(owner);
        wallet.setPaused(ID, true);
        assertEq(wallet.isValidSignature(d, sig), INVALID);
        vm.prank(owner);
        wallet.setPaused(ID, false);
        assertEq(wallet.isValidSignature(d, sig), INVALID);
        _replace(150000, address(0));
        assertEq(wallet.isValidSignature(d, sig), INVALID);
        assertEq(wallet.getPolicy(ID).occupied, 100000);
        _grant(keccak256("resumed"), KEY_B, 150000, _ids());
        _register(_payment(STEP_B, keccak256("resumed"), 50000), KEY_B);
        assertEq(wallet.getPolicy(ID).occupied, 150000);
    }

    function test_budgetCannotShrinkBelowOccupancyAndReplacementIsAtomic() public {
        _register(_payment(STEP_A, SESSION_A, 100000), KEY_A);
        vm.expectRevert(MandateAccount.InvalidPolicy.selector);
        _replace(99999, address(0));
        assertEq(wallet.getPolicy(ID).version, 1);
        assertEq(wallet.getPolicy(ID).budget, 150000);
    }

    function test_prevalidationThenRootOrSessionRevocationRejectsSettlement() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes32 d = _register(a, KEY_A);
        assertEq(wallet.isValidSignature(d, _sign(d, KEY_A)), bytes4(0x1626ba7e));
        vm.prank(owner);
        wallet.revokeSession(ID, SESSION_A);
        bytes memory sig = _sign(d, KEY_A);
        vm.expectRevert("signature");
        token.transferWithAuthorization(address(wallet), a.to, a.value, 0, a.validBefore, a.nonce, sig);
        assertFalse(token.authorizationState(address(wallet), a.nonce));
        vm.prank(owner);
        wallet.revokeMandate(ID);
        vm.expectRevert(MandateAccount.InvalidPolicy.selector);
        _replace(150000, address(0));
        assertEq(wallet.getPolicy(ID).occupied, 100000);
        vm.warp(a.validBefore + 1);
        wallet.releaseExpired(d);
        assertEq(wallet.getPolicy(ID).occupied, 0);
        vm.expectRevert(MandateAccount.InvalidPolicy.selector);
        _create(address(0));
    }

    function test_expiryPaidAndCanceledNonceKeepCorrectOccupancy() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes32 da = _register(a, KEY_A);
        _settle(a, KEY_A);
        MandateAccount.Payment memory b = _payment(STEP_B, SESSION_B, 50000);
        bytes32 db = _register(b, KEY_B);
        token.cancelForTest(address(wallet), b.nonce);
        vm.warp(a.validBefore + 1);
        vm.expectRevert(MandateAccount.UnsafeRelease.selector);
        wallet.releaseExpired(da);
        vm.expectRevert(MandateAccount.UnsafeRelease.selector);
        wallet.releaseExpired(db);
        assertEq(wallet.getPolicy(ID).occupied, 150000);
        assertEq(token.balanceOf(merchant), 100000);
    }

    function test_safeReleaseRequiresStrictExpiryAndUnusedNonce() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes32 d = _register(a, KEY_A);
        vm.expectRevert(MandateAccount.UnsafeRelease.selector);
        wallet.releaseExpired(d);
        vm.warp(a.validBefore);
        assertEq(wallet.isValidSignature(d, _sign(d, KEY_A)), INVALID);
        vm.expectRevert(MandateAccount.UnsafeRelease.selector);
        wallet.releaseExpired(d);
        vm.warp(a.validBefore + 1);
        wallet.releaseExpired(d);
        assertEq(wallet.getPolicy(ID).occupied, 0);
    }

    function test_sessionScopeAndLimitsCannotExpand() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = keccak256("not-approved");
        vm.expectRevert(MandateAccount.InvalidSession.selector);
        _grant(keccak256("bad"), KEY_B, 150000, ids);
        vm.expectRevert(MandateAccount.InvalidSession.selector);
        _grant(keccak256("large"), KEY_B, 150001, _ids());
        ids[0] = STEP_A;
        _grant(keccak256("narrow"), KEY_B, 100000, ids);
        MandateAccount.Payment memory b = _payment(STEP_B, keccak256("narrow"), 50000);
        bytes memory sig = _sign(wallet.registrationDigest(b), KEY_B);
        vm.expectRevert(MandateAccount.InvalidPayment.selector);
        wallet.registerPayment(b, sig, "");
        vm.prank(owner);
        wallet.revokeSession(ID, keccak256("narrow"));
        vm.expectRevert(MandateAccount.InvalidSession.selector);
        _grant(keccak256("narrow"), KEY_A, 100000, ids);
    }

    function test_unapprovedRequestMerchantValueWindowAndNonceRejectEvenWithValidSessionSignature() public {
        for (uint256 i; i < 6; ++i) {
            MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
            if (i == 0) a.requestHash = keccak256("malicious-resource");
            if (i == 1) a.to = owner;
            if (i == 2) a.merchantId = keccak256("other-merchant");
            if (i == 3) a.value = 0;
            if (i == 4) a.validBefore += 1;
            if (i == 5) a.nonce = keccak256("other-nonce");
            bytes memory sig = _sign(wallet.registrationDigest(a), KEY_A);
            vm.expectRevert(MandateAccount.InvalidPayment.selector);
            wallet.registerPayment(a, sig, "");
        }
        assertEq(wallet.getPolicy(ID).occupied, 0);
    }

    function test_wrongAndMalformedSignaturesUnregisteredDigestAndTamperReject() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes memory sig = _sign(wallet.registrationDigest(a), KEY_A);
        a.quoteHash = keccak256("tampered");
        vm.expectRevert(MandateAccount.InvalidSignature.selector);
        wallet.registerPayment(a, sig, "");
        vm.expectRevert(MandateAccount.InvalidSignature.selector);
        wallet.registerPayment(a, hex"1234", "");
        bytes32 d = _register(a, KEY_A);
        assertEq(wallet.isValidSignature(d, _sign(d, KEY_B)), INVALID);
        assertEq(wallet.isValidSignature(d, hex"1234"), INVALID);
        assertEq(wallet.isValidSignature(keccak256("not-registered"), sig), INVALID);
    }

    function test_chainAccountVersionAndEpochBound() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes memory sig = _sign(wallet.registrationDigest(a), KEY_A);
        uint256 original = block.chainid;
        vm.chainId(original + 1);
        vm.expectRevert(MandateAccount.InvalidSession.selector);
        wallet.registerPayment(a, sig, "");
        vm.chainId(original);
        MandateAccount other = new MandateAccount(owner, IAuthorizationAsset(address(token)));
        assertTrue(wallet.registrationDigest(a) != other.registrationDigest(a));
        a.policyVersion += 1;
        vm.expectRevert(MandateAccount.InvalidSession.selector);
        wallet.registerPayment(a, sig, "");
        a.policyVersion -= 1;
        a.sessionEpoch += 1;
        vm.expectRevert(MandateAccount.InvalidSession.selector);
        wallet.registerPayment(a, sig, "");
    }

    function test_sameSignatureCannotRegisterAtDifferentAccount() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes memory sig = _sign(wallet.registrationDigest(a), KEY_A);
        MandateAccount other = new MandateAccount(owner, IAuthorizationAsset(address(token)));
        (MandateAccount.Merchant[] memory ms, MandateAccount.Step[] memory ss) = _scope(address(0));
        vm.startPrank(owner);
        other.createMandate(ID, keccak256("task-description"), MandateAccount.Limits(150000, 100000, 3000), ms, ss);
        other.grantSession(ID, SESSION_A, vm.addr(KEY_A), 150000, 100000, 2900, _ids());
        vm.stopPrank();
        a.nonce = other.paymentNonce(ID, STEP_A);
        vm.expectRevert(MandateAccount.InvalidSignature.selector);
        other.registerPayment(a, sig, "");
        assertEq(other.getPolicy(ID).occupied, 0);
    }

    function test_rootRevocationAfterValidPrecheckStopsRealTokenSettlement() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes32 d = _register(a, KEY_A);
        bytes memory sig = _sign(d, KEY_A);
        assertEq(wallet.isValidSignature(d, sig), bytes4(0x1626ba7e));
        vm.prank(owner);
        wallet.revokeMandate(ID);
        vm.expectRevert("signature");
        token.transferWithAuthorization(address(wallet), a.to, a.value, 0, a.validBefore, a.nonce, sig);
        assertEq(token.balanceOf(merchant), 0);
        assertFalse(token.authorizationState(address(wallet), a.nonce));
        assertEq(wallet.getPolicy(ID).occupied, 100000);
    }

    function test_configuredMerchantQuoteSignerMustVerifyPaymentBoundQuote() public {
        _replace(150000, vm.addr(QUOTE_KEY));
        _grant(keccak256("quoted"), KEY_A, 150000, _ids());
        MandateAccount.Payment memory a = _payment(STEP_A, keccak256("quoted"), 100000);
        bytes memory sig = _sign(wallet.registrationDigest(a), KEY_A);
        bytes memory quote = _sign(wallet.quoteDigest(a), QUOTE_KEY);
        vm.expectRevert(MandateAccount.InvalidSignature.selector);
        wallet.registerPayment(a, sig, "");
        a.quoteHash = keccak256("changed-quote");
        sig = _sign(wallet.registrationDigest(a), KEY_A);
        vm.expectRevert(MandateAccount.InvalidSignature.selector);
        wallet.registerPayment(a, sig, quote);
        wallet.registerPayment(a, sig, _sign(wallet.quoteDigest(a), QUOTE_KEY));
    }

    function test_onlyOwnerMutationAndWithdrawalAndFailedTransferRemainReserved() public {
        vm.expectRevert(MandateAccount.Unauthorized.selector);
        wallet.setPaused(ID, true);
        vm.expectRevert(MandateAccount.Unauthorized.selector);
        wallet.revokeMandate(ID);
        vm.expectRevert(MandateAccount.Unauthorized.selector);
        wallet.revokeSession(ID, SESSION_A);
        vm.expectRevert(MandateAccount.Unauthorized.selector);
        wallet.ownerWithdraw(owner, 1);
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        _register(a, KEY_A);
        vm.prank(owner);
        wallet.ownerWithdraw(owner, 1000000);
        bytes memory sig = _sign(wallet.paymentDigest(a), KEY_A);
        vm.expectRevert();
        token.transferWithAuthorization(address(wallet), a.to, a.value, 0, a.validBefore, a.nonce, sig);
        assertFalse(token.authorizationState(address(wallet), a.nonce));
        assertEq(wallet.getPolicy(ID).occupied, 100000);
    }

    function test_assetDomainChangeFailsClosedWithoutRefundingCommitment() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes32 d = _register(a, KEY_A);
        vm.mockCall(
            address(token),
            abi.encodeWithSelector(token.DOMAIN_SEPARATOR.selector),
            abi.encode(keccak256("changed-token-domain"))
        );
        assertEq(wallet.isValidSignature(d, _sign(d, KEY_A)), INVALID);
        MandateAccount.Payment memory b = _payment(STEP_B, SESSION_B, 50000);
        bytes memory sig = _sign(wallet.registrationDigest(b), KEY_B);
        vm.expectRevert(MandateAccount.InvalidPayment.selector);
        wallet.registerPayment(b, sig, "");
        assertEq(wallet.getPolicy(ID).occupied, 100000);
    }

    function test_expiredRootSessionAndPaymentWindowsReject() public {
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes32 d = _register(a, KEY_A);
        bytes memory sig = _sign(d, KEY_A);
        vm.warp(2900);
        assertEq(wallet.isValidSignature(d, sig), INVALID);
        a = _payment(STEP_B, SESSION_B, 50000);
        sig = _sign(wallet.registrationDigest(a), KEY_B);
        vm.expectRevert(MandateAccount.InvalidSession.selector);
        wallet.registerPayment(a, sig, "");
        vm.warp(3000);
        vm.expectRevert(MandateAccount.InvalidSession.selector);
        wallet.registerPayment(a, sig, "");
    }

    function test_factoryPredictionOwnershipIdempotencyAndDistinctCaller() public {
        MandateFactory factory = new MandateFactory();
        bytes32 salt = keccak256("wallet");
        address predicted = factory.predictAccount(owner, IAuthorizationAsset(address(token)), salt);
        vm.prank(owner);
        address account = factory.createAccount(IAuthorizationAsset(address(token)), salt);
        assertEq(account, predicted);
        assertEq(MandateAccount(account).owner(), owner);
        vm.prank(owner);
        assertEq(factory.createAccount(IAuthorizationAsset(address(token)), salt), account);
        address attackerAccount = factory.createAccount(IAuthorizationAsset(address(token)), salt);
        assertTrue(attackerAccount != account);
        assertEq(MandateAccount(attackerAccount).owner(), address(this));
    }

    function testFuzz_explicitlyInvalidAmount(uint256 seed) public {
        // Every generated value is above the approved 100000 single-payment cap.
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, bound(seed, 100001, type(uint128).max));
        bytes memory sig = _sign(wallet.registrationDigest(a), KEY_A);
        vm.expectRevert(MandateAccount.InvalidPayment.selector);
        wallet.registerPayment(a, sig, "");
        assertEq(wallet.getPolicy(ID).occupied, 0);
    }

    function testFuzz_explicitlyWrongSigner(uint256 seed) public {
        // Keys in [1,1000000], excluding both approved keys, are guaranteed wrong.
        uint256 key = bound(seed, 1, 1000000);
        if (key == KEY_A || key == KEY_B) key = 1;
        MandateAccount.Payment memory a = _payment(STEP_A, SESSION_A, 100000);
        bytes memory sig = _sign(wallet.registrationDigest(a), key);
        vm.expectRevert(MandateAccount.InvalidSignature.selector);
        wallet.registerPayment(a, sig, "");
        assertEq(wallet.getPolicy(ID).occupied, 0);
    }
}
