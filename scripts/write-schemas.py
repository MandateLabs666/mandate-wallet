#!/usr/bin/env python3
"""Reproducible JSON Schema artifact; cross-field invariants live in the shared validator."""
import json,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
address={'type':'string','pattern':'^0x[0-9a-fA-F]{40}$'}
digest={'type':'string','pattern':'^0x[0-9a-fA-F]{64}$'}
uint={'type':'string','pattern':'^(0|[1-9][0-9]*)$','maxLength':78}
integer={'type':'integer','minimum':1,'maximum':9007199254740991}
def obj(fields):
    fields={'schemaVersion':{'const':1},**fields}
    return {'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}
defs={
 'PolicySpec':obj(dict(mandateId=digest,owner=address,wallet=address,chainId=integer,sessionSigner=address,asset=address,payTo=address,budget=uint,maxPerPayment=uint,expiresAt=integer,stepIds={'type':'array','items':digest,'minItems':1,'maxItems':16,'uniqueItems':True})),
 'ActionProof':obj(dict(mandateId=digest,stepId=digest,wallet=address,chainId=integer,nonce=digest,paymentDigest=digest,requestHash=digest,quoteHash=digest,registrationSignature={'type':'string','pattern':'^0x[0-9a-fA-F]{130}$'},evidenceSource={'const':'local'})),
 'PaymentCommitment':obj(dict(mandateId=digest,stepId=digest,wallet=address,chainId=integer,asset=address,payTo=address,amount=uint,validAfter=uint,validBefore=uint,nonce=digest,paymentDigest=digest,registrationTx=digest)),
 'SessionAttestation':obj(dict(sessionId=digest,mandateId=digest,scope={'type':'array','items':{'type':'string'},'minItems':1},checkpointRoot=digest,previousRoot={'anyOf':[digest,{'type':'null'}]},source={'enum':['local','merchant_signed','independent_witness']},disclosure={'enum':['public_fixture','selective']},witness={'anyOf':[address,{'type':'null'}]},implemented={'const':False})),
 'ContainmentDecisionLog':obj(dict(mandateId=digest,stepId=digest,decision={'enum':['allow','reject','pending']},code={'type':'string','minLength':1},evidenceRefs={'type':'array','items':{'type':'string'}},timestamp=integer,source={'const':'local'})),
}
(root/'schemas').mkdir(exist_ok=True)
(root/'schemas/m1.schema.json').write_text(json.dumps({'$schema':'http://json-schema.org/draft-07/schema#','title':'Mandate M1 version 1 objects','description':'Validate JSON Schema first, then shared cross-field uint256 and policy invariants. SessionAttestation is specification only.','$defs':defs},indent=2)+'\n')
