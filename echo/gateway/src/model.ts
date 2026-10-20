import { z } from "zod";
import type { Address, Hex } from "viem";
export type AuthContext = {
	instanceId: Hex;
	policyVersion: bigint;
	sessionId: Hex;
	authorityEpoch: bigint;
	validAfter: number;
	validUntil: number;
	nonce: bigint;
};
export type PackedOp = {
	sender: Address;
	nonce: bigint;
	initCode: Hex;
	callData: Hex;
	accountGasLimits: Hex;
	preVerificationGas: bigint;
	gasFees: Hex;
	paymasterAndData: Hex;
	signature: Hex;
};
export type RpcOp = {
	sender: Address;
	nonce: Hex;
	callData: Hex;
	callGasLimit: Hex;
	verificationGasLimit: Hex;
	preVerificationGas: Hex;
	maxFeePerGas: Hex;
	maxPriorityFeePerGas: Hex;
	signature: Hex;
	paymaster?: Address;
	paymasterData?: Hex;
	paymasterVerificationGasLimit?: Hex;
	paymasterPostOpGasLimit?: Hex;
};
const atomic = z
	.string()
	.regex(/^[1-9][0-9]*$/)
	.refine((n) => /^[1-9][0-9]*$/.test(n) && BigInt(n) < 2n ** 128n);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const SwapRequest = z
	.object({
		schemaVersion: z.literal(2),
		requestId: z.string().min(1).max(128),
		instanceId: hash,
		sessionId: hash,
		tokenIn: address,
		tokenOut: address,
		direction: z.enum(["exactInput", "exactOutput"]),
		inputLimit: atomic,
		outputConstraint: atomic,
		fee: z.literal(500),
	})
	.strict();
export type SwapRequestInput = z.infer<typeof SwapRequest>;
export type PreparedSwap = {
	request: SwapRequestInput;
	auth: AuthContext;
	op: PackedOp;
	hash: Hex;
	signer: Address;
	implementation: Address;
	router: Address;
};
export type ExecutionRecord = {
	schemaVersion: 2;
	requestId: string;
	requestHash: Hex;
	chainId: number;
	entryPoint: Address;
	implementation: Address;
	sender: Address;
	instanceId: Hex;
	sessionId: Hex;
	nonce: Hex;
	userOpHash: Hex;
	signedOp: RpcOp;
	request: SwapRequestInput;
	state: "pending" | "succeeded" | "failed" | "rejected";
	transactionHash?: Hex;
	blockHash?: Hex;
	blockNumber?: string;
	inputBalanceBefore?: string;
	inputBalanceAfter?: string;
	outputBalanceBefore?: string;
	outputBalanceAfter?: string;
	assetProof?: "transaction-call-trace" | "account-balance-event";
	actualInput?: string;
	actualOutput?: string;
	actualGasCostWei?: string;
	actualGasUsed?: string;
	errorCode?: string;
	submitted: boolean;
};
export class EchoError extends Error {
	constructor(
		readonly code: string,
		readonly detail?: string,
	) {
		super(code);
		this.name = "EchoError";
	}
}
