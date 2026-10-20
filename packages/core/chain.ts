import { parseAbi, type Address, type Hex, type Chain, type LocalAccount, createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { M1Error } from './model.js';

export const walletAbi = parseAbi([
  'error Unauthorized()', 'error InvalidPolicy()', 'error InvalidPayment()', 'error InvalidSignature()', 'error BudgetExceeded()', 'error StepAlreadyUsed()', 'error UnsafeRelease()',
  'function createMandate(bytes32 id,address signer,address payTo,uint256 budget,uint256 maxPerPayment,uint64 expiresAt,bytes32[] steps)',
  'function registerPayment((bytes32 mandateId,bytes32 stepId,bytes32 requestHash,bytes32 quoteHash,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce) p,bytes registrationSignature) returns (bytes32 digest)',
  'function paymentDigest((bytes32 mandateId,bytes32 stepId,bytes32 requestHash,bytes32 quoteHash,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce) p) view returns (bytes32)',
  'function registrationDigest((bytes32 mandateId,bytes32 stepId,bytes32 requestHash,bytes32 quoteHash,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce) p) view returns (bytes32)',
  'function getMandate(bytes32) view returns ((address sessionSigner,address payTo,uint256 budget,uint256 maxPerPayment,uint256 occupied,uint64 expiresAt,bool revoked,bool exists))',
  'function getCommitment(bytes32) view returns ((bytes32 mandateId,bytes32 stepId,bytes32 nonce,uint256 value,uint256 validBefore,bool released,bool exists))',
  'function isValidSignature(bytes32 hash,bytes signature) view returns (bytes4)',
  'function revokeMandate(bytes32)', 'function releaseExpired(bytes32)',
  'function owner() view returns (address)', 'function asset() view returns (address)',
  'function paymentNonce(bytes32,bytes32) view returns (bytes32)',
  'function usedStep(bytes32,bytes32) view returns (bool)',
  'event PaymentRegistered(bytes32 indexed digest,bytes32 indexed mandateId,bytes32 indexed stepId,uint256 value,bytes32 nonce,uint256 validBefore,bytes32 requestHash,bytes32 quoteHash)',
]);
export const tokenAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)',
  'function name() view returns (string)', 'function version() view returns (string)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function authorizationState(address,bytes32) view returns (bool)',
  'function mint(address,uint256)', 'function transfer(address,uint256) returns (bool)',
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)',
  'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
  'event AuthorizationCanceled(address indexed authorizer,bytes32 indexed nonce)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
export const registerTypes = { RegisterPayment: [
  { name:'mandateId',type:'bytes32' },{ name:'stepId',type:'bytes32' },{ name:'requestHash',type:'bytes32' },{ name:'quoteHash',type:'bytes32' },
  { name:'to',type:'address' },{ name:'value',type:'uint256' },{ name:'validAfter',type:'uint256' },{ name:'validBefore',type:'uint256' },{ name:'nonce',type:'bytes32' },
] } as const;
export const authorizationTypes = { TransferWithAuthorization: [
  { name:'from',type:'address' },{ name:'to',type:'address' },{ name:'value',type:'uint256' },
  { name:'validAfter',type:'uint256' },{ name:'validBefore',type:'uint256' },{ name:'nonce',type:'bytes32' },
] } as const;
export type PaymentParams = { mandateId: Hex; stepId: Hex; requestHash: Hex; quoteHash: Hex; to: Address; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex };
export function chainFor(id: number): Chain {
  if (id === 84532) return baseSepolia;
  if (id === 31337) return { id, name:'Anvil M1', nativeCurrency:{ name:'Ether', symbol:'ETH', decimals:18 }, rpcUrls:{ default:{ http:['http://127.0.0.1:8545'] } } };
  throw new M1Error('TRANSACTION_NETWORK_UNSUPPORTED');
}
export function clients(id: number, rpc: string, operator: LocalAccount) {
  const chain = chainFor(id); const transport = http(rpc, { timeout: 10000, retryCount: 0 });
  return { pc: createPublicClient({ chain, transport, pollingInterval:200 }), wc: createWalletClient({ account:operator, chain, transport }) };
}
