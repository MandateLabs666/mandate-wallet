import { expect, it } from "vitest";
import { atomicAmount, parseUSDC, nonceFor, requestHash } from "../model.js";
import { draftOwnerAction } from "../owner.js";
import { decodeFunctionData, type Address, type Hex } from "viem";
import { accountAbi } from "../accountAbi.js";
const wallet="0x1111111111111111111111111111111111111111" as Address;
const id="0x"+"12".repeat(32) as Hex, step="0x"+"34".repeat(32) as Hex;
it("uses integer USDC and refuses floats, scientific notation, signs and precision loss",()=>{
  expect(parseUSDC("0.15")).toBe(150000n); expect(parseUSDC("1.000001")).toBe(1000001n);
  for(const value of ["1e6","-1","+1","01","0.0000001","NaN"]) expect(()=>parseUSDC(value)).toThrow();
  expect(()=>atomicAmount("1.0")).toThrow();expect(()=>atomicAmount(0.1 as never)).toThrow();
  expect(()=>atomicAmount(1n<<256n)).toThrow();
});
it("business nonce is chain/account/mandate/step-specific with no version or agent input",()=>{
  const nonce=nonceFor(84532,wallet,id,step);
  expect(nonceFor(84532,wallet,id,step)).toBe(nonce);
  expect(nonceFor(11155111,wallet,id,step)).not.toBe(nonce);
  expect(nonceFor(84532,"0x2222222222222222222222222222222222222222",id,step)).not.toBe(nonce);
});
it("request hash includes exact URL, method and canonical body, and refuses unsent fields",()=>{
  expect(requestHash({method:"POST",url:"https://api.example/p",body:{b:2,a:1}})).toBe(requestHash({method:"POST",url:"https://api.example/p",body:{a:1,b:2}}));
  expect(requestHash({method:"GET",url:"https://api.example/p?q=a",body:null})).not.toBe(requestHash({method:"GET",url:"https://api.example/p?q=b",body:null}));
  expect(()=>requestHash({method:"GET",url:"https://api.example/p",body:{a:1}})).toThrow("GET_BODY_UNSUPPORTED");
  expect(()=>requestHash({method:"GET",url:"https://user:secret@api.example/p",body:null})).toThrow("INVALID_RESOURCE_URL");
  expect(()=>requestHash({method:"GET",url:"https://api.example/p#fragment",body:null})).toThrow("INVALID_RESOURCE_URL");
});
it("owner actions are bounded unsigned transactions and mainnet writes remain unavailable",()=>{
  const draft=draftOwnerAction(84532,wallet,wallet,{action:"revoke",id});
  expect(draft.approvalRequired).toBe("owner-wallet");expect(draft.transaction.value).toBe("0");
  expect(decodeFunctionData({abi:accountAbi,data:draft.transaction.data}).functionName).toBe("revokeMandate");
  expect(()=>draftOwnerAction(8453,wallet,wallet,{action:"revoke",id})).toThrow("WRITE_NETWORK_UNSUPPORTED");
  expect(()=>draftOwnerAction(84532,wallet,wallet,{action:"withdraw",to:wallet,amount:"0.1"})).toThrow();
});
