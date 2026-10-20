import {readFileSync,writeFileSync} from "node:fs";
import {createPublicClient,http,type Chain,type Hex} from "viem";
import {sepolia,baseSepolia} from "viem/chains";
const settings=JSON.parse(readFileSync("mandate/networks/networks.json","utf8"));
const results=[];
for(const chainId of [11155111,84532]) {
  const spec=settings.networks.find((s:{chainId:number})=>s.chainId===chainId),network:Chain=chainId===11155111?sepolia:baseSepolia;
  const primary=createPublicClient({chain:network,transport:http(spec.rpc,{timeout:20000,retryCount:0})}),witness=createPublicClient({chain:network,transport:http(spec.witnessRpc,{timeout:20000,retryCount:0})});
  if(await primary.getChainId()!==chainId || await witness.getChainId()!==chainId)throw new Error("CHAIN_MISMATCH");
  const deployment=JSON.parse(readFileSync(`artifacts/m3/${chainId}-deployment.json`,"utf8")),accept=JSON.parse(readFileSync(`artifacts/m3/${chainId}-acceptance.json`,"utf8"));
  if(accept.publicGatePassed!==true)throw new Error("COMPLETE_PUBLIC_EXPERIMENT_REQUIRED");
  const rows=[...deployment.transactions,...accept.transactions] as {id:string;hash:Hex;gas:string;feeCap:string}[];
  const unique=new Map(rows.map(row=>[row.hash,row]));
  const transactions=[];let evmFees=0n,l1Fees=0n,reserved=0n;
  for(const row of unique.values()) {
    const receipt=await primary.getTransactionReceipt({hash:row.hash}),other=await witness.getTransactionReceipt({hash:row.hash});
    const header=await primary.getBlock({blockNumber:receipt.blockNumber}),secondHeader=await witness.getBlock({blockNumber:receipt.blockNumber});
    const matches=receipt.blockHash===other.blockHash && receipt.blockHash===header.hash && header.hash===secondHeader.hash && receipt.status===other.status && receipt.gasUsed===other.gasUsed && receipt.effectiveGasPrice===other.effectiveGasPrice;
    if(!matches)throw new Error("PUBLIC_RECEIPT_SOURCES_DISAGREE");
    const l1Fee=BigInt((receipt as unknown as {l1Fee?:bigint}).l1Fee??0n),fee=receipt.gasUsed*receipt.effectiveGasPrice;
    evmFees+=fee;l1Fees+=l1Fee;reserved+=BigInt(row.gas)*BigInt(row.feeCap);
    transactions.push({id:row.id,hash:row.hash,status:receipt.status,block:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed,effectiveGasPrice:receipt.effectiveGasPrice,evmFeeWei:fee,l1DataFeeWei:l1Fee,witnessMatches:true});
  }
  if(reserved>BigInt(settings.m3PublicLimits.evmGasReservationsWeiPerChain) || evmFees>reserved)throw new Error("EVM_FEE_RESERVATION_CAP_EXCEEDED");
  results.push({chainId,assetKind:accept.assetKind,wallet:accept.wallet,asset:accept.asset,merchant:accept.merchant,mandateId:accept.mandateId,caseTag:accept.caseTag??"initial",transactions,evmReservationWei:reserved,evmFeeWei:evmFees,l1DataFeeWei:l1Fees,feesSeparateFromUSDC:true,paidAtomic:"100000",final:accept.final});
  console.log(JSON.stringify({chainId,receipts:transactions.length,allWitnessMatches:true}));
}
writeFileSync("artifacts/m3/public-evidence.json",JSON.stringify({schemaVersion:2,recordedAt:new Date().toISOString(),mainnetTransactions:0,results,limitations:["Direct test settlement; no service delivery claimed.","RPC agreement is not independent consensus verification.","Base L1 data fee is recorded separately from signed EVM fee caps."]},(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n");
