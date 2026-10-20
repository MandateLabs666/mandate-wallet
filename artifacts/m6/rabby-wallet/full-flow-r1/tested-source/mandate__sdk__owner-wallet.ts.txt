import {decodeFunctionData,isAddressEqual,type Address,type Hex} from "viem";
import {accountAbi} from "./accountAbi.js";
import {draftOwnerAction,type OwnerActionInput} from "./owner.js";
import {MandateError} from "./model.js";
export interface OwnerProvider {
  request(args:{method:string;params?:readonly unknown[]}):Promise<unknown>;
  on?(event:string,listener:(value:unknown)=>void):void;
  removeListener?(event:string,listener:(value:unknown)=>void):void;
}
export type OwnerDraft=ReturnType<typeof draftOwnerAction>;
export type OwnerWalletRequest={requestId:Hex;draft:OwnerDraft;transactionHash?:Hex};
export type OwnerSubmission={requestId:Hex;actionId:Hex;chainId:number;wallet:Address;state:"awaiting-wallet"|"broadcast"|"submission-unknown"|"rejected";transactionHash?:Hex};
export function ownerInputFromDraft(draft:OwnerDraft):OwnerActionInput{
  const {functionName,args}=decodeFunctionData({abi:accountAbi,data:draft.transaction.data}),a=args as readonly any[];
  const limits=(p:any)=>({budget:String(p.budget),maxPerPayment:String(p.maxPerPayment),expiresAt:Number(p.expiresAt)});
  switch(functionName){
    case "createMandate":return {action:"create",id:a[0],taskHash:a[1],limits:limits(a[2]),merchants:a[3],steps:a[4]};
    case "replacePolicy":return {action:"replace",id:a[0],limits:limits(a[1]),merchants:a[2],steps:a[3]};
    case "setPaused":return {action:"pause",id:a[0],paused:a[1]};
    case "revokeMandate":return {action:"revoke",id:a[0]};
    case "grantSession":return {action:"grant",id:a[0],sessionId:a[1],signer:a[2],budget:String(a[3]),maxPerPayment:String(a[4]),expiresAt:Number(a[5]),steps:a[6]};
    case "revokeSession":return {action:"revokeSession",id:a[0],sessionId:a[1]};
    default:throw new MandateError("OWNER_REVIEW_TYPE_UNSUPPORTED");
  }
}
export function describeOwnerDraft(draft:OwnerDraft,input:OwnerActionInput){
  const expected=draftOwnerAction(draft.transaction.chainId,draft.transaction.from,draft.transaction.to,input);
  if(expected.actionId!==draft.actionId||expected.transaction.data!==draft.transaction.data||draft.transaction.value!=="0")throw new MandateError("OWNER_REVIEW_CALLDATA_MISMATCH");
  const decoded=decodeFunctionData({abi:accountAbi,data:draft.transaction.data});
  return {action:draft.action,chainId:draft.transaction.chainId,owner:draft.transaction.from,wallet:draft.transaction.to,nativeValueAtomic:"0",decodedFunction:decoded.functionName,input,permissionChange:["replace","pause","revoke"].includes(draft.action)?"Existing occupied funds remain; policy version changes. Previous grants become stale. New execution requires owner-approved current scope and grant.":draft.action==="grant"?"Finite session grant; one approved signer and explicit steps.":draft.action==="revokeSession"?"Irreversible session revocation. Previously paid funds remain paid.":"New mandate; no funds move in this authorization transaction."};
}
export async function connectOwner(provider:OwnerProvider,expected:{chainId:number;owner:Address}){
  const accounts=await provider.request({method:"eth_requestAccounts"});
  if(!Array.isArray(accounts)||typeof accounts[0]!=="string"||!isAddressEqual(accounts[0] as Address,expected.owner))throw new MandateError("WALLET_WRONG_OWNER");
  await checkOwnerConnection(provider,expected);return expected.owner;
}
export async function checkOwnerConnection(provider:OwnerProvider,expected:{chainId:number;owner:Address}){
  const [chain,accounts]=await Promise.all([provider.request({method:"eth_chainId"}),provider.request({method:"eth_accounts"})]);
  if(typeof chain!=="string"||!/^0x[0-9a-f]+$/i.test(chain)||BigInt(chain)!==BigInt(expected.chainId))throw new MandateError("WALLET_WRONG_NETWORK");
  if(!Array.isArray(accounts)||typeof accounts[0]!=="string"||!isAddressEqual(accounts[0] as Address,expected.owner))throw new MandateError("WALLET_ACCOUNT_CHANGED");
}
export async function submitOwnerDraft(provider:OwnerProvider,request:OwnerWalletRequest,input:OwnerActionInput,remember:(record:OwnerSubmission)=>void,previous?:OwnerSubmission){
  const review=describeOwnerDraft(request.draft,input);
  if(request.transactionHash||previous&&previous.requestId===request.requestId&&["awaiting-wallet","broadcast","submission-unknown"].includes(previous.state))throw new MandateError("OWNER_SUBMISSION_RECONCILE_FIRST");
  await checkOwnerConnection(provider,{chainId:review.chainId,owner:review.owner});
  const record:OwnerSubmission={requestId:request.requestId,actionId:request.draft.actionId,chainId:review.chainId,wallet:review.wallet,state:"awaiting-wallet"};remember(record);
  try{
    const hash=await provider.request({method:"eth_sendTransaction",params:[{from:review.owner,to:review.wallet,data:request.draft.transaction.data,value:"0x0",chainId:"0x"+review.chainId.toString(16)}]});
    if(typeof hash!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new MandateError("WALLET_TRANSACTION_HASH_INVALID");
    record.transactionHash=hash.toLowerCase() as Hex;record.state="broadcast";remember(record);return record;
  }catch(error){record.state=(error as {code?:number})?.code===4001?"rejected":"submission-unknown";remember(record);throw error;}
}
