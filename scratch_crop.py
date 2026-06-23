from PIL import Image

def crop_to_opaque_area(image_path, output_path):
    img = Image.open(image_path).convert("RGBA")
    # getbbox() はアルファチャンネルが0より大きい領域のバウンディングボックスを (left, top, right, bottom) で返す
    bbox = img.getbbox()
    if bbox:
        # 余裕を持たせるために数ピクセル外側を切り取る（境界がカットされるのを防ぐため）
        left = max(0, bbox[0] - 5)
        top = max(0, bbox[1] - 5)
        right = min(img.width, bbox[2] + 5)
        bottom = min(img.height, bbox[3] + 5)
        
        cropped_img = img.crop((left, top, right, bottom))
        cropped_img.save(output_path, "PNG")
        print(f"Successfully cropped. Original: {img.size} -> Cropped: {cropped_img.size}, BBox: {bbox}")
    else:
        print("No opaque area detected.")

if __name__ == "__main__":
    crop_to_opaque_area(
        "/Users/koya/premiere-downgrader/mascot.png",
        "/Users/koya/premiere-downgrader/mascot.png"
    )
