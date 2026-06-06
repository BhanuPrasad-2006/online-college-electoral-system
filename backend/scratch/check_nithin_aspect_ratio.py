import cv2

def main():
    img_path = "uploads/faces/student_078df338-1900-4d98-8cba-1d8b02154369.jpeg"
    img = cv2.imread(img_path)
    if img is None:
        print("Image not found")
        return
    h, w, c = img.shape
    print(f"Nithin's Image dimensions: width={w}, height={h}, channels={c}")
    print(f"Aspect ratio: {w/h:.4f}")

if __name__ == "__main__":
    main()
