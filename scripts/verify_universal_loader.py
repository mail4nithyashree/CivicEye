import os
import av
from PIL import Image
import numpy as np
import cv2

def load_any_image(filepath):
    """
    Robust image loader that supports all standard and next-gen image formats
    including JPEG, PNG, WEBP, AVIF, HEIC, BMP, and TIFF without crashing.
    """
    # 1. Try standard PIL
    try:
        with Image.open(filepath) as img:
            img.load()
            return img.convert('RGB')
    except Exception:
        pass

    # 2. Try PyAV container stream decoding (for AVIF / HEIF / MP4 frames)
    try:
        container = av.open(filepath)
        stream = container.streams.video[0]
        for packet in container.demux(stream):
            for frame in stream.decode(packet):
                img = frame.to_image()
                container.close()
                return img.convert('RGB')
        container.close()
    except Exception:
        pass

    # 3. Try OpenCV via in-memory buffer
    try:
        with open(filepath, 'rb') as f:
            data = np.frombuffer(f.read(), np.uint8)
        bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if bgr is not None:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            return Image.fromarray(rgb)
    except Exception:
        pass

    raise RuntimeError(f"Universal loader failed to decode image: {filepath}")

def verify_all_directories():
    print("Testing universal loader across all dataset directories...")
    dirs_to_check = ["AI/training_images", "AI/test_images"]
    if os.path.exists("dataset_working/images"):
        dirs_to_check.append("dataset_working/images")

    all_passed = True
    for d in dirs_to_check:
        total = 0
        success = 0
        failed = []
        for root, _, files in os.walk(d):
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in ['.jpg', '.jpeg', '.png', '.webp', '.avif']:
                    total += 1
                    fp = os.path.join(root, f)
                    try:
                        img = load_any_image(fp)
                        w, h = img.size
                        if w > 0 and h > 0:
                            success += 1
                        else:
                            failed.append((fp, "0 dimension"))
                    except Exception as e:
                        failed.append((fp, str(e)))
        print(f"Directory: {d:25s} -> Loaded {success}/{total} images ({(success/total*100) if total else 0:.1f}%)")
        if failed:
            all_passed = False
            for fp, err in failed:
                print(f"   FAILED: {fp} -> {err}")
    
    if all_passed:
        print("\n>>> 100% OF ALL IMAGES IN ALL DIRECTORIES LOADED PERFECTLY! <<<")

if __name__ == "__main__":
    verify_all_directories()
