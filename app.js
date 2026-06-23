document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const statusPanel = document.getElementById('status-panel');
  const fileNameEl = document.getElementById('file-name');
  const fileSizeEl = document.getElementById('file-size');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const messageEl = document.getElementById('message');
  const btnGroup = document.getElementById('btn-group');
  const btnDownload = document.getElementById('btn-download');
  const btnReset = document.getElementById('btn-reset');
  const targetVersionSelect = document.getElementById('target-version');
  const mascotBubble = document.getElementById('mascot-bubble');

  let processedBlob = null;
  let processedFileName = '';

  // ドラッグ＆ドロップイベントの制御
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  // ファイルがドロップされたとき
  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // クリックしてファイル選択
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // リセットボタン
  btnReset.addEventListener('click', resetUI);

  // ダウンロードボタン
  btnDownload.addEventListener('click', () => {
    if (processedBlob) {
      const url = URL.createObjectURL(processedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = processedFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showMessage('success', 'ファイルの保存が完了しました！');
      updateMascotBubble('魔法のダウングレード版をダウンロードしたよ！開けるか試してみてね！💖');
    }
  });

  // UIリセット関数
  function resetUI() {
    fileInput.value = '';
    processedBlob = null;
    processedFileName = '';
    statusPanel.style.display = 'none';
    dropZone.style.display = 'block';
    progressBarFill.style.width = '0%';
    showMessage('info', '');
    btnGroup.style.display = 'none';
    targetVersionSelect.disabled = false;
    updateMascotBubble('他のファイルもダウングレードしちゃう？💫');
  }

  // メッセージ表示関数
  function showMessage(type, text) {
    messageEl.className = 'message ' + type;
    
    let icon = '';
    if (type === 'success') icon = '✓ ';
    if (type === 'error') icon = '⚠️ ';
    if (type === 'info' && text !== '') icon = 'ℹ️ ';
    
    messageEl.textContent = icon + text;
  }

  // ファイルサイズ変換
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Streamの全チャンクをメモリ上に読み込み、結合して一つのUint8Arrayを返すヘルパー関数
  // file://環境でのResponse APIのセキュリティ制限（Failed to fetch）を回避するために使用
  async function readAllChunks(readableStream) {
    const reader = readableStream.getReader();
    const chunks = [];
    let totalLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  // Gzip解凍 (Uint8Arrayを返す)
  async function decompressGzip(blob) {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = blob.stream().pipeThrough(ds);
    return await readAllChunks(decompressedStream);
  }

  // Gzip圧縮 (Blobを返す)
  async function compressGzip(uint8Array) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(uint8Array);
        controller.close();
      }
    });
    const cs = new CompressionStream('gzip');
    const compressedStream = stream.pipeThrough(cs);
    const compressedBytes = await readAllChunks(compressedStream);
    return new Blob([compressedBytes], { type: 'application/x-gzip' });
  }

  // 0-255のバイトに対応する文字マッピングテーブルを事前定義
  // 0x80以上のバイト（日本語UTF-8のマルチバイトやバイナリデータ等）は、
  // JavaScriptのサロゲートペア破損や自動エンコーディング変換（windows-1252）の干渉を回避するため、
  // プライベートユース領域（U+E080〜U+E0FF）にシフトしてマッピングします。
  const byteToCharTable = new Array(256);
  for (let i = 0; i < 256; i++) {
    if (i < 0x80) {
      byteToCharTable[i] = String.fromCharCode(i);
    } else {
      byteToCharTable[i] = String.fromCharCode(i + 0xE000);
    }
  }

  // バイナリデータを一切破損させず、エンコーディング変換の影響も受けずに文字列化する関数
  function uint8ArrayToString(uint8Array) {
    let str = '';
    const chunkSize = 65535; // スタックオーバーフローを防ぐための分割処理
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const subArray = uint8Array.subarray(i, i + chunkSize);
      let tempStr = '';
      for (let j = 0; j < subArray.length; j++) {
        tempStr += byteToCharTable[subArray[j]];
      }
      str += tempStr;
    }
    return str;
  }

  // ファイル処理コアロジック
  async function handleFile(file) {
    // 拡張子チェック
    if (!file.name.endsWith('.prproj')) {
      alert('Adobe Premiere Proプロジェクトファイル（.prproj）を選択してください。');
      return;
    }

    // UI状態初期化
    dropZone.style.display = 'none';
    statusPanel.style.display = 'block';
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);
    progressBarFill.style.width = '10%';
    targetVersionSelect.disabled = true;
    const targetVersion = targetVersionSelect.value;
    showMessage('info', 'プロジェクトファイルを解析中...');
    updateMascotBubble('プロジェクトを解析中だよ〜！ちょっと待ってね！⏰');

    try {
      // 1. ファイルの読み込みと解凍
      let xmlText = '';
      let isGzipped = true;
      let decompressedBytes;

      try {
        progressBarFill.style.width = '20%';
        decompressedBytes = await decompressGzip(file);
      } catch (decompressError) {
        // 解凍に失敗した場合は、非圧縮XMLファイルとして直接読み込みを試みる
        console.warn('Gzip解凍に失敗しました。非圧縮XMLとして読み込みます。', decompressError);
        progressBarFill.style.width = '20%';
        const arrayBuffer = await file.arrayBuffer();
        decompressedBytes = new Uint8Array(arrayBuffer);
        isGzipped = false;
      }

      progressBarFill.style.width = '40%';

      // 2. バイナリデータを保護し、かつブラウザの自動エンコーディング変換（windows-1252）を回避してテキスト化
      xmlText = uint8ArrayToString(decompressedBytes);

      // 3. バージョン書き換え処理
      // <Project ... Version="XX"> タグを検索
      const projectTagRegex = /(<Project\b[^>]*\bVersion=")(\d+)(")/;
      const match = xmlText.match(projectTagRegex);

      if (!match) {
        throw new Error('プロジェクトファイルの構造解析に失敗しました。有効なPremiere Proプロジェクトではない可能性があります。');
      }

      const originalVersion = match[2];
      const selectedOptionText = targetVersionSelect.options[targetVersionSelect.selectedIndex].text;
      showMessage('info', `元のプロジェクトバージョン（内規ID: ${originalVersion}）を検出しました。${selectedOptionText} 形式にダウングレード中...`);
      
      // バージョンを選択された値に書き換える
      const updatedXmlText = xmlText.replace(projectTagRegex, `$1${targetVersion}$3`);
      progressBarFill.style.width = '60%';

      // 4. 文字列からバイナリ（Uint8Array）へ正確に復元
      // U+E080〜U+E0FFの文字は -0xE000 して元の0x80〜0xFFバイトに戻す
      const updatedBytes = new Uint8Array(updatedXmlText.length);
      for (let i = 0; i < updatedXmlText.length; i++) {
        const code = updatedXmlText.charCodeAt(i);
        if (code < 0x80) {
          updatedBytes[i] = code;
        } else if (code >= 0xE080 && code <= 0xE0FF) {
          updatedBytes[i] = code - 0xE000;
        } else {
          updatedBytes[i] = code & 0xff; // 万が一のための安全フォールバック
        }
      }
      progressBarFill.style.width = '80%';

      // 5. 再圧縮処理
      if (isGzipped) {
        showMessage('info', '圧縮データを再生成中...');
        processedBlob = await compressGzip(updatedBytes);
      } else {
        // 元が非圧縮だった場合は非圧縮のまま書き出す
        processedBlob = new Blob([updatedBytes], { type: 'text/xml' });
      }

      progressBarFill.style.width = '100%';
      
      // 出力ファイル名設定
      const targetVersionLabel = targetVersion === '1' ? 'v1' : targetVersionSelect.options[targetVersionSelect.selectedIndex].text.match(/\d{4}/)?.[0] || targetVersion;
      const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
      processedFileName = `${baseName}_downgraded_${targetVersionLabel}.prproj`;

      showMessage('success', `ダウングレードに成功しました！（${selectedOptionText} 互換）`);
      updateMascotBubble('ダウングレードできたよ！すごいでしょ！ダウンロードしてね！🎉');
      
      // ダウンロードボタン有効化
      btnGroup.style.display = 'flex';

    } catch (error) {
      console.error(error);
      progressBarFill.style.width = '100%';
      progressBarFill.style.backgroundColor = 'var(--error-color)';
      showMessage('error', error.message || 'ファイルの処理中にエラーが発生しました。');
      updateMascotBubble('あれれ？エラーになっちゃったみたい…💦 ファイルを確認してね');
      btnGroup.style.display = 'flex';
      btnDownload.style.display = 'none'; // エラー時はダウンロード不可
    }
  }

  // マスコットの吹き出し更新関数
  function updateMascotBubble(text) {
    if (mascotBubble) {
      mascotBubble.textContent = text;
      // 吹き出しがぷるんと動くアニメーションをトリガー
      mascotBubble.classList.remove('bubble-animate');
      void mascotBubble.offsetWidth; // 強制リフロー
      mascotBubble.classList.add('bubble-animate');
    }
  }
});
