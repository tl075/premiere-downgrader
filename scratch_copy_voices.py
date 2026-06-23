import os
import shutil

src_dir = "/Users/koya/Library/CloudStorage/GoogleDrive-otaniko@tv-asahipro.co.jp/マイドライブ/プレミア"
dest_dir = "/Users/koya/premiere-downgrader/voices"

os.makedirs(dest_dir, exist_ok=True)

# フォルダ内の.mp3ファイルを取得（文字化け対策のためOSからリストアップ）
files = [f for f in os.listdir(src_dir) if f.endswith('.mp3')]
print(f"Found MP3 files: {files}")

for idx, filename in enumerate(sorted(files), start=1):
    src_path = os.path.join(src_dir, filename)
    dest_path = os.path.join(dest_dir, f"voice_{idx}.mp3")
    shutil.copy2(src_path, dest_path)
    print(f"Copied and renamed: {filename} -> voice_{idx}.mp3")
print("All audio files processed successfully.")
