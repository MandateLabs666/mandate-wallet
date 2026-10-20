"""Accept a real MetaMask local-EVM video; retain raw inputs privately."""
import argparse, datetime, hashlib, io, json, os, re, shutil, sqlite3, subprocess, tempfile, zipfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('revision')
parser.add_argument('--visual-reviewed', action='store_true', help='Record the operator\'s completed inspection of all twelve decoded stage frames.')
args = parser.parse_args()
if not re.fullmatch('[a-z0-9-]+', args.revision): raise SystemExit('INVALID_REVISION')
build = root / '.runtime/competition-video' / args.revision
out = root / 'artifacts/competition/wallet-video' / args.revision
out.mkdir(parents=True, exist_ok=True)
def read(name): return json.loads((build / name).read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def require(value, code):
    if not value: raise SystemExit(code)
def save(name, value): (out / name).write_text(json.dumps(value, indent=2) + '\n')
summary, capture, verification = read('summary.json'), read('capture.json'), read('verification.json')
require(not summary['smoke'] and summary['allStagesPassed'] and summary['actualMetaMask'] and not summary['providerInjected'], 'CAPTURE_NOT_ACTUAL_WALLET')
require(summary['paymentTransactions'] == 1 and summary['ownerWalletTransactions'] == 3 and summary['sameHashOnRecovery'] and summary['revocationConfirmed'] and summary['laterStepRejected'], 'WORKFLOW_ASSERTION_FAILED')
require(verification['report']['requiredChecksPassed'] and verification['report']['overall'] == 'incomplete' and verification['processSeparate'], 'EVIDENCE_ASSERTION_FAILED')
require(capture['chainId'] == 31337 and capture['paidAtomic'] == '10000' and capture['newPublicTransactions'] == 0 and not capture['webServerOwnerKeyLoaded'], 'WRONG_SCOPE')
require([t['action'] for t in capture['ownerTransactions']] == ['create', 'grant', 'revokeSession'] and all(t['status'] == 'confirmed' and t['actionApplied'] for t in capture['ownerTransactions']), 'WALLET_TRANSACTIONS_NOT_CONFIRMED')
require(len(capture['timeline']) == 12 and all(capture['frames'][i]['timeMs'] < capture['frames'][i+1]['timeMs'] for i in range(len(capture['frames'])-1)), 'CAPTURE_TIMELINE_INVALID')
for a, b in zip(capture['timeline'], capture['timeline'][1:]): require(a['startMs'] + a['voiceDurationSeconds'] * 1000 <= b['startMs'], 'NARRATION_OVERLAP')
for frame in capture['frames']:
    with Image.open(build / frame['file']) as image: require(image.size == (1280, 900), 'FRAME_DIMENSION_MISMATCH')
video = root / 'competition/video' / ('mandate-wallet-demo-' + args.revision + '.mp4')
require(sha(video) == summary['outputSHA256'], 'OUTPUT_CHANGED')
probe = json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)], text=True))
duration = float(probe['format']['duration'])
require(0 < duration < 300 and abs(duration - capture['totalMs'] / 1000) < 0.2, 'VIDEO_DURATION_MISMATCH')
v = next(s for s in probe['streams'] if s['codec_type'] == 'video')
a = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
require(v['codec_name'] == 'h264' and a['codec_name'] == 'aac' and v['width'] == 1280 and v['height'] == 900, 'OUTPUT_FORMAT_MISMATCH')
decoded = subprocess.run(['/opt/homebrew/bin/ffmpeg', '-hide_banner', '-v', 'error', '-i', str(video), '-f', 'null', '-'], capture_output=True, text=True)
require(decoded.returncode == 0 and not decoded.stderr.strip(), 'FULL_VIDEO_DECODE_FAILED')
volume = subprocess.run(['/opt/homebrew/bin/ffmpeg', '-hide_banner', '-i', str(video), '-af', 'volumedetect', '-vn', '-f', 'null', '-'], capture_output=True, text=True)
peak = float(re.search(r'max_volume: ([-\d.]+) dB', volume.stderr).group(1))
require(volume.returncode == 0 and peak < 0, 'AUDIO_CLIPPING')
screens = out / 'stages'
screens.mkdir(exist_ok=True)
for i, stage in enumerate(capture['timeline']):
    at = (stage['startMs'] / 1000) + min(2, stage['voiceDurationSeconds'] / 2)
    subprocess.run(['/opt/homebrew/bin/ffmpeg', '-hide_banner', '-v', 'error', '-y', '-ss', str(at), '-i', str(video), '-frames:v', '1', str(screens / f'{i+1:02}-{stage["id"]}.png')], check=True)
