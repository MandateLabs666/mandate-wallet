import { z } from 'zod';
import { getAddress, isAddress, keccak256, toBytes, encodeAbiParameters, parseAbiParameters, type Hex } from 'viem';

export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v=>isAddress(v),'invalid address checksum').transform(v => getAddress(v));
export const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v => v.toLowerCase() as Hex);
export const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v => /^(0|[1-9][0-9]*)$/.test(v)&&BigInt(v) < 2n ** 256n, 'invalid uint256');
const version = { schemaVersion: z.literal(1) };
export const PolicySpec = z.object({ ...version, mandateId: hash, owner: address, wallet: address,
  chainId: z.number().int().positive().safe(), sessionSigner: address, asset: address, payTo: address,
  budget: uint, maxPerPayment: uint, expiresAt: z.number().int().positive().safe(), stepIds: z.array(hash).min(1).max(16),
}).strict().superRefine((p, c) => {
  if(!uint.safeParse(p.budget).success||!uint.safeParse(p.maxPerPayment).success)return;
  if (BigInt(p.budget) === 0n || BigInt(p.maxPerPayment) === 0n || BigInt(p.maxPerPayment) > BigInt(p.budget)) c.addIssue({ code: 'custom', message: 'invalid limits' });
  if (new Set(p.stepIds).size !== p.stepIds.length || p.stepIds.some(s => s === '0x' + '0'.repeat(64))) c.addIssue({ code: 'custom', message: 'invalid steps' });
});
export const ActionProof = z.object({ ...version, mandateId: hash, stepId: hash, wallet: address,
  chainId: z.number().int().positive().safe(), nonce: hash, paymentDigest: hash, requestHash: hash, quoteHash: hash,
  registrationSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/), evidenceSource: z.literal('local'),
}).strict();
export const PaymentCommitment = z.object({ ...version, mandateId: hash, stepId: hash, wallet: address,
  chainId: z.number().int().positive().safe(), asset: address, payTo: address, amount: uint, validAfter: uint, validBefore: uint,
  nonce: hash, paymentDigest: hash, registrationTx: hash,
}).strict();
export const SessionAttestation = z.object({ ...version, sessionId: hash, mandateId: hash, scope: z.array(z.string()).min(1),
  checkpointRoot: hash, previousRoot: hash.nullable(), source: z.enum(['local', 'merchant_signed', 'independent_witness']),
  disclosure: z.enum(['public_fixture', 'selective']), witness: address.nullable(), implemented: z.literal(false),
}).strict();
export const ContainmentDecisionLog = z.object({ ...version, mandateId: hash, stepId: hash,
  decision: z.enum(['allow', 'reject', 'pending']), code: z.string().min(1), evidenceRefs: z.array(z.string()),
  timestamp: z.number().int().positive().safe(), source: z.literal('local'),
}).strict();
export type Policy = z.infer<typeof PolicySpec>;
export class M1Error extends Error { constructor(public readonly code: string) { super(code); this.name = 'M1Error'; } }
export function canonical(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a<b?-1:a>b?1:0).map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function hashJson(value: unknown): Hex { return keccak256(toBytes(canonical(value))); }
export function stepId(name: string): Hex { return keccak256(toBytes(name)); }
export function nonceFor(chainId: number, wallet: `0x${string}`, mandateId: Hex, step: Hex): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('uint256,address,bytes32,bytes32'), [BigInt(chainId),wallet,mandateId,step]));
}
