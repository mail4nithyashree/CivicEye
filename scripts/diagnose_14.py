import os
import av
from PIL import Image
import numpy as np

failed_paths = [
   r'AI\test_images\food_objects\photo-1625398407796-82650a8c135f.jpg',
   r'AI\test_images\people\guy-shows-document-girl-group-young-freelancers-office-have-conversation-working_146671-13569.jpg',
   r'AI\test_images\people\pexels-nikku0109-33885308.jpg',
   r'AI\test_images\pothole\bNAGLORE-POTHOLES-820-5-3.jpg',
   r'AI\test_images\random_non_road\ancient-temple-architecture_23-2151996317.jpg',
   r'AI\test_images\random_non_road\beauty-random-island-india-captured-december-lakshadweep-picture-represents-thr-any-457672028.jpg',
   r'AI\test_images\random_non_road\pexels-photo-13301406.jpg',
   r'AI\test_images\unrelated_images\pexels-photo-35339691.jpg',
   r'AI\test_images\unrelated_images\vertical-shot-common-kingfisher-perched-wood-field-with-blurry-background_181624-59348.jpg',
   r'AI\test_images\unrelated_images\wedding-for-india-shaadidukaan.jpg',
   r'AI\test_images\valid_road_no_issue\empty-road-stretching-through-rural-landscape-sunrise_672283-1913.jpg',
   r'AI\test_images\valid_road_no_issue\indian-highway-netarhat-jharkhand-india-th-december-vertical-view-tarmac-468337984.jpg',
   r'AI\test_images\valid_road_no_issue\pexels-photo-29194277.jpg',
   r'AI\test_images\waterlogging\Water-Logging-41_1754756824799.jpg'
]

for p in failed_paths:
    print(f"\n--- Testing {p} ---")
    if not os.path.exists(p):
        print("Does not exist!")
        continue
    size = os.path.getsize(p)
    print(f"File size: {size}")
    with open(p, 'rb') as f:
        hdr = f.read(64)
    print(f"Header: {hdr[:32]}")
    try:
        container = av.open(p)
        print("Streams:", container.streams)
        for frame in container.decode(video=0):
            print("Frame decoded:", frame)
            break
    except Exception as e:
        print("PyAV error:", e)
