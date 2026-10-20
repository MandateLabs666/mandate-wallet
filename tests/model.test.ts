import { describe,it,expect } from 'vitest';
import { PolicySpec,hashJson,nonceFor,stepId } from '../packages/core/model.js';
import { Ajv } from 'ajv';
import { readFileSync } from 'node:fs';
import { validateQuote } from '../packages/core/client.js';
import type { PaymentRequired,PaymentRequirements } from '@x402/core/types';

const a='0x'+'a'.repeat(40);const id=stepId('task');
const policy={schemaVersion:1,mandateId:id,owner:a,wallet:a,chainId:84532,sessionSigner:a,asset:a,payTo:a,budget:'150000',maxPerPayment:'100000',expiresAt:2000000000,stepIds:[stepId('eth-stats')]};
describe('versioned policy and deterministic context',()=>{
  it('rejects float, leading zeros, overflow and budget inconsistencies',()=>{
    for(const budget of ['0.15','0150000',(2n**256n).toString(),'0','99999'])expect(PolicySpec.safeParse({...policy,budget}).success).toBe(false);
  });
  it('rejects unexpected fields, versions and duplicate steps',()=>{
    expect(PolicySpec.safeParse({...policy,arbitraryTransfer:true}).success).toBe(false);
    expect(PolicySpec.safeParse({...policy,schemaVersion:2}).success).toBe(false);
    expect(PolicySpec.safeParse({...policy,stepIds:[policy.stepIds[0],policy.stepIds[0]]}).success).toBe(false);
  });
  it('binds nonce to wallet, chain, mandate and approved step',()=>{
    const base=nonceFor(84532,a as `0x${string}`,id,policy.stepIds[0]);
    expect(base).not.toBe(nonceFor(8453,a as `0x${string}`,id,policy.stepIds[0]));
    expect(base).not.toBe(nonceFor(84532,('0x'+'b'.repeat(40)) as `0x${string}`,id,policy.stepIds[0]));
    expect(base).not.toBe(nonceFor(84532,a as `0x${string}`,id,stepId('btc-stats')));
    expect(hashJson({b:2,a:1})).toBe(hashJson({a:1,b:2}));
  });
  it('publishes all five strict object schemas',()=>{
    const schema=JSON.parse(readFileSync('schemas/m1.schema.json','utf8'));const ajv=new Ajv({strict:false});ajv.addSchema({...schema,$id:'m1'});
    expect(Object.keys(schema.$defs)).toHaveLength(5);
    const validate=ajv.compile({$ref:'m1#/$defs/PolicySpec'});expect(validate(policy)).toBe(true);expect(validate({...policy,extra:'x'})).toBe(false);
  });
  it('rejects unsupported payment routes, price increases and changed recipients before signing',()=>{
    const p=PolicySpec.parse(policy);const url='https://merchant.example/stats';
    const r:PaymentRequired={x402Version:2,resource:{url},accepts:[{scheme:'exact',network:'eip155:84532',asset:p.asset,payTo:p.payTo,amount:'100000',maxTimeoutSeconds:300,extra:{name:'USDC',version:'2'}}]};
    expect(validateQuote(r,p,url).amount).toBe('100000');
    const changes:Partial<PaymentRequirements>[]=[{scheme:'upto'},{network:'eip155:8453'},{amount:'100001'},{payTo:'0x'+'b'.repeat(40)},{extra:{name:'USDC',version:'2',assetTransferMethod:'permit2'}}];
    for(const change of changes)expect(()=>validateQuote({...r,accepts:[{...r.accepts[0],...change}]},p,url)).toThrow('QUOTE_UNSUPPORTED');
    expect(()=>validateQuote({...r,x402Version:1},p,url)).toThrow('RESOURCE_OR_VERSION_MISMATCH');
  });
});
