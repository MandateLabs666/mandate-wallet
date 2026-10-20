import {
	createPublicClient,
	http,
	encodeFunctionData,
	encodePacked,
	decodeFunctionData,
	hashTypedData,
	toHex,
	hexToBigInt,
	parseEventLogs,
	getAbiItem,
	getAddress,
	isAddressEqual,
	keccak256,
	TransactionReceiptNotFoundError,
	type Address,
	type Hex,
	type Chain,
	type LocalAccount,
} from "viem";
import { sepolia } from "viem/chains";
import { canonical, hashJson } from "../../../packages/core/model.js";
import {
	accountAbi,
	registryAbi,
	routerAbi,
	entryPointAbi,
	tokenAbi,
	authorityTypes,
	STUB_SIGNATURE,
	ZERO_HASH,
} from "./abi.js";
import {
	SwapRequest,
	EchoError,
	type SwapRequestInput,
	type PreparedSwap,
	type PackedOp,
	type RpcOp,
	type ExecutionRecord,
	type AuthContext,
} from "./model.js";
import { ExecutionStore } from "./store.js";

export type GatewayConfig = {
	chainId: 1337 | 31337 | 11155111;
	rpcUrl: string;
	bundlerUrl: string;
	entryPoint: Address;
	registry: Address;
	account: Address;
	implementation: Address;
	deploymentBlock: bigint;
	confirmations: number;
};
const local: Chain = {
	id: 31337,
	name: "M2 Anvil",
	nativeCurrency: { name: "test Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: { default: { http: ["http://127.0.0.1"] } },
};
export function pack(op: RpcOp): PackedOp {
	const paymaster = op.paymaster
		? encodePacked(
				["address", "uint128", "uint128", "bytes"],
				[
					op.paymaster,
					hexToBigInt(op.paymasterVerificationGasLimit ?? "0x0"),
					hexToBigInt(op.paymasterPostOpGasLimit ?? "0x0"),
					op.paymasterData ?? "0x",
				],
			)
		: "0x";
	return {
		sender: op.sender,
		nonce: hexToBigInt(op.nonce),
		initCode: "0x",
		callData: op.callData,
		accountGasLimits: encodePacked(
			["uint128", "uint128"],
			[hexToBigInt(op.verificationGasLimit), hexToBigInt(op.callGasLimit)],
		),
		preVerificationGas: hexToBigInt(op.preVerificationGas),
		gasFees: encodePacked(
			["uint128", "uint128"],
			[hexToBigInt(op.maxPriorityFeePerGas), hexToBigInt(op.maxFeePerGas)],
		),
		paymasterAndData: paymaster,
		signature: op.signature,
	};
}
export function wire(op: PackedOp): RpcOp {
	const limits = BigInt(op.accountGasLimits),
		fees = BigInt(op.gasFees),
		mask = (1n << 128n) - 1n;
	const result: RpcOp = {
		sender: op.sender,
		nonce: toHex(op.nonce),
		callData: op.callData,
		verificationGasLimit: toHex(limits >> 128n),
		callGasLimit: toHex(limits & mask),
		preVerificationGas: toHex(op.preVerificationGas),
		maxPriorityFeePerGas: toHex(fees >> 128n),
		maxFeePerGas: toHex(fees & mask),
		signature: op.signature,
	};
	if (op.paymasterAndData !== "0x") {
		if (op.paymasterAndData.length < 106)
			throw new EchoError("PAYMASTER_ENCODING_INVALID");
		result.paymaster = getAddress(op.paymasterAndData.slice(0, 42));
		result.paymasterVerificationGasLimit = ("0x" +
			op.paymasterAndData.slice(42, 74)) as Hex;
		result.paymasterPostOpGasLimit = ("0x" +
			op.paymasterAndData.slice(74, 106)) as Hex;
		result.paymasterData = ("0x" + op.paymasterAndData.slice(106)) as Hex;
	}
	return result;
}
export function signingData(
	config: GatewayConfig,
	hash: Hex,
	auth: AuthContext,
) {
	return {
		domain: {
			name: "EchoAuthority",
			version: "2",
			chainId: config.chainId,
			verifyingContract: config.account,
		},
		types: authorityTypes,
		primaryType: "EchoUserOperation" as const,
		message: {
			userOpHash: hash,
			entryPoint: config.entryPoint,
			implementation: config.implementation,
			instanceId: auth.instanceId,
			policyVersion: auth.policyVersion,
			sessionId: auth.sessionId,
			authorityEpoch: auth.authorityEpoch,
			validAfter: auth.validAfter,
			validUntil: auth.validUntil,
			operationNonce: auth.nonce,
		},
	};
}
export class EchoGateway {
	readonly pc;
	constructor(
		readonly config: GatewayConfig,
		readonly store: ExecutionStore,
	) {
		if (![1337, 31337, 11155111].includes(config.chainId))
			throw new EchoError("NETWORK_UNSUPPORTED");
		this.pc = createPublicClient({
			chain:
				config.chainId === 11155111
					? sepolia
					: { ...local, id: config.chainId },
			transport: http(config.rpcUrl, { timeout: 10000, retryCount: 0 }),
			pollingInterval: 200,
		});
	}
	async rpc<T>(method: string, params: unknown[]): Promise<T> {
		const response = await fetch(this.config.bundlerUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
			signal: AbortSignal.timeout(10000),
		});
		const body = (await response.json()) as {
			result: T;
			error?: { code: number; message: string };
		};
		if (body.error)
			throw new EchoError(`BUNDLER_${body.error.code}`, body.error.message);
		if (!response.ok) throw new EchoError("BUNDLER_HTTP_ERROR");
		return body.result;
	}
	async prepareSwap(request: SwapRequestInput): Promise<PreparedSwap> {
		const r = SwapRequest.parse(request);
		const c = this.config;
		if ((await this.pc.getChainId()) !== c.chainId)
			throw new EchoError("RPC_CHAIN_MISMATCH");
		if (
			!isAddressEqual(await this.pc.readContract({
				address: c.account,
				abi: accountAbi,
				functionName: "implementation",
			}), c.implementation)
		)
			throw new EchoError("DELEGATION_MISMATCH");
		const p = await this.pc.readContract({
			address: c.registry,
			abi: registryAbi,
			functionName: "getPolicy",
			args: [r.instanceId as Hex],
		});
		if (
			!p.exists ||
			p.paused ||
			!isAddressEqual(p.owner, c.account) ||
			p.budgetAsset.toLowerCase() !== r.tokenIn.toLowerCase()
		)
			throw new EchoError("POLICY_OR_ASSET_MISMATCH");
		const s =
			r.sessionId !== ZERO_HASH
				? await this.pc.readContract({
						address: c.registry,
						abi: registryAbi,
						functionName: "getSession",
						args: [r.sessionId as Hex],
					})
				: undefined;
		if (
			s &&
			(!s.active ||
				s.instanceId !== r.instanceId ||
				s.tokenOut.toLowerCase() !== r.tokenOut.toLowerCase())
		)
			throw new EchoError("SESSION_MISMATCH");
		const now = (await this.pc.getBlock()).timestamp;
		const until = Math.min(Number(now) + 300, p.expiry, s?.expiry ?? p.expiry);
		if (until <= now) throw new EchoError("AUTHORITY_EXPIRED");
		const upper = BigInt(r.inputLimit);
		const day = now / 86400n;
		const daily = p.lastDay === day ? p.dailySpent : 0n;
		if (
			upper > p.maxPerOp ||
			p.totalSpent + upper > p.totalBudget ||
			daily + upper > p.maxPerDay ||
			(s &&
				(upper > s.maxPerOp ||
					s.totalSpent + upper > s.totalBudget ||
					(s.lastDay === day ? s.dailyOps : 0n) >= s.maxOpsPerDay))
		)
			throw new EchoError("BUDGET_EXCEEDED");
		const nonce = await this.pc.readContract({
			address: c.entryPoint,
			abi: entryPointAbi,
			functionName: "getNonce",
			args: [c.account, 0n],
		});
		const auth: AuthContext = {
			instanceId: r.instanceId as Hex,
			policyVersion: p.version,
			sessionId: r.sessionId as Hex,
			authorityEpoch: s?.epoch ?? p.executeEpoch,
			validAfter: 0,
			validUntil: until,
			nonce,
		};
		const params = {
			tokenIn: getAddress(r.tokenIn),
			tokenOut: getAddress(r.tokenOut),
			fee: r.fee,
			recipient: c.account,
			deadline: BigInt(until),
			sqrtPriceLimitX96: 0n,
		};
		const inner =
			r.direction === "exactInput"
				? encodeFunctionData({
						abi: routerAbi,
						functionName: "exactInputSingle",
						args: [
							{
								...params,
								amountIn: upper,
								amountOutMinimum: BigInt(r.outputConstraint),
							},
						],
					})
				: encodeFunctionData({
						abi: routerAbi,
						functionName: "exactOutputSingle",
						args: [
							{
								...params,
								amountOut: BigInt(r.outputConstraint),
								amountInMaximum: upper,
							},
						],
					});
		const callData = encodeFunctionData({
			abi: accountAbi,
			functionName: "execute",
			args: [
				ZERO_HASH,
				encodePacked(["address", "uint256", "bytes"], [p.router, 0n, inner]),
				auth,
			],
		});
		const price = await this.pc.getGasPrice();
		let op: RpcOp = {
			sender: c.account,
			nonce: toHex(nonce),
			callData,
			verificationGasLimit: toHex(500000n),
			callGasLimit: toHex(1000000n),
			preVerificationGas: toHex(100000n),
			maxFeePerGas: toHex(price * 2n),
			maxPriorityFeePerGas: toHex(price),
			signature: STUB_SIGNATURE,
		};
		const estimate = await this.rpc<{
			verificationGasLimit: Hex;
			callGasLimit: Hex;
			preVerificationGas: Hex;
		}>("eth_estimateUserOperationGas", [op, c.entryPoint]);
		// Estimation margin is applied before signing. Sponsored fields are not padded afterwards.
		op = {
			...op,
			verificationGasLimit: toHex(
				(hexToBigInt(estimate.verificationGasLimit) * 120n) / 100n + 4000n,
			),
			callGasLimit: toHex(
				(hexToBigInt(estimate.callGasLimit) * 120n) / 100n + 4000n,
			),
			preVerificationGas: toHex(
				(hexToBigInt(estimate.preVerificationGas) * 120n) / 100n,
			),
		};
		const packed = pack(op);
		const hash = await this.pc.readContract({
			address: c.entryPoint,
			abi: entryPointAbi,
			functionName: "getUserOpHash",
			args: [packed],
		});
		return {
			request: r,
			auth,
			op: packed,
			hash,
			signer: s?.signer ?? p.executeSigner,
			implementation: c.implementation,
			router: p.router,
		};
	}
	async sponsorPreparedOp(
		prepared: PreparedSwap,
		sponsor: (stub: RpcOp) => Promise<Partial<RpcOp>>,
	): Promise<PreparedSwap> {
		if (prepared.op.signature !== STUB_SIGNATURE)
			throw new EchoError("SPONSOR_BEFORE_SIGNING_ONLY");
		const fields = await sponsor(wire(prepared.op));
		if (
			!fields.paymaster ||
			!fields.paymasterVerificationGasLimit ||
			!fields.paymasterPostOpGasLimit ||
			fields.paymasterData === undefined
		)
			throw new EchoError("SPONSOR_RESPONSE_INCOMPLETE");
		const base = wire(prepared.op);
		// Copy only fee/gas/sponsor fields. A sponsor cannot replace calldata, sender, nonce or signature.
		const final: RpcOp = {
			...base,
			paymaster: fields.paymaster,
			paymasterVerificationGasLimit: fields.paymasterVerificationGasLimit,
			paymasterPostOpGasLimit: fields.paymasterPostOpGasLimit,
			paymasterData: fields.paymasterData,
		};
		for (const key of [
			"callGasLimit",
			"verificationGasLimit",
			"preVerificationGas",
			"maxFeePerGas",
			"maxPriorityFeePerGas",
		] as const)
			if (fields[key] !== undefined) final[key] = fields[key];
		const op = pack(final);
		const hash = await this.pc.readContract({
			address: this.config.entryPoint,
			abi: entryPointAbi,
			functionName: "getUserOpHash",
			args: [op],
		});
		return { ...prepared, op, hash };
	}
	async signUserOp(
		prepared: PreparedSwap,
		signer: Pick<LocalAccount, "address" | "signTypedData">,
	): Promise<PreparedSwap> {
		if (!isAddressEqual(signer.address, prepared.signer))
			throw new EchoError("SIGNER_MISMATCH");
		const hash = await this.pc.readContract({
			address: this.config.entryPoint,
			abi: entryPointAbi,
			functionName: "getUserOpHash",
			args: [prepared.op],
		});
		if (hash !== prepared.hash)
			throw new EchoError("PREPARED_OPERATION_CHANGED");
		const signature = await signer.signTypedData(
			signingData(this.config, hash, prepared.auth),
		);
		return {
			...prepared,
			op: { ...prepared.op, signature: ("0x02" + signature.slice(2)) as Hex },
		};
	}
	async submitSignedOp(p: PreparedSwap): Promise<ExecutionRecord> {
		if (p.op.signature === STUB_SIGNATURE || p.op.signature.length !== 134)
			throw new EchoError("FINAL_SIGNATURE_REQUIRED");
		if (
			(await this.pc.readContract({
				address: this.config.entryPoint,
				abi: entryPointAbi,
				functionName: "getUserOpHash",
				args: [p.op],
			})) !== p.hash
		)
			throw new EchoError("SIGNED_OPERATION_CHANGED");
		const r: ExecutionRecord = {
			schemaVersion: 2,
			requestId: p.request.requestId,
			requestHash: hashJson(p.request),
			chainId: this.config.chainId,
			entryPoint: this.config.entryPoint,
			implementation: this.config.implementation,
			sender: p.op.sender,
			instanceId: p.auth.instanceId,
			sessionId: p.auth.sessionId,
			nonce: toHex(p.op.nonce),
			userOpHash: p.hash,
			signedOp: wire(p.op),
			request: p.request,
			state: "pending",
			submitted: false,
		};
		if (!this.store.insert(r)) {
			const existing = this.store.get(r.chainId, r.sender, r.requestId)!;
			if (existing.requestHash !== r.requestHash)
				throw new EchoError("REQUEST_REUSE_MISMATCH");
			return this.reconcileUserOp(existing);
		}
		try {
			const accepted = await this.rpc<Hex>("eth_sendUserOperation", [
				r.signedOp,
				this.config.entryPoint,
			]);
			if (accepted !== r.userOpHash)
				throw new EchoError("BUNDLER_HASH_MISMATCH");
			r.submitted = true;
			this.store.save(r);
		} catch (e) {
			r.errorCode =
				e instanceof EchoError ? e.code : "BUNDLER_RESPONSE_UNKNOWN";
			if (/^BUNDLER_-(3250[0-9]|32602)$/.test(r.errorCode))
				r.state = "rejected";
			this.store.save(r);
		}
		return this.reconcileUserOp(r);
	}
	async reconcileUserOp(r: ExecutionRecord): Promise<ExecutionRecord> {
		try {
			if ((await this.pc.getChainId()) !== r.chainId)
				throw new EchoError("RPC_CHAIN_MISMATCH");
			if (
			!isAddressEqual(r.entryPoint, this.config.entryPoint) ||
			!isAddressEqual(r.implementation, this.config.implementation)
			)
				throw new EchoError("RECORDED_CONTEXT_CHANGED");
			const canonicalReceipt = async (hash: Hex) => {
				try {
					const receipt = await this.pc.getTransactionReceipt({ hash });
					const block = await this.pc.getBlock({ blockNumber: receipt.blockNumber });
					if (/^0x0+$/.test(receipt.blockHash) || block.hash !== receipt.blockHash)
						return undefined;
					return receipt;
				} catch (error) {
					// A timeout is not proof that a receipt has disappeared.
					if (error instanceof TransactionReceiptNotFoundError) return undefined;
					throw error;
				}
			};
			const examined = new Set<Hex>();
			let receipt;
			if (r.transactionHash) {
				examined.add(r.transactionHash);
				receipt = await canonicalReceipt(r.transactionHash);
				if (!receipt) {
					// Preserve the operation, but never export orphaned amounts as
					// current receipt evidence. A replacement bundle may have a new hash.
					for (const field of [
						"transactionHash", "blockHash", "blockNumber", "actualGasCostWei",
						"actualGasUsed", "actualInput", "actualOutput", "assetProof",
						"inputBalanceBefore", "inputBalanceAfter", "outputBalanceBefore", "outputBalanceAfter",
					] as const) delete r[field];
					r.state = "pending";
					r.errorCode = "RECEIPT_REORGED";
				}
			}
			if (!receipt) {
				const bundled = await this.rpc<{
					receipt: { transactionHash: Hex };
				} | null>("eth_getUserOperationReceipt", [r.userOpHash]).catch(
					() => null,
				);
				const hash = bundled?.receipt?.transactionHash;
				if (hash && !examined.has(hash)) {
					examined.add(hash);
					// The bundler's receipt is a hint; canonical chain evidence wins.
					receipt = await canonicalReceipt(hash);
				}
			}
			if (!receipt) {
				const head = await this.pc.getBlockNumber({ cacheTime: 0 });
				for (
					let from = this.config.deploymentBlock;
					from <= head;
					from += 200n
				) {
					const logs = await this.pc.getLogs({
						address: this.config.entryPoint,
						event: getAbiItem({
							abi: entryPointAbi,
							name: "UserOperationEvent",
						}),
						args: { userOpHash: r.userOpHash },
						fromBlock: from,
						toBlock: from + 199n < head ? from + 199n : head,
					});
					for (const log of logs) {
						const hash = log.transactionHash;
						if (!hash || examined.has(hash)) continue;
						examined.add(hash);
						receipt = await canonicalReceipt(hash);
						if (receipt) break;
					}
					if (receipt) break;
				}
			}
			if (!receipt) {
				if (r.state !== "rejected") r.state = "pending";
				this.store.save(r);
				return r;
			}
			const tx = receipt.transactionHash;
			const head = await this.pc.getBlockNumber({ cacheTime: 0 });
			if (
				head - receipt.blockNumber + 1n < BigInt(this.config.confirmations)
			)
				throw new EchoError("RECEIPT_UNCONFIRMED");
			const events = parseEventLogs({
				abi: entryPointAbi,
				eventName: "UserOperationEvent",
				logs: receipt.logs.filter(
					(l) =>
						l.address.toLowerCase() === this.config.entryPoint.toLowerCase(),
				),
			});
			const event = events.find(
				(e) =>
					e.args.userOpHash === r.userOpHash &&
					e.args.sender.toLowerCase() === r.sender.toLowerCase() &&
					e.args.nonce === BigInt(r.nonce),
			);
			if (!event) throw new EchoError("USER_OPERATION_EVENT_MISSING");
			r.transactionHash = tx;
			r.blockHash = receipt.blockHash;
			r.blockNumber = receipt.blockNumber.toString();
			r.actualGasCostWei = event.args.actualGasCost.toString();
			r.actualGasUsed = event.args.actualGasUsed.toString();
			if (receipt.status !== "success" || !event.args.success) {
				r.state = "failed";
				r.errorCode = "USER_OPERATION_FAILED";
				this.store.save(r);
				return r;
			}
			const swap = parseEventLogs({
				abi: accountAbi,
				eventName: "SwapExecuted",
				logs: receipt.logs.filter(
					(l) => l.address.toLowerCase() === r.sender.toLowerCase(),
				),
			}).find(
				(e) =>
					e.args.nonce === BigInt(r.nonce) &&
					e.args.instanceId === r.instanceId &&
					e.args.sessionId === r.sessionId,
			);
			if (
				!swap ||
				swap.args.tokenIn.toLowerCase() !== r.request.tokenIn.toLowerCase() ||
				swap.args.tokenOut.toLowerCase() !== r.request.tokenOut.toLowerCase()
			)
				throw new EchoError("SWAP_EVENT_MISSING");
			const inputTransfers = parseEventLogs({
				abi: tokenAbi,
				eventName: "Transfer",
				logs: receipt.logs.filter(
					(l) => l.address.toLowerCase() === r.request.tokenIn.toLowerCase(),
				),
			});
			const outputTransfers = parseEventLogs({
				abi: tokenAbi,
				eventName: "Transfer",
				logs: receipt.logs.filter(
					(l) => l.address.toLowerCase() === r.request.tokenOut.toLowerCase(),
				),
			});
			const decoded = decodeFunctionData({
				abi: accountAbi,
				data: r.signedOp.callData,
			});
			const packedCall = decoded.args![1] as Hex;
			const router = getAddress(packedCall.slice(0, 42));
			if (
				!inputTransfers.some(
					(e) =>
						e.args.from.toLowerCase() === r.sender.toLowerCase() &&
						e.args.to === router &&
						e.args.value === swap.args.actualInput,
				) ||
				!outputTransfers.some(
					(e) =>
						e.args.to.toLowerCase() === r.sender.toLowerCase() &&
						e.args.value === swap.args.actualOutput,
				)
			)
				throw new EchoError("ASSET_EVENTS_MISMATCH");
			if (
				swap.args.actualInput > BigInt(r.request.inputLimit) ||
				(r.request.direction === "exactInput"
					? swap.args.actualInput !== BigInt(r.request.inputLimit) ||
						swap.args.actualOutput < BigInt(r.request.outputConstraint)
					: swap.args.actualOutput !== BigInt(r.request.outputConstraint))
			)
				throw new EchoError("RESULT_CONSTRAINT_MISMATCH");
			// SwapExecuted contains the balance delta enforced atomically by the verified account.
			// Corroborate the four exact balanceOf reads when the RPC retains historical trace state.
			r.assetProof = "account-balance-event";
			delete r.inputBalanceBefore;
			delete r.inputBalanceAfter;
			delete r.outputBalanceBefore;
			delete r.outputBalanceAfter;
			try {
				type Frame = {
					from?: string;
					to?: string;
					input?: Hex;
					output?: Hex;
					error?: string;
					calls?: Frame[];
				};
				const trace = (await this.pc.request({
					method: "debug_traceTransaction",
					params: [tx, { tracer: "callTracer" }],
				} as never)) as unknown as Frame;
				const frames = (f: Frame): Frame[] => [
					f,
					...(f.calls ?? []).flatMap(frames),
				];
				const execution = frames(trace).find(
					(f) =>
						f.from?.toLowerCase() === this.config.entryPoint.toLowerCase() &&
						f.to?.toLowerCase() === r.sender.toLowerCase() &&
						f.input === r.signedOp.callData &&
						!f.error,
				);
				if (!execution) throw new EchoError("EXECUTION_TRACE_MISSING");
				const balances = (asset: string) =>
					frames(execution)
						.filter(
							(f) =>
								f.from?.toLowerCase() === r.sender.toLowerCase() &&
								f.to?.toLowerCase() === asset.toLowerCase() &&
								f.input?.slice(0, 10) === "0x70a08231" &&
								f.output &&
								!f.error,
						)
						.map((f) => BigInt(f.output!));
				const inputs = balances(r.request.tokenIn),
					outputs = balances(r.request.tokenOut);
				if (
					inputs.length !== 2 ||
					outputs.length !== 2 ||
					inputs[0] - inputs[1] !== swap.args.actualInput ||
					outputs[1] - outputs[0] !== swap.args.actualOutput
				)
					throw new EchoError("ASSET_BALANCE_DELTA_MISMATCH");
				r.inputBalanceBefore = inputs[0].toString();
				r.inputBalanceAfter = inputs[1].toString();
				r.outputBalanceBefore = outputs[0].toString();
				r.outputBalanceAfter = outputs[1].toString();
				r.assetProof = "transaction-call-trace";
			} catch (error) {
				if (error instanceof EchoError) throw error;
			}
			r.actualInput = swap.args.actualInput.toString();
			r.actualOutput = swap.args.actualOutput.toString();
			r.state = "succeeded";
			delete r.errorCode;
			this.store.save(r);
			return r;
		} catch (e) {
			r.state = "pending";
			r.errorCode = e instanceof EchoError ? e.code : "RECONCILIATION_UNKNOWN";
			this.store.save(r);
			return r;
		}
	}
	exportEvidence() {
		return {
			schemaVersion: 2,
			config: {
				...this.config,
				deploymentBlock: this.config.deploymentBlock.toString(),
			},
			records: this.store.all(),
			limitations: [
				"controlled swap fixture",
				"same-host test signing",
				`${this.config.confirmations}-block confirmation is not finality`,
			],
		};
	}
	async execute(
		request: SwapRequestInput,
		signer: Pick<LocalAccount, "address" | "signTypedData">,
	) {
		const r = SwapRequest.parse(request);
		const existing = this.store.get(
			this.config.chainId,
			this.config.account,
			r.requestId,
		);
		if (existing) {
			if (existing.requestHash !== hashJson(r))
				throw new EchoError("REQUEST_REUSE_MISMATCH");
			return this.reconcileUserOp(existing);
		}
		return this.submitSignedOp(
			await this.signUserOp(await this.prepareSwap(r), signer),
		);
	}
	async retryRecordedOp(r: ExecutionRecord) {
		r = await this.reconcileUserOp(r);
		if (r.state !== "pending") return r;
		const nonce = await this.pc.readContract({
			address: this.config.entryPoint,
			abi: entryPointAbi,
			functionName: "getNonce",
			args: [r.sender, 0n],
		});
		const decoded = decodeFunctionData({
			abi: accountAbi,
			data: r.signedOp.callData,
		});
		const auth = decoded.args![2]!;
		if (
			nonce !== BigInt(r.nonce) ||
			(await this.pc.getBlock()).timestamp >= BigInt(auth.validUntil)
		)
			return r;
		// Do not replace an operation that the bundler still tracks. An unknown lookup is not proof of absence.
		let known: unknown;
		try {
			known = await this.rpc("eth_getUserOperationByHash", [r.userOpHash]);
		} catch {
			r.errorCode = "BUNDLER_PRESENCE_UNKNOWN";
			this.store.save(r);
			return r;
		}
		if (known) return r;
		try {
			const hash = await this.rpc<Hex>("eth_sendUserOperation", [
				r.signedOp,
				this.config.entryPoint,
			]);
			if (hash !== r.userOpHash) throw new EchoError("BUNDLER_HASH_MISMATCH");
			r.submitted = true;
			this.store.save(r);
		} catch {
			r.errorCode = "RETRY_RESPONSE_UNKNOWN";
			this.store.save(r);
		}
		return this.reconcileUserOp(r);
	}
}
