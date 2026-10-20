import { getAbiItem, parseEventLogs } from "viem";
import type { EchoGateway, GatewayConfig } from "../gateway/src/client.js";
import { EchoError, type ExecutionRecord } from "../gateway/src/model.js";
import { entryPointAbi, registryAbi, tokenAbi } from "../gateway/src/abi.js";

/** Verify the isolated M2 failure at its transaction, rather than today's ledger.
 * Registry spending starts at zero and every increment emits PolicySpendUpdated.
 * Folding the canonical event prefix avoids requiring archive state after restart.
 * This is an experiment assertion, not a general multi-operation receipt parser.
 */
export async function verifyFailedSpend(
	pc: EchoGateway["pc"],
	config: GatewayConfig,
	failure: ExecutionRecord,
) {
	if (failure.state !== "failed" || !failure.transactionHash)
		throw new EchoError("FAILURE_NOT_CONFIRMED");
	if (failure.chainId !== config.chainId ||
		failure.entryPoint.toLowerCase() !== config.entryPoint.toLowerCase() ||
		failure.sender.toLowerCase() !== config.account.toLowerCase())
		throw new EchoError("FAILURE_CONTEXT_MISMATCH");
	if ((await pc.getChainId()) !== config.chainId)
		throw new EchoError("RPC_CHAIN_MISMATCH");
	const receipt = await pc.getTransactionReceipt({ hash: failure.transactionHash });
	const block = await pc.getBlock({ blockNumber: receipt.blockNumber });
	const head = await pc.getBlockNumber({ cacheTime: 0 });
	if (
		receipt.status !== "success" || block.hash !== receipt.blockHash ||
		receipt.blockHash !== failure.blockHash ||
		receipt.blockNumber.toString() !== failure.blockNumber ||
		head - receipt.blockNumber + 1n < BigInt(config.confirmations)
	) throw new EchoError("FAILURE_RECEIPT_UNCONFIRMED");
	const event = parseEventLogs({
		abi: entryPointAbi, eventName: "UserOperationEvent",
		logs: receipt.logs.filter(l => l.address.toLowerCase() === config.entryPoint.toLowerCase()),
	}).find(e => e.args.userOpHash === failure.userOpHash &&
		e.args.sender.toLowerCase() === config.account.toLowerCase() &&
		e.args.nonce === BigInt(failure.nonce));
	if (!event || event.args.success) throw new EchoError("FAILED_OPERATION_EVENT_MISSING");
	const spendsInReceipt = parseEventLogs({
		abi: registryAbi, eventName: "PolicySpendUpdated",
		logs: receipt.logs.filter(l => l.address.toLowerCase() === config.registry.toLowerCase()),
	}).filter(e => e.args.instanceId === failure.instanceId);
	const transfersInReceipt = parseEventLogs({
		abi: tokenAbi, eventName: "Transfer",
		logs: receipt.logs.filter(l => l.address.toLowerCase() === failure.request.tokenIn.toLowerCase()),
	}).filter(e => e.args.from.toLowerCase() === config.account.toLowerCase());
	if (spendsInReceipt.length || transfersInReceipt.length)
		throw new EchoError("FAILED_SWAP_CHANGED_PRINCIPAL");
	let registered = false;
	let spent = 0n;
	let priorSpendEvents = 0;
	for (let from = config.deploymentBlock; from <= receipt.blockNumber; from += 200n) {
		const to = from + 199n < receipt.blockNumber ? from + 199n : receipt.blockNumber;
		const registrations = await pc.getLogs({
			address: config.registry,
			event: getAbiItem({ abi: registryAbi, name: "InstanceRegistered" }),
			args: { instanceId: failure.instanceId }, fromBlock: from, toBlock: to,
		});
		registered ||= registrations.some(l => !l.removed && l.args.owner?.toLowerCase() === config.account.toLowerCase() &&
			(l.blockNumber! < receipt.blockNumber || l.transactionIndex! <= receipt.transactionIndex));
		const logs = await pc.getLogs({
			address: config.registry,
			event: getAbiItem({ abi: registryAbi, name: "PolicySpendUpdated" }),
			args: { instanceId: failure.instanceId }, fromBlock: from, toBlock: to,
		});
		for (const log of logs.sort((a, b) =>
			Number(a.blockNumber! - b.blockNumber!) || a.transactionIndex! - b.transactionIndex! || a.logIndex! - b.logIndex!)) {
			if (log.removed || log.blockNumber! > receipt.blockNumber ||
				(log.blockNumber === receipt.blockNumber && log.transactionIndex! > receipt.transactionIndex)) continue;
			if (log.args.totalSpent === undefined) throw new EchoError("SPEND_EVENT_MALFORMED");
			spent = log.args.totalSpent;
			priorSpendEvents++;
		}
	}
	if (!registered) throw new EchoError("FAILURE_POLICY_REGISTRATION_MISSING");
	if (spent !== 0n) throw new EchoError("FAILURE_EXPERIMENT_BASELINE_CHANGED");
	return {
		chainId: config.chainId, registry: config.registry, account: config.account,
		instanceId: failure.instanceId, userOpHash: failure.userOpHash,
		transactionHash: receipt.transactionHash, blockHash: receipt.blockHash,
		blockNumber: receipt.blockNumber.toString(), spentAtFailure: spent.toString(),
		priorSpendEvents, failedOperationSuccess: false,
		spendEventsInFailureReceipt: spendsInReceipt.length,
		inputTransfersInFailureReceipt: transfersInReceipt.length,
		source: "canonical-registry-event-prefix" as const,
	};
}
