import {createRequire} from "node:module";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
const fromTsx=createRequire(import.meta.resolve("tsx")),esbuild=fromTsx("esbuild");
if(fromTsx("esbuild/package.json").version!=="0.27.7")throw new Error("PINNED_VERIFIER_BUILDER_MISMATCH");
await esbuild.build({entryPoints:["mandate/evidence/cli.ts"],outfile:"dist/mandate-evidence-verifier.js",bundle:true,platform:"node",format:"esm",target:"node24",packages:"external"});
const reportDirectory=process.env.MANDATE_BUILD_REPORT_DIR??"artifacts/m5/build";mkdirSync(reportDirectory,{recursive:true});
const report={observedAt:new Date().toISOString(),entry:"mandate/evidence/cli.ts",output:"dist/mandate-evidence-verifier.js",builder:"esbuild",builderVersion:"0.27.7",sha256:createHash("sha256").update(readFileSync("dist/mandate-evidence-verifier.js")).digest("hex"),privateRuntimeDependency:false};
writeFileSync(reportDirectory+"/verifier.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
