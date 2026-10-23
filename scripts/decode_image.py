import sys
import io
from PIL import Image

try:
    import pillow_avif
except Exception:
    pass

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

try:
    data = sys.stdin.buffer.read()
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    w, h = img.size
    sys.stdout.buffer.write(w.to_bytes(4, 'little'))
    sys.stdout.buffer.write(h.to_bytes(4, 'little'))
    sys.stdout.buffer.write(img.tobytes())
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
