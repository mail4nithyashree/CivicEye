import av
from PIL import Image

def load_avif_safely(filepath):
    """Robustly decodes AVIF/HEIF container using PyAV without EOF flush error."""
    try:
        container = av.open(filepath)
        for frame in container.decode(video=0):
            img = frame.to_image().convert('RGB')
            return img
    except Exception as e:
        # Demux fallback with safe EOF handling
        try:
            container = av.open(filepath)
            stream = container.streams.video[0]
            for packet in container.demux(stream):
                try:
                    for frame in stream.decode(packet):
                        return frame.to_image().convert('RGB')
                except (av.error.EOFError, av.error.InvalidDataError):
                    break
        except Exception as inner_e:
            raise RuntimeError(f"Failed to decode AVIF via PyAV: {inner_e}")
    raise ValueError("No video frame found in container")

if __name__ == "__main__":
    p = r"AI\test_images\waterlogging\Water-Logging-41_1754756824799.jpg"
    try:
        img = load_avif_safely(p)
        print("Success! Decoded Image size:", img.size, "Mode:", img.mode)
    except Exception as e:
        print("Failed:", e)

