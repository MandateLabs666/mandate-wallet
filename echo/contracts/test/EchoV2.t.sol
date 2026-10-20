// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {EchoAuthContext, EchoPolicyInput, EchoPolicy} from "../src/EchoTypes.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {EchoIntentDecoder} from "../src/EchoIntentDecoder.sol";
import {EchoPolicyValidator} from "../src/EchoPolicyValidator.sol";
import {EchoDelegationModule} from "../src/EchoDelegationModule.sol";
import {EchoOnboarding} from "../src/EchoOnboarding.sol";
import {MockInputToken, MockOutputToken} from "../src/MockTokens.sol";
import {MockSwapRouter} from "../src/MockSwapRouter.sol";

abstract contract EchoFixture is Test {
    EntryPoint ep;
    PolicyRegistry registry;
    EchoIntentDecoder decoder;
    EchoPolicyValidator validator;
    EchoDelegationModule logic;
    EchoOnboarding onboarding;
    MockInputToken input;
    MockOutputToken output;
    MockSwapRouter router;
    uint256 constant OWNER_KEY = 0xa11ce;
    uint256 constant EXECUTE_KEY = 0xece;
    uint256 constant SESSION_KEY = 0x5e551;
    address owner;
    bytes32 id;
    bytes32 sessionId;

    function setUp() public virtual {
        vm.warp(1000);
        string memory official = string.concat(vm.projectRoot(), "/../../artifacts/m2/EntryPoint.v0.7.json");
        bytes memory creation = vm.parseJsonBytes(vm.readFile(official), ".bytecode.object");
        address deployed;
        assembly ("memory-safe") { deployed := create(0, add(creation, 32), mload(creation)) }
        require(deployed != address(0));
        ep = EntryPoint(payable(deployed));
        registry = new PolicyRegistry(address(this));
        decoder = new EchoIntentDecoder();
        validator = new EchoPolicyValidator();
        logic = new EchoDelegationModule(registry, decoder, validator, address(ep));
        onboarding = new EchoOnboarding(registry);
        registry.setImplementation(address(logic));
        registry.setOnboarding(address(onboarding));
        owner = vm.addr(OWNER_KEY);
        vm.signAndAttachDelegation(address(logic), OWNER_KEY);
        input = new MockInputToken();
        output = new MockOutputToken();
        router = new MockSwapRouter(address(input), address(output));
        input.mint(owner, 1000000);
        address[] memory outputs = new address[](1);
        outputs[0] = address(output);
        vm.prank(owner);
        id = onboarding.registerInstanceAndEip7702(
            EchoPolicyInput(
                address(input), address(router), vm.addr(EXECUTE_KEY), outputs, 100000, 150000, 150000, 100000
            )
        );
        vm.prank(owner);
        sessionId = registry.createSession(id, vm.addr(SESSION_KEY), address(output), 100000, 150000, 5, 100000);
        vm.deal(address(this), 10 ether);
        ep.depositTo{value: 1 ether}(owner);
    }

    function auth(uint256 nonce, bytes32 sid) internal view returns (EchoAuthContext memory) {
        EchoPolicy memory p = registry.getPolicy(id);
        return EchoAuthContext(
            id,
            p.version,
            sid,
            sid == bytes32(0) ? p.executeEpoch : registry.getSession(sid).epoch,
            0,
            uint48(block.timestamp + 300),
            nonce
        );
    }

    function inner(uint256 amount, bool exactOutput) internal view returns (bytes memory) {
        if (exactOutput) {
            return abi.encodeWithSelector(
                decoder.EXACT_OUTPUT_SINGLE(),
                EchoIntentDecoder.ExactOutputSingleParams(
                    address(input), address(output), 500, owner, block.timestamp + 300, 25000000000000, amount, 0
                )
            );
        }
        return abi.encodeWithSelector(
            decoder.EXACT_INPUT_SINGLE(),
            EchoIntentDecoder.ExactInputSingleParams(
                address(input), address(output), 500, owner, block.timestamp + 300, amount, amount * 1e18 / 2000e6, 0
            )
        );
    }

    function operation(uint256 nonce, uint256 amount, bytes32 sid, bool exactOutput)
        internal
        view
        returns (PackedUserOperation memory op)
    {
        op = PackedUserOperation(
            owner,
            nonce,
            "",
            abi.encodeCall(
                logic.execute,
                (
                    bytes32(0),
                    abi.encodePacked(address(router), uint256(0), inner(amount, exactOutput)),
                    auth(nonce, sid)
                )
            ),
            bytes32((uint256(500000) << 128) | 1000000),
            100000,
            bytes32((uint256(1) << 128) | 1),
            "",
            ""
        );
        op.signature = signature(ep.getUserOpHash(op), auth(nonce, sid), sid == bytes32(0) ? EXECUTE_KEY : SESSION_KEY);
    }

    function signature(bytes32 hash, EchoAuthContext memory a, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, validator.digest(owner, address(ep), address(logic), hash, a));
        return abi.encodePacked(bytes1(0x02), r, s, v);
    }

    function handle(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        ep.handleOps(ops, payable(address(0xbabe)));
    }

    function validate(PackedUserOperation memory op) internal returns (uint256) {
        bytes32 h = ep.getUserOpHash(op);
        vm.prank(address(ep));
        return EchoDelegationModule(payable(owner)).validateUserOp(op, h, 0);
    }
}

