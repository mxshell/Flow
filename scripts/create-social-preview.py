"""Regenerate public/social-preview.png with Pillow (not required by the app build)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCALE = 2
image = Image.new("RGB", (1200 * SCALE, 630 * SCALE), "#f6f7fb")
draw = ImageDraw.Draw(image)


def font(size, bold=False):
    names = [
        Path("/System/Library/Fonts/Supplemental") / ("Arial Bold.ttf" if bold else "Arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu") / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"),
    ]
    for path in names:
        if path.exists():
            return ImageFont.truetype(str(path), size * SCALE)
    raise RuntimeError("Install Arial or DejaVu Sans to regenerate the preview.")


def text(x, y, label, size, color="#27324b", bold=False):
    draw.text((x * SCALE, y * SCALE), label, font=font(size, bold), fill=color)


def rect(x, y, width, height, color, radius=3):
    draw.rounded_rectangle((x * SCALE, y * SCALE, (x + width) * SCALE, (y + height) * SCALE), radius=radius * SCALE, fill=color)


def curve(x0, y0, x1, y1):
    points = []
    for i in range(101):
        t = i / 100
        # Horizontal tangents at each end form the familiar Sankey ribbon.
        x = (1-t)**3*x0 + 3*(1-t)**2*t*((x0+x1)/2) + 3*(1-t)*t*t*((x0+x1)/2) + t**3*x1
        y = (1-t)**3*y0 + 3*(1-t)**2*t*y0 + 3*(1-t)*t*t*y1 + t**3*y1
        points.append((round(x * SCALE), round(y * SCALE)))
    return points


def ribbon(x0, top0, x1, top1, width, color):
    draw.polygon(curve(x0, top0, x1, top1) + list(reversed(curve(x0, top0+width, x1, top1+width))), fill=color)


rect(64, 58, 44, 44, "#5761d9", 12)
for start, end in [(71, 90), (80, 71), (90, 80)]:
    draw.line(curve(74, start, 98, end), fill="white", width=4*SCALE)
text(121, 55, "Flow.", 42, bold=True)
text(65, 193, "FREE SANKEY DIAGRAM MAKER", 15, "#5761d9", True)
text(61, 237, "See the", 68, bold=True)
text(61, 312, "whole flow.", 68, bold=True)
text(65, 414, "Budgets. Business. Job searches.", 23, "#657189")
text(65, 456, "Private by design. No account needed.", 18, "#758098")
text(65, 560, "flow.mxshell.dev", 18, "#5761d9")

ribbon(642, 232, 819, 270, 150, "#d9d8ef")
ribbon(642, 430, 819, 420, 70, "#e2ddf2")
ribbon(833, 270, 1090, 220, 115, "#eadbcf")
ribbon(833, 385, 1090, 390, 65, "#d5deed")
ribbon(833, 450, 1090, 500, 40, "#cfe3dc")
rect(628, 232, 14, 150, "#8686d7")
rect(628, 430, 14, 70, "#aea0dc")
rect(819, 270, 14, 220, "#7b83d0")
rect(1090, 220, 14, 115, "#dcaa86")
rect(1090, 390, 14, 65, "#91a5cf")
rect(1090, 500, 14, 40, "#7eb3a5")
text(622, 201, "Salary", 17, "#657189")
text(622, 399, "Other", 17, "#657189")
text(793, 237, "Income", 17, "#657189")
text(1033, 188, "Spending", 17, "#657189")
text(1056, 358, "Bills", 17, "#657189")
text(1044, 468, "Savings", 17, "#657189")

image = image.resize((1200, 630), Image.Resampling.LANCZOS)
image.save(ROOT / "public/social-preview.png", optimize=True)
print("Created public/social-preview.png (1200 × 630)")
