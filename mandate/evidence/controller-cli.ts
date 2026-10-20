import {readFileSync,statSync} from "node:fs";
import {privateKeyToAccount} from "viem/accounts";
import type {Hex} from "viem";
import {SessionController} from "./controller.js";
import {serveController} from "./controller-http.js";
import {EnvelopeSchema} from "./controller-model.js";
import {VerifierTrustSchema} from "./bundle.js";
import {MandateError} from "../sdk/model.js";
process.umask(0o077);
if(process.argv.length!==4||process.argv[2]!=="--config")throw new Error("USAGE: --config private-controller.json");
const config=JSON.parse(readFileSync(process.argv[3],"utf8")),trust=VerifierTrustSchema.parse(config.trust),envelope=EnvelopeSchema.parse(config.envelope),scope=envelope.payload.scope;
if(scope.chainId!==trust.chainId||scope.wallet.toLowerCase()!==trust.wallet.toLowerCase()||scope.mandateId!==trust.mandateId||scope.sessionId!==trust.sessionId||scope.signer.toLowerCase()!==trust.sessionSigner.toLowerCase())throw new MandateError("CONTROLLER_TRUST_SCOPE_MISMATCH");
if((statSync(config.controllerKeyFile).mode&0o077)!==0)throw new MandateError("CONTROLLER_KEY_PERMISSIONS");
const signer=privateKeyToAccount(JSON.parse(readFileSync(config.controllerKeyFile,"utf8")).privateKey as Hex);
// Deliberately synthetic model adapter for reproducible query-budget experiments.
let counter=0;const controller=await SessionController.create(config.storeFile,envelope,signer,async()=>({source:"synthetic-controlled-query-adapter",draw:++counter%7}),{owner:trust.owner,scope});
const service=await serveController(controller,config.port??43404);console.log(JSON.stringify({origin:service.origin,controller:signer.address,mode:envelope.payload.mode,ownerKeyLoaded:false,sessionKeyLoaded:false}));
let closing=false;const close=async()=>{if(closing)return;closing=true;await service.close();controller.close();};process.once("SIGINT",()=>{void close();});process.once("SIGTERM",()=>{void close();});
