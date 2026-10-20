// Test funding preparation only; this is not a Mandate cross-chain payment feature.
import { createPublicClient,createWalletClient,http,parseAbi,parseEther,getAddress,keccak256 } from 'viem';
import { sepolia,baseSepolia } from 'viem/chains';
import { readFileSync,existsSync } from 'node:fs';
import { readTestKey,writeEvidence } from './harness.js';
import { M1Error } from '../packages/core/model.js';

const config=JSON.parse(readFileSync('artifacts/test-accounts.json','utf8'));const owner=readTestKey('owner');
if(config.chainId!==84532||owner.address!==getAddress(config.addresses.owner))throw new M1Error('TEST_ACCOUNT_MISMATCH');
const l1=createPublicClient({chain:sepolia,transport:http('https://ethereum-sepolia-rpc.publicnode.com',{timeout:10000,retryCount:0}),pollingInterval:1000});
const l2=createPublicClient({chain:baseSepolia,transport:http('https://sepolia.base.org',{timeout:10000,retryCount:0}),pollingInterval:1000});
if(await l1.getChainId()!==11155111||await l2.getChainId()!==84532)throw new M1Error('FUNDING_NETWORK_MISMATCH');
const bridge=getAddress('0xfd0Bf71F60660E2f608ed56e1659C450eB113120');
const abi=parseAbi(['function depositETHTo(address to,uint32 minGasLimit,bytes extraData) payable']);
const amount=parseEther('0.005');const path='artifacts/testnet-funding-bridge.json';
let record=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):undefined;
if(record&&record.recipient!==owner.address)throw new M1Error('FUNDING_RECORD_MISMATCH');
if(!record){
  const sourceBalance=await l1.getBalance({address:owner.address});if(sourceBalance<amount+parseEther('0.001'))throw new M1Error('SEPOLIA_FAUCET_FUNDS_NOT_READY');
  const code=await l1.getCode({address:bridge});if(!code||code==='0x')throw new M1Error('BRIDGE_NOT_DEPLOYED');
  const wc=createWalletClient({account:owner,chain:sepolia,transport:http('https://ethereum-sepolia-rpc.publicnode.com')});
  const {request}=await l1.simulateContract({account:owner,address:bridge,abi,functionName:'depositETHTo',args:[owner.address,200000,'0x'],value:amount});
  const hash=await wc.writeContract(request);
  record={sourceChainId:11155111,destinationChainId:84532,recipient:owner.address,amount:amount.toString(),bridge,bridgeCodeHash:keccak256(code),transaction:hash,state:'L1_SUBMITTED',source:'https://docs.base.org/specifications/reference/base-contracts',faucetTransaction:'0x3e8a811a3d8c7b0994a0098821fa0dc6fa94791ad2b4b9ba8c8ad77dae9b2dae',initialBaseBalance:(await l2.getBalance({address:owner.address})).toString()};
  writeEvidence(path,record);
}
const receipt=await l1.waitForTransactionReceipt({hash:record.transaction,timeout:60000});
if(receipt.status!=='success')throw new M1Error('BRIDGE_SOURCE_REVERTED');
record.sourceBlock=receipt.blockNumber.toString();record.sourceBlockHash=receipt.blockHash;record.state='L1_CONFIRMED_WAITING_BASE';writeEvidence(path,record);
for(let i=0;i<30;i++){
  const balance=await l2.getBalance({address:owner.address});
  if(balance>=BigInt(record.initialBaseBalance)+amount){record.state='BASE_FUNDED';record.destinationBalance=balance.toString();writeEvidence(path,record);break;}
  await new Promise(r=>setTimeout(r,1000));
}
console.log(JSON.stringify({state:record.state,amount:record.amount,sourceTransaction:record.transaction,evidence:path}));
