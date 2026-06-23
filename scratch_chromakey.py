import sys
from PIL import Image

def remove_green_background(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()
    
    newData = []
    for item in datas:
        r, g, b, a = item
        # 緑色の判定（クロマキー）
        # 緑が赤・青に対して十分優勢な場合を背景とする
        # 背景の緑はかなり鮮やか (R < 50, G > 120, B < 80 など)
        if g > 1.15 * r and g > 1.15 * b and g > 50:
            # 背景を完全透明に
            newData.append((0, 0, 0, 0))
        else:
            # 境界の緑フリンジ除去（簡易的な緑スピル抑制）
            # もし緑が赤・青の両方より大きいなら、緑の輝度を赤と青の平均に抑える
            if g > r and g > b:
                avg = (r + b) // 2
                # 急激に変えると不自然なので、中間値をとる
                g = (g + avg) // 2
            newData.append((r, g, b, a))
            
    img.putdata(newData)
    img.save(output_path, "PNG")
    print("Successfully removed green background and saved as PNG")

if __name__ == "__main__":
    remove_green_background(
        "/Users/koya/.gemini/antigravity/brain/df4bc4e1-7cf5-4761-a994-c84a47abb5f8/media__1782192770541.png",
        "/Users/koya/premiere-downgrader/mascot.png"
    )
