import {it,expect} from "vitest";
import {execFile} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
const marker="CREDENTIAL_PARSE_CANARY";
function run(args:string[]){return new Promise<{stdout:string;stderr:string;exitCode:number}>((resolve)=>{
  execFile(process.execPath,["--import","tsx",...args],{env:{PATH:process.env.PATH},timeout:8000},(error,stdout,stderr)=>resolve({stdout,stderr,exitCode:error?Number(error.code??1):0}));
});}
for(const entry of ["web","sdk","gateway","monitor"] as const)it(entry+" startup rejects malformed private JSON without leaking its contents or parser stack",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"mandate-log-canary-")),bad=join(dir,"private.json"),missing=join(dir,"missing.json");
  try{
    writeFileSync(bad,'{"connectionToken":"'+marker+'",broken}',{mode:0o600});
    const commands={web:["mandate/web/cli.ts","--config",missing,"--credential-file",bad],sdk:["mandate/sdk/cli.ts","context","--config",missing,"--credential-file",bad],gateway:["mandate/gateway/cli.ts","--config",bad],monitor:["mandate/operations/cli.ts",bad,join(dir,"result.json")]};
    const result=await run(commands[entry]);expect(result.exitCode).toBe(1);expect(result.stdout+result.stderr).not.toContain(marker);expect(result.stderr).not.toContain("SyntaxError");
    const expected={web:"WEB_START_REJECTED",sdk:"SDK_COMMAND_REJECTED",gateway:"GATEWAY_START_REJECTED",monitor:"MONITOR_START_REJECTED"};expect(result.stderr).toContain(JSON.stringify({code:expected[entry]}));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
