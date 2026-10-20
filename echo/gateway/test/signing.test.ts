import {it,expect} from "vitest";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {recoverTypedDataAddress} from "viem";
import {SignerStore} from "../src/signing.js";
it("retains full GCM tag signing and rejects truncated authentication tags",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"echo-gcm-test-")),path=join(directory,"keys.json"),passphrase="local-test-only";
  const original=new SignerStore(path,passphrase),created=original.create("test"),stored=JSON.parse(readFileSync(path,"utf8"));original.close();
  const typed={domain:{name:"Echo test",chainId:31337},types:{Probe:[{name:"value",type:"uint256"}]},primaryType:"Probe" as const,message:{value:1n}};
  for(const length of [16,12,8,4]){
    const modified=structuredClone(stored);modified.items[0].tag=Buffer.from(stored.items[0].tag,"base64").subarray(0,length).toString("base64");
    const changed=join(directory,`${length}.json`);writeFileSync(changed,JSON.stringify(modified),{mode:0o600});const store=new SignerStore(changed,passphrase);
    try{
      if(length===16){const signature=await store.signer("test").signTypedData(typed);expect(await recoverTypedDataAddress({...typed,signature})).toBe(created.address);}
      else await expect(store.signer("test").signTypedData(typed)).rejects.toThrow("KEYSTORE_AUTH_TAG_LENGTH");
    }finally{store.close();}
  }
});
