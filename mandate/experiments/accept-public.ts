import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {createPublicClient,createWalletClient,http,encodeFunctionData,keccak256,toHex,hashTypedData,type Chain,type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {sepolia,baseSepolia} from "viem/chains";
import {M3Journal,type TransactionContext} from "./journal.js";
import {accountAbi} from "../sdk/accountAbi.js";
import {testTokenAbi} from "../sdk/testTokenAbi.js";
import {MandateReader,reconcilePayment} from "../sdk/reader.js";
import {nonceFor,requestHash,encodePayment,decodePayment,type Payment} from "../sdk/model.js";
import {budgetAtReceipt} from "./budget-evidence.js";
process.umask(0o077);
const settings=JSON.parse(readFileSync("mandate/networks/networks.json","utf8"));
const caseTag=process.env.M3_TEST_CASE??"initial";
if(!/^[a-z0-9-]{1,32}$/.test(caseTag))throw new Error("INVALID_TEST_CASE");
const onlyChain=process.env.M3_ONLY_CHAIN?Number(process.env.M3_ONLY_CHAIN):undefined;
if(onlyChain!==undefined && ![11155111,84532].includes(onlyChain))throw new Error("WRITE_NETWORK_UNSUPPORTED");
if(caseTag!=="initial" && (onlyChain!==84532 || !existsSync("artifacts/m3/expired-base-case-recovery.json")))throw new Error("NEW_CASE_REQUIRES_PROVEN_EXPIRED_UNUSED_RECOVERY");
const key=(path:string)=>privateKeyToAccount(JSON.parse(readFileSync(path,"utf8")).privateKey as Hex);
const agents=[key(".runtime/m3/keys/agent-a.json"),key(".runtime/m3/keys/agent-b.json")];
const ids=["alpha","beta-over-budget","gamma-revoked"].map(x=>keccak256(toHex(x)));
const sessions=["agent-a","agent-b"].map(x=>keccak256(toHex(x)));
const merchantId=keccak256(toHex("M3-controlled-merchant"));
const request=requestHash({method:"GET",url:"https://controlled.mandate.invalid/m3/data",body:null});
function write(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n");}
for(const chainId of [11155111,84532].filter(id=>onlyChain===undefined || id===onlyChain)) {
  const config=JSON.parse(readFileSync(`.runtime/m3/${chainId}-config.json`,"utf8"));
  const network:Chain=chainId===11155111?sepolia:baseSepolia;
  const pc=createPublicClient({chain:network,transport:http(config.rpc,{timeout:20000,retryCount:0}),pollingInterval:5000});
  const owner=key(chainId===11155111?".runtime/m2/keys/owner.json":".runtime/keys/owner.json");
  const operator=key(chainId===11155111?".runtime/m2/keys/utility.json":".runtime/keys/operator.json");
  const context=(account:ReturnType<typeof key>):TransactionContext=>({pc,wc:createWalletClient({chain:network,account,transport:http(config.rpc,{timeout:20000,retryCount:0})})});
  const deployment=JSON.parse(readFileSync(`artifacts/m3/${chainId}-deployment.json`,"utf8"));
  const priorReservation=deployment.transactions.reduce((sum:bigint,r:{gas:string;feeCap:string})=>sum+BigInt(r.gas)*BigInt(r.feeCap),0n);
  const journal=new M3Journal(`.runtime/m3/${chainId}-experiment-journal.json`,BigInt(settings.m3PublicLimits.evmGasReservationsWeiPerChain)-priorReservation);
  const send:typeof journal.send=(id,c,intent,status)=>journal.send(caseTag==="initial" || id==="fund-asset"?id:caseTag+":"+id,c,intent,status);
  const paymentPrefix=caseTag==="initial"?`${chainId}`:`${chainId}-${caseTag}`;
  const reader=new MandateReader(pc,chainId,config.wallet,config.tokenDomain);await reader.verifyContext();
  const planPath=`.runtime/m3/${paymentPrefix}-plan.json`;
  if(!existsSync(planPath))write(planPath,{id:keccak256(toHex(`M3-${chainId}-shared-task-v2${caseTag==="initial"?"":"-"+caseTag}`)),expiresAt:(await pc.getBlock()).timestamp+86400n,merchantBefore:await pc.readContract({address:config.asset,abi:testTokenAbi,functionName:"balanceOf",args:[config.merchant]})});
  const plan=JSON.parse(readFileSync(planPath,"utf8"));
  const reportPath=`artifacts/m3/${chainId}-acceptance.json`;
  let report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,"utf8")):undefined;
  if(report && (report.caseTag??"initial")!==caseTag){write(`artifacts/m3/${chainId}-acceptance-${report.caseTag??"initial"}.json`,report);report=undefined;}
  report??={schemaVersion:2,caseTag,chainId,assetKind:config.assetKind,wallet:config.wallet,asset:config.asset,merchant:config.merchant,mandateId:plan.id,publicGatePassed:false,sourceCommit:config.sourceCommit,limitations:["Direct controlled EIP-3009 settlement experiment; not an external HTTP service purchase.","EntryPoint/bundler are unnecessary on this ERC-1271 payment path.","Base L1 data fee is separate from EVM gas reservation; mainnet remains read-only."]};
  function save(){report.transactions=journal.evidence();write(reportPath,report);}
  async function signedPayment(name:string,stepId:Hex,sid:Hex,value:bigint,agentIndex:number) {
    const path=`.runtime/m3/${paymentPrefix}-${name}-payment.json`;
    if(existsSync(path))return JSON.parse(readFileSync(path,"utf8"));
    const now=(await pc.getBlock()).timestamp;
    const p:Payment={mandateId:plan.id,policyVersion:1n,sessionId:sid,sessionEpoch:1n,stepId,merchantId,requestHash:request,quoteHash:keccak256(toHex("controlled-test-quote")),to:config.merchant,value,validAfter:0n,validBefore:now+300n,nonce:nonceFor(chainId,config.wallet,plan.id,stepId)};
    const signature=await agents[agentIndex].signTypedData(await reader.checkedRegistrationData(p));
    const result={payment:encodePayment(p),registrationSignature:signature};write(path,result);return result;
  }
  try {
    if(report.publicGatePassed===true) {
      const record=JSON.parse(readFileSync(`.runtime/m3/${paymentPrefix}-alpha-payment.json`,"utf8"));
      const proof=await reconcilePayment(pc,config.wallet,config.asset,decodePayment(record.payment),report.paid.transactionHash);
      if(proof.state!=="paid")throw new Error("COMPLETED_PAYMENT_NEEDS_RECONCILIATION");
      report.recheckedAt=new Date().toISOString();save();continue;
    }
    await send("fund-asset",context(owner),{to:config.asset,data:encodeFunctionData({abi:testTokenAbi,functionName:chainId===11155111?"mint":"transfer",args:[config.wallet,150000n]})});save();
    const created=await send("create-mandate",context(owner),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"createMandate",args:[plan.id,keccak256(toHex("controlled-public-budget-test")),{budget:150000n,maxPerPayment:100000n,expiresAt:BigInt(plan.expiresAt)},[{id:merchantId,payTo:config.merchant,quoteSigner:"0x0000000000000000000000000000000000000000"}],ids.map(id=>({id,merchantId,requestHash:request}))]})});report.mandateStartBlock=created.blockNumber.toString();save();
    for(let i=0;i<2;i++){await send(`grant-${i}`,context(owner),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"grantSession",args:[plan.id,sessions[i],agents[i].address,150000n,100000n,BigInt(plan.expiresAt),ids]})});save();}
    const aRecord=await signedPayment("alpha",ids[0],sessions[0],100000n,0),a=decodePayment(aRecord.payment);
    await send("register-alpha",context(operator),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"registerPayment",args:[a,aRecord.registrationSignature,"0x"]})});save();
    const bRecord=await signedPayment("over-budget",ids[1],sessions[1],100000n,1),b=decodePayment(bRecord.payment);
    const negativeBudget=await send("reject-over-budget",context(operator),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"registerPayment",args:[b,bRecord.registrationSignature,"0x"]}),gas:400000n},"reverted");
    const budgetCheckpoint=await budgetAtReceipt(pc,config.wallet,plan.id,BigInt(report.mandateStartBlock),negativeBudget);
    if(budgetCheckpoint.occupied!=="100000" || budgetCheckpoint.matchingChangesInReceipt!==0)throw new Error("OVER_BUDGET_MUTATED_ROOT");
    report.overBudget={transactionHash:negativeBudget.transactionHash,status:negativeBudget.status,checkpoint:budgetCheckpoint};save();
    const signaturePath=`.runtime/m3/${paymentPrefix}-alpha-signature.json`;
    if(!existsSync(signaturePath))write(signaturePath,{signature:await agents[0].signTypedData(await reader.approvedPaymentData(a))});
    const paymentSignature=JSON.parse(readFileSync(signaturePath,"utf8")).signature;
    if(!report.crossChain) {
      const data=await reader.approvedPaymentData(a),otherChain=chainId===11155111?84532:11155111;
      const wrongSignature=await agents[0].signTypedData({...data,domain:{...data.domain,chainId:otherChain}});
      const digest=hashTypedData(data);
      const valid=await pc.readContract({address:config.wallet,abi:accountAbi,functionName:"isValidSignature",args:[digest,paymentSignature]});
      const wrong=await pc.readContract({address:config.wallet,abi:accountAbi,functionName:"isValidSignature",args:[digest,wrongSignature]});
      if(valid!=="0x1626ba7e" || wrong!=="0xffffffff")throw new Error("CROSS_CHAIN_SIGNATURE_CONTROL_FAILED");
      let wrongNetwork=false,wrongAsset=false;
      try{await new MandateReader(pc,otherChain,config.wallet,{...config.tokenDomain,chainId:otherChain}).verifyContext();}catch(e){wrongNetwork=e instanceof Error && e.message==="CHAIN_MISMATCH";}
      try{await new MandateReader(pc,chainId,config.wallet,{...config.tokenDomain,verifyingContract:config.merchant}).verifyContext();}catch(e){wrongAsset=e instanceof Error && e.message==="ASSET_MISMATCH";}
      if(!wrongNetwork || !wrongAsset)throw new Error("CONFIGURATION_MISMATCH_NOT_REJECTED");
      report.crossChain={correctDomainAccepted:valid,wrongDomainChainId:otherChain,wrongChainSignatureRejected:wrong,wrongNetworkRejected:true,wrongAssetRejected:true};save();
    }
    if(chainId===84532) {
      const settlementId=caseTag==="initial"?"settle-alpha":caseTag+":settle-alpha";
      const rows=journal.evidence();
      const reserved=rows.filter(r=>r.id==="settle-alpha" || r.id.endsWith(":settle-alpha")).reduce(sum=>sum+100000n,0n);
      if(!rows.some(r=>r.id===settlementId) && reserved+a.value>BigInt(settings.m3PublicLimits.cumulativeNativeUSDCPurchaseLimitAtomic))throw new Error("CUMULATIVE_NATIVE_USDC_CAP_EXCEEDED");
    }
    const paid=await send("settle-alpha",context(operator),{to:config.asset,data:encodeFunctionData({abi:testTokenAbi,functionName:"transferWithAuthorization",args:[config.wallet,a.to,a.value,a.validAfter,a.validBefore,a.nonce,paymentSignature]})});
    const paidProof=await reconcilePayment(pc,config.wallet,config.asset,a,paid.transactionHash);
    if(paidProof.state!=="paid")throw new Error("MATCHING_TRANSFER_PROOF_MISSING");
    report.paid={...paidProof,payment:encodePayment(a),registrationDigest:hashTypedData(await reader.checkedRegistrationData(a))};save();
    const cRecord=await signedPayment("gamma",ids[2],sessions[1],50000n,1),c=decodePayment(cRecord.payment);
    await send("register-gamma",context(operator),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"registerPayment",args:[c,cRecord.registrationSignature,"0x"]})});save();
    const revokeSignaturePath=`.runtime/m3/${paymentPrefix}-gamma-signature.json`;
    if(!existsSync(revokeSignaturePath))write(revokeSignaturePath,{signature:await agents[1].signTypedData(await reader.approvedPaymentData(c))});
    const revokeSignature=JSON.parse(readFileSync(revokeSignaturePath,"utf8")).signature;
    const digest=await pc.readContract({address:config.wallet,abi:accountAbi,functionName:"paymentDigest",args:[c]});
    if(!report.prevalidation) {
      const before=await pc.readContract({address:config.wallet,abi:accountAbi,functionName:"isValidSignature",args:[digest,revokeSignature]});
      if(before!=="0x1626ba7e")throw new Error("PREVALIDATION_FAILED");report.prevalidation={digest,result:before};save();
    }
    await send("revoke-agent-b",context(owner),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"revokeSession",args:[plan.id,sessions[1]]})});save();
    const after=await pc.readContract({address:config.wallet,abi:accountAbi,functionName:"isValidSignature",args:[digest,revokeSignature]});
    if(after!=="0xffffffff")throw new Error("REVOKED_SIGNER_STILL_VALID");
    const revoked=await send("revoked-settlement",context(operator),{to:config.asset,data:encodeFunctionData({abi:testTokenAbi,functionName:"transferWithAuthorization",args:[config.wallet,c.to,c.value,c.validAfter,c.validBefore,c.nonce,revokeSignature]}),gas:400000n},"reverted");
    const tokenUsed=await pc.readContract({address:config.asset,abi:testTokenAbi,functionName:"authorizationState",args:[config.wallet,c.nonce]});
    const revokeCheckpoint=await budgetAtReceipt(pc,config.wallet,plan.id,BigInt(report.mandateStartBlock),revoked);
    const revokedBlock=await pc.getBlock({blockNumber:revoked.blockNumber});
    if(tokenUsed || revokeCheckpoint.occupied!=="150000" || revokeCheckpoint.matchingChangesInReceipt!==0 || revokedBlock.timestamp>=c.validBefore || revoked.gasUsed>=400000n)throw new Error("REVOCATION_CHECKPOINT_OR_VALID_WINDOW_FAILED");
    report.revocation={transactionHash:revoked.transactionHash,status:revoked.status,after,nonceUsed:false,checkpoint:revokeCheckpoint,settlementAttemptBeforeExpiry:true,payment:encodePayment(c)};save();
    report.phase="waiting-for-expiry";save();
    while((await pc.getBlock()).timestamp<=c.validBefore)await new Promise(resolve=>setTimeout(resolve,15000));
    await send("release-gamma",context(operator),{to:config.wallet,data:encodeFunctionData({abi:accountAbi,functionName:"releaseExpired",args:[digest]})});save();
    const budget=await reader.readBudget(plan.id,sessions[1]);
    const [walletBalance,merchantBalance,usedStep]=await Promise.all([
      pc.readContract({address:config.asset,abi:testTokenAbi,functionName:"balanceOf",args:[config.wallet]}),
      pc.readContract({address:config.asset,abi:testTokenAbi,functionName:"balanceOf",args:[config.merchant]}),
      pc.readContract({address:config.wallet,abi:accountAbi,functionName:"usedStep",args:[plan.id,ids[2]]}),
    ]);
    if(budget.policy.occupied!==100000n || budget.session.occupied!==0n || walletBalance!==50000n || merchantBalance-BigInt(plan.merchantBefore)!==100000n || !usedStep)throw new Error("FINAL_BUDGET_OR_ASSET_DELTA_MISMATCH");
    report.phase="experiment-complete";report.final={rootOccupied:"100000",revokedGrantOccupied:"0",available:"50000",walletBalance:"50000",merchantDelta:"100000",releasedStepStillUsed:true};report.publicGatePassed=true;report.completedAt=new Date().toISOString();save();
    console.log(JSON.stringify({chainId,publicGatePassed:true,nativeUSDC:chainId===84532,paid:"100000",occupied:"100000"}));
  } finally {save();}
}
