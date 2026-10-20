/** Explorer targets are selected from trusted chain IDs, never from service metadata. */
export function transactionExplorerURL(chainId:unknown,hash:unknown):string|undefined{
 if(typeof hash!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(hash))return;
 const origin=chainId===84532?"https://sepolia.basescan.org":chainId===11155111?"https://sepolia.etherscan.io":undefined;
 return origin?`${origin}/tx/${hash}`:undefined;
}
