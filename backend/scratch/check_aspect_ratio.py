import cv2

def main():
    img_path = "uploads/faces/CSE/1DS24CY015_25594d.jpg"
    img = cv2.imread(img_path)
    if img is None:
        print("Image not found")
        return
    h, w, c = img.shape
    print(f"Image dimensions: width={w}, height={h}, channels={c}")
    print(f"Aspect ratio: {w/h:.4f} (expected 3:4 = 0.75 or 4:3 = 1.33)")

if __name__ == "__main__":
    main()
