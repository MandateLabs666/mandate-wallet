// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MandateWallet, IAuthorizationAsset} from "../src/MandateWallet.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract BudgetHandler is Test {
    MockUSDC public token;
    MandateWallet public wallet;
    address public merchant = address(0xCAFE);
    uint256 constant KEY=0x402;
    bytes32 public constant ID=keccak256("invariant");
    bytes32[] public digests;
    mapping(bytes32=>MandateWallet.Payment) internal payments;
    constructor() {
        token=new MockUSDC(); wallet=new MandateWallet(address(this),IAuthorizationAsset(address(token))); token.mint(address(wallet),1000000);
        bytes32[] memory steps=new bytes32[](16); for(uint256 i;i<16;i++) steps[i]=bytes32(i+1);
        wallet.createMandate(ID,vm.addr(KEY),merchant,150000,100000,uint64(block.timestamp+100000),steps);
    }
    function signature(bytes32 d) internal view returns(bytes memory) { (uint8 v,bytes32 r,bytes32 s)=vm.sign(KEY,d);return abi.encodePacked(r,s,v); }
    function reserve(uint256 seed,uint256 amount) external {
        bytes32 step=bytes32(seed%16+1); amount=bound(amount,1,100000);
        MandateWallet.Payment memory p=MandateWallet.Payment(ID,step,bytes32(0),bytes32(0),merchant,amount,0,block.timestamp+120,wallet.paymentNonce(ID,step));
        try wallet.registerPayment(p,signature(wallet.registrationDigest(p))) returns(bytes32 d) { digests.push(d);payments[d]=p; } catch {}
    }
    function settle(uint256 seed) external {
        if(digests.length==0) return; MandateWallet.Payment memory p=payments[digests[seed%digests.length]];
        try token.transferWithAuthorization(address(wallet),merchant,p.value,p.validAfter,p.validBefore,p.nonce,signature(wallet.paymentDigest(p))) {} catch {}
    }
    function advance(uint256 seconds_) external { vm.warp(block.timestamp+seconds_%180); }
    function release(uint256 seed) external { if(digests.length==0)return;try wallet.releaseExpired(digests[seed%digests.length]) {} catch {} }
    function revoke() external { wallet.revokeMandate(ID); }
    function remainingCommitments() external view returns(uint256 total) {
        for(uint256 i;i<digests.length;i++){MandateWallet.Commitment memory c=wallet.getCommitment(digests[i]);if(!c.released)total+=c.value;}
    }
}
contract BudgetInvariantTest is StdInvariant,Test {
    BudgetHandler handler;
    function setUp() public { handler=new BudgetHandler();targetContract(address(handler)); }
    function invariant_occupiedWithinBudgetAndMatchesCommitments() public view {
        MandateWallet.Mandate memory m=handler.wallet().getMandate(handler.ID());
        assertLe(m.occupied,m.budget);assertEq(m.occupied,handler.remainingCommitments());
        assertLe(handler.token().balanceOf(handler.merchant()),m.occupied);
    }
}
