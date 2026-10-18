import os

def inspect_file(filepath):
    try:
        size = os.path.getsize(filepath)
        with open(filepath, "rb") as f:
            header = f.read(64)
        return size, header
    except Exception as e:
        return 0, str(e)

with open("scripts/audit_dataset.py", "r") as f:
    pass

import json
from PIL import Image

for root, dirs, files in os.walk("AI"):
    for f in files:
        fpath = os.path.join(root, f)
        try:
            with Image.open(fpath) as img:
                img.verify()
        except Exception as e:
            sz, hdr = inspect_file(fpath)
            print(f"Failed: {fpath} (size: {sz} bytes)")
            print(f"  Header: {hdr[:32]}")
            # check if it's text/html or webp
            try:
                txt = hdr.decode('latin1', errors='ignore')
                print(f"  Header text: {txt[:40]}")
            except:
                pass
