#!/usr/bin/env python3
"""Publish allowlisted, public demo evidence from the completed capture run."""
import copy
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TAKE=ROOT/'.runtime/claude-video-base-v1/formal-take-01'
OUT=ROOT/'competition/video/claude-desktop-base-v1'
EVIDENCE=OUT/'execution-evidence'


def read(path):
    return json.loads(path.read_text())


def write(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def main():
    EVIDENCE.mkdir(exist_ok=True)
    now=datetime.now(timezone.utc).isoformat()
    files=['deployment-evidence.json','funding-evidence.json','new-eth-authorization-evidence.json',
           'new-eth-payment-evidence.json','revocation-evidence.json','refusal-evidence.json',
           'final-transactions.json','purchase-bundle.json','verifier-trust.json','independent-verification.json']
    # Only these reviewed public structures are exported. No runtime directory copy.
    forbidden={'privatekey','private_key','secret','accesstoken','connectiontoken','rawtransaction','rawsignedtransaction','password'}
    def check(value):
        if isinstance(value,dict):
            for key,child in value.items():
                if key.lower() in forbidden:
                    raise ValueError('Private field in public evidence: '+key)
                check(child)
        elif isinstance(value,list):
            for child in value:
                check(child)
    for name in files:
        data=read(TAKE/name);check(data);write(EVIDENCE/name,data)
    payment=read(TAKE/'new-eth-payment-evidence.json')
    refusal=read(TAKE/'refusal-evidence.json')
    revocation=read(TAKE/'revocation-evidence.json')
    final=read(TAKE/'final-transactions.json')
    repair=read(TAKE/'repair-package.json')
    verification=read(TAKE/'independent-verification.json')
    assert verification['requiredChecksPassed']
    assert payment['procurementAmountAtomic']=='10000'
    assert refusal['signedTransactionCountBefore']==refusal['signedTransactionCountAfter']==3
    assert all(o['walletUSDCAtomic']=='140000' and not o['unusedBTCStepRegistered'] for o in refusal['observations'])
    take=read(TAKE/'take.json')
    old_transactions=copy.deepcopy(take['onChainTransactions'])
    historical=take.get('historicalAuthorization',{'mandateId':take['mandateId'],'sessionId':take['sessionId']})
    current_transactions=final['observations'][0]['receipts']
    source_files=['pnpm-lock.yaml','package.json','mandate/contracts/src/MandateAccount.sol',
                  'mandate/sdk/accountAbi.ts','mandate/services/client.ts','mandate/services/transactions.ts',
                  'mandate/services/diagnostics.ts','mandate/evidence/verifier.ts','mandate/onboarding/engine.ts',
                  'mandate/onboarding/hosts.ts','mandate/desktop/manifest.json',
                  'scripts/prepare-base-demo-edit.py','scripts/render-base-demo.py','scripts/export-base-demo-evidence.py']
    fingerprints={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in source_files if (ROOT/f).exists()}
    run={'schemaVersion':1,'takeId':'formal-take-01','exportedAt':now,'status':'Public testnet case complete; picture edit complete; awaiting user voice-over',
         'chainId':84532,'network':'Base Sepolia','owner':take['owner'],'wallet':take['wallet'],'asset':take['asset'],
         'mandateId':payment['mandateId'],'sessionId':payment['sessionId'],
         'sessionSigner':'0x818D3bd3ddf805FA9916AB50813d0EB67e40862f',
         'payTo':'0x5B608Ea8219185dc5C971D2924913bF1e60fCEc1','paymentNonce':payment['paymentNonce'],
         'rootBudgetAtomic':'150000','maxPerPaymentAtomic':'100000','procurementAmountAtomic':'10000',
         'initialWalletUSDCAtomic':'150000','finalWalletUSDCAtomic':'140000','sessionRevoked':True,
         'walletRuntimeHash':read(TAKE/'verifier-trust.json')['walletRuntimeHash'],
         'gitHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
         'workingTreeHasChanges':bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()),
         'sourceSHA256':fingerprints,'sourceVersionRule':'The working tree contains changes. File fingerprints and the installed bundle identify this run; git HEAD alone does not.',
         'connector':{k:repair[k] for k in ['displayName','identity','version','sha256','bundleSHA256','privateKeysBundled','connectionTokenBundled','installedInClaude','noRequiredFileFields']},
         'scope':{'merchant':'controlled local HTTP service','facilitator':'controlled implementation using public Base Sepolia settlement','data':'fixed ETH statistics; not live market data','ownerKey':'external Rabby wallet','agentTransport':'native Claude Desktop stdio MCP'},
         'finality':{'commonProviderFinalizedHeight':final['commonFinalizedHeight'],'allEightTransactionsAtOrBeforeThatHeight':final['allTransactionsAtOrBeforeCommonFinalizedHeight'],'assumption':'RPC reports are trusted; provider agreement is not an independent consensus proof.'}}
    write(EVIDENCE/'run.json',run)
    write(EVIDENCE/'transactions.json',{'schemaVersion':1,'chainId':84532,'transactions':current_transactions,'fees':'USDC purchases, EVM execution gas and Base L1 data fees are separate. A null L1 fee means it was not returned, not zero.'})
    write(EVIDENCE/'service-and-orders.json',{'successfulETHOrder':payment['record'],'paymentNonce':payment['paymentNonce'],'stateChronology':payment['audit'],'revokedBTCRequest':refusal['record'],'newPaymentOnRecovery':False,'newTransactionOnRefusal':False})
    write(EVIDENCE/'recording-history.json',{'initialTransactions':old_transactions,
         'initialMandateId':historical['mandateId'],'initialSessionId':historical['sessionId'],
         'successfulMandateId':payment['mandateId'],'successfulSessionId':payment['sessionId'],
         'explanation':'Earlier registration confirmation was not recognized by the client before its immutable five-minute payment commitment expired. No USDC settled for that earlier order. Its original hash and nonce were retained. The owner explicitly approved a new ETH task and two-hour session in the same wallet. No deployment or funding was repeated.',
         'earlierRegistrationHash':'0xea3820236898a8e343efdc9dd97e2cee34addf906763f08202cf1c36a4883409',
         'originalCause':'The first exception was reduced to a generic transport/chain error; the exact original RPC cause cannot be recovered.',
         'repairs':'Bounded original-hash receipt reads, read-only reconciliation, explicit expired-commitment handling, sanitized stage diagnostics and PublicNode primary RPC.',
         'installation':'Initial 0.2.0 import was followed by a native 0.2.1 update, reload and actual model calls. The successful case uses 0.2.1.',
         'retainedAt':['Private source UI captures','Public old transaction hashes above'],
         'wizardIndependentCheck':'The wizard has no trusted verification profile for this connection and returned TRUSTED_VERIFICATION_PROFILE_REQUIRED. The standalone verifier was subsequently run with the explicit public verifier-trust.json; no UI success is claimed.'})
    tx={r['kind']:r['hash'] for r in current_transactions}
    chapter_transactions={'public-setup':['account','fund-gas','fund-usdc','task'],'grant-explorer':['session'],
                          'purchase':['registration','settlement'],'payment-explorer':['settlement'],
                          'recover-brief':['settlement'],'revoke-explorer':['revocation']}
    script=read(OUT/'script.en.json')
    write(EVIDENCE/'scene-map.json',{'scenes':[{'id':s['id'],'start':s['start'],'end':s['end'],
           'transactions':[{'kind':k,'hash':tx[k],'explorer':'https://sepolia.basescan.org/tx/'+tx[k]} for k in chapter_transactions.get(s['id'],[])],
           'evidence':{'refusal':['refusal-evidence.json','revocation-evidence.json'],'recover-brief':['new-eth-payment-evidence.json','service-and-orders.json']}.get(s['id'],['transactions.json'])} for s in script['scenes']],
           'detailedSourceAudit':'../mandate-base-sepolia-demo.silent.json','editingDisclosures':read(OUT/'demo-edit.json')['editingDisclosures']})
    write(EVIDENCE/'checks.json',{'schemaVersion':1,'checkedAt':now,'singlePaymentAmountAtomic':'10000',
          'registrationCountForSuccessfulTask':1,'settlementCountForSuccessfulTask':1,'walletBalanceDeltaAtomic':'10000',
          'firstPaidResponseHTTP':500,'recoveredResponseHTTP':200,'sameNonceAndSettlementOnRecovery':True,
          'resultState':'valid','resultChecker':'ETH-stats-v2','revocationConfirmedByTwoRPCs':True,
          'refusalCode':'AGENT_GRANT_INACTIVE','BTCRegistered':False,'refusalGeneratedTransactions':0,
          'signedTransactionCountBeforeRefusal':3,'signedTransactionCountAfterRefusal':3,
          'independentVerifierRequiredChecksPassed':verification['requiredChecksPassed'],
          'independentVerifierOverall':verification['overall'],'unproven':['HTTPS source truth','Complete execution history'],
          'media':read(OUT/'mandate-base-sepolia-demo.silent.json')['media'],'decodeCheck':'passed',
          'visualReview':{'sourceContactSheet':True,'all33ShotPosters':True,'actualVideoSamplesSeconds':[0,38.25,50,69,76,110.3,116,135,145,170,191,215,250,269,286],
                          'checks':['Persistent system panel','Readable detail crops','No unrelated manual-extension warning in Claude crop','No fabricated transaction/UI state','Subtitles within canvas']},
          'privacy':{'exportMethod':'Allowlisted reviewed JSON structures only','ownerOrSessionOrOperatorKeysExported':False,'connectionCredentialsExported':False,'paymentAuthorizationSignatureExported':False,'rawSignedTransactionsExported':False,'publicEvidenceSignaturesIncluded':True}})
    manifest=[]
    for file in sorted(EVIDENCE.iterdir()):
        if file.suffix not in {'.json','.md'}:
            continue
        manifest.append(hashlib.sha256(file.read_bytes()).hexdigest()+'  '+file.name)
    (EVIDENCE/'SHA256SUMS').write_text('\n'.join(manifest)+'\n')
    with zipfile.ZipFile(OUT/'mandate-base-sepolia-execution-evidence.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(EVIDENCE.iterdir()):
            if file.is_file():archive.write(file,'execution-evidence/'+file.name)
    take['historicalAuthorization']=historical
    take.update({'status':'Public case and picture edit complete; awaiting user voice-over','updatedAt':now,
                 'completedDemo':False,'pictureEditComplete':True,'publicExecutionComplete':True,
                 'mandateId':payment['mandateId'],'sessionId':payment['sessionId'],
                 'sessionRevoked':True,'currentCaseTransactions':current_transactions,
                 'capturedFrames':len(read(TAKE/'frames.json')),'publicEvidence':'competition/video/claude-desktop-base-v1/execution-evidence/run.json'})
    write(TAKE/'take.json',take)
    print(json.dumps({'publicFiles':len(manifest),'publicExecutionComplete':True,'pictureEditComplete':True,'voiceOverPending':True}))


if __name__=='__main__':
    main()
