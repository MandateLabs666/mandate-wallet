#!/usr/bin/env python3
"""Render an animated layout preview from genuine captured application views.

All application pixels come from the supplied screenshots. This offline
compositor does not launch or control browsers, wallets, or agent applications.
"""
import argparse
import hashlib
import json
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


LAYOUTS = {
    "workspace": {
        "system": (32, 130, 1360, 780, 1),
        "claude": (1416, 130, 472, 244, 1),
        "rabby": (1416, 398, 472, 244, 1),
        "explorer": (1416, 666, 472, 244, 1),
    },
    "wallet": {
        "system": (32, 130, 1012, 780, 1),
        "rabby": (1068, 130, 576, 780, 1),
        "claude": (1668, 130, 220, 378, 1),
        "explorer": (1668, 532, 220, 378, 1),
    },
    "agent": {
        "claude": (32, 130, 1216, 780, 1),
        "system": (1272, 130, 616, 280, 1),
        "rabby": (1272, 434, 296, 476, 1),
        "explorer": (1592, 434, 296, 476, 1),
    },
    "proof": {
        "system": (32, 130, 902, 780, 1),
        "explorer": (958, 130, 930, 780, 1),
        "claude": (1416, 130, 472, 244, 0),
        "rabby": (1416, 398, 472, 244, 0),
    },
}

for layout in LAYOUTS.values():
    assert layout["system"][2] >= 600 and layout["system"][4] == 1


