import sys
import io
from PIL import Image

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
