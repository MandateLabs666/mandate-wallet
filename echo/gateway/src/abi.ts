import { parseAbi, type Hex } from "viem";
export const AUTH_TUPLE =
	"(bytes32 instanceId,uint64 policyVersion,bytes32 sessionId,uint64 authorityEpoch,uint48 validAfter,uint48 validUntil,uint256 nonce)";
export const accountAbi = parseAbi([
	`function execute(bytes32 mode,bytes packed,${AUTH_TUPLE} auth) payable`,
	"function authorityState() view returns(bytes32 id,uint64 version,uint64 executeEpoch,address signer,bool paused,uint48 expiry)",
	"function implementation() view returns(address)",
	"event SwapExecuted(uint256 indexed nonce,bytes32 indexed instanceId,bytes32 indexed sessionId,address tokenIn,address tokenOut,uint256 actualInput,uint256 actualOutput)",
]);
export const policyInputTuple =
	"(address budgetAsset,address router,address executeSigner,address[] outputs,uint256 maxPerOp,uint256 maxPerDay,uint256 totalBudget,uint48 expiry)";
export const registryAbi = parseAbi([
	"error Unauthorized()",
	"error InvalidPolicy()",
	"error InvalidContext()",
	"error BudgetExceeded()",
	"function setImplementation(address)",
	"function setOnboarding(address)",
	`function createPolicy(${policyInputTuple} input) returns(bytes32 id)`,
	"function createSession(bytes32 id,address signer,address tokenOut,uint256 maxPerOp,uint256 totalBudget,uint256 maxOpsPerDay,uint48 expiry) returns(bytes32 sid)",
	"function revokeSession(bytes32)",
	"function pauseInstance(bytes32,bool)",
	"function rotateExecuteSigner(bytes32,address)",
	"function updateLimits(bytes32,uint256,uint256,uint256,uint48)",
	"function getPolicy(bytes32) view returns((address owner,address budgetAsset,address router,address executeSigner,uint256 maxPerOp,uint256 maxPerDay,uint256 totalBudget,uint256 totalSpent,uint256 dailySpent,uint256 lastDay,uint48 expiry,uint64 version,uint64 executeEpoch,bool paused,bool exists))",
	"function getSession(bytes32) view returns((bytes32 instanceId,address signer,address tokenOut,uint256 maxPerOp,uint256 totalBudget,uint256 totalSpent,uint256 maxOpsPerDay,uint256 dailyOps,uint256 lastDay,uint48 expiry,uint64 epoch,bool active))",
	"event InstanceRegistered(bytes32 indexed instanceId,address indexed owner,address budgetAsset,uint256 totalBudget)",
	"event SessionCreated(bytes32 indexed sessionId,bytes32 indexed instanceId,address signer)",
	"event PolicySpendUpdated(bytes32 indexed instanceId,bytes32 indexed sessionId,address budgetAsset,uint256 actualInput,uint256 totalSpent)",
]);
export const onboardingAbi = parseAbi([
	`function registerInstanceAndEip7702(${policyInputTuple} input) returns(bytes32)`,
]);
export const routerAbi = parseAbi([
	"function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) returns(uint256)",
	"function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) returns(uint256)",
	"function setFault(bool,uint8,bytes)",
]);
export const tokenAbi = parseAbi([
	"function balanceOf(address) view returns(uint256)",
	"function allowance(address,address) view returns(uint256)",
	"function mint(address,uint256)",
	"event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export const packedOpTuple =
	"(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)";
export const entryPointAbi = parseAbi([
	"function getNonce(address,uint192) view returns(uint256)",
	`function getUserOpHash(${packedOpTuple} op) view returns(bytes32)`,
	`function handleOps(${packedOpTuple}[] ops,address beneficiary)`,
	"function depositTo(address) payable",
	"function balanceOf(address) view returns(uint256)",
	"event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
	"event UserOperationRevertReason(bytes32 indexed userOpHash,address indexed sender,uint256 nonce,bytes revertReason)",
]);
export const authorityTypes = {
	EchoUserOperation: [
		{ name: "userOpHash", type: "bytes32" },
		{ name: "entryPoint", type: "address" },
		{ name: "implementation", type: "address" },
		{ name: "instanceId", type: "bytes32" },
		{ name: "policyVersion", type: "uint64" },
		{ name: "sessionId", type: "bytes32" },
		{ name: "authorityEpoch", type: "uint64" },
		{ name: "validAfter", type: "uint48" },
		{ name: "validUntil", type: "uint48" },
		{ name: "operationNonce", type: "uint256" },
	],
} as const;
export const CANONICAL_ENTRYPOINT =
	"0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;
export const ZERO_HASH = ("0x" + "0".repeat(64)) as Hex;
export const STUB_SIGNATURE = ("0x02" +
	"0".repeat(63) +
	"1" +
	"0".repeat(63) +
	"1" +
	"1b") as Hex;
