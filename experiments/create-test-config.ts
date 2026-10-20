import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

process.umask(0o077);
mkdirSync('.runtime/keys', { recursive: true, mode: 0o700 });
const addresses: Record<string, string> = {};
for (const role of ['owner', 'session', 'operator', 'merchant']) {
  const path = `.runtime/keys/${role}.json`;
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify({ privateKey: generatePrivateKey() }), { mode: 0o600, flag: 'wx' });
  }
  addresses[role] = privateKeyToAccount(JSON.parse(readFileSync(path, 'utf8')).privateKey).address;
}
const publicConfig = { chainId: 84532, rpcUrl: 'https://sepolia.base.org', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', addresses };
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/test-accounts.json', JSON.stringify(publicConfig, null, 2) + '\n');
console.log(JSON.stringify(publicConfig, null, 2));
