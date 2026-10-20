// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {EchoFixture} from "./EchoV2.t.sol";
import {Test} from "forge-std/Test.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {EchoAuthContext, EchoPolicy} from "../src/EchoTypes.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {EchoIntentDecoder} from "../src/EchoIntentDecoder.sol";
import {EchoPolicyValidator} from "../src/EchoPolicyValidator.sol";
import {EchoDelegationModule} from "../src/EchoDelegationModule.sol";
import {MockInputToken} from "../src/MockTokens.sol";
import {MockSwapRouter} from "../src/MockSwapRouter.sol";

contract EchoSpendHandler is Test {
    EntryPoint ep;
    PolicyRegistry registry;
    EchoIntentDecoder decoder;
    EchoPolicyValidator validator;
    EchoDelegationModule logic;
    MockInputToken input;
    MockSwapRouter router;
    address owner;
    address output;
    bytes32 id;
    uint256 public observedDebits;

    constructor(
        EntryPoint e,
        PolicyRegistry r,
        EchoIntentDecoder d,
        EchoPolicyValidator v,
        EchoDelegationModule l,
        MockInputToken i,
        MockSwapRouter swap,
        address o,
        address out,
        bytes32 policy
    ) {
        ep = e;
        registry = r;
        decoder = d;
        validator = v;
        logic = l;
        input = i;
        router = swap;
        owner = o;
        output = out;
        id = policy;
    }

    function swap(uint128 sample, bool exactOutput, bool fail) external {
        uint256 upper = bound(sample, 1, 120000);
        uint256 nonce = ep.getNonce(owner, 0);
        EchoPolicy memory p = registry.getPolicy(id);
        EchoAuthContext memory a =
            EchoAuthContext(id, p.version, bytes32(0), p.executeEpoch, 0, uint48(block.timestamp + 300), nonce);
        bytes memory data = exactOutput
            ? abi.encodeWithSelector(
                decoder.EXACT_OUTPUT_SINGLE(),
                EchoIntentDecoder.ExactOutputSingleParams(
                    address(input), output, 500, owner, block.timestamp + 300, upper * 1e18 / 2000e6, 100000, 0
                )
            )
            : abi.encodeWithSelector(
                decoder.EXACT_INPUT_SINGLE(),
                EchoIntentDecoder.ExactInputSingleParams(
                    address(input), output, 500, owner, block.timestamp + 300, upper, upper * 1e18 / 2000e6, 0
                )
            );
        PackedUserOperation memory op = PackedUserOperation(
            owner,
            nonce,
            "",
            abi.encodeCall(logic.execute, (bytes32(0), abi.encodePacked(address(router), uint256(0), data), a)),
            bytes32((uint256(500000) << 128) | 1000000),
            100000,
            bytes32((uint256(1) << 128) | 1),
            "",
            ""
        );
        (uint8 v, bytes32 rr, bytes32 ss) =
            vm.sign(0xece, validator.digest(owner, address(ep), address(logic), ep.getUserOpHash(op), a));
        op.signature = abi.encodePacked(bytes1(0x02), rr, ss, v);
        address admin = router.admin();
        vm.prank(admin);
        router.setFault(fail, 0, "");
        uint256 beforeBalance = input.balanceOf(owner);
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        try ep.handleOps(ops, payable(address(0xbabe))) {} catch {}
        observedDebits += beforeBalance - input.balanceOf(owner);
    }
}

contract EchoBudgetInvariant is EchoFixture {
    EchoSpendHandler handler;

    function setUp() public override {
        super.setUp();
        handler = new EchoSpendHandler(
            ep, registry, decoder, validator, logic, input, router, owner, address(output), id
        );
        targetContract(address(handler));
    }

    function invariant_budgetAndIndependentAssetLedgerAgree() public view {
        EchoPolicy memory p = registry.getPolicy(id);
        assertLe(p.totalSpent, p.totalBudget);
        assertLe(p.dailySpent, p.maxPerDay);
        assertEq(p.totalSpent, 1000000 - input.balanceOf(owner));
        assertEq(p.totalSpent, handler.observedDebits());
        assertEq(input.allowance(owner, address(router)), 0);
    }
}
