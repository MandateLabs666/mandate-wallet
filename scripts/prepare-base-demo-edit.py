#!/usr/bin/env python3
"""Prepare narration, subtitles and a reviewable edit from this recorded run."""
import copy
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAKE = ROOT/'.runtime/claude-video-base-v1/formal-take-01'
OUT = ROOT/'competition/video/claude-desktop-base-v1'


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')


def stamp(seconds, srt=False):
    ms = round(seconds*1000)
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}' if srt else f'{m:02}:{s:02}'


def main():
    script = json.loads((OUT/'script.draft.json').read_text())
    script['status'] = 'Picture edit from actual recorded execution; awaiting user voice-over'
    script['capture'] = 'Edited actual UI captures from formal-take-01; idle periods and debugging cut; views held between actions.'
    script['scenes'][1]['narration'] = ('Prepare Claude Desktop, Rabby and Node twenty-four, then start Mandate using the manual’s setup command. '
        'The owner needs test ETH and USDC. This demo uses controlled services and fixed statistics.')
    script['scenes'][2]['narration'] = script['scenes'][2]['narration'].replace('one hour', 'two hours')
    script['scenes'][8]['narration'] = ('Claude resumes the same ETH step after checking its payment state. '
        'The original order and settlement hash are retained, and there is no second payment. '
        'The service returns the sample and the result checker validates it. '
        'Claude writes a brief, identifies the fixed demonstration dataset, and cites the settlement.')
    script['scenes'][9]['narration'] = ('Claude prepares a revocation request. The owner reviews it in the wallet workspace and signs in Rabby. '
        'The BaseScan receipt and SessionRevoked log confirm the change. '
        'Future spending by this session is blocked while the completed purchase remains recorded.')
    captions=[]
    for scene in script['scenes']:
        words = scene['narration'].split()
        groups, group = [], []
        for word in words:
            group.append(word)
            if len(group)>=14 and (word.endswith(('.', ',', ';')) or len(group)>=20):
                groups.append(group); group=[]
        if group:
            groups.append(group)
        cursor=scene['start']
        for i,group in enumerate(groups):
            end=scene['end'] if i==len(groups)-1 else cursor+(scene['end']-scene['start'])*len(group)/len(words)
            captions.append({'start':cursor,'end':end,'text':' '.join(group),'chapter':scene['id']})
            cursor=end
    script['wordCount']=sum(len(s['narration'].split()) for s in script['scenes'])
    script['subtitleTiming']='Provisional narration timing matched to picture edit; realign after user recording.'
    write(OUT/'script.en.json',script)
    voice=['# Mandate Wallet — English voice-over', '',
           'Picture length: **4:50**. Read the narration paragraphs only. Record each numbered chapter separately if convenient. '
           'These timings are guides; the edit and SRT will be aligned to the supplied recording.', '',
           'Pronunciation: USDC = “U S D C”; ETH = “E T H”; BTC = “B T C”; MCP = “M C P”; EIP = “E I P”.', '']
    for n,s in enumerate(script['scenes'],1):
        voice.extend([f'## {n:02} · {stamp(s["start"])}–{stamp(s["end"])} · {s["id"]}', '',s['narration'],''])
    (OUT/'VOICEOVER.en.md').write_text('\n'.join(voice))
    import textwrap
    srt=[]
    for i,c in enumerate(captions,1):
        srt.extend([str(i),stamp(c['start'],True)+' --> '+stamp(c['end'],True),
                    '\n'.join(textwrap.wrap(c['text'],width=70,break_long_words=False,break_on_hyphens=False)),''])
    (OUT/'captions.en.srt').write_text('\n'.join(srt))

    def track(label,crop=None):
        return {'label':label,**({'crop':crop} if crop else {})}
    native=[1100,55,2680,1510]
    settings=[550,90,2940,2010]
    explorer=[210,110,1580,905]
    intro=[350,210,1460,1210]
    shots=[]
    def shot(id,mode,seconds,title,tracks,note=''):
        shots.append({'id':id,'mode':mode,'seconds':seconds,'title':title,'tracks':tracks,'note':note})
    shot('purpose','workspace',18,'01 / An approved task for Claude',{'system':track('choose-base-sepolia',intro)})
    shot('prerequisites','workspace',16,'02 / Prepare the software and test assets',{'system':track('review-public-setup',[350,210,1460,1210])})
    shot('network','workspace',4,'03 / Choose Testnet → Base Sepolia',{'system':track('choose-base-sepolia',intro)})
    shot('owner-connect','wallet',4,'04 / Connect the external owner wallet',{'rabby':track('connect-review')})
    shot('account-review','workspace',4,'05 / Prepare the smart account',{'system':track('review-public-setup',intro)})
    shot('deploy','wallet',6,'06 / Review and sign the deployment',{'system':track('deploy-transaction-review'),'rabby':track('deploy-signing-review')})
    shot('deployment-proof','proof',4,'07 / Confirm the deployment receipt',{'explorer':track('deployment-basescan-overview')})
    shot('gas','wallet',4,'08 / Fund network gas separately',{'system':track('gas-funding-confirmed',intro),'rabby':track('gas-funding-review')})
    shot('usdc','workspace',4,'09 / Transfer 0.15 test USDC to the account',{'system':track('usdc-funding-review',intro)})
    shot('funding-proof','proof',3,'10 / Verify the USDC funding',{'system':track('funding-confirmed',intro),'explorer':track('funding-basescan-overview')})
    file='new-eth-owner-review.png'
    shot('task-permission','workspace',7,'11 / Review the approved task and spending limits',{'system':{'file':file,'capturedAt':datetime.fromtimestamp((TAKE/file).stat().st_mtime,timezone.utc).isoformat(),'crop':[640,20,1150,680]}})
    shot('session-review','workspace',5,'12 / Approve a finite two-hour session',{'system':track('confirmed-two-hour-grant-review-revisited',[630,0,1160,550])},'Confirmed grant review revisited; no new transaction is submitted in this shot.')
    shot('grant-proof','proof',5,'13 / Verify the same authorization transaction',{'explorer':track('new-eth-session-basescan-overview',explorer)})
    shot('grant-log','proof',6,'14 / Match the session and mandate in the event log',{'explorer':track('new-eth-session-basescan-event',explorer)})
    shot('download','workspace',7,'15 / Download the configured Guided connector',{'system':track('claude-guided-download-page',intro)})
    shot('extensions','agent',6,'16 / Open Claude Desktop → Settings → Extensions',{'claude':track('claude-extensions-before-import',settings)})
    shot('import','agent',8,'17 / Use Advanced settings → Install extension',{'claude':track('claude-advanced-install-entry',settings)})
    file='claude-repair-021-enabled.png'
    shot('enabled','agent',14,'18 / Enable Guided ec0539 and start a conversation',{'claude':{'file':file,'capturedAt':datetime.fromtimestamp((TAKE/file).stat().st_mtime,timezone.utc).isoformat(),'crop':[960,90,2760,1980]}},'Recorded connector was updated to 0.2.1 and reloaded to the approved task; no file fields are required.')
    shot('context','agent',12,'19 / Read the account context before spending',{'claude':track('new-eth-context-confirmed',native)})
    shot('quote','agent',10,'20 / Quote ETH statistics for 0.01 test USDC',{'claude':track('new-eth-quote-confirmed',[1100,100,2680,1080])})
    shot('purchase','agent',10,'21 / Register the commitment before payment',{'claude':track('new-eth-purchase-running',native)})
    shot('delivery-failure','agent',23,'22 / Payment succeeds; the controlled first response fails',{'claude':track('new-eth-paid-service-failure',[1100,40,2680,1260])})
    shot('payment-receipt','proof',12,'23 / Verify the 0.01-USDC transfer on BaseScan',{'explorer':track('new-eth-usdc-settlement-overview',explorer)})
    shot('payment-events','proof',10,'24 / Match AuthorizationUsed and Transfer',{'explorer':track('new-eth-usdc-authorization-and-transfer-events',explorer)})
    shot('recovery','agent',16,'25 / Recover the original order without another payment',{'claude':track('new-eth-recovered-brief',[1100,0,2680,1450])})
    shot('brief','agent',10,'26 / Produce a brief from the validated demonstration sample',{'claude':track('new-eth-recovered-brief',[1100,660,2680,1770])})
    shot('revoke-request','agent',9,'27 / Prepare the owner’s session revocation request',{'claude':track('new-eth-agent-revocation-request',native)})
    shot('revoke-receipt','proof',6,'28 / Confirm the owner-signed revocation',{'explorer':track('session-revoked-basescan-overview',explorer)})
    shot('revoke-log','proof',6,'29 / Inspect the SessionRevoked event',{'explorer':track('session-revoked-basescan-event',explorer)})
    shot('refusal','agent',14,'30 / A revoked session cannot buy the unused BTC sample',{'claude':track('revoked-btc-refusal-confirmed',native)})
    shot('ledger','workspace',10,'31 / Confirm the rejected call produced no new payment',{'system':track('final-paid-and-refusal-ledger',[325,145,1670,865])})
    shot('evidence','workspace',8,'32 / Keep payment, delivery and result evidence separate',{'system':track('final-evidence-overview',[325,145,1670,865])})
    shot('close','workspace',9,'33 / Owner-defined spending with a verifiable outcome',{'system':track('final-paid-and-refusal-ledger',[325,145,1670,865])})
    assert sum(s['seconds'] for s in shots)==290
    edit={'schemaVersion':1,'takeId':'formal-take-01','seconds':290,'captions':captions,'shots':shots,
          'composition':{'size':[2560,1440],'badge':'DEMO / PICTURE EDIT',
            'footnote':'Actual UI captures · Held views are not live · Waiting and debugging cut · Test assets / controlled services',
            'cameras':{'system':{'title':'Mandate | Owner workspace','shortTitle':'Mandate'},
                       'claude':{'title':'Claude Desktop | Agent task','shortTitle':'Claude'},
                       'rabby':{'title':'Rabby | Captured owner review','shortTitle':'Rabby'},
                       'explorer':{'title':'BaseScan | Public testnet receipt','shortTitle':'BaseScan'}}},
          'editingDisclosures':[
            'Actual application captures are cropped and scaled; application text and values are not redrawn.',
            'Idle time, wallet handoffs, failed preliminary task and debugging are cut. The full transaction history is retained in the evidence.',
            'The same deployed wallet and funding are reused. The successful case uses a new explicitly owner-approved task and a two-hour session.',
            'The grant-review shot revisits its confirmed draft after execution. It does not create or renew permission.',
            'The original connector installation was followed by the recorded 0.2.1 update and reload to the successful task.',
            'Views are retained between actions and are not synchronized live feeds. Explorer views are arranged next to the event being explained.',
            'The first paid HTTP response deliberately fails. Recovery uses the same order, nonce and settlement.',
            'An unrelated disabled manual-extension notification is excluded by cropping the Claude content area.',
            'The quote tool’s ambiguous readyForRegistration wording is excluded; existing authorization was active and no extra grant was required.',
            'The video has no voice-over yet. Subtitle timings are provisional until the user recording is supplied.'
          ]}
    write(OUT/'demo-edit.json',edit)
    for filename,updates in [
        ('new-eth-connection-binding.json',{'claudeReload':'verified in native Claude context, quote, purchase, recovery, revoke draft and refusal calls','nativeConversation':'https://claude.ai/chat/f757c6fb-f28d-4034-9153-7955c3fa299b'}),
        ('repair-package.json',{'installedInClaude':True,'nativeUpdateEvidence':'claude-repair-021-enabled.png','nativeExecutionVersion':'0.2.1'})]:
        value=json.loads((TAKE/filename).read_text()); value.update(updates);write(TAKE/filename,value)
    print(json.dumps({'seconds':290,'shots':len(shots),'words':script['wordCount'],'captions':len(captions)}))


if __name__=='__main__':
    main()
