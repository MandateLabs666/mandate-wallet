import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import {
	randomBytes,
	pbkdf2Sync,
	createCipheriv,
	createDecipheriv,
} from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { LocalAccount, Hex } from "viem";
import { EchoError } from "./model.js";
type Item = {
	id: string;
	address: string;
	encrypted: string;
	iv: string;
	tag: string;
};
/// Echo v2 encrypted signing handles. No legacy raw-key export/signature constructor.
export class SignerStore {
	private data: { schemaVersion: 2; salt: string; items: Item[] };
	private encryptionKey: Buffer;
	constructor(
		readonly path: string,
		passphrase: string,
	) {
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		try {
			this.data = JSON.parse(readFileSync(path, "utf8"));
			if (this.data.schemaVersion !== 2)
				throw new EchoError("LEGACY_KEYSTORE_REISSUE_REQUIRED");
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
			this.data = {
				schemaVersion: 2,
				salt: randomBytes(32).toString("hex"),
				items: [],
			};
		}
		this.encryptionKey = pbkdf2Sync(
			passphrase,
			Buffer.from(this.data.salt, "hex"),
			310000,
			32,
			"sha256",
		);
	}
	private flush() {
		writeFileSync(this.path, JSON.stringify(this.data, null, 2), {
			mode: 0o600,
		});
		chmodSync(this.path, 0o600);
	}
	create(id: string) {
		if (this.data.items.some((i) => i.id === id))
			throw new EchoError("SIGNER_EXISTS");
		const key = generatePrivateKey();
		const account = privateKeyToAccount(key);
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv, { authTagLength: 16 });
		const encrypted = Buffer.concat([
			cipher.update(key, "utf8"),
			cipher.final(),
		]);
		this.data.items.push({
			id,
			address: account.address,
			encrypted: encrypted.toString("base64"),
			iv: iv.toString("base64"),
			tag: cipher.getAuthTag().toString("base64"),
		});
		this.flush();
		return { id, address: account.address };
	}
	signer(id: string): Pick<LocalAccount, "address" | "signTypedData"> {
		const item = this.data.items.find((i) => i.id === id);
		if (!item) throw new EchoError("SIGNER_MISSING");
		return {
			address: item.address as `0x${string}`,
			signTypedData: async (data) => {
				const tag = Buffer.from(item.tag, "base64");
				if (tag.length !== 16) throw new EchoError("KEYSTORE_AUTH_TAG_LENGTH");
				const decipher = createDecipheriv(
					"aes-256-gcm",
					this.encryptionKey,
					Buffer.from(item.iv, "base64"),
					{ authTagLength: 16 },
				);
				decipher.setAuthTag(tag);
				const raw = Buffer.concat([
					decipher.update(Buffer.from(item.encrypted, "base64")),
					decipher.final(),
				]).toString("utf8") as Hex;
				const account = privateKeyToAccount(raw);
				if (account.address !== item.address)
					throw new EchoError("KEYSTORE_ADDRESS_MISMATCH");
				return account.signTypedData(data);
			},
		};
	}
	close() {
		this.encryptionKey.fill(0);
	}
}
