import asyncio
import os
import sys
import cv2
import numpy as np

sys.path.append(".")
from app.services.face_service import assess_frame_quality, enhance_frame

def main():
    ref_path = "uploads/faces/yatish_ref.jpg"
    if not os.path.exists(ref_path):
        print(f"Reference photo {ref_path} does not exist.")
        return

    print("Loading reference photo...")
    img = cv2.imread(ref_path)
    if img is None:
        print("Failed to load reference image.")
        return

    print(f"Loaded image shape: {img.shape}")
    
    # Run quality assessment
    q = assess_frame_quality(img)
    print("\n--- Assessment Results ---")
    for k, v in q.items():
        if k != "img_bgr" and k != "image_data":
            print(f"{k}: {v}")

    # Test enhancement
    enhanced = enhance_frame(img, q["classification"])
    print("\n--- Enhancement ---")
    print(f"Enhanced image shape: {enhanced.shape}")
    
    # Save enhanced test image
    out_path = "scratch/enhanced_test.jpg"
    cv2.imwrite(out_path, enhanced)
    print(f"Saved enhanced test image to {out_path}")

    # Re-assess enhanced
    q_enhanced = assess_frame_quality(enhanced)
    print("\n--- Enhanced Assessment Results ---")
    for k, v in q_enhanced.items():
        if k != "img_bgr" and k != "image_data":
            print(f"{k}: {v}")

if __name__ == "__main__":
    main()
