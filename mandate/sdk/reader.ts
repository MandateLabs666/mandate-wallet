import { hashTypedData, isAddressEqual, parseAbi, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { accountAbi } from "./accountAbi.js";
import { MandateError, PaymentSchema, registrationTypedData, paymentTypedData, type Payment } from "./model.js";
export const tokenReadAbi = parseAbi([
  "function DOMAIN_SEPARATOR() view returns (bytes32)", "function authorizationState(address,bytes32) view returns (bool)",
  "function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)",
  "event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)", "event AuthorizationCanceled(address indexed authorizer,bytes32 indexed nonce)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export class MandateReader {
  constructor(readonly pc: PublicClient, readonly chainId: number, readonly wallet: Address, readonly tokenDomain: {name:string;version:string;chainId:number;verifyingContract:Address}) {}
  async verifyContext() {
    const [chain, declaredChain, asset, fixedDomain] = await Promise.all([
      this.pc.getChainId(),
      this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"deploymentChainId"}),
      this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"asset"}),
      this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"tokenDomain"}),
    ]);
    if (chain !== this.chainId || declaredChain !== BigInt(this.chainId) || this.tokenDomain.chainId !== this.chainId) throw new MandateError("CHAIN_MISMATCH");
    if (!isAddressEqual(asset,this.tokenDomain.verifyingContract)) throw new MandateError("ASSET_MISMATCH");
    const currentDomain = await this.pc.readContract({address:asset,abi:tokenReadAbi,functionName:"DOMAIN_SEPARATOR"});
    // Hash a zero-valued authorization to check supplied domain metadata against on-chain digest.
    const zero = "0x" + "00".repeat(32) as Hex;
    const probe: Payment = {mandateId:zero,policyVersion:1n,sessionId:zero,sessionEpoch:1n,stepId:zero,merchantId:zero,requestHash:zero,quoteHash:zero,to:this.wallet,value:1n,validAfter:0n,validBefore:1n,nonce:zero};
    const {message} = paymentTypedDataUnchecked(this.tokenDomain,this.wallet,probe);
    const digest = hashTypedData({domain:this.tokenDomain,types:authorizationTypes,primaryType:"TransferWithAuthorization",message});
    const expected = await this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"paymentDigest",args:[probe]});
    if (currentDomain !== fixedDomain || digest !== expected) throw new MandateError("TOKEN_DOMAIN_MISMATCH");
    return {chainId:chain,asset,tokenDomain:fixedDomain};
  }
  async readBudget(mandateId: Hex, sessionId: Hex) {
    await this.verifyContext();
    const [policy, session] = await Promise.all([
      this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"getPolicy",args:[mandateId]}),
      this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"getSession",args:[mandateId,sessionId]}),
    ]);
    return {policy,session,rootAvailable:policy.budget-policy.occupied,grantAvailable:session.budget-session.occupied};
  }
  async checkedRegistrationData(input: Payment) {
    await this.verifyContext(); const p = PaymentSchema.parse(input);
    const data = registrationTypedData(this.chainId,this.wallet,p);
    const expected = await this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"registrationDigest",args:[p]});
    if (hashTypedData(data) !== expected) throw new MandateError("REGISTRATION_ENCODER_MISMATCH");
    return data;
  }
  async approvedPaymentData(input: Payment) {
    await this.verifyContext(); const p = PaymentSchema.parse(input);
    const data = paymentTypedData(this.tokenDomain,this.wallet,p); const digest = hashTypedData(data);
    const c = await this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"getCommitment",args:[digest]});
    if (!c.exists || c.released || hashTypedData(registrationTypedData(this.chainId,this.wallet,PaymentSchema.parse(c.payment))) !== hashTypedData(registrationTypedData(this.chainId,this.wallet,p))) throw new MandateError("PAYMENT_NOT_REGISTERED");
    const [policy,session,nonceUsed] = await Promise.all([
      this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"getPolicy",args:[p.mandateId]}),
      this.pc.readContract({address:this.wallet,abi:accountAbi,functionName:"getSession",args:[p.mandateId,p.sessionId]}),
      this.pc.readContract({address:this.tokenDomain.verifyingContract,abi:tokenReadAbi,functionName:"authorizationState",args:[this.wallet,p.nonce]}),
    ]);
    const now = (await this.pc.getBlock()).timestamp;
    if (!policy.exists || policy.paused || policy.revoked || policy.version !== p.policyVersion || !session.exists || session.revoked || session.policyVersion !== p.policyVersion || session.epoch !== p.sessionEpoch || now >= BigInt(policy.expiresAt) || now >= BigInt(session.expiresAt) || now >= p.validBefore || nonceUsed) throw new MandateError("PAYMENT_AUTHORITY_INACTIVE");
    return data;
  }
}
import { authorizationTypes } from "./model.js";
function paymentTypedDataUnchecked(domain: MandateReader["tokenDomain"], wallet: Address, p: Payment) {
  return {domain,message:{from:wallet,to:p.to,value:p.value,validAfter:p.validAfter,validBefore:p.validBefore,nonce:p.nonce}};
}
export async function reconcilePayment(pc: PublicClient, wallet: Address, token: Address, p: Payment, transactionHash?: Hex, confirmations = 2) {
  if (!Number.isSafeInteger(confirmations) || confirmations < 1) throw new MandateError("INVALID_CONFIRMATIONS");
  const used = await pc.readContract({address:token,abi:tokenReadAbi,functionName:"authorizationState",args:[wallet,p.nonce]});
  if (!transactionHash) return {state:used?"consumed_unknown":((await pc.getBlock()).timestamp > p.validBefore?"expired_unused":"pending"),nonceUsed:used} as const;
  const receipt = await pc.getTransactionReceipt({hash:transactionHash});
  const [block, tip] = await Promise.all([pc.getBlock({blockNumber:receipt.blockNumber}),pc.getBlockNumber({cacheTime:0})]);
  if (block.hash !== receipt.blockHash || tip < receipt.blockNumber + BigInt(confirmations-1)) return {state:"pending",nonceUsed:used} as const;
  if (receipt.status !== "success") return {state:used?"consumed_unknown":"failed",nonceUsed:used,transactionHash} as const;
  const logs = receipt.logs.filter(l => isAddressEqual(l.address,token));
  const authorizations = parseEventLogs({abi:tokenReadAbi,eventName:"AuthorizationUsed",logs}).filter(e=>isAddressEqual(e.args.authorizer,wallet) && e.args.nonce===p.nonce);
  const transfers = parseEventLogs({abi:tokenReadAbi,eventName:"Transfer",logs});
  const cancellations = parseEventLogs({abi:tokenReadAbi,eventName:"AuthorizationCanceled",logs}).filter(e=>isAddressEqual(e.args.authorizer,wallet) && e.args.nonce===p.nonce);
  if (used && authorizations.length === 0 && cancellations.length === 1 && !transfers.some(e=>isAddressEqual(e.args.from,wallet)))
    return {state:"canceled",nonceUsed:true,transactionHash,blockHash:receipt.blockHash,occupiedRetained:true} as const;
  const auth = authorizations.length === 1 ? authorizations[0] : undefined;
  const nextUse = auth ? parseEventLogs({abi:tokenReadAbi,eventName:"AuthorizationUsed",logs}).find(e=>e.logIndex! > auth.logIndex!) : undefined;
  const transfer = auth ? transfers.find(e=>e.logIndex! > auth.logIndex! && (!nextUse || e.logIndex! < nextUse.logIndex!)) : undefined;
  if (!used || !auth || !transfer || !isAddressEqual(transfer.args.from,wallet) || !isAddressEqual(transfer.args.to,p.to) || transfer.args.value !== p.value) return {state:"consumed_unknown",nonceUsed:used,transactionHash,reason:"INCOMPLETE_TRANSFER_EVIDENCE"} as const;
  return {state:"paid",nonceUsed:true,transactionHash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,value:p.value,merchant:p.to} as const;
}
