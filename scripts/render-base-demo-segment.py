#!/usr/bin/env python3
"""Compose recorded deployment or funding segments from this take's UI frames."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
from datetime import datetime
from pathlib import Path

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("take", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--section", choices=["deployment", "funding"], default="deployment")
    args = parser.parse_args()
    take = args.take.resolve()
    frames = json.loads((take / "frames.json").read_text())
    evidence_file = take / ("funding-evidence.json" if args.section == "funding" else "deployment-evidence.json")
    evidence = json.loads(evidence_file.read_text())
    metadata = json.loads((take / "take.json").read_text())
    if args.section == "funding":
        if len(evidence["observations"]) < 2 or not all(
            o["status"] == "verified" and o["walletUSDCAtomic"] == "150000"
            and o["operatorETHWei"] == "1000000000000000"
            and len(o["transactions"]) == 2
            and all(t["status"] == "success" and t["canonicalAtRead"] and t["intentMatches"]
                    for t in o["transactions"]) for o in evidence["observations"]
        ):
            raise ValueError("Matching funding transactions and balances from two RPCs are required")
    elif not all(o["status"] == "success" and o["canonicalAtRead"] for o in evidence["observations"]):
        raise ValueError("Confirmed, checked deployment evidence is required")
    spec = importlib.util.spec_from_file_location("multiview", Path(__file__).with_name("render-multiview-preview.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    config = {"size": [2560, 1440], "badge": "RECORDED SEGMENT",
              "footnote": f"Actual testnet {args.section} · Views retained between actions · Waiting periods cut · No voice-over yet",
              "cameras": {
                  "system": {"title": "Mandate | Request context", "shortTitle": "Mandate"},
                  "rabby": {"title": "Rabby | Captured wallet view", "shortTitle": "Rabby"},
                  "claude": {"title": "Claude Desktop", "shortTitle": "Claude"},
                  "explorer": {"title": f"BaseScan | This {args.section}", "shortTitle": "BaseScan"}}}
    painter = module.Compositor(config)
    scenes = [
        {"mode": "workspace", "seconds": 4, "title": "01 / Choose Base Sepolia",
         "caption": "Choose Base Sepolia in the setup wizard. The owner wallet already holds test ETH and test USDC.",
         "tracks": {"system": "choose-base-sepolia"}},
        {"mode": "wallet", "seconds": 4, "title": "02 / Connect the test owner",
         "caption": "Connect the test owner wallet. Verify the Base Sepolia network and the local Mandate origin in Rabby.",
         "tracks": {"rabby": "connect-review"}},
        {"mode": "workspace", "seconds": 4, "title": "03 / Prepare the smart account",
         "caption": "The wizard calculates a new smart-account address and prepares separate deployment, funding and permission steps.",
         "tracks": {"system": "review-public-setup"}},
        {"mode": "wallet", "seconds": 5, "title": "04 / Review the deployment request",
         "caption": "Review the factory address, chain and owner. This deployment transfers zero ETH, apart from the testnet transaction fee.",
         "tracks": {"system": "deploy-transaction-review", "rabby": "deploy-signing-review"}},
        {"mode": "wallet", "seconds": 4, "title": "05 / Confirm the deployment",
         "caption": "The owner authorizes this specific transaction. Rabby signs and broadcasts it once; the wizard retains the original hash.",
         "tracks": {"rabby": "deploy-final-confirmation"}},
        {"mode": "proof", "seconds": 6, "title": "06 / Verify the same transaction",
         "caption": "The confirmed account address and transaction hash match the successful BaseScan receipt. Two RPC providers also verify the owner and asset.",
         "tracks": {"system": "deploy-confirmed", "explorer": "deployment-basescan-overview"}},
    ]
    if args.section == "funding":
        scenes = [
            {"mode": "wallet", "seconds": 5, "title": "01 / Fund operator gas separately",
             "caption": "The owner funds the operator with 0.001 test ETH. This pays network gas separately from the USDC purchase budget.",
             "tracks": {"system": "gas-funding-confirmed", "rabby": "gas-funding-review"}},
            {"mode": "workspace", "seconds": 5, "title": "02 / Review the purchase funds",
             "caption": "The separate token transfer sends 0.15 native test USDC to the new smart wallet. Both funding transactions are confirmed.",
             "tracks": {"system": "usdc-funding-review"}},
            {"mode": "proof", "seconds": 7, "title": "03 / Verify receipt and destination",
             "caption": "BaseScan shows the same 0.15-USDC transfer to the smart wallet. Two RPC providers confirm the transaction and resulting balance.",
             "tracks": {"system": "funding-confirmed", "explorer": "funding-basescan-overview"}},
        ]
    fps = 30
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    command = ["/opt/homebrew/bin/ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "rawvideo",
               "-pix_fmt", "rgb24", "-s", "2560x1440", "-r", str(fps), "-i", "pipe:0", "-an",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "2",
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    loaded, audit, cursor, previous = {}, [], 0, None
    try:
        for index, scene in enumerate(scenes):
            tracks = {}
            for camera, label in scene["tracks"].items():
                rows = [row for row in frames if row["camera"] == camera and row["label"] == label]
                if not rows or any(row["take"] != "formal-take-01" for row in rows):
                    raise ValueError("Missing same-take camera frames: " + label)
                start = datetime.fromisoformat(rows[0]["capturedAt"]).timestamp()
                tracks[camera] = [(datetime.fromisoformat(row["capturedAt"]).timestamp() - start, row) for row in rows]
                audit.append({"scene": index + 1, "camera": camera, "label": label,
                              "sourceFrames": len(rows), "firstCapturedAt": rows[0]["capturedAt"],
                              "lastCapturedAt": rows[-1]["capturedAt"], "videoStartSeconds": cursor,
                              "videoEndSeconds": cursor + scene["seconds"],
                              "pacing": "Original source order at 1x, then hold the last view for narration"})
            count = round(scene["seconds"] * fps)
            for number in range(count):
                local = number / fps
                for camera, rows in tracks.items():
                    row = rows[0][1]
                    for at, candidate in rows:
                        if at > local:
                            break
                        row = candidate
                    if loaded.get(camera) != row["file"]:
                        path = (take / row["file"]).resolve()
                        if not path.is_relative_to(take):
                            raise ValueError("Invalid source frame path")
                        painter.sources[camera] = Image.open(path).convert("RGB")
                        painter.cache.clear()
                        loaded[camera] = row["file"]
                image = painter.frame(scene, previous, local)
                if number == min(count - 1, 45):
                    image.save(take / f"{output.stem}-scene-{index + 1:02}.png")
                process.stdin.write(image.tobytes())
            previous = scene
            cursor += scene["seconds"]
            print(json.dumps({"scene": index + 1, "seconds": cursor}), flush=True)
    finally:
        process.stdin.close()
    error = process.stderr.read().decode()
    if process.wait() != 0:
        raise RuntimeError(error)
    subprocess.run(["/opt/homebrew/bin/ffmpeg", "-hide_banner", "-v", "error", "-i", str(output),
                    "-f", "null", "-"], check=True)
    transactions = ([{"hash": evidence["observations"][0]["hash"], "explorer": evidence["explorer"]}]
                    if args.section == "deployment" else
                    [{"hash": t["hash"], "kind": t["kind"], "explorer": "https://sepolia.basescan.org/tx/" + t["hash"]}
                     for t in evidence["observations"][0]["transactions"]])
    report = {"takeId": "formal-take-01", "status": f"Recorded {args.section} segment; full demo incomplete",
              "completedDemo": False, "seconds": cursor, "size": [2560, 1440], "fps": fps,
              "chainId": metadata["network"]["chainId"], "wallet": metadata["wallet"],
              "transactions": transactions,
              "originalUIFramesOnly": True, "systemViewAlwaysRetained": True, "audit": audit,
              "excludedMaterial": ["Historical rehearsal screenshots", "Earlier manual Claude extension settings",
                                   "Explorer auto-decoded factory event labels do not match the pinned ABI",
                                   "Wallet submitting frame may already show the closed notification's parent page"],
              "evidenceSHA256": hashlib.sha256(evidence_file.read_bytes()).hexdigest()}
    output.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "seconds": cursor, "completedDemo": False}), flush=True)


if __name__ == "__main__":
    main()
