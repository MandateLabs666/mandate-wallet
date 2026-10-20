// Local, no-chain reproducer for an independently reported AES-GCM tag policy.
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {randomBytes,createHash} from "node:crypto";
import {recoverTypedDataAddress} from "viem";
import {SignerStore} from "../gateway/src/signing.js";
process.umask(0o077);
const phase=process.argv[2];if(!phase||!/^[a-z0-9-]+$/.test(phase))throw Error("PROBE_PHASE_REQUIRED");
const output=resolve("artifacts/m7/security",`keystore-${phase}.json`);
if(existsSync(output))throw Error("PROBE_OUTPUT_EXISTS");
const directory=mkdtempSync(join(tmpdir(),"echo-gcm-review-")),path=join(directory,"original.json"),password=randomBytes(32).toString("hex"),original=new SignerStore(path,password);
const signer=original.create("review"),stored=JSON.parse(readFileSync(path,"utf8"));original.close();
const typed={domain:{name:"Echo local keystore review",version:"1",chainId:31337},types:{Probe:[{name:"value",type:"uint256"}]},primaryType:"Probe" as const,message:{value:1n}};
const results=[];
for(const tagBytes of [16,12,8,4]){
  const data=structuredClone(stored);data.items[0].tag=Buffer.from(stored.items[0].tag,"base64").subarray(0,tagBytes).toString("base64");
  const changed=join(directory,`tag-${tagBytes}.json`);writeFileSync(changed,JSON.stringify(data),{mode:0o600});const store=new SignerStore(changed,password);
  try{const signature=await store.signer("review").signTypedData(typed);const recovered=await recoverTypedDataAddress({...typed,signature});results.push({tagBytes,signed:true,signatureValidForOriginalSigner:recovered.toLowerCase()===signer.address.toLowerCase()});}
  catch(error){results.push({tagBytes,signed:false,code:(error as Error).message.match(/^[A-Z_]+$/)?.[0]??"CRYPTOGRAPHIC_REJECTION"});}
  finally{store.close();}
}
mkdirSync(join(output,".."),{recursive:true});writeFileSync(output,JSON.stringify({schemaVersion:1,phase,environment:"local encrypted test keystore; no chain",sourceSHA256:createHash("sha256").update(readFileSync("echo/gateway/src/signing.ts")).digest("hex"),expectedTagBytes:16,results,signaturesOrKeysExported:false,newPublicTransactions:0},null,2)+"\n");
console.log(JSON.stringify({phase,results,signaturesOrKeysExported:false}));
