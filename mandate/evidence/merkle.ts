import {randomBytes} from "node:crypto";
import {z} from "zod";
import {encodeAbiParameters,keccak256,toHex,type Hex} from "viem";
import {canonicalJson,MandateError} from "../sdk/model.js";
export const HashSchema=z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(v=>v.toLowerCase() as Hex);
const nameSchema=z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/);
const leafDomain=keccak256(toHex("MandateEvidenceLeaf/v2")),nodeDomain=keccak256(toHex("MandateEvidenceNode/v2")),paddingDomain=keccak256(toHex("MandateEvidencePadding/v2"));
export const DisclosureSchema=z.object({schemaVersion:z.literal(2),name:nameSchema,value:z.unknown(),salt:HashSchema,index:z.number().int().min(0).max(255),leafCount:z.number().int().min(1).max(256),siblings:z.array(HashSchema).max(8)}).strict();
export type Disclosure=z.infer<typeof DisclosureSchema>;
export type PrivateLeaf={name:string;value:unknown;salt:Hex;index:number};
function encodedValue(value:unknown){
  let nodes=0;
  const check=(v:unknown,depth:number)=>{
    if(++nodes>10000||depth>32)throw new MandateError("EVIDENCE_JSON_LIMIT");
    if(v===null||typeof v==="string"||typeof v==="boolean"||(typeof v==="number"&&Number.isFinite(v)))return;
    if(Array.isArray(v)){for(let i=0;i<v.length;i++)check(v[i],depth+1);return;}
    if(typeof v==="object"&&v&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)){
      for(const key of Object.keys(v)){const descriptor=Object.getOwnPropertyDescriptor(v,key)!;if(!("value" in descriptor))throw new MandateError("EVIDENCE_NON_JSON_VALUE");check(descriptor.value,depth+1);}return;
    }
    throw new MandateError("EVIDENCE_NON_JSON_VALUE");
  };
  check(value,0);const encoded=canonicalJson(value);if(Buffer.byteLength(encoded)>65536)throw new MandateError("EVIDENCE_LEAF_TOO_LARGE");return encoded;
}
function leafHash(leaf:PrivateLeaf){
  nameSchema.parse(leaf.name);HashSchema.parse(leaf.salt);
  if(!Number.isSafeInteger(leaf.index)||leaf.index<0||leaf.index>255)throw new MandateError("EVIDENCE_INDEX_INVALID");
  return keccak256(encodeAbiParameters([{type:"bytes32"},{type:"uint256"},{type:"string"},{type:"bytes32"},{type:"bytes32"}],[leafDomain,BigInt(leaf.index),leaf.name,keccak256(toHex(encodedValue(leaf.value))),leaf.salt]));
}
function nodeHash(left:Hex,right:Hex){return keccak256(encodeAbiParameters([{type:"bytes32"},{type:"bytes32"},{type:"bytes32"}],[nodeDomain,left,right]));}
function paddingHash(index:number,leafCount:number){return keccak256(encodeAbiParameters([{type:"bytes32"},{type:"uint256"},{type:"uint256"}],[paddingDomain,BigInt(index),BigInt(leafCount)]));}
function tree(leaves:PrivateLeaf[]){
  if(leaves.length<1||leaves.length>256)throw new MandateError("EVIDENCE_LEAF_COUNT_INVALID");
  if(new Set(leaves.map(l=>l.name)).size!==leaves.length)throw new MandateError("EVIDENCE_FIELD_DUPLICATE");
  if(leaves.some((l,i)=>l.index!==i || (i>0&&leaves[i-1].name>=l.name)))throw new MandateError("EVIDENCE_FIELD_ORDER_INVALID");
  if(leaves.reduce((n,l)=>n+Buffer.byteLength(encodedValue(l.value)),0)>1048576)throw new MandateError("EVIDENCE_TREE_TOO_LARGE");
  const size=2**Math.ceil(Math.log2(leaves.length)),bottom=leaves.map(leafHash);
  while(bottom.length<size)bottom.push(paddingHash(bottom.length,leaves.length));
  const levels=[bottom];
  while(levels.at(-1)!.length>1){const previous=levels.at(-1)!,next:Hex[]=[];for(let i=0;i<previous.length;i+=2)next.push(nodeHash(previous[i],previous[i+1]));levels.push(next);}
  return {levels,root:levels.at(-1)![0]};
}
export function commitFields(fields:Record<string,unknown>){
  const leaves=Object.keys(fields).sort().map((name,index)=>({name,index,value:fields[name],salt:toHex(randomBytes(32))}));
  return {schemaVersion:2 as const,leaves,root:tree(leaves).root};
}
export function disclose(leaves:PrivateLeaf[],names:string[]):Disclosure[]{
  const {levels}=tree(leaves);
  if(new Set(names).size!==names.length)throw new MandateError("EVIDENCE_DISCLOSURE_DUPLICATE");
  return names.map(name=>{
    const leaf=leaves.find(l=>l.name===name);if(!leaf)throw new MandateError("EVIDENCE_FIELD_MISSING");
    const siblings:Hex[]=[];let index=leaf.index;
    for(let depth=0;depth<levels.length-1;depth++){siblings.push(levels[depth][index^1]);index=Math.floor(index/2);}
    return {schemaVersion:2,name:leaf.name,value:leaf.value,salt:leaf.salt,index:leaf.index,leafCount:leaves.length,siblings};
  });
}
export function verifyDisclosure(root:Hex,input:unknown,expectedLeafCount:number){
  HashSchema.parse(root);const p=DisclosureSchema.parse(input);
  if(!Object.hasOwn(p,"value"))throw new MandateError("EVIDENCE_FIELD_MISSING");
  if(!Number.isSafeInteger(expectedLeafCount)||expectedLeafCount<1||expectedLeafCount>256||p.index>=p.leafCount || p.siblings.length!==Math.ceil(Math.log2(p.leafCount)) || p.leafCount!==expectedLeafCount)throw new MandateError("EVIDENCE_PATH_INVALID");
  let hash=leafHash({name:p.name,value:p.value,index:p.index,salt:p.salt}),index=p.index;
  for(const sibling of p.siblings){hash=index%2===0?nodeHash(hash,sibling):nodeHash(sibling,hash);index=Math.floor(index/2);}
  if(hash.toLowerCase()!==root.toLowerCase())throw new MandateError("EVIDENCE_ROOT_MISMATCH");
  return p;
}
export function verifyDisclosures(root:Hex,inputs:unknown[],leafCount:number){
  if(inputs.length>leafCount)throw new MandateError("EVIDENCE_DISCLOSURE_COUNT_INVALID");
  const proofs=inputs.map(p=>verifyDisclosure(root,p,leafCount));
  if(new Set(proofs.map(p=>p.index)).size!==proofs.length || new Set(proofs.map(p=>p.name)).size!==proofs.length)throw new MandateError("EVIDENCE_DISCLOSURE_DUPLICATE");
  return Object.fromEntries(proofs.map(p=>[p.name,p.value]));
}
