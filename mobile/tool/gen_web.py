"""Sinh tệp web (PWA) cho 3 app: index.html, manifest.json, biểu tượng, sqt.js, sw.js.

Chạy lại sau khi sửa mobile/web_shared: python3 mobile/tool/gen_web.py
"""
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "web_shared"
APPS = {
    "customer": ("Ship Quanh Tôi", "Quanh Tôi", "Đặt món & nhu yếu phẩm quanh bạn, có người thật xác nhận", "#FF6B2C", "🛵"),
    "merchant": ("SQT Đối Tác", "SQT Quán", "Nhận và xử lý đơn cho quán", "#1DB954", "Q"),
    "rider": ("SQT Tài Xế", "SQT Tài Xế", "Nhận chuyến và giao hàng", "#7C5CFF", "S"),
}
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def icon(size: int, color: str, letter: str, maskable: bool) -> Image.Image:
    img = Image.new("RGBA", (size, size), color if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 0 if maskable else size // 16
    if not maskable:
        d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=size // 5, fill=color)
    c = size // 2
    # Sóng "quanh tôi" lan toả.
    for r, w in ((size * 0.36, size // 40), (size * 0.27, size // 40)):
        d.ellipse([c - r, c - r, c + r, c + r], outline=(255, 255, 255, 110), width=max(2, w))
    glyph = "🛵" if letter == "🛵" else letter
    if glyph == "🛵":
        # Không có font emoji: vẽ ghim vị trí.
        r = size * 0.13
        d.ellipse([c - r, c - r * 1.6, c + r, c + r * 0.4], fill="white")
        d.polygon([(c - r * 0.8, c - r * 0.2), (c + r * 0.8, c - r * 0.2), (c, c + r * 1.4)], fill="white")
        d.ellipse([c - r * 0.4, c - r, c + r * 0.4, c - r * 0.2], fill=color)
    else:
        f = ImageFont.truetype(FONT, int(size * 0.34))
        d.text((c, c), glyph, font=f, fill="white", anchor="mm")
    return img


for app, (name, short, desc, color, letter) in APPS.items():
    web = ROOT / "apps" / app / "web"
    (web / "icons").mkdir(parents=True, exist_ok=True)
    for f in ("sqt.js", "sw.js", "flutter_bootstrap.js"):
        shutil.copy(SHARED / f, web / f)
    for s in (192, 512):
        icon(s, color, letter, False).save(web / "icons" / f"Icon-{s}.png")
        icon(s, color, letter, True).save(web / "icons" / f"Icon-maskable-{s}.png")
    icon(64, color, letter, False).save(web / "favicon.png")
    manifest = {
        "name": name,
        "short_name": short,
        "start_url": ".",
        "scope": ".",
        "display": "standalone",
        "background_color": "#FFFFFF",
        "theme_color": color,
        "description": desc,
        "lang": "vi",
        "orientation": "portrait-primary",
        "prefer_related_applications": False,
        "icons": [
            {"src": f"icons/Icon-{s}.png", "sizes": f"{s}x{s}", "type": "image/png"} for s in (192, 512)
        ]
        + [{"src": f"icons/Icon-maskable-{s}.png", "sizes": f"{s}x{s}", "type": "image/png", "purpose": "maskable"} for s in (192, 512)],
    }
    (web / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (web / "index.html").write_text(
        f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <base href="$FLUTTER_BASE_HREF">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="{color}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="{short}">
  <link rel="apple-touch-icon" href="icons/Icon-192.png">
  <link rel="icon" type="image/png" href="favicon.png">
  <link rel="manifest" href="manifest.json">
  <title>{name}</title>
  <style>
    body {{ margin: 0; background: #fff; font-family: system-ui, sans-serif; }}
    #splash {{ position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #444; }}
    #splash img {{ width: 96px; height: 96px; }}
  </style>
  <script src="sqt.js"></script>
</head>
<body>
  <div id="splash"><img src="icons/Icon-192.png" alt=""><div>{name}</div></div>
  <script src="flutter_bootstrap.js" async></script>
</body>
</html>
""",
        encoding="utf-8",
    )
    print("đã sinh", app)
