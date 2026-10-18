import av
from PIL import Image
import io

def load_avif_pyav(filepath):
    container = av.open(filepath)
    for frame in container.decode(video=0):
        img = frame.to_image() # Returns PIL Image in RGB
        return img
    raise ValueError("No video frame found in container")

test_path = r"AI\test_images\flowers_plants\pexels-photo-36778679.jpg"
try:
    img = load_avif_pyav(test_path)
    print(f"SUCCESS: Loaded {test_path} -> Size {img.size}, Mode {img.mode}")
except Exception as e:
    print(f"FAILED: {e}")
