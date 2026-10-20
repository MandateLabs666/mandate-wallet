import {readFileSync,writeFileSync,lstatSync,renameSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {randomUUID} from "node:crypto";
import {MonitorConfigSchema,MonitorState,runMonitor} from "./monitor.js";
process.umask(0o077);
async function main(){
  const [configPath,outputPath,...extra]=process.argv.slice(2);
  if(!configPath||!outputPath||extra.length)throw Error("MONITOR_USAGE");
  const stat=lstatSync(configPath);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>65536||process.getuid&&stat.uid!==process.getuid())throw Error("MONITOR_CONFIG_REJECTED");
  const config=MonitorConfigSchema.parse(JSON.parse(readFileSync(configPath,"utf8")));
  if([configPath,config.purchaseDatabase,config.evidenceDatabase,config.stateDatabase].filter(Boolean).some(p=>resolve(p!)===resolve(outputPath)))throw Error("MONITOR_OUTPUT_CONFLICT");
  try{if(lstatSync(outputPath).isSymbolicLink())throw Error("MONITOR_OUTPUT_CONFLICT");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
  const state=new MonitorState(config.stateDatabase);
  try{
    const report=await runMonitor(config,state);mkdirSync(dirname(resolve(outputPath)),{recursive:true,mode:0o700});
    const temporary=resolve(outputPath)+".tmp-"+randomUUID();writeFileSync(temporary,JSON.stringify(report,null,2)+"\n",{mode:0o600,flag:"wx"});renameSync(temporary,outputPath);
    console.log(JSON.stringify({activeAlerts:report.active.length,critical:report.active.filter(a=>a.severity==="critical").length,incompleteSources:report.coverage.filter(c=>!c.complete).length,transactionsSubmitted:0}));
    if(report.active.some(a=>a.severity==="critical")||report.coverage.some(c=>!c.complete))process.exitCode=2;
  }finally{state.close();}
}
await main().catch(()=>{process.stderr.write(JSON.stringify({code:"MONITOR_START_REJECTED"})+"\n");process.exitCode=1;});
