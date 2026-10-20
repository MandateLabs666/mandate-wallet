import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { canonical } from "../../../packages/core/model.js";
import { EchoError, type ExecutionRecord } from "./model.js";
export class ExecutionStore {
	private db: DatabaseSync;
	private closed = false;
	constructor(path: string) {
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		this.db = new DatabaseSync(path);
		chmodSync(path, 0o600);
		this.db.exec(
			"PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS operations(request_key TEXT PRIMARY KEY,json TEXT NOT NULL);",
		);
	}
	key(chainId: number, sender: string, requestId: string) {
		return `${chainId}:${sender.toLowerCase()}:${requestId}`;
	}
	get(
		chainId: number,
		sender: string,
		requestId: string,
	): ExecutionRecord | undefined {
		const row = this.db
			.prepare("SELECT json FROM operations WHERE request_key=?")
			.get(this.key(chainId, sender, requestId)) as
			| { json: string }
			| undefined;
		return row ? JSON.parse(row.json) : undefined;
	}
	insert(r: ExecutionRecord) {
		return (
			this.db
				.prepare("INSERT OR IGNORE INTO operations VALUES(?,?)")
				.run(this.key(r.chainId, r.sender, r.requestId), canonical(r))
				.changes === 1
		);
	}
	save(r: ExecutionRecord) {
		const previous = this.get(r.chainId, r.sender, r.requestId);
		if (
			!previous ||
			previous.userOpHash !== r.userOpHash ||
			canonical(previous.signedOp) !== canonical(r.signedOp) ||
			previous.requestHash !== r.requestHash ||
			previous.entryPoint !== r.entryPoint ||
			previous.implementation !== r.implementation
		)
			throw new EchoError("OPERATION_IMMUTABLE");
		this.db
			.prepare("UPDATE operations SET json=? WHERE request_key=?")
			.run(canonical(r), this.key(r.chainId, r.sender, r.requestId));
	}
	all() {
		return (
			this.db
				.prepare("SELECT json FROM operations ORDER BY request_key")
				.all() as { json: string }[]
		).map((r) => JSON.parse(r.json) as ExecutionRecord);
	}
	close() {
		if (!this.closed) {
			this.db.close();
			this.closed = true;
		}
	}
}