contract EchoV2Test is EchoFixture {
    function test_realEntryPointRealtimeSwap() public {
        handle(operation(0, 100000, bytes32(0), false));
        assertEq(input.balanceOf(owner), 900000);
        assertEq(output.balanceOf(owner), 50000000000000);
        assertEq(input.allowance(owner, address(router)), 0);
        assertEq(registry.getPolicy(id).totalSpent, 100000);
    }

    function test_sessionExactOutputActualSpendNotMaximum() public {
        handle(operation(0, 100000, sessionId, true));
        assertEq(registry.getPolicy(id).totalSpent, 50000);
        assertEq(registry.getSession(sessionId).totalSpent, 50000);
        assertEq(input.allowance(owner, address(router)), 0);
    }

    function test_twoValidatedOperationsShareExecutionBudget() public {
        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = operation(0, 100000, bytes32(0), false);
        ops[1] = operation(1, 100000, sessionId, false);
        ep.handleOps(ops, payable(address(0xbabe)));
        assertEq(registry.getPolicy(id).totalSpent, 100000);
        assertEq(input.balanceOf(owner), 900000);
        assertEq(ep.getNonce(owner, 0), 2);
    }

    function test_failedRouterRollsBackPrincipalAllowanceAndLedger() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        router.setFault(true, 0, "");
        handle(op);
        assertEq(registry.getPolicy(id).totalSpent, 0);
        assertEq(input.balanceOf(owner), 1000000);
        assertEq(input.allowance(owner, address(router)), 0);
        assertEq(ep.getNonce(owner, 0), 1);
    }

    function test_wrongOutputRevertsWholeSwap() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        router.setFault(false, 2, "");
        handle(op);
        assertEq(registry.getPolicy(id).totalSpent, 0);
        assertEq(input.balanceOf(owner), 1000000);
        assertEq(input.balanceOf(address(router)), 0);
    }

    function test_reentrantRouterCannotEnterAccount() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        router.setFault(false, 1, op.callData);
        handle(op);
        assertEq(registry.getPolicy(id).totalSpent, 0);
        assertEq(input.balanceOf(owner), 1000000);
    }

    function test_validationDoesNotRecordSpend() public {
        PackedUserOperation memory op = operation(0, 100000, sessionId, false);
        assertEq(validate(op) & uint160(type(uint160).max), 0);
        assertEq(validate(op) & uint160(type(uint160).max), 0);
        assertEq(registry.getPolicy(id).totalSpent, 0);
        assertEq(registry.getSession(sessionId).dailyOps, 0);
    }

    function test_legacyBearerAndWrongSignerRejected() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        op.signature = abi.encodePacked(bytes1(0x03), bytes32(EXECUTE_KEY));
        assertEq(validate(op) & 1, 1);
        op.signature = signature(ep.getUserOpHash(op), auth(0, bytes32(0)), SESSION_KEY);
        assertEq(validate(op) & 1, 1);
    }

    function test_publicSignatureCannotAuthorizeChangedOperation() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        op.preVerificationGas++;
        assertEq(validate(op) & 1, 1);
        op.preVerificationGas--;
        op.nonce = 1;
        assertEq(validate(op) & 1, 1);
        op.nonce = 0;
        op.gasFees = bytes32(uint256(2));
        assertEq(validate(op) & 1, 1);
    }

    function test_revokeAfterValidationRejectsSameOperation() public {
        PackedUserOperation memory op = operation(0, 100000, sessionId, false);
        assertEq(validate(op) & 1, 0);
        vm.prank(owner);
        registry.revokeSession(sessionId);
        assertEq(validate(op) & 1, 1);
        assertEq(registry.getPolicy(id).totalSpent, 0);
    }

    function test_pauseAndPolicyVersionInvalidatesSignatures() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        vm.prank(owner);
        registry.pauseInstance(id, true);
        assertEq(validate(op) & 1, 1);
        vm.prank(owner);
        registry.pauseInstance(id, false);
        assertEq(validate(op) & 1, 1);
    }

    function test_timeValidityDelegatedToEntryPoint() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        vm.warp(1400);
        assertEq(validate(op) & 1, 0);
        vm.expectRevert();
        handle(op);
        assertEq(registry.getPolicy(id).totalSpent, 0);
    }

    function test_replayCannotChargeTwice() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        handle(op);
        vm.expectRevert();
        handle(op);
        assertEq(registry.getPolicy(id).totalSpent, 100000);
    }

    function test_missingDepositNeverUsesEOABalance() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        vm.deal(owner, 1 ether);
        bytes32 h = ep.getUserOpHash(op);
        vm.prank(address(ep));
        assertEq(EchoDelegationModule(payable(owner)).validateUserOp(op, h, 1) & 1, 1);
        assertEq(owner.balance, 1 ether);
    }

    function test_chainReplayRejected() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        vm.chainId(block.chainid + 1);
        assertEq(validate(op) & 1, 1);
    }

    function test_nonzeroValueAndUnsupportedModeRejected() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        op.callData = abi.encodeCall(
            logic.execute,
            (bytes32(0), abi.encodePacked(address(router), uint256(1), inner(100000, false)), auth(0, bytes32(0)))
        );
        op.signature=signature(ep.getUserOpHash(op),auth(0,bytes32(0)),EXECUTE_KEY);
        assertEq(validate(op) & 1, 1);
        op.callData = abi.encodeCall(
            logic.execute,
            (
                bytes32(uint256(1)),
                abi.encodePacked(address(router), uint256(0), inner(100000, false)),
                auth(0, bytes32(0))
            )
        );
        op.signature=signature(ep.getUserOpHash(op),auth(0,bytes32(0)),EXECUTE_KEY);
        assertEq(validate(op) & 1, 1);
    }

    function test_dailyResetKeepsTotalAppendOnly() public {
        handle(operation(0, 50000, bytes32(0), false));
        vm.warp(86401);
        handle(operation(1, 50000, bytes32(0), false));
        EchoPolicy memory p = registry.getPolicy(id);
        assertEq(p.totalSpent, 100000);
        assertEq(p.dailySpent, 50000);
    }

    function test_ownerCallbacksRestrictedAndAtomic() public {
        EchoPolicy memory p = registry.getPolicy(id);
        address[] memory outputs = new address[](1);
        outputs[0] = address(output);
        vm.expectRevert();
        EchoDelegationModule(payable(owner)).syncPolicy(id, p, outputs);
        vm.prank(owner);
        registry.updateLimits(id, 100000, 150000, 150000, 99999);
        (, uint64 version,,,,) = EchoDelegationModule(payable(owner)).authorityState();
        assertEq(version, 2);
    }

    function testFuzz_invalidAmounts(uint256 amount) public {
        amount = bound(amount, 100001, type(uint128).max);
        PackedUserOperation memory op = operation(0, amount, bytes32(0), false);
        assertEq(validate(op) & 1, 1);
        assertEq(registry.getPolicy(id).totalSpent, 0);
    }

    function testFuzz_wrongSigner(uint256 key) public {
        key = bound(key, 1, type(uint128).max);
        vm.assume(key != EXECUTE_KEY);
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        op.signature = signature(ep.getUserOpHash(op), auth(0, bytes32(0)), key);
        assertEq(validate(op) & 1, 1);
    }

    function test_decoderMatchesBothCanonicalRouterABIs() public view {
        assertEq(decoder.EXACT_INPUT_SINGLE(), bytes4(0x414bf389));
        assertEq(decoder.EXACT_OUTPUT_SINGLE(), bytes4(0xdb3e2198));
        assertEq(decoder.decode(inner(100000, false)).maxAmountIn, 100000);
        assertEq(decoder.decode(inner(100000, true)).outputConstraint, 25000000000000);
    }

    function test_nonCanonicalAndTruncatedCalldataRejected() public {
        bytes memory good = inner(100000, false);
        vm.expectRevert();
        decoder.decode(bytes.concat(good, hex"00"));
        bytes memory shortCall = new bytes(good.length - 1);
        for (uint256 i; i < shortCall.length; i++) {
            shortCall[i] = good[i];
        }
        vm.expectRevert();
        decoder.decode(shortCall);
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        op.callData = bytes.concat(op.callData, hex"00");
        op.signature = signature(ep.getUserOpHash(op), auth(0, bytes32(0)), EXECUTE_KEY);
        assertEq(validate(op) & 1, 1);
    }

    function rejectedCall(address target, bytes memory data) internal {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        op.callData =
            abi.encodeCall(logic.execute, (bytes32(0), abi.encodePacked(target, uint256(0), data), auth(0, bytes32(0))));
        op.signature = signature(ep.getUserOpHash(op), auth(0, bytes32(0)), EXECUTE_KEY);
        assertEq(validate(op) & 1, 1);
    }

    function test_wrongRouterSelectorAssetRecipientRejectedWithValidSignatures() public {
        rejectedCall(address(0x1234), inner(100000, false));
        bytes memory data = inner(100000, false);
        data[0] = 0xff;
        rejectedCall(address(router), data);
        rejectedCall(
            address(router),
            abi.encodeWithSelector(
                decoder.EXACT_INPUT_SINGLE(),
                EchoIntentDecoder.ExactInputSingleParams(
                    address(output), address(input), 500, owner, 1300, 100000, 1, 0
                )
            )
        );
        rejectedCall(
            address(router),
            abi.encodeWithSelector(
                decoder.EXACT_INPUT_SINGLE(),
                EchoIntentDecoder.ExactInputSingleParams(
                    address(input), address(output), 500, address(0x1234), 1300, 100000, 1, 0
                )
            )
        );
    }

    function test_wrongImplementationAndAccountTypedDomainsRejected() public {
        PackedUserOperation memory op = operation(0, 100000, bytes32(0), false);
        bytes32 h = ep.getUserOpHash(op);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(EXECUTE_KEY, validator.digest(owner, address(ep), address(0x1234), h, auth(0, bytes32(0))));
        op.signature = abi.encodePacked(bytes1(0x02), r, s, v);
        assertEq(validate(op) & 1, 1);
        (v, r, s) =
            vm.sign(EXECUTE_KEY, validator.digest(address(0x1234), address(ep), address(logic), h, auth(0, bytes32(0))));
        op.signature = abi.encodePacked(bytes1(0x02), r, s, v);
        assertEq(validate(op) & 1, 1);
    }

    function test_syncFailureRollsBackOwnerModification() public {
        bytes memory designation = owner.code;
        vm.etch(owner, hex"60006000fd");
        vm.prank(owner);
        vm.expectRevert();
        registry.updateLimits(id, 50000, 100000, 150000, 99999);
        assertEq(registry.getPolicy(id).version, 1);
        assertEq(registry.getPolicy(id).maxPerOp, 100000);
        vm.etch(owner, designation);
    }

    function test_sessionSubsetDailyCountAndExecuteRevocation() public {
        vm.prank(owner);
        bytes32 limited = registry.createSession(id, vm.addr(SESSION_KEY), address(output), 50000, 100000, 1, 100000);
        handle(operation(0, 50000, limited, false));
        handle(operation(1, 50000, limited, false));
        assertEq(registry.getPolicy(id).totalSpent, 50000);
        assertEq(registry.getSession(limited).dailyOps, 1);
        PackedUserOperation memory op = operation(2, 50000, bytes32(0), false);
        vm.prank(owner);
        registry.rotateExecuteSigner(id, address(0));
        assertEq(validate(op) & 1, 1);
    }
}
