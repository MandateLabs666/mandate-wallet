import {it,expect} from "vitest";
import {privateKeyToAccount} from "viem/accounts";
import {keccak256,toHex,type Hex} from "viem";
import {commitFields,disclose} from "../merkle.js";
import {signCheckpoint,verifyCheckpointChain,verifyCheckpoint,disclosedCheckpoint,ZERO_ROOT,type CheckpointHeader} from "../checkpoint.js";
const signer=privateKeyToAccount("0x"+"66".repeat(32) as Hex),wallet=privateKeyToAccount("0x"+"77".repeat(32) as Hex).address;
const scope={chainId:84532,wallet,mandateId:keccak256(toHex("root")),sessionId:keccak256(toHex("session")),signer:signer.address};
it("appends previously observed stages and rejects truncation gaps, reorder and context replay",async()=>{
  const tree=commitFields({requestHash:keccak256(toHex("request")),privateBody:{fixture:true}});
  const header:CheckpointHeader={schemaVersion:2,...scope,policyVersion:"1",sessionEpoch:"1",stepId:keccak256(toHex("step")),sequence:"0",kind:"pre-payment",previousRoot:ZERO_ROOT,merkleRoot:tree.root,leafCount:2,observedAt:"1000"};
  const a=await signCheckpoint(signer,header),b=await signCheckpoint(signer,{...header,kind:"registration",sequence:"1",previousRoot:a.root,observedAt:"1001"});
  expect(await verifyCheckpointChain([a,b],scope)).toHaveLength(2);expect(disclosedCheckpoint(a,disclose(tree.leaves,["requestHash"]))).toEqual({requestHash:keccak256(toHex("request"))});
  await expect(verifyCheckpointChain([b],scope)).rejects.toThrow("HISTORY_INVALID");await expect(verifyCheckpointChain([b,a],scope)).rejects.toThrow("HISTORY_INVALID");
  await expect(verifyCheckpointChain([a,b],{...scope,chainId:11155111})).rejects.toThrow("CONTEXT_MISMATCH");
  await expect(verifyCheckpoint({...a,header:{...a.header,leafCount:1}},signer.address)).rejects.toThrow("ROOT_MISMATCH");
  const delayed=await signCheckpoint(signer,{...header,sequence:"1",previousRoot:a.root,observedAt:"999"});await expect(verifyCheckpointChain([a,delayed],scope)).rejects.toThrow("HISTORY_INVALID");
  // A valid local prefix cannot prove that its missing tail ever existed.
  expect(await verifyCheckpointChain([a],scope)).toHaveLength(1);
});
