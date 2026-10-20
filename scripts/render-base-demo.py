#!/usr/bin/env python3
"""Render the Base Sepolia demo from captured UI frames, with a source audit.

Offline editing only. No browsers, wallets, model calls or transactions run here.
"""
import argparse
import hashlib
import importlib.util
import json
import subprocess
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('take', type=Path)
    ap.add_argument('edit', type=Path)
    ap.add_argument('output', type=Path)
    ap.add_argument('--posters-only', action='store_true')
    args = ap.parse_args()
    take = args.take.resolve()
    edit = json.loads(args.edit.read_text())
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    posters = output.parent / 'review-frames'
    posters.mkdir(exist_ok=True)
    spec = importlib.util.spec_from_file_location('multiview', Path(__file__).with_name('render-multiview-preview.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # A larger explorer panel keeps the payment and event details readable.
    module.LAYOUTS['proof'] = {
        'explorer': (32, 130, 1216, 780, 1),
        'system': (1272, 130, 616, 280, 1),
        'claude': (1272, 434, 616, 476, 1),
        'rabby': (1272, 434, 296, 476, 0),
    }
    class Painter(module.Compositor):
        def camera(self, name, rect, active):
            if name in self.sources:
                return super().camera(name, rect, active)
            w, h = self.unit(rect[2]), self.unit(rect[3])
            if rect[4] < .01:
                return None
            im = Image.new('RGB', (w, h), '#101722')
            d = ImageDraw.Draw(im)
            d.rounded_rectangle((1, 1, w-2, h-2), radius=self.unit(12), outline='#2b3647', width=2)
            notes = {
                'claude': ('CLAUDE DESKTOP', 'Read the approved scope.\nQuote and purchase the service.\nRecover the original order.'),
                'rabby': ('OWNER WALLET', 'Approve the budget and session.\nSign owner transactions in Rabby.\nKeep the owner key outside the agent.'),
                'explorer': ('PUBLIC EXECUTION EVIDENCE', 'Verify Base Sepolia receipts.\nInspect the USDC transfer.\nCheck the session revocation.'),
            }
            title, body = notes.get(name, ('MANDATE', 'Prepare the owner-approved task.'))
            self.text(d, (22, 22), title, 15, '#8ebcff', True)
            y = 70
            for line in body.split('\n'):
                self.wrapped(d, (22, y), line, rect[2]-44, 16, '#ced9e9', 24)
                y += 42
            return im

    painter = Painter(edit['composition'])
    frames = json.loads((take / 'frames.json').read_text())
    audit, cursor, previous, loaded = [], 0., None, {}
    fps = 30
    process = None
    if not args.posters_only:
        process = subprocess.Popen([
            '/opt/homebrew/bin/ffmpeg', '-hide_banner', '-v', 'error', '-y',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '2560x1440', '-r', str(fps), '-i', 'pipe:0',
            '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-threads', '2',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)
        ], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for index, shot in enumerate(edit['shots']):
            tracks = {}
            for camera, track in shot['tracks'].items():
                if 'file' in track:
                    rows = [{'file': track['file'], 'capturedAt': track['capturedAt'], 'take': 'formal-take-01'}]
                else:
                    rows = [f for f in frames if f['camera'] == camera and f['label'] == track['label']]
                if not rows or any(r['take'] != 'formal-take-01' for r in rows):
                    raise ValueError('Missing captured source: '+str(track))
                first = datetime.fromisoformat(rows[0]['capturedAt']).timestamp()
                tracks[camera] = [(datetime.fromisoformat(r['capturedAt']).timestamp()-first, r) for r in rows]
                audit.append({'shot': index+1, 'videoStart': cursor, 'videoEnd': cursor+shot['seconds'],
                              'camera': camera, 'source': track, 'sourceFrames': len(rows),
                              'firstCapturedAt': rows[0]['capturedAt'], 'lastCapturedAt': rows[-1]['capturedAt'],
                              'sourceSHA256': {r['file']: hashlib.sha256((take/r['file']).read_bytes()).hexdigest() for r in rows},
                              'pacing': 'Original source order at 1x; last view held for narration'})
            count = round(shot['seconds'] * fps)
            render_numbers = [45] if args.posters_only else range(count)
            frame_bytes, previous_key = None, None
            for number in render_numbers:
                local = number/fps
                changed = False
                for camera, rows in tracks.items():
                    row = rows[0][1]
                    for at, candidate in rows:
                        if at > local:
                            break
                        row = candidate
                    track = shot['tracks'][camera]
                    key = (row['file'], tuple(track.get('crop', [])))
                    if loaded.get(camera) != key:
                        path = (take/row['file']).resolve()
                        if not path.is_relative_to(take):
                            raise ValueError('Source path outside take')
                        source = Image.open(path).convert('RGB')
                        if track.get('crop'):
                            x0,y0,x1,y1 = track['crop']
                            if not (0<=x0<x1<=source.width and 0<=y0<y1<=source.height):
                                raise ValueError('Crop outside source '+str(key))
                            source = source.crop(track['crop'])
                        painter.sources[camera] = source
                        painter.cache.clear()
                        loaded[camera] = key
                        changed = True
                cue = next(c for c in edit['captions'] if c['start'] <= cursor+local < c['end']+.0001)
                key = (cue['text'], min(number, 20))
                if changed or previous_key != key or frame_bytes is None:
                    scene = {**shot, 'caption': cue['text']}
                    image = painter.frame(scene, previous, local)
                    d = ImageDraw.Draw(image)
                    painter.text(d, (40, 107), shot.get('note', ''), 10, '#71849f')
                    frame_bytes = image.tobytes()
                    previous_key = key
                if number == 45:
                    image.save(posters/f'{index+1:02}-{shot["id"]}.png')
                if process:
                    process.stdin.write(frame_bytes)
            cursor += shot['seconds']
            previous = shot
            print(json.dumps({'shot': index+1, 'seconds': cursor, 'postersOnly': args.posters_only}), flush=True)
    finally:
        if process:
            process.stdin.close()
    if process:
        error = process.stderr.read().decode()
        if process.wait() != 0:
            raise RuntimeError(error)
        media = subprocess.run(['/opt/homebrew/bin/ffprobe', '-v', 'error', '-show_entries',
                                'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', str(output)],
                               capture_output=True, text=True, check=True)
        subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-v','error','-i',str(output),'-f','null','-'], check=True)
        report = {'schemaVersion': 1, 'status': 'Picture edit complete; awaiting user voice-over',
                  'seconds': cursor, 'chainId': 84532, 'takeId': 'formal-take-01',
                  'originalUIFramesOnly': True, 'offlineCompositor': True,
                  'systemViewAlwaysRetained': True, 'audioIncluded': False,
                  'media': json.loads(media.stdout), 'decodeCheck': 'passed',
                  'editingDisclosures': edit['editingDisclosures'], 'audit': audit,
                  'editSHA256': hashlib.sha256(args.edit.read_bytes()).hexdigest()}
        output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    main()
