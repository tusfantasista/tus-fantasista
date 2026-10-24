#!/usr/bin/env python3
"""Render the silent, 30-second FESTA dance invitation from published photos.

Requires Pillow, an FFmpeg build with libx264, and a Japanese font. All source
paths are relative to --repo-root; intermediate files stay under --work-dir.
The only public outputs are the dated MP4 and its WebP poster. No Facebook
video, earlier video edit, music, or generated image is used.

Example:
  python3 scripts/render-dance-invitation.py --repo-root . \
    --work-dir /tmp/festa-dance-movie --ffmpeg /path/to/ffmpeg
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import unicodedata

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


WIDTH, HEIGHT, FPS = 1280, 720, 24
DURATION = 30.0
BASENAME = "festa60-dance-invitation-20261025"
CREAM = (255, 248, 229, 255)
GOLD = (255, 209, 91, 255)
NAVY = (7, 18, 28, 255)

# Labels preserve the published event/date wording. In particular, the 2025
# gallery is labelled "2025年度", not asserted to have been shot in calendar 2025.
SCENES = [
    {
        "id": "life", "start": 0.0, "end": 4.0,
        "image": "public/assets/img/gallery/festa-2023/festa-2023-03.jpg",
        "source_page": "public/gallery/index.html",
        "source_caption": "FANTASISTA FESTA 2023 ダンスタイム",
        "label": ["FANTASISTA FESTA 2023｜ダンスタイム"],
        "lines": ["大学で出会ったダンスを、", "これからの人生へ。"],
        "layout": "landscape", "center_y": 0.25, "font_size": 54,
    },
    {
        "id": "student_days", "start": 4.0, "end": 8.0,
        "image": "public/assets/img/festa60/founding-decade/1960s-training.webp",
        "source_page": "public/assets/data/public-photo-library.json",
        "source_caption": "1960年代後半 創部初期の練習風景",
        "label": ["1960年代後半｜創部初期の練習風景"],
        "lines": ["初めてのホールド。", "夢中で練習した四年間。"],
        "layout": "landscape", "center_y": 0.38, "font_size": 54,
    },
    {
        "id": "again", "start": 8.0, "end": 12.0,
        "image": "public/assets/img/archive/2017-2026/2443249799144767.webp",
        "source_page": "public/assets/data/public-photo-library.json",
        "source_caption": "2021年OBOG練習会",
        "label": ["2021年｜OBOG練習会"],
        "lines": ["久しぶりでも、", "また踊る楽しさがある。"],
        "layout": "landscape", "center_y": 0.35, "font_size": 54,
    },
    {
        "id": "enjoy", "start": 12.0, "end": 16.0,
        "image": "public/assets/img/gallery/festa-2025/festa-2025-16.jpg",
        "source_page": "public/gallery/index.html",
        "source_caption": "2025年度 FANTASISTA FESTA 交流の一場面",
        "label": ["2025年度 FANTASISTA FESTA", "交流の一場面"],
        "lines": ["仲間と、", "踊って、笑って。"],
        "layout": "portrait", "font_size": 58,
    },
    {
        "id": "next_generation", "start": 16.0, "end": 20.0,
        "image": "public/assets/img/archive/2017-2026/122133971031193463.webp",
        "source_page": "public/assets/data/public-photo-library.json",
        "source_caption": "2026年春東部",
        "label": ["2026年｜春東部"],
        "lines": ["この楽しさを、", "次の世代へ。"],
        "layout": "portrait", "font_size": 58,
    },
    {
        "id": "gather", "start": 20.0, "end": 25.0,
        "image": "public/assets/img/gallery/festa-2023/festa-2023-06.jpg",
        "source_page": "public/gallery/index.html",
        "source_caption": "FANTASISTA FESTA 2023 フロアの一場面",
        "label": ["FANTASISTA FESTA 2023｜フロアの一場面"],
        "lines": ["もう一度、集まろう。", "もう一度、歴史を動かそう。"],
        "layout": "landscape", "center_y": 0.25, "font_size": 54,
    },
    {
        "id": "invitation", "start": 25.0, "end": 30.0,
        "image": None, "source_page": None, "source_caption": None,
        "label": [],
        "lines": ["東京理科大学舞踏研究部", "60周年記念FESTA",
                  "2027年2月11日（木・祝）", "参加申込へ",
                  "特設サイトからお申し込みください。"],
        "layout": "endcard",
    },
]


def choose_font(explicit: Path | None) -> Path:
    if explicit:
        if not explicit.is_file():
            raise FileNotFoundError(explicit)
        return explicit
    font_dir = Path("/System/Library/Fonts")
    for weight in ("W6", "W5", "W4"):
        for path in sorted(font_dir.glob("*.ttc")):
            name = unicodedata.normalize("NFC", path.name)
            if "ヒラギノ角ゴシック" in name and weight in name:
                return path
    raise RuntimeError("A Japanese font is required; supply --font /path/to/font")


def top_level_atoms(path: Path) -> list[str]:
    """Check that faststart placed moov before the media payload."""
    atoms = []
    total = path.stat().st_size
    with path.open("rb") as stream:
        while stream.tell() < total:
            header = stream.read(8)
            if len(header) != 8:
                break
            size, kind = struct.unpack(">I4s", header)
            header_size = 8
            if size == 1:
                size = struct.unpack(">Q", stream.read(8))[0]
                header_size = 16
            elif size == 0:
                size = total - stream.tell() + 8
            if size < header_size:
                raise ValueError("Invalid MP4 atom size")
            atoms.append(kind.decode("ascii", errors="replace"))
            stream.seek(size - header_size, 1)
    return atoms


class Renderer:
    def __init__(self, repo: Path, font_path: Path):
        self.repo = repo
        self.font_path = font_path
        self.font_cache: dict[int, ImageFont.FreeTypeFont] = {}
        self.sources: dict[str, Image.Image] = {}
        self.backgrounds: dict[str, Image.Image] = {}
        self.overlays: dict[str, Image.Image] = {}
        for scene in SCENES:
            if scene["image"]:
                path = repo / scene["image"]
                self.sources[scene["id"]] = ImageOps.exif_transpose(
                    Image.open(path)
                ).convert("RGB")
            if scene["layout"] == "portrait":
                source = self.sources[scene["id"]]
                bg = ImageOps.fit(source, (WIDTH, HEIGHT), Image.Resampling.LANCZOS)
                bg = bg.filter(ImageFilter.GaussianBlur(48))
                self.backgrounds[scene["id"]] = ImageEnhance.Brightness(bg).enhance(0.29)
            if scene["layout"] != "endcard":
                self.overlays[scene["id"]] = self.overlay(scene)
        self.card = self.endcard()

    def font(self, size: int) -> ImageFont.FreeTypeFont:
        if size not in self.font_cache:
            self.font_cache[size] = ImageFont.truetype(str(self.font_path), size)
        return self.font_cache[size]

    def text(self, draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str,
             size: int, color=CREAM, max_width: int = 1152, shadow: bool = True) -> None:
        while draw.textlength(text, font=self.font(size)) > max_width:
            size -= 1
        x, y = xy
        if shadow:
            draw.text((x + 1, y + 2), text, font=self.font(size), anchor="lt",
                      fill=(0, 0, 0, 205), stroke_width=2,
                      stroke_fill=(0, 0, 0, 130))
        draw.text((x, y), text, font=self.font(size), anchor="lt", fill=color)

    def centered(self, draw: ImageDraw.ImageDraw, y: int, text: str,
                 size: int, color=CREAM) -> None:
        width = draw.textlength(text, font=self.font(size))
        self.text(draw, ((WIDTH - width) / 2, y), text, size, color, shadow=False)

    def overlay(self, scene: dict) -> Image.Image:
        overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        portrait = scene["layout"] == "portrait"
        if portrait:
            # Text occupies the left; the unblurred portrait begins at x=744.
            # A gentle horizontal scrim removes distracting duplicate faces.
            for x in range(780):
                opacity = int(180 * max(0.0, 1.0 - x / 780) ** 0.40)
                draw.line((x, 0, x, HEIGHT), fill=(5, 14, 22, opacity))
            for i, line in enumerate(scene["label"]):
                self.text(draw, (64, 48 + 34 * i), line, 23,
                          max_width=620, shadow=False)
            for i, line in enumerate(scene["lines"]):
                self.text(draw, (64, 291 + 86 * i), line, scene["font_size"],
                          GOLD if i == 1 else CREAM, max_width=620)
            return overlay
        # Faces stay in the upper/middle image; the main copy sits over the floor.
        for y in range(HEIGHT):
            bottom = 235 * max(0, (y - 392) / (HEIGHT - 392)) ** 0.82
            top = 112 * max(0, 1 - y / 150)
            opacity = round(max(bottom, top))
            if opacity:
                draw.line((0, y, WIDTH, y), fill=(5, 13, 21, opacity))
        self.text(draw, (64, 35), scene["label"][0], 23, max_width=1130)
        for i, line in enumerate(scene["lines"]):
            self.text(draw, (64, 538 + i * 77), line, scene["font_size"],
                      GOLD if scene["id"] == "life" and i == 1 else CREAM)
        return overlay

    def endcard(self) -> Image.Image:
        card = Image.new("RGBA", (WIDTH, HEIGHT), NAVY)
        draw = ImageDraw.Draw(card)
        # Subtle code-drawn light and arcs; no additional photo or generated art.
        for y in range(HEIGHT):
            tint = int(9 * (1 - abs(y - 320) / HEIGHT))
            draw.line((0, y, WIDTH, y), fill=(7 + tint, 18 + tint, 28 + tint, 255))
        draw.arc((850, -150, 1520, 520), 80, 275, fill=(62, 69, 65, 255), width=2)
        draw.arc((-180, 480, 540, 1200), 190, 355, fill=(55, 64, 63, 255), width=2)
        self.centered(draw, 114, SCENES[-1]["lines"][0], 30)
        self.centered(draw, 191, SCENES[-1]["lines"][1], 78, GOLD)
        draw.line((433, 309, 847, 309), fill=(163, 143, 82, 255), width=2)
        self.centered(draw, 357, SCENES[-1]["lines"][2], 53)
        draw.rounded_rectangle((454, 484, 826, 563), radius=39, fill=GOLD)
        self.centered(draw, 506, SCENES[-1]["lines"][3], 37, NAVY)
        self.centered(draw, 600, SCENES[-1]["lines"][4], 25)
        return card.convert("RGB")

    def scene_frame(self, scene: dict, progress: float) -> Image.Image:
        if scene["layout"] == "endcard":
            return self.card.copy()
        source = self.sources[scene["id"]]
        if scene["layout"] == "portrait":
            frame = self.backgrounds[scene["id"]].copy()
            # Contain preserves the complete hold, expression and foot placement.
            portrait = ImageOps.contain(source, (496, HEIGHT), Image.Resampling.LANCZOS)
            frame.paste(portrait, (WIDTH - portrait.width - 40, (HEIGHT - portrait.height) // 2))
        else:
            # A 1.2% total push is deliberately restrained; no lateral panning.
            eased = 0.5 - 0.5 * math.cos(math.pi * progress)
            zoom = 1.0 + 0.012 * eased
            base = ImageOps.fit(source, (round(WIDTH * zoom), round(HEIGHT * zoom)),
                                Image.Resampling.LANCZOS,
                                centering=(0.5, scene["center_y"]))
            left = (base.width - WIDTH) // 2
            top = (base.height - HEIGHT) // 2
            frame = base.crop((left, top, left + WIDTH, top + HEIGHT))
        frame = frame.convert("RGBA")
        frame.alpha_composite(self.overlays[scene["id"]])
        return frame.convert("RGB")

    def frame(self, when: float) -> Image.Image:
        index = min(len(SCENES) - 1, next(
            (i for i, scene in enumerate(SCENES) if when < scene["end"]), len(SCENES) - 1
        ))
        scene = SCENES[index]
        progress = (when - scene["start"]) / (scene["end"] - scene["start"])
        current = self.scene_frame(scene, progress)
        transition = 0.28
        if index > 0 and when - scene["start"] < transition:
            previous = self.scene_frame(SCENES[index - 1], 1.0)
            alpha = max(0.0, (when - scene["start"]) / transition)
            alpha = alpha * alpha * (3 - 2 * alpha)
            current = Image.blend(previous, current, alpha)
        return current


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--ffmpeg", type=Path)
    parser.add_argument("--font", type=Path)
    args = parser.parse_args()
    repo = args.repo_root.resolve()
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    ffmpeg = str(args.ffmpeg.resolve()) if args.ffmpeg else shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg is required; supply --ffmpeg /path/to/ffmpeg")
    public_out = repo / "public/assets/video"
    public_out.mkdir(parents=True, exist_ok=True)
    video = public_out / f"{BASENAME}.mp4"
    poster = public_out / f"{BASENAME}-poster.webp"
    renderer = Renderer(repo, choose_font(args.font))
    renderer.scene_frame(SCENES[0], 0.40).save(poster, "WEBP", quality=88, method=6)
    total_frames = round(DURATION * FPS)
    encode_log = work / "encode.log"
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "warning", "-y",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", f"{WIDTH}x{HEIGHT}",
        "-framerate", str(FPS), "-i", "pipe:0", "-an", "-frames:v", str(total_frames),
        "-vf", "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p",
        "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage", "-crf", "25",
        "-maxrate", "1100k", "-bufsize", "2200k", "-profile:v", "high", "-level:v", "3.1",
        "-g", "48", "-keyint_min", "24", "-sc_threshold", "0", "-pix_fmt", "yuv420p",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-movflags", "+faststart", "-progress", str(work / "render-progress.txt"), str(video),
    ]
    with encode_log.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
        try:
            assert process.stdin is not None
            for frame_number in range(total_frames):
                process.stdin.write(renderer.frame(frame_number / FPS).tobytes())
                if frame_number % (FPS * 4) == 0:
                    print(f"Rendered {frame_number / FPS:.0f}/{DURATION:.0f} seconds", flush=True)
            process.stdin.close()
            code = process.wait()
        except BaseException:
            process.kill()
            process.wait()
            raise
    if code:
        raise RuntimeError(f"Encoding failed; see {encode_log}")
    if video.stat().st_size >= 5_000_000:
        raise RuntimeError("Video exceeds the 5 MB target; revise encoder settings")
    atoms = top_level_atoms(video)
    assert atoms.index("moov") < atoms.index("mdat"), atoms

    # Decode the entire deliverable, rather than checking only a still/poster.
    with (work / "decode.log").open("w", encoding="utf-8") as log:
        subprocess.run([
            ffmpeg, "-hide_banner", "-v", "error", "-xerror", "-i", str(video),
            "-map", "0:v:0", "-f", "null", "-",
        ], stdout=subprocess.DEVNULL, stderr=log, check=True)

    # The contact sheet is extracted from the encoded MP4, one midpoint per scene.
    contact = Image.new("RGB", (1280, 4 * 402), (8, 16, 24))
    draw = ImageDraw.Draw(contact)
    for index, scene in enumerate(SCENES):
        midpoint = (scene["start"] + scene["end"]) / 2
        still = work / f"scene-{index + 1:02d}-{scene['id']}.png"
        subprocess.run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", str(midpoint),
            "-i", str(video), "-frames:v", "1", "-update", "1", str(still),
        ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
        preview = Image.open(still).convert("RGB").resize((640, 360), Image.Resampling.LANCZOS)
        x, y = index % 2 * 640, index // 2 * 402
        contact.paste(preview, (x, y))
        draw.text((x + 16, y + 370),
                  f"{index + 1:02d}  {scene['start']:g}–{scene['end']:g}s  /  {scene['id']}",
                  font=renderer.font(20), fill=CREAM[:3])
    contact.save(work / "scene-contact.jpg", quality=93)
    report = {
        "status": "local_render_for_review", "duration_seconds": DURATION,
        "width": WIDTH, "height": HEIGHT, "fps": FPS, "frames": total_frames,
        "video_codec": "H.264 High", "pixel_format": "yuv420p",
        "audio_streams": 0, "subtitles": "Japanese, burned in",
        "full_decode": "pass", "faststart": True, "top_level_mp4_atoms": atoms,
        "file_bytes": video.stat().st_size, "poster_bytes": poster.stat().st_size,
        "sha256": hashlib.sha256(video.read_bytes()).hexdigest(),
        "video": str(video.relative_to(repo)), "poster": str(poster.relative_to(repo)),
        "source_scope": "Previously published local public photos only",
        "private_footage_used": False, "earlier_edit_used": False,
        "music_used": False, "ai_generated_media_used": False,
        "timing_note": "Each scene begins with a 0.28-second crossfade except the opening",
        "scenes": SCENES,
    }
    (work / "scene-timing.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({key: value for key, value in report.items() if key != "scenes"},
                     ensure_ascii=False, indent=2), flush=True)
    print(work / "scene-contact.jpg", flush=True)


if __name__ == "__main__":
    main()
