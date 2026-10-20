"""Check the current material set against recorded execution, not intended claims."""
import argparse, datetime, hashlib, json, re, subprocess, zipfile
import xml.etree.ElementTree as E
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
out = root / args.output
if out.exists(): raise SystemExit('AUDIT_OUTPUT_EXISTS')
out.mkdir(parents=True)
def load(name): return json.loads((root / name).read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def require(value, code):
    if not value: raise SystemExit(code)
def pointer(value, path):
    for part in path.strip('/').split('/'): value = value[int(part)] if isinstance(value, list) else value[part]
    return value
claims = []
def claim(name, source, path, expected=None):
    value = pointer(load(source), path)
    if expected is not None: require(value == expected, 'CLAIM_MISMATCH:' + name)
    claims.append({'id':name,'source':source,'pointer':path,'value':value,'sourceSHA256':sha(root/source)})
    return value
materials = load('competition/MATERIALS.json')
paths = sorted(set(materials['primary'].values()) | set(materials['websiteSource']) | {'README.md'})
for p in paths: require((root/p).is_file(), 'MATERIAL_MISSING:' + p)
text = {p:(root/p).read_text() for p in paths if Path(p).suffix in ['.md','.json','.html','.ts','.srt']}
ns = {'a':'http://schemas.openxmlformats.org/drawingml/2006/main','c':'http://schemas.openxmlformats.org/drawingml/2006/chart'}
deck = materials['primary']['deck']
with zipfile.ZipFile(root/deck) as archive:
    slides = sorted([p for p in archive.namelist() if re.fullmatch(r'ppt/slides/slide[0-9]+\.xml',p)], key=lambda p:int(re.search(r'slide([0-9]+)',p)[1]))
    slide_text = [' | '.join(n.text or '' for n in E.fromstring(archive.read(p)).findall('.//a:t',ns)) for p in slides]
    notes = sorted([p for p in archive.namelist() if re.fullmatch(r'ppt/notesSlides/notesSlide[0-9]+\.xml',p)],key=lambda p:int(re.search(r'notesSlide([0-9]+)',p)[1]))
    note_text = [' '.join(n.text or '' for n in E.fromstring(archive.read(p)).findall('.//a:t',ns)) for p in notes]
    text[deck] = '\n'.join(slide_text + note_text)
    chart_values=[]
    for p in sorted(n for n in archive.namelist() if re.search(r'/charts/chart[0-9]+\.xml$',n)):
        chart=E.fromstring(archive.read(p))
        values=[float(n.text) for n in chart.findall('.//c:val//c:numCache/c:pt/c:v',ns)]
        chart_values.append(values)
require(len(slides)==len(notes)==12,'DECK_PART_COUNT')
report = text[materials['primary']['report']]
benchmark='artifacts/m7/benchmarks/audit.json'
for baseline in ['B1','B2','B3','B4']:
    values=[]
    for metric in ['gasPerTask','purchaseMs','fullTaskMs']:
        values.append([claim(f'{baseline}-{metric}-{q}',benchmark,f'/byBaseline/{baseline}/{metric}/{q}') for q in ['p50','p95']])
    row='| '+baseline+' | '+' | '.join(' / '.join(str(round(x)) if i==0 else f'{x:.2f}' for x in pair) for i,pair in enumerate(values))+' |'
    require(row in report,'REPORT_TABLE_MISMATCH:'+baseline)
    claim(baseline+'-sampleCount',benchmark,f'/byBaseline/{baseline}/tasks',30)
require(chart_values == [[float(pointer(load(benchmark),f'/byBaseline/{b}/gasPerTask/p50')) for b in ['B1','B2','B3','B4']], [round(float(pointer(load(benchmark),f'/byBaseline/{b}/fullTaskMs/p50')),2) for b in ['B1','B2','B3','B4']]], 'NATIVE_CHART_VALUES_MISMATCH')
for key, expected in [('httpTasks',120),('httpPaymentTransactions',132),('httpEventualValidTasks',120),('duplicatePayments',0),('statefulCoreCases',8),('evidencePayments',66),('controllerChargedQueryCap',3),('normalRepetitionsPerCase',3)]: claim(key,benchmark,'/'+key,expected)
for role in ['execute','session']: claim('echo-'+role+'-successfulSwaps',benchmark,'/echo/'+role+'/success',5)
for b in ['B3','B4']:
    for key in ['fullBytes','minimalBytes']:
        value=claim(b+'-'+key,benchmark,f'/disclosurePerPayment/{b}/{key}/p50')
        require(str(value) in report,'DISCLOSURE_FIGURE_MISSING')
for key,expected in [('invalidSamples',10000),('distinctCalldata',10000),('provenInvalidByPredicate',10000),('expectedRejectionMatched',10000),('falseAccepts',0),('legalControlCallsAccepted',6),('exactSeedAndSourceReplay',True)]: claim('invalid-'+key,'artifacts/m7/research/dataset-audit.json','/'+key,expected)
dataset=load('artifacts/m7/research/dataset-audit.json');require(len(dataset['strata'])==20 and set(dataset['strata'].values())=={500},'INVALID_GENERATION_COUNTS')
for chain in [84532,11155111]:
    source=f'artifacts/m3/{chain}-deployment.json'
    for field in ['address','asset']:
        value=claim(f'{chain}-{field}',source,'/contracts/MandateAccount/'+field)
        require(value in report,'NETWORK_ADDRESS_NOT_IN_REPORT')
claim('public-example','artifacts/m5/lifecycle/public-bundle.json','/record/settlementHash')
require(claims[-1]['value'] in slide_text[5] and claims[-1]['value'] in report,'PUBLIC_EXAMPLE_MISMATCH')
index=load('artifacts/competition/execution-index/index.json')
claim('public-index-transactions','artifacts/competition/execution-index/index.json','/selectedPublicTransactions',14)
require(index['selectedPublicTransactions']==14 and len(index['demoSteps'])==8,'PUBLIC_INDEX_COUNT')
transactions=[t for n in index['publicNetworks'] for t in n['transactions']]
require(len(transactions)==14 and sum(t['status']=='reverted' for t in transactions)==2,'PUBLIC_REFUSAL_COUNT')
for t in transactions: require(t['expectedStatus']==t['status'],'PUBLIC_TRANSACTION_STATUS_MISMATCH')

deck_accept='artifacts/competition/presentation-v3/acceptance.json'
require(claim('deckSHA',deck_accept,'/outputSHA256')==sha(root/deck),'DECK_CHANGED_AFTER_ACCEPTANCE')
spoken=claim('spokenWords',deck_accept,'/spokenWords',964)
estimate=claim('estimatedSeconds',deck_accept,'/estimatedSeconds')
require(estimate<600 and abs(estimate-(spoken*60/115+50))<0.001,'DECK_TIME_ESTIMATE')
content=load(materials['primary']['deckSource'])
require(len(content['slides'])==12,'DECK_SOURCE_COUNT')
for i,s in enumerate(content['slides']): require(s['narration'] in note_text[i] and s['narration'] in text[materials['primary']['speakerScript']],'NOTES_SOURCE_MISMATCH:'+str(i+1))
video_accept='artifacts/competition/wallet-video/wallet-v3/acceptance.json'
require(claim('videoSHA',video_accept,'/outputSHA256')==sha(root/materials['primary']['video']),'VIDEO_CHANGED_AFTER_ACCEPTANCE')
claim('videoDuration',video_accept,'/durationSeconds',214.35)
claim('videoFrames',video_accept,'/capturedFrames',408)
for key,expected in [('stages',12),('paymentTransactions',1),('paidAtomic','10000'),('ownerWalletTransactions',3),('actualMetaMask',True),('providerInjected',False),('sameHashOnRecovery',True),('humanRehearsal',False),('physicalMobileDevice',False)]: claim('video-'+key,video_accept,'/'+key,expected)
capture=load('artifacts/competition/wallet-video/wallet-v3/capture.json')
for stage in capture['timeline']:
    require(stage['narration'] in text[materials['primary']['transcript']] and stage['caption'] in text[materials['primary']['captions']],'VIDEO_NARRATIVE_CHANGED')
verify=load('artifacts/competition/wallet-video/wallet-v3/verification.json')
require(verify['report']['requiredChecksPassed'] and verify['report']['overall']=='incomplete','VIDEO_GUARANTEE_MISMATCH')
for key,expected in [('initialSignals',113),('finalRawSignals',112),('thirdPartyHumanAudit',False)]: claim('security-'+key,'artifacts/m7/security/acceptance.json','/'+key,expected)
rc2=load('artifacts/competition/source-delivery/rc2/package.json')
for key,expected in [('solidityCases',23),('reproductionPhases',10),('invariantCalls',8192),('invariantHandlerReverts',0)]: claim('rc2-'+key,'artifacts/competition/source-delivery/acceptance.json','/'+key,expected)
require(sum(claim('rc2-typescriptCases','artifacts/competition/source-delivery/acceptance.json','/typescriptCases').values())==84,'RC2_TEST_COUNT')
claim('wallet-responsiveViews','artifacts/m6/external-wallet/automation-acceptance.json','/responsiveViews',14)
claim('wallet-exactExtensionRelease','artifacts/m6/external-wallet/provenance.json','/archiveSHA256','8ea87cd478abde80ead7bd78bf71a05062fd1f260dfdb53de624865d460c5e4a')
source_text=text[materials['primary']['sourceDelivery']]
require(rc2['archiveSHA256'] in source_text and rc2['sourceCommit'] in source_text and str(rc2['sourceFiles']) in source_text and 'predates' in source_text,'HISTORICAL_SOURCE_SCOPE_MISMATCH')
if materials.get('currentSourceCandidate'):
    current_source=materials['currentSourceCandidate'];current=load(current_source)
    for key in ['sourceCommit','archiveSHA256','sourceFiles','typescriptTotal','reproductionPhases','invariantCalls','invariantHandlerReverts','newPublicTransactions','finalSubmissionFreeze','privateRuntimeCopied']:
        claim('currentSource-'+key,current_source,'/'+key)
    for key in ['contracts','echo-contracts']:claim('currentSource-'+key,current_source,'/solidityCases/'+key)
    claim('currentSource-privateScanVariants',current_source,'/privacy/actualPrivateValueVariantsCompared')
    package_source=str(Path(current_source).with_name('package.json'))
    claim('currentSource-archiveBytes',package_source,'/archiveBytes')
    require(current['archiveSHA256'] in source_text and current['sourceCommit'] in source_text and str(current['sourceFiles']) in source_text,'CURRENT_SOURCE_TEXT_MISMATCH')
    require(sum(current['solidityCases'].values())==50 and current['typescriptTotal']==sum(current['typescriptCases'].values()) and current['typescriptTotal']>=105 and current['reproductionPhases']==13,'CURRENT_SOURCE_COUNTS_MISMATCH')
    if 'mandate/services/test/cash.test.ts' in load(package_source)['fileManifest']:require(current.get('cashFundingRecoveryTestIncluded') and current['typescriptCases']['service-tests']>=27 and current['typescriptTotal']>=106,'CURRENT_SOURCE_CASH_RECOVERY_MISSING')

# A current hosted revision is a separate exact source scope from the candidate ZIP.
hosted_evidence=[];hosted_scope=None
if materials.get('currentHostedSite'):
    hosted=load(materials['currentHostedSite']);acceptance=load(materials['currentHostedAcceptance'])
    require(hosted['status']=='succeeded' and hosted['failure_message'] is None,'CURRENT_HOSTING_NOT_SUCCEEDED')
    require(acceptance['ownerOnlyAccessConfirmedBeforePublishing'] and not acceptance['sharingChanged'] and not acceptance['backendOrPrivateRuntimeUploaded'],'CURRENT_HOSTING_SCOPE_MISMATCH')
    require(hosted['id']==acceptance['deploymentId'] and hosted['version_id']==acceptance['versionId'] and hosted['url']==acceptance['url'],'CURRENT_HOSTING_ID_MISMATCH')
    for source_path,digest in acceptance['sourceFingerprint'].items():require(sha(root/source_path)==digest,'CURRENT_HOSTED_SOURCE_CHANGED:'+source_path)
    preflight_path=str(Path(materials['currentHostedSite']).with_name('preflight.json'));preflight=load(preflight_path)
    require(preflight['siteSourceCommit']==acceptance['siteSourceCommit'] and preflight['projectSourceCommit']==acceptance['projectSourceCommit'] and preflight['archiveSecretScanPassed'],'CURRENT_HOSTING_PREFLIGHT_MISMATCH')
    for body in [report,text[materials['primary']['sourceDelivery']]]:
        require(acceptance['projectSourceCommit'] in body and acceptance['siteSourceCommit'] in body,'CURRENT_HOSTING_MATERIAL_VERSION_MISMATCH')
    for name,digest in preflight['files'].items():
        if name!='app.js':require(sha(root/'mandate/web/static'/name)==digest,'CURRENT_HOSTED_ASSET_CHANGED:'+name)
    hosted_evidence=[root/materials['currentHostedSite'],root/materials['currentHostedAcceptance'],root/preflight_path]
    hosted_scope={'projectSourceCommit':acceptance['projectSourceCommit'],'siteSourceCommit':acceptance['siteSourceCommit'],'status':hosted['status'],'ownerPrivate':True,'staticAssets':len(preflight['files'])}

connection_scope=None
retained_connection=materials.get('retainedHostedConnection')
if materials.get('currentHostedConnection') or retained_connection:
    current_connection=materials.get('currentHostedConnection')
    source=current_connection or retained_connection['acceptance'];connection=load(source)
    historical_commit=None if current_connection else retained_connection['sourceCommit']
    if historical_commit:
        require(re.fullmatch(r'[0-9a-f]{40}',historical_commit) and materials.get('currentHostedConnectionStatus')=='pending authorized native-wallet/transport recheck','RETAINED_CONNECTION_SCOPE_UNDECLARED')
    connection_scope={'relation':'current' if current_connection else 'retained historical evidence','sourceCommit':historical_commit,'currentVersionTransportVerified':bool(current_connection)}
    first_connection_claim=len(claims)
    for key,expected in [('hostedLoopbackAllowedAndDenied',True),('singleLocalPaymentEvents',1),('sameHashRecovery',True),('denialPaymentEvents',0),('webTestsPassed',8),('siteDispatchValueCompared',True),('humanAcceptance',False),('physicalMobile',False),('newPublicTransactions',0)]:
        claim('hostedConnection-'+key,source,'/'+key,expected)
    claim('hostedConnection-browserVersion',source,'/browserVersion','Chrome/151.0.7922.34')
    allowed_source=str(Path(source).parent/'allowed/result.json')
    for key,expected in [('sourceHeaderMatched',True),('redirectRejected',True),('destinationHits',0),('realSiteCredentialUsed',False)]:
        claim('hostedConnection-redirect-'+key,allowed_source,'/redirectControl/'+key,expected)
    require(load(allowed_source)['authenticatedTransport']=='native Chromium HTTP; per-request CDP Site header; cross-origin redirects rejected before transmission','HOSTED_CONNECTION_TRANSPORT_SCOPE')
    if current_connection:require(load(allowed_source)['hostedAsset']['SHA256']==preflight['files']['app.js'],'CURRENT_CONNECTION_ASSET_VERSION_MISMATCH')
    require(connection['actualHostedOrigin']==hosted['url'] and connection['denialGuidanceVisibleWidths']==[1280,390] and connection['G3']=='open','HOSTED_CONNECTION_SCOPE_MISMATCH')
    for key in ['sourceFingerprint','financialSourcesUnchangedFromRC6','evidenceSHA256','externalEvidenceSHA256']:
        for path,digest in connection[key].items():
            if historical_commit and key in ['sourceFingerprint','financialSourcesUnchangedFromRC6']:
                recorded=subprocess.run(['git','show',historical_commit+':'+path],cwd=root,capture_output=True)
                require(recorded.returncode==0 and hashlib.sha256(recorded.stdout).hexdigest()==digest,'RETAINED_CONNECTION_SOURCE_CHANGED:'+path)
            else:require(sha(root/path)==digest,'HOSTED_CONNECTION_EVIDENCE_CHANGED:'+path)
    for entry in claims[first_connection_claim:]:entry['versionScope']=connection_scope

if materials.get('latestNativeRabbyLocalFlow'):
    source=materials['latestNativeRabbyLocalFlow']
    for key,expected in [('actualHostedPage',False),('fullyUnattended',False),('humanAcceptance',False),('ownerTransactions',3),('tokenPayments',1),('paidAtomic','10000'),('sameHashRecovery',True),('finiteSessionRevoked',True),('newStepRejectedByUIAndAPI',True),('independentChainProofPassed',True),('automaticTaskHandoffFixValidatedHere',False),('newPublicTransactions',0)]:
        claim('nativeRabbyLocal-'+key,source,'/'+key,expected)

if materials.get('latestCreatedTaskFix'):
    source=materials['latestCreatedTaskFix']
    for key,expected in [('baselineBugReproduced',True),('fixedUICasesPassed',10),('webTestsPassed',8),('hostedNativeWalletAcceptance',False)]:
        claim('createdTaskFix-'+key,source,'/'+key,expected)

# All literal addresses and 32-byte references must occur in recorded evidence.
evidence=[root/p for p in ['artifacts/m3/84532-deployment.json','artifacts/m3/11155111-deployment.json','artifacts/competition/execution-index/index.json','artifacts/m5/lifecycle/public-bundle.json','artifacts/public-probes.json','artifacts/sepolia-payment.json','artifacts/m2/sepolia-evidence.json','artifacts/m6/external-wallet/final.json','artifacts/competition/wallet-video/wallet-v3/capture.json','mandate/sdk/VERSIONS.json']]+hosted_evidence
known='\n'.join(p.read_text() for p in evidence)
address_pattern=r'0x[0-9a-fA-F]{40}(?![0-9a-fA-F])'
reference_pattern=r'0x[0-9a-fA-F]{64}(?![0-9a-fA-F])'
addresses={a.lower() for a in re.findall(address_pattern,known)}
references={a.lower() for a in re.findall(reference_pattern,known)}
address_occurrences=[]
for p,body in text.items():
    for value in set(re.findall(address_pattern,body)):
        require(value.lower() in addresses,'UNSUPPORTED_ADDRESS:'+p+':'+value);address_occurrences.append({'material':p,'address':value})
    for value in set(re.findall(reference_pattern,body)):
        require(value.lower() in references,'UNSUPPORTED_32_BYTE_REFERENCE:'+p+':'+value)
links=0
for p,body in text.items():
    if not p.endswith('.md'):continue
    for target in re.findall(r'\]\(([^)]+)\)',body):
        if re.match(r'[a-z]+:',target) or target.startswith('#'):continue
        require((root/p).parent.joinpath(target.split('#')[0]).exists(),'BROKEN_MATERIAL_LINK:'+p+':'+target);links+=1
require('manual usability pending' in slide_text[10] and 'no human audit claimed' in slide_text[10] and 'no mainnet spending' in slide_text[5],'DECK_BOUNDARY_CLAIMS_CHANGED')
require('same-host controller is not isolation' in slide_text[7] and 'overall' in text[materials['primary']['videoGuide']] and 'incomplete' in text[materials['primary']['videoGuide']],'EVIDENCE_BOUNDARY_CLAIMS_CHANGED')
require(not any(materials[k] for k in ['mainnetPaymentsAuthorized','formalSubmissionAuthorized','humanWalletUsabilityAccepted','thirdPartyHumanAudit','finalVersionFrozen']),'MATERIAL_SCOPE_EXPANDED')
manual=load('competition/CLAIM_REVIEW.json')
require(len(manual['claims'])>=10 and all(c['reviewedAgainstCodeAndEvidence'] and c['limit'] for c in manual['claims']),'MANUAL_REVIEW_INCOMPLETE')
for c in manual['claims']:
    for p in c['sources']:require((root/p).exists(),'CLAIM_REVIEW_SOURCE_MISSING')
sources=sorted(set(paths+['competition/MATERIALS.json','competition/CLAIM_REVIEW.json','scripts/audit-competition-materials.py']))
reviewed_sources=sorted({p for c in manual['claims'] for p in c['sources']})
result={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'acceptedTasks':['T11.08'],'scope':'current primary report/deck/notes/video/captions/guides/website source; historical artifacts explicitly versioned','quantitativeClaims':len(claims),'literalAddressOccurrences':address_occurrences,'localLinksChecked':links,'nativeChartValuesMatched':True,'notesAndCaptionsMatchedSource':True,'historicalSourceAndHostingScopesExplicit':True,'manualCodeAndEvidenceClaimReview':True,'sourceFingerprint':{p:sha(root/p) for p in sources},'referenceEvidenceSHA256':{str(p.relative_to(root)):sha(p) for p in evidence},'claims':claims,'newPublicTransactions':0,'finalVersionFrozen':False,'formalSubmissionSent':False,'limits':['Author-operated material audit; not a non-author human audit or renewed public transaction acceptance.','Times are local measured values or explicitly labeled script estimates, not production performance.',('Hosted static source matches its recorded build; backend, manual and cross-device flows retain separate acceptance.' if hosted_scope else 'Current local website source differs from recorded older owner-private hosted deployment.'),'Source candidates preserve their exact earlier commits; a new export needs its own reproduction/privacy acceptance.','Any material change requires rechecking this versioned audit; T11.09 final freeze remains open.']}
result['currentHostingScope']=hosted_scope
result['hostedConnectionEvidenceScope']=connection_scope
result['reviewedImplementationAndEvidenceSHA256']={p:sha(root/p) for p in reviewed_sources}
(out/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'acceptedTasks':['T11.08'],'quantitativeClaims':len(claims),'materials':len(paths),'addressOccurrences':len(address_occurrences),'localLinks':links,'newPublicTransactions':0}))