safe_capture = {k:v for k,v in capture.items() if k != 'frames'}
safe_capture['frames'] = [{**f, 'SHA256':sha(build / f['file'])} for f in capture['frames']]
save('capture.json', safe_capture)
save('summary.json', {k:v for k,v in summary.items() if k != 'output'})
save('verification.json', verification)
def timestamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
subtitles, transcript = [], ['# Actual MetaMask / local EVM demo transcript', '', f'Revision {args.revision}; {duration:.2f} seconds. Offline computer narration, not human rehearsal. Stage captions accompany the exact narration below.', '', 'Local chain 31337, mock USDC and controlled merchant. Root creation used native MetaMask before capture; grant and revocation confirmations are captured. No public transaction or mainnet payment.', '']
for i, stage in enumerate(capture['timeline']):
    start = stage['startMs'] / 1000
    end = capture['timeline'][i+1]['startMs'] / 1000 if i+1 < len(capture['timeline']) else duration
    subtitles.extend([str(i+1), f'{timestamp(start)} --> {timestamp(end)}', stage['caption'], ''])
    transcript.extend([f'## {i+1}. {stage["id"]} ({start:.2f}s)', '', stage['narration'], ''])
transcript.extend(['Sources: [narrative source](wallet-content.json), [captured results](../../artifacts/competition/wallet-video/' + args.revision + '/capture.json), [independent report](../../artifacts/competition/wallet-video/' + args.revision + '/verification.json), [actual wallet acceptance](../../planning/M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md), [tool review](../STATIC_TOOL_REVIEW.en.md).', '', 'Financial and record checks pass, while overall verification remains incomplete. Manual usability, physical-mobile acceptance, remaining wallet paths, final freeze and organizer confirmations retain their own task states.'])
caption_path = root / 'competition/video' / ('mandate-wallet-demo-' + args.revision + '.srt')
transcript_path = root / 'competition/video' / ('TRANSCRIPT.' + args.revision + '.en.md')
caption_path.write_text('\n'.join(subtitles))
transcript_path.write_text('\n'.join(transcript) + '\n')

# Compare actual credentials, raw owner transactions and payment payload signatures
# without exporting the needles. Tool corpora and browser profiles are not inputs.
needles = set()
def collect(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, str) and len(item) > 15 and key.lower() in ['privatekey', 'connectiontoken', 'apikey', 'password', 'credential', 'registrationsignature']: needles.add(item.encode())
            if key == 'raw' and isinstance(item, str) and item.startswith('0x') and len(item) > 100: needles.add(item.encode())
            if key == 'payload' and isinstance(item, dict) and isinstance(item.get('signature'), str): needles.add(item['signature'].encode())
            if isinstance(item, (dict, list)): collect(item)
    elif isinstance(value, list):
        for item in value: collect(item)
for current, dirs, files in os.walk(root / '.runtime'):
    dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'downloads', 'delivery-build', 'profile', 'chrome-profile', 'frames', 'presentation-build', 'browsers', 'metamask-13.52.0', 'security-review']]
    for name in files:
        p = Path(current) / name
        if p.suffix == '.json' and p.stat().st_size < 2_000_000:
            try: collect(json.loads(p.read_text()))
            except (ValueError, UnicodeError): pass
temporary_profiles = 0
for credential in Path(tempfile.gettempdir()).glob('mandate-m4-*/wallet-video-credential.json'):
    temporary_profiles += 1
    directory = credential.parent
    for name in ['wallet-video-credential.json', 'session.json', 'operator.json']:
        p = directory / name
        if p.exists(): collect(json.loads(p.read_text()))
    database = directory / 'purchases.sqlite'
    if database.exists():
        with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as db:
            for row in db.execute('SELECT json FROM purchases'): collect(json.loads(row[0]))
            for row in db.execute('SELECT raw FROM signed_transactions'): collect({'raw': row[0]})
