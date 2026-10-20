// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {MandateWallet, IAuthorizationAsset} from "../src/MandateWallet.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MandateWalletTest is Test {
    MockUSDC token;
    MandateWallet wallet;
    address owner;
    address merchant;
    uint256 constant SESSION_KEY = 0x402;
    bytes32 constant ID = keccak256("task");
    bytes32 constant ETH = keccak256("eth-stats");
    bytes32 constant BTC = keccak256("btc-stats");

    function setUp() public {
        vm.warp(1000);
        owner = makeAddr("owner"); merchant = makeAddr("merchant");
        token = new MockUSDC();
        wallet = new MandateWallet(owner, IAuthorizationAsset(address(token)));
        token.mint(address(wallet), 1000000);
        bytes32[] memory steps = new bytes32[](2); steps[0] = ETH; steps[1] = BTC;
        vm.prank(owner);
        wallet.createMandate(ID, vm.addr(SESSION_KEY), merchant, 150000, 100000, 2000, steps);
    }
    function payment(bytes32 step, uint256 amount) internal view returns (MandateWallet.Payment memory) {
        return MandateWallet.Payment(ID, step, keccak256("request"), keccak256("quote"), merchant, amount, 0, block.timestamp + 300, wallet.paymentNonce(ID, step));
    }
    function sign(bytes32 digest, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest); return abi.encodePacked(r,s,v);
    }
    function reserve(MandateWallet.Payment memory p) internal returns (bytes32) { return wallet.registerPayment(p, sign(wallet.registrationDigest(p), SESSION_KEY)); }
    function settle(MandateWallet.Payment memory p) internal {
        token.transferWithAuthorization(address(wallet), p.to, p.value, p.validAfter, p.validBefore, p.nonce, sign(wallet.paymentDigest(p), SESSION_KEY));
    }
    function expectSettlementFailure(MandateWallet.Payment memory p, bytes memory reason) internal {
        bytes memory sig = sign(wallet.paymentDigest(p), SESSION_KEY);
        if(reason.length == 0) vm.expectRevert(); else vm.expectRevert(reason);
        token.transferWithAuthorization(address(wallet), p.to, p.value, p.validAfter, p.validBefore, p.nonce, sig);
    }
    function test_normalPaymentAndAccounting() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); reserve(p); settle(p);
        assertEq(token.balanceOf(merchant), 100000); assertEq(token.balanceOf(address(wallet)), 900000);
        assertEq(wallet.getMandate(ID).occupied, 100000); assertTrue(token.authorizationState(address(wallet), p.nonce));
    }
    function test_twoReservationsCannotOverspend() public {
        reserve(payment(ETH, 100000));
        MandateWallet.Payment memory p = payment(BTC, 100000); bytes memory sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.BudgetExceeded.selector); wallet.registerPayment(p, sig);
        assertEq(wallet.getMandate(ID).occupied, 100000);
    }
    function test_sameStepOnlyOnceEvenAfterRelease() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes32 d = reserve(p);
        bytes memory sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.StepAlreadyUsed.selector); wallet.registerPayment(p, sig);
        vm.warp(p.validBefore + 1); wallet.releaseExpired(d);
        p.validBefore = block.timestamp + 300; sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.StepAlreadyUsed.selector); wallet.registerPayment(p, sig);
    }
    function test_unregisteredSignatureRejected() public {
        MandateWallet.Payment memory p = payment(ETH, 100000);
        assertEq(wallet.isValidSignature(wallet.paymentDigest(p), sign(wallet.paymentDigest(p), SESSION_KEY)), bytes4(0xffffffff));
        expectSettlementFailure(p, bytes("signature"));
    }
    function test_revokeAfterPreverificationPreventsSettlement() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes32 d = reserve(p);
        assertEq(wallet.isValidSignature(d, sign(d, SESSION_KEY)), bytes4(0x1626ba7e));
        vm.prank(owner); wallet.revokeMandate(ID);
        assertEq(wallet.isValidSignature(d, sign(d, SESSION_KEY)), bytes4(0xffffffff));
        expectSettlementFailure(p, bytes("signature"));
        assertEq(wallet.getMandate(ID).occupied, 100000);
    }
    function test_tamperedAmountRecipientAndNonceRejected() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); reserve(p);
        p.value = 99999; expectSettlementFailure(p, bytes("signature"));
        p.value = 100000; p.to = owner; expectSettlementFailure(p, bytes("signature"));
        p.to = merchant; p.nonce = keccak256("fresh"); expectSettlementFailure(p, bytes("signature"));
    }
    function test_changedChainInvalidatesRegistrationAndPayment() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes32 d = reserve(p);
        vm.chainId(block.chainid + 1);
        assertEq(wallet.isValidSignature(d, sign(d, SESSION_KEY)), bytes4(0xffffffff));
        p = payment(BTC, 1000); bytes memory sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.InvalidPolicy.selector); wallet.registerPayment(p, sig);
    }
    function test_otherWalletRejectsSameSignature() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes32 d = reserve(p);
        MandateWallet other = new MandateWallet(owner, IAuthorizationAsset(address(token)));
        assertEq(other.isValidSignature(d, sign(d, SESSION_KEY)), bytes4(0xffffffff));
    }
    function test_releaseNeedsExpiryAndUnusedNonce() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes32 d = reserve(p);
        vm.expectRevert(MandateWallet.UnsafeRelease.selector); wallet.releaseExpired(d);
        vm.warp(p.validBefore); vm.expectRevert(MandateWallet.UnsafeRelease.selector); wallet.releaseExpired(d);
        vm.warp(p.validBefore + 1); wallet.releaseExpired(d); assertEq(wallet.getMandate(ID).occupied, 0);
        vm.expectRevert(MandateWallet.UnsafeRelease.selector); wallet.releaseExpired(d);
    }
    function test_paidCannotBeReleased() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes32 d = reserve(p); settle(p);
        vm.warp(p.validBefore + 1); vm.expectRevert(MandateWallet.UnsafeRelease.selector); wallet.releaseExpired(d);
    }
    function test_canceledNonceIsNotAssumedPaidOrReleased() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes32 d = reserve(p);
        token.cancelForTest(address(wallet), p.nonce); assertEq(token.balanceOf(merchant), 0);
        vm.warp(p.validBefore + 1); vm.expectRevert(MandateWallet.UnsafeRelease.selector); wallet.releaseExpired(d);
        assertEq(wallet.getMandate(ID).occupied, 100000);
    }
    function test_expiredSignatureAndMandateRejected() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes32 d = reserve(p);
        vm.warp(p.validBefore); assertEq(wallet.isValidSignature(d, sign(d, SESSION_KEY)), bytes4(0xffffffff));
        vm.warp(2000); p = payment(BTC, 1000); bytes memory sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.InvalidPolicy.selector); wallet.registerPayment(p, sig);
    }
    function test_onlyOwnerCanCreateRevokeWithdraw() public {
        vm.expectRevert(MandateWallet.Unauthorized.selector); wallet.revokeMandate(ID);
        vm.expectRevert(MandateWallet.Unauthorized.selector); wallet.withdrawAsset(owner, 1);
        bytes32[] memory steps = new bytes32[](1); steps[0] = ETH;
        vm.expectRevert(MandateWallet.Unauthorized.selector); wallet.createMandate(keccak256("x"), owner, merchant, 1, 1, 2000, steps);
    }
    function test_badSessionAndMalformedSignaturesRejected() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes memory sig = sign(wallet.registrationDigest(p), 999);
        vm.expectRevert(MandateWallet.InvalidSignature.selector); wallet.registerPayment(p, sig);
        bytes32 d = reserve(p); assertEq(wallet.isValidSignature(d, hex"1234"), bytes4(0xffffffff));
        assertEq(wallet.isValidSignature(d, sign(d, 999)), bytes4(0xffffffff));
    }
    function test_zeroAmountInvalidStepAndLongDeadlineRejected() public {
        MandateWallet.Payment memory p = payment(ETH, 0); bytes memory sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.InvalidPayment.selector); wallet.registerPayment(p, sig);
        p = payment(keccak256("invented-step"), 1000); sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.InvalidPolicy.selector); wallet.registerPayment(p, sig);
        p = payment(ETH, 1000); p.validBefore += 1; sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.InvalidPayment.selector); wallet.registerPayment(p, sig);
    }
    function test_failedTokenTransferKeepsReservation() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); reserve(p);
        vm.prank(owner); wallet.withdrawAsset(owner, 1000000);
        expectSettlementFailure(p, bytes(""));
        assertFalse(token.authorizationState(address(wallet), p.nonce)); assertEq(wallet.getMandate(ID).occupied, 100000);
    }
    function test_replayCannotTransferTwice() public {
        MandateWallet.Payment memory p = payment(ETH, 100000); reserve(p); settle(p);
        expectSettlementFailure(p, bytes("used")); assertEq(token.balanceOf(merchant), 100000);
    }
    function testFuzz_invalidAmountsCannotRegister(uint256 value) public {
        value = bound(value, 100001, type(uint128).max);
        MandateWallet.Payment memory p = payment(ETH, value); bytes memory sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        vm.expectRevert(MandateWallet.InvalidPayment.selector); wallet.registerPayment(p, sig);
        assertEq(wallet.getMandate(ID).occupied, 0);
    }
    function testFuzz_wrongKeysCannotRegister(uint256 key) public {
        key = bound(key, 1, type(uint128).max); vm.assume(key != SESSION_KEY);
        MandateWallet.Payment memory p = payment(ETH, 100000); bytes memory sig = sign(wallet.registrationDigest(p), key);
        vm.expectRevert(MandateWallet.InvalidSignature.selector); wallet.registerPayment(p, sig);
        assertEq(wallet.getMandate(ID).occupied, 0);
    }
    function testFuzz_mixedReservationsStayWithinBudget(uint256 a, uint256 b) public {
        a = bound(a, 1, 100000); b = bound(b, 1, 100000);
        reserve(payment(ETH, a)); MandateWallet.Payment memory p = payment(BTC, b); bytes memory sig = sign(wallet.registrationDigest(p), SESSION_KEY);
        if (a + b > 150000) { vm.expectRevert(MandateWallet.BudgetExceeded.selector); wallet.registerPayment(p, sig); }
        else { wallet.registerPayment(p, sig); }
        assertLe(wallet.getMandate(ID).occupied, 150000);
    }
}
