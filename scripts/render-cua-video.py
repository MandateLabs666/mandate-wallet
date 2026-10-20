#!/usr/bin/env python3
"""Encode genuine CUA screenshot sequences without controlling any UI.

This produces a capture-method preview, not competition acceptance evidence.
Frame timestamps, scene boundaries and source hashes remain in the sidecar.
"""
import argparse
import hashlib
import json
import subprocess
from collections import OrderedDict
from datetime import datetime
from pathlib import Path


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def quoted(path):
    return "'" + str(path).replace("'", "'\\''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.manifest.resolve()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    parts_dir = output.parent / (output.stem + "-parts")
    parts_dir.mkdir(exist_ok=True)
    groups = OrderedDict()
    frames = json.loads(source.read_text())
    if not frames:
        raise ValueError("No captured frames")
    for frame in frames:
        path = (source.parent / frame["file"]).resolve()
        if not path.is_relative_to(source.parent) or not path.is_file():
            raise ValueError("Invalid source frame path")
        groups.setdefault(frame["label"], []).append((frame, path))
    parts, scenes = [], []
    for number, (label, rows) in enumerate(groups.items(), 1):
        at = [datetime.fromisoformat(row[0]["capturedAt"]).timestamp() for row in rows]
        deltas = [b - a for a, b in zip(at, at[1:])]
        if any(delta <= 0 for delta in deltas):
            raise ValueError("Frame timestamps must increase within each scene")
        # The final still has no observed successor; hold it for one source interval.
        tail = sorted(deltas)[len(deltas) // 2] if deltas else 1 / 12
        durations = deltas + [tail]
        sequence = parts_dir / f"{number:02}.ffconcat"
        sequence.write_text("ffconcat version 1.0\n" + "".join(
            f"file {quoted(path)}\nduration {seconds:.6f}\n"
            for (_, path), seconds in zip(rows, durations)
        ) + f"file {quoted(rows[-1][1])}\n")
        part = parts_dir / f"{number:02}.mp4"
        run("/opt/homebrew/bin/ffmpeg", "-hide_banner", "-v", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(sequence), "-vf",
            "scale=1920:1080:force_original_aspect_ratio=decrease,"
            "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0b0d11,setsar=1,fps=30,format=yuv420p",
            "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-threads", "2", "-movflags", "+faststart", str(part))
        parts.append(part)
        scenes.append({"label": label, "sourceFrames": len(rows),
                       "sourceSeconds": sum(durations),
                       "firstCapturedAt": rows[0][0]["capturedAt"],
                       "lastCapturedAt": rows[-1][0]["capturedAt"],
                       "frames": [{"file": row["file"], "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                                  for row, path in rows]})
    sequence = parts_dir / "parts.ffconcat"
    sequence.write_text("ffconcat version 1.0\n" + "".join(f"file {quoted(p)}\n" for p in parts))
    run("/opt/homebrew/bin/ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "concat",
        "-safe", "0", "-i", str(sequence), "-c", "copy", "-movflags", "+faststart", str(output))
    media = json.loads(run("/opt/homebrew/bin/ffprobe", "-v", "error", "-show_entries",
                          "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", str(output)))
    run("/opt/homebrew/bin/ffmpeg", "-hide_banner", "-v", "error", "-i", str(output), "-f", "null", "-")
    report = {"status": "capture-method preview; not a completed competition demo",
              "captureMethod": "Actual CUA screenshot frames; elapsed gaps between scenes removed",
              "composition": "Aspect ratio preserved; padded to 1920x1080; repeated frames at 30 fps",
              "generatedUIFrames": False, "containsAudio": False, "media": media, "scenes": scenes}
    output.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "scenes": len(scenes), "sourceFrames": len(frames), "media": media}))


if __name__ == "__main__":
    main()
