import {readFileSync,writeFileSync} from "node:fs";
import {verifyEvidence} from "./verifier.js";
const args=process.argv.slice(2);
if(args.length!==6||args[0]!=="--bundle"||args[2]!=="--trust"||args[4]!=="--output")throw new Error("USAGE: --bundle public.json --trust trusted-config.json --output report.json");
const read=(path:string)=>{const bytes=readFileSync(path);if(bytes.length>8*1024*1024)throw new Error("EVIDENCE_INPUT_TOO_LARGE");return JSON.parse(bytes.toString("utf8"));};
const report=await verifyEvidence(read(args[1]),read(args[3]));writeFileSync(args[5],JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({requiredChecksPassed:report.requiredChecksPassed,overall:report.overall,checks:report.checks.map(c=>({name:c.name,status:c.status,code:c.code}))}));process.exitCode=report.requiredChecksPassed?0:2;
