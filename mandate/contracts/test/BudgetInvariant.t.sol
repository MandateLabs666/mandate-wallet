// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MandateAccount, IAuthorizationAsset} from "../src/MandateAccount.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract BudgetHandler is Test {
    MandateAccount public wallet;
    TestUSDC public token;
    address public merchant;
    bytes32 public constant ID = keccak256("invariant-task");
    bytes32 private constant M = keccak256("merchant");
    bytes32 private constant REQUEST = keccak256("fixed-request");
    uint256 private constant KEY_A = 0xaaaa;
    uint256 private constant KEY_B = 0xbbbb;
    MandateAccount.Payment[] private registered;
    mapping(uint256 => bool) public released;
    mapping(uint256 => bool) public consumed;
    uint256 public paid;
    uint256 public rejected;
    uint256 public nextStep;

    constructor(MandateAccount wallet_, TestUSDC token_, address merchant_) {
        wallet = wallet_;
        token = token_;
        merchant = merchant_;
    }

    function _sig(bytes32 digest, uint256 key) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function register(uint256 amountSeed, bool agentB) external {
        if (nextStep >= 64) return;
        bytes32 sid = agentB ? bytes32(uint256(2)) : bytes32(uint256(1));
        uint256 value = bound(amountSeed, 1, 100000);
        bytes32 step = bytes32(nextStep + 1);
        MandateAccount.Payment memory p = MandateAccount.Payment(
            ID,
            1,
            sid,
            1,
            step,
            M,
            REQUEST,
            keccak256("quote"),
            merchant,
            value,
            0,
            block.timestamp + 300,
            wallet.paymentNonce(ID, step)
        );
        bytes memory sig = _sig(wallet.registrationDigest(p), agentB ? KEY_B : KEY_A);
        try wallet.registerPayment(p, sig, "") {
            registered.push(p);
            ++nextStep;
        }
            catch {
            ++rejected;
        }
    }

    function settleOrCancel(uint256 indexSeed, bool cancel) external {
        if (registered.length == 0) return;
        uint256 index = indexSeed % registered.length;
        MandateAccount.Payment memory p = registered[index];
        if (released[index] || consumed[index]) return;
        if (cancel) {
            token.cancelForTest(address(wallet), p.nonce);
            consumed[index] = true;
            return;
        }
        if (block.timestamp >= p.validBefore) return;
        bytes memory sig = _sig(wallet.paymentDigest(p), p.sessionId == bytes32(uint256(2)) ? KEY_B : KEY_A);
        token.transferWithAuthorization(address(wallet), p.to, p.value, p.validAfter, p.validBefore, p.nonce, sig);
        consumed[index] = true;
        paid += p.value;
    }

    function advanceAndRelease(uint256 indexSeed, uint256 deltaSeed) external {
        vm.warp(block.timestamp + bound(deltaSeed, 0, 60));
        if (registered.length == 0) return;
        uint256 index = indexSeed % registered.length;
        MandateAccount.Payment memory p = registered[index];
        if (released[index] || consumed[index] || block.timestamp <= p.validBefore) return;
        wallet.releaseExpired(wallet.paymentDigest(p));
        released[index] = true;
    }

    function independentOccupied(uint256 agent) public view returns (uint256 result) {
        for (uint256 i; i < registered.length; ++i) {
            if (!released[i] && (agent == 0 || registered[i].sessionId == bytes32(agent))) {
                result += registered[i].value;
            }
        }
    }
}

contract BudgetInvariantTest is StdInvariant, Test {
    MandateAccount wallet;
    TestUSDC token;
    BudgetHandler handler;
    address merchant;
    bytes32 constant ID = keccak256("invariant-task");

    function setUp() public {
        vm.warp(1000);
        token = new TestUSDC();
        merchant = makeAddr("merchant");
        wallet = new MandateAccount(address(this), IAuthorizationAsset(address(token)));
        token.mint(address(wallet), 1000000);
        MandateAccount.Merchant[] memory ms = new MandateAccount.Merchant[](1);
        ms[0] = MandateAccount.Merchant(keccak256("merchant"), merchant, address(0));
        MandateAccount.Step[] memory ss = new MandateAccount.Step[](64);
        bytes32[] memory ids = new bytes32[](64);
        for (uint256 i; i < 64; ++i) {
            ids[i] = bytes32(i + 1);
            ss[i] = MandateAccount.Step(ids[i], ms[0].id, keccak256("fixed-request"));
        }
        wallet.createMandate(ID, keccak256("task"), MandateAccount.Limits(150000, 100000, 1000000000), ms, ss);
        wallet.grantSession(ID, bytes32(uint256(1)), vm.addr(0xaaaa), 150000, 100000, 1000000000, ids);
        wallet.grantSession(ID, bytes32(uint256(2)), vm.addr(0xbbbb), 150000, 100000, 1000000000, ids);
        handler = new BudgetHandler(wallet, token, merchant);
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = BudgetHandler.register.selector;
        selectors[1] = BudgetHandler.settleOrCancel.selector;
        selectors[2] = BudgetHandler.advanceAndRelease.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariant_rootAndBothGrantsMatchIndependentReservationLedger() public view {
        uint256 root = handler.independentOccupied(0);
        assertEq(wallet.getPolicy(ID).occupied, root);
        assertLe(root, 150000);
        for (uint256 agent = 1; agent <= 2; ++agent) {
            uint256 occupied = handler.independentOccupied(agent);
            assertEq(wallet.getSession(ID, bytes32(agent)).occupied, occupied);
            assertLe(occupied, 150000);
        }
        assertLe(handler.paid(), root);
        assertEq(token.balanceOf(merchant), handler.paid());
        assertEq(token.balanceOf(address(wallet)) + handler.paid(), 1000000);
    }

    function testHandlerSettlementMovesFundsAndCancellationRetainsReservation() public {
        handler.register(20000, false);
        handler.register(30000, true);
        handler.settleOrCancel(0, false);
        handler.settleOrCancel(1, true);
        assertEq(handler.paid(), 20000);
        assertEq(token.balanceOf(merchant), 20000);
        assertEq(token.balanceOf(address(wallet)), 980000);
        assertEq(wallet.getPolicy(ID).occupied, 50000);
        invariant_rootAndBothGrantsMatchIndependentReservationLedger();
    }
}