class Compositor:
    def __init__(self, config):
        self.config = config
        self.width, self.height = config.get("size", [2560, 1440])
        if self.width * 9 != self.height * 16:
            raise ValueError("Use a 16:9 canvas")
        self.scale = self.width / 1920
        self.sources = {}
        self.cache = {}
        for name, camera in config["cameras"].items():
            if camera.get("file"):
                self.sources[name] = Image.open(camera["file"]).convert("RGB")
        self.font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
        self.bold_path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
        self.fonts = {}

    def unit(self, value):
        return round(value * self.scale)

    def font(self, size, bold=False):
        key = (self.unit(size), bold)
        if key not in self.fonts:
            self.fonts[key] = ImageFont.truetype(self.bold_path if bold else self.font_path, key[0])
        return self.fonts[key]

    def text(self, draw, xy, value, size=20, fill="#eaf1fc", bold=False):
        draw.text(tuple(self.unit(v) for v in xy), value, font=self.font(size, bold), fill=fill)

    def fit_text(self, value, width, size):
        draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))
        while value and draw.textlength(value, font=self.font(size)) > width:
            value = value[:-1]
        return value

    def wrapped(self, draw, xy, value, max_width, size, fill, line_height):
        words = value.split()
        line = ""
        x, y = xy
        for word in words:
            candidate = (line + " " + word).strip()
            if line and draw.textlength(candidate, font=self.font(size)) > self.unit(max_width):
                self.text(draw, (x, y), line, size, fill)
                y += line_height
                line = word
            else:
                line = candidate
        if line:
            self.text(draw, (x, y), line, size, fill)

    def camera(self, name, rect, active):
        _, _, width, height, opacity = rect
        w, h = self.unit(width), self.unit(height)
        if opacity < 0.01 or w < self.unit(90) or h < self.unit(80):
            return None
        key = (name, w, h, active)
        if key in self.cache:
            return self.cache[key]
        # Bound the cache while animated sizes change.
        if len(self.cache) > 24:
            self.cache.clear()
        card = Image.new("RGB", (w, h), "#10151e")
        draw = ImageDraw.Draw(card)
        radius, bar = self.unit(12), self.unit(42)
        border = "#559eff" if active else "#2b3647"
        draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill="#10151e")
        draw.rectangle((1, bar, w - 2, h - 2), fill="#0c1017")
        camera = self.config["cameras"][name]
        compact = width < 320
        label = camera.get("shortTitle", camera["title"]) if compact else camera["title"]
        label_size = 13 if compact else 16
        dot = self.unit(6)
        draw.ellipse((self.unit(14), self.unit(18), self.unit(14) + dot, self.unit(18) + dot), fill=border)
        label = self.fit_text(label, max(1, w - self.unit(54)), label_size)
        self.text(draw, (30, 12), label, label_size, bold=True)
        content_w, content_h = w - self.unit(12), h - bar - self.unit(12)
        if name in self.sources:
            source = self.sources[name]
            ratio = min(content_w / source.width, content_h / source.height)
            fitted = source.resize((max(1, round(source.width * ratio)), max(1, round(source.height * ratio))), Image.Resampling.LANCZOS)
            card.paste(fitted, ((w - fitted.width) // 2, bar + (h - bar - fitted.height) // 2))
        else:
            mid_x, mid_y = w // 2, bar + content_h // 2
            small = width < 500
            title = "Awaiting capture" if small else "Awaiting this run's transaction"
            size = 14 if small else 24
            text_w = draw.textlength(title, font=self.font(size, True))
            draw.text((mid_x - text_w / 2, mid_y - self.unit(15)), title,
                      font=self.font(size, True), fill="#a9bad2")
            if not small:
                note = "Fresh Base Sepolia evidence will appear here."
                note_w = draw.textlength(note, font=self.font(16))
                draw.text((mid_x - note_w / 2, mid_y + self.unit(28)), note,
                          font=self.font(16), fill="#71849f")
        draw.rounded_rectangle((1, 1, w - 2, h - 2), radius=radius, outline=border,
                               width=self.unit(2 if active else 1))
        self.cache[key] = card
        return card

    def frame(self, scene, previous, local_time):
        image = Image.new("RGB", (self.width, self.height), "#080b10")
        draw = ImageDraw.Draw(image)
        self.text(draw, (40, 27), "mandate", 34, bold=True)
        self.text(draw, (222, 43), "AGENT WALLET", 13, "#7f94b1")
        self.text(draw, (40, 88), scene["title"], 18, "#d6e4fa", True)
        self.text(draw, (1468, 35), "BASE SEPOLIA", 15, "#8ebcff", True)
        self.text(draw, (1650, 35), self.config.get("badge", "LAYOUT PREVIEW"), 14, "#f2bd6e", True)
        draw.line((self.unit(32), self.unit(114), self.unit(1888), self.unit(114)), fill="#253044")
        current = LAYOUTS[scene["mode"]]
        before = LAYOUTS[previous["mode"]] if previous else current
        fraction = min(1.0, max(0.0, local_time / 0.65))
        ease = fraction * fraction * (3 - 2 * fraction)
        rects = {name: tuple(a + (b - a) * ease for a, b in zip(before[name], current[name]))
                 for name in current}
        focus = {"workspace": "system", "wallet": "rabby", "agent": "claude", "proof": "explorer"}[scene["mode"]]
        # Keep the system on top while panels move past each other, so an
        # expanding agent/wallet panel cannot briefly cover it completely.
        order = [n for n in rects if n != focus] + [focus]
        if previous and fraction < 1:
            order = [name for name in order if name != "system"] + ["system"]
        for name in order:
            rect = rects[name]
            card = self.camera(name, rect, name == focus)
            if card is None:
                continue
            position = (self.unit(rect[0]), self.unit(rect[1]))
            if rect[4] >= 0.999:
                image.paste(card, position)
            else:
                mask = Image.new("L", card.size, round(255 * rect[4]))
                image.paste(card, position, mask)
        draw = ImageDraw.Draw(image)
        draw.line((self.unit(32), self.unit(934), self.unit(1888), self.unit(934)), fill="#253044")
        self.text(draw, (40, 951), "VIEW FOCUS", 12, "#7f94b1", True)
        self.text(draw, (154, 947), self.config["cameras"][focus]["title"], 18, "#8ebcff", True)
        self.wrapped(draw, (40, 983), scene["caption"], 1800, 23, "#eef4ff", 30)
        self.text(draw, (40, 1054), self.config.get("footnote", "Captured views from different times · No new transaction or connector installation is demonstrated"), 12, "#71849f")
        return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    if config.get("purpose") != "layout-preview":
        raise ValueError("This renderer is for layout previews, not final-demo acceptance")
    for scene in config["scenes"]:
        if scene["mode"] not in LAYOUTS or scene["seconds"] <= 0:
            raise ValueError("Invalid scene")
    compositor = Compositor(config)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    fps = config.get("fps", 30)
    args_ffmpeg = ["/opt/homebrew/bin/ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "rawvideo",
                   "-pix_fmt", "rgb24", "-s", f"{compositor.width}x{compositor.height}", "-r", str(fps),
                   "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                   "-threads", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)]
    process = subprocess.Popen(args_ffmpeg, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    counts = []
    try:
        previous = None
        for index, scene in enumerate(config["scenes"]):
            count = math.ceil(scene["seconds"] * fps)
            poster_at = min(count - 1, round(fps * 1.1))
            for frame in range(count):
                image = compositor.frame(scene, previous, frame / fps)
                if frame == poster_at:
                    image.save(output.parent / f"layout-{index + 1:02}-{scene['mode']}.png")
                process.stdin.write(image.tobytes())
            counts.append(count)
            previous = scene
            print(json.dumps({"scene": scene["mode"], "frames": count}), flush=True)
    finally:
        process.stdin.close()
    error = process.stderr.read().decode()
    if process.wait() != 0:
        raise RuntimeError(error)
    check = subprocess.run(["/opt/homebrew/bin/ffprobe", "-v", "error", "-show_entries",
                            "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", str(output)],
                           check=True, capture_output=True, text=True)
    subprocess.run(["/opt/homebrew/bin/ffmpeg", "-hide_banner", "-v", "error", "-i", str(output),
                    "-f", "null", "-"], check=True)
    sources = {}
    for name, camera in config["cameras"].items():
        sources[name] = {**camera}
        if camera.get("file"):
            sources[name]["sha256"] = hashlib.sha256(Path(camera["file"]).read_bytes()).hexdigest()
        else:
            sources[name]["placeholder"] = True
    report = {"purpose": "layout-preview", "completedDemo": False, "newPublicTransactions": 0,
              "systemViewVisibleInEveryLayout": True, "systemOnTopDuringTransitions": True,
              "transitionSeconds": 0.65,
              "applicationPixels": "Unaltered genuine screenshots, scaled to fit each panel",
              "captureSynchronization": "Source screenshots were captured at different times",
              "sources": sources, "scenes": config["scenes"], "renderedFrames": sum(counts),
              "media": json.loads(check.stdout)}
    output.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "media": report["media"]}), flush=True)


if __name__ == "__main__":
    main()
