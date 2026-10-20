const artifactDirectory=process.env.MANDATE_M5_ARTIFACT_DIR??"artifacts/m5";
import {it,expect} from "vitest";
import {mkdirSync,writeFileSync} from "node:fs";
import {commitFields,disclose,verifyDisclosure,verifyDisclosures} from "../merkle.js";
it("salted selective disclosure verifies every tree size and exposes only selected fields",()=>{
  for(const count of [1,2,3,4,5,7,8,9,31,32,33,255,256]){
    const fields=Object.fromEntries(Array.from({length:count},(_,i)=>["field"+String(i).padStart(3,"0"),{value:i,privateNote:"not disclosed unless selected"}]));
    const tree=commitFields(fields),proofs=disclose(tree.leaves,Object.keys(fields));
    expect(verifyDisclosures(tree.root,proofs,count)).toEqual(fields);
    const one=disclose(tree.leaves,["field000"]);expect(Object.keys(verifyDisclosures(tree.root,one,count))).toEqual(["field000"]);expect(one).toHaveLength(1);
    expect(commitFields(fields).root).not.toBe(tree.root);
  }
});
it("rejects duplicate indices/names, invalid JSON, oversized leaves, trees and unknown fields",()=>{
  const t=commitFields({alpha:1,beta:2}),p=disclose(t.leaves,["alpha"])[0];
  const upper=(h:string)=>("0x"+h.slice(2).toUpperCase()) as `0x${string}`;
  expect(verifyDisclosure(upper(t.root),{...p,salt:upper(p.salt),siblings:p.siblings.map(upper)},2).value).toBe(1);
  expect(()=>verifyDisclosures(t.root,[p,p],2)).toThrow("DUPLICATE");
  expect(()=>disclose(t.leaves,["alpha","alpha"])).toThrow("DUPLICATE");
  expect(()=>verifyDisclosure(t.root,{...p,extra:true},2)).toThrow();
  expect(()=>commitFields({alpha:undefined})).toThrow("NON_JSON");expect(()=>commitFields({alpha:NaN})).toThrow("NON_JSON");
  expect(()=>commitFields({alpha:"x".repeat(65537)})).toThrow("TOO_LARGE");
  expect(()=>commitFields(Object.fromEntries(Array.from({length:257},(_,i)=>["f"+i,i])))).toThrow("COUNT_INVALID");
  expect(()=>commitFields(Object.fromEntries(Array.from({length:32},(_,i)=>["f"+i,"x".repeat(40000)])))).toThrow("TREE_TOO_LARGE");
  let deep:unknown=0;for(let i=0;i<34;i++)deep={nested:deep};expect(()=>commitFields({alpha:deep})).toThrow("JSON_LIMIT");
});
it("rejects 10000 generated invalid proofs with fixed seed and explicit mutation rules",()=>{
  const t=commitFields({alpha:"public",beta:"private",gamma:3,omega:true}),proofs=disclose(t.leaves,t.leaves.map(l=>l.name));
  let seed=0x04022029;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  const rules=["different-value","different-salt","different-index","different-name","different-sibling","wrong-path-length","wrong-leaf-count","unknown-schema-field"],counts=Object.fromEntries(rules.map(r=>[r,0]));
  for(let i=0;i<10000;i++){
    const p=JSON.parse(JSON.stringify(proofs[random()%proofs.length])),rule=random()%rules.length;
    if(rule===0)p.value={altered:i};if(rule===1)p.salt="0x"+"00".repeat(32);if(rule===2)p.index=(p.index+1)%4;if(rule===3)p.name="tampered"+i;
    if(rule===4)p.siblings[0]="0x"+"00".repeat(32);if(rule===5)p.siblings.pop();if(rule===6)p.leafCount=3;if(rule===7)p.acceptIndex=0;
    expect(()=>verifyDisclosure(t.root,p,4)).toThrow();counts[rules[rule]]++;
  }
  mkdirSync(artifactDirectory,{recursive:true});writeFileSync(artifactDirectory+"/invalid-merkle-proofs.json",JSON.stringify({seed:"0x04022029",generator:"xorshift32; choose existing disclosure and one of eight mutations",samples:10000,rejected:10000,rules:counts},null,2)+"\n");
});
it("records the privacy cost without describing hidden fields as checked",()=>{
  const t=commitFields({request:{method:"POST",url:"https://example.org/stats",body:{privateAccount:"fixture-only-private"}},quote:{amount:"10000",network:"eip155:84532"},response:{privatePayload:"x".repeat(512)},result:{valid:true}});
  const minimal=disclose(t.leaves,["quote","result"]),full=disclose(t.leaves,t.leaves.map(l=>l.name));
  expect(JSON.stringify(minimal)).not.toContain("fixture-only-private");expect(Object.keys(verifyDisclosures(t.root,minimal,4))).toEqual(["quote","result"]);
  const report={scope:"synthetic four-field fixture",minimalBytes:Buffer.byteLength(JSON.stringify(minimal)),fullBytes:Buffer.byteLength(JSON.stringify(full)),minimalFields:["quote","result"],hiddenFieldsNotVerified:["request","response"],saltsBytesPerLeaf:32,guarantee:"commitment consistency only"};
  expect(report.minimalBytes).toBeLessThan(report.fullBytes);mkdirSync(artifactDirectory,{recursive:true});writeFileSync(artifactDirectory+"/disclosure-size.json",JSON.stringify(report,null,2)+"\n");
});
