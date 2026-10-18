import os
import cv2
import numpy as np
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()

def load_image_robust(filepath):
    # Try PIL first
    try:
        with Image.open(filepath) as img:
            return img.convert('RGB')
    except Exception:
        pass
    
    # Try cv2 (handles avif / other formats)
    try:
        # cv2.imread might fail on non-ascii path in windows, use imdecode
        with open(filepath, 'rb') as f:
            data = np.frombuffer(f.read(), np.uint8)
        bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if bgr is not None:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            return Image.fromarray(rgb)
    except Exception:
        pass

    # Try pillow_heif directly
    try:
        heif_file = pillow_heif.read_heif(filepath)
        return Image.frombytes(
            heif_file.mode, 
            heif_file.size, 
            heif_file.data,
            "raw",
        ).convert('RGB')
    except Exception as e:
        raise RuntimeError(f"Cannot load image {filepath}: {e}")

def test_loading(directory):
    total = 0
    success = 0
    failed = []
    for root, dirs, files in os.walk(directory):
        for f in files:
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.avif')):
                total += 1
                p = os.path.join(root, f)
                try:
                    img = load_image_robust(p)
                    if img.size[0] > 0 and img.size[1] > 0:
                        success += 1
                    else:
                        failed.append((p, "Zero size"))
                except Exception as e:
                    failed.append((p, str(e)))
    return total, success, failed

print("Testing loading in AI/training_images:")
t_tot, t_suc, t_fail = test_loading("AI/training_images")
print(f"Training: {t_suc}/{t_tot} images loaded successfully.")
if t_fail:
    print(f"Failed ({len(t_fail)}): {t_fail}")

print("\nTesting loading in AI/test_images:")
te_tot, te_suc, te_fail = test_loading("AI/test_images")
print(f"Test: {te_suc}/{te_tot} images loaded successfully.")
if te_fail:
    print(f"Failed ({len(te_fail)}): {te_fail}")