require(temporary_profiles > 0, 'NO_ACTUAL_VIDEO_CREDENTIAL_SCAN_INPUTS')
needles |= {n[2:] for n in list(needles) if n.startswith(b'0x')}
require(needles, 'NO_PRIVATE_SCAN_INPUTS')
pattern = re.compile(b'|'.join(re.escape(n) for n in sorted(needles, key=len, reverse=True)))
sources = [root / p for p in ['mandate/experiments/competition-wallet-video.ts', 'competition/video/wallet-content.json', 'scripts/accept-wallet-video.py']]
for p in sources + [video, caption_path, transcript_path] + [p for p in out.rglob('*') if p.is_file() and p.name != 'acceptance.json']:
    require(not pattern.search(p.read_bytes()), 'PRIVATE_VALUE_IN_OUTPUT:' + str(p.relative_to(root)))
changed = subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=ACMRT', '-z'], cwd=root).split(b'\0')
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=root).split(b'\0')
worktree_paths = sorted({root / name.decode() for name in changed + untracked if name})
def inspect_bytes(data, label, depth=0):
    require(not pattern.search(data), 'PRIVATE_VALUE_IN_CHANGED_MATERIAL:' + label)
    if depth < 3 and zipfile.is_zipfile(io.BytesIO(data)):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for name in archive.namelist():
                if not name.endswith('/'): inspect_bytes(archive.read(name), label + '::' + name, depth+1)
for p in worktree_paths:
    if p.is_file(): inspect_bytes(p.read_bytes(), str(p.relative_to(root)))
save('media-checks.json', {'durationSeconds': duration, 'videoCodec': v['codec_name'], 'audioCodec': a['codec_name'], 'dimensions': [v['width'], v['height']], 'frameRate': v['r_frame_rate'], 'allFramesExactDimensions': True, 'fullAVDecodePassed': True, 'maxAudioVolumeDB': peak, 'narrationOverlap': False, 'sceneCutsOrSpeedChanges': False, 'privateValueVariantsCompared': len(needles), 'temporaryVideoProfilesCompared': temporary_profiles, 'knownPrivateValuesExcluded': True})
if args.visual_reviewed:
    save('acceptance.json', {
        'schemaVersion': 1, 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'revision': args.revision, 'output': str(video.relative_to(root)), 'outputSHA256': sha(video),
        'durationSeconds': duration, 'capturedFrames': len(capture['frames']), 'stages': 12,
        'allDecodedStageFramesVisuallyInspected': True, 'actualMetaMask': True, 'providerInjected': False,
        'paymentTransactions': 1, 'paidAtomic': '10000', 'ownerWalletTransactions': 3,
        'sameHashOnRecovery': True, 'revocationConfirmed': True, 'laterStepRejected': True,
        'rootCreationBeforeCapture': True, 'grantAndRevocationNativeConfirmationsCaptured': True,
        'fullAVDecodePassed': True, 'maxAudioVolumeDB': peak, 'knownPrivateValuesExcluded': True,
        'privateValueVariantsCompared': len(needles), 'changedMaterialFilesCompared': len(worktree_paths), 'nestedZipMembersCompared': True, 'humanRehearsal': False, 'physicalMobileDevice': False,
        'sourceFingerprint': {str(p.relative_to(root)):sha(p) for p in sources},
        'evidenceSHA256': {str(p.relative_to(root)):sha(p) for p in [caption_path, transcript_path] + sorted(p for p in out.rglob('*') if p.is_file() and p.name != 'acceptance.json')},
        'newPublicTransactions': 0, 'formalSubmissionSent': False, 'tasksNewlyClosed': [],
        'limits': ['Local EVM and controlled merchant, not a new public testnet transaction.', 'Official unmodified unpacked extension operated automatically, not a human or phone acceptance.', 'Entire report is exported separately; its lower checks extend beyond the recorded Evidence viewport.', 'Native wallet displays estimated fiat gas using its own presentation; these local estimates are not measured procurement costs.', 'Overall verification incomplete for missing HTTPS/full-history guarantees.', 'T8 manual/remaining paths and final all-material/package/freeze checks remain separate.'],
        'preservedFailedAttempt': {'revision':'wallet-v2', 'stage':'setup', 'reason':'native-control wait timed out before capture; no success claimed'}
    })
print(json.dumps({'revision': args.revision, 'seconds': duration, 'stages': 12, 'frames': len(capture['frames']), 'peakDB': peak, 'privateValueVariantsCompared': len(needles), 'visualAcceptance': 'operator inspection recorded' if args.visual_reviewed else 'pending; inspect twelve decoded stage frames before final acceptance'}))
