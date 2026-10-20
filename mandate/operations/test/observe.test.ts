import {it,expect,vi,beforeEach} from "vitest";
import {keccak256,type Address,type Hex} from "viem";
import {authorityIssues,observeTarget,type ObservationTarget} from "../observe.js";
const mocks=vi.hoisted(()=>({clients:[] as any[]}));
vi.mock("viem",async original=>({...await original<typeof import("viem")>(),createPublicClient:()=>mocks.clients.shift()}));
const wallet="0x1111111111111111111111111111111111111111" as Address;
const asset="0x2222222222222222222222222222222222222222" as Address;
const id=("0x"+"ab".repeat(32)) as Hex,code="0x60016000" as Hex;
const target:ObservationTarget={chainId:84532,rpcs:["https://primary.example","https://witness.example"],wallet,owner:wallet,asset,runtimeHash:keccak256(code),mandateId:id,sessionId:id};
const policy={taskHash:id,budget:150000n,maxPerPayment:100000n,occupied:10000n,expiresAt:2000n,version:1n,paused:false,revoked:false,exists:true};
const session={signer:wallet,budget:100000n,maxPerPayment:100000n,occupied:10000n,expiresAt:1500n,policyVersion:1n,epoch:1n,revoked:false,exists:true};
function client(finalized=100n){return {
  getChainId:vi.fn(async()=>84532),
  getBlock:vi.fn(async(query:any)=>({number:query.blockNumber??finalized,hash:id,timestamp:1000n})),
  getCode:vi.fn(async()=>code),getBalance:vi.fn(async()=>0n),
  readContract:vi.fn(async(q:any)=>({owner:wallet,asset,deploymentChainId:84532n,tokenDomain:id,DOMAIN_SEPARATOR:id,balanceOf:40000n,decimals:6,getPolicy:policy,getSession:session})[q.functionName as "owner"]),
};}
beforeEach(()=>{mocks.clients=[];});
it("pins both RPCs to their common finalized height and reports coverage rather than purchase readiness",async()=>{
  const a=client(110n),b=client(100n);mocks.clients=[a,b];const r=await observeTarget(target);
  expect(r.verified).toBe(true);expect(r.issues).toEqual([]);expect(r.coverage).toEqual({account:true,policy:true,session:true,merchantAndStep:false,purchaseReadiness:false});
  for(const pc of [a,b]){
    expect(pc.readContract.mock.calls.every(([q])=>q.blockNumber===100n)).toBe(true);
    expect(pc.getBlock.mock.calls.filter(([q])=>q.blockNumber===100n)).toHaveLength(2);
  }
});
it("rejects state disagreement, runtime mismatch and anchor change without blessing one provider",async()=>{
  let a=client(),b=client();b.getBalance.mockResolvedValueOnce(1n);mocks.clients=[a,b];await expect(observeTarget(target)).rejects.toThrow("RPC_STATE_DISAGREEMENT");
  a=client();b=client();b.getCode.mockResolvedValueOnce("0x60026000");mocks.clients=[a,b];await expect(observeTarget(target)).rejects.toThrow("PINNED_RUNTIME_MISMATCH");
  a=client();b=client();let reads=0;b.getBlock.mockImplementation(async(q:any)=>({number:q.blockNumber??100n,hash:++reads===3?("0x"+"cd".repeat(32)) as Hex:id,timestamp:1000n}));mocks.clients=[a,b];await expect(observeTarget(target)).rejects.toThrow("ANCHOR_CHANGED_DURING_READ");
});
it("distinguishes zero funds, expired authority and spent reservation from fresh active scope",()=>{
  expect(authorityIssues({timestamp:1000n,cash:0n,policy:{...policy,expiresAt:1000n,occupied:150000n},session:{...session,revoked:true,policyVersion:0n}})).toEqual(["WALLET_ASSET_BALANCE_ZERO","POLICY_EXPIRED","POLICY_BUDGET_EXHAUSTED","SESSION_REVOKED","SESSION_POLICY_VERSION_STALE"]);
  expect(authorityIssues({timestamp:1000n,cash:1n,policy:{...policy,occupied:150001n}})).toContain("POLICY_ACCOUNTING_INVARIANT_BROKEN");
});
it("fails closed on the wrong chain, timeout and credential-bearing endpoints",async()=>{
  const a=client(),b=client();a.getChainId.mockResolvedValueOnce(1);mocks.clients=[a,b];await expect(observeTarget(target)).rejects.toThrow("RPC_CHAIN_MISMATCH");
  mocks.clients=[client(),client()];mocks.clients[0].getChainId.mockRejectedValueOnce(new Error("RPC_TIMEOUT"));await expect(observeTarget(target)).rejects.toThrow("RPC_TIMEOUT");
  await expect(observeTarget({...target,rpcs:["https://primary.example?apiKey=redacted","https://witness.example"]})).rejects.toThrow("PUBLIC_HTTPS_RPC_REQUIRED");
});
