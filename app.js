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
  const mascotImage = document.getElementById('mascot-image');

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
      
      // ダウンロードボタン有効化
      btnGroup.style.display = 'flex';

    } catch (error) {
      console.error(error);
      progressBarFill.style.width = '100%';
      progressBarFill.style.backgroundColor = 'var(--error-color)';
      showMessage('error', error.message || 'ファイルの処理中にエラーが発生しました。');
      btnGroup.style.display = 'flex';
      btnDownload.style.display = 'none'; // エラー時はダウンロード不可
    }
  }

  // 音声ファイルリスト
  const voiceFiles = [
    'voices/voice_1.mp3',
    'voices/voice_2.mp3',
    'voices/voice_3.mp3',
    'voices/voice_4.mp3',
    'voices/voice_5.mp3',
    'voices/voice_6.mp3',
    'voices/voice_7.mp3'
  ];

  // キャラクターのドラッグ移動 ＆ クリック処理の統合
  const mascotContainer = document.getElementById('mascot-container');
  if (mascotContainer && mascotImage) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialBottom = 0;
    const dragThreshold = 6; // ドラッグと判定する移動量（px）
    let hasDragged = false;

    // 初期スタイルの設定（ドラッグ計算を簡素化するため）
    mascotContainer.style.left = '10px';
    mascotContainer.style.bottom = '-20px';
    mascotContainer.style.position = 'fixed';
    mascotContainer.style.right = 'auto';
    mascotContainer.style.top = 'auto';

    // 不透明ピクセル判定用キャッシュ
    let mascotCanvas = null;
    let mascotCtx = null;
    let mascotImgData = null;

    const initMascotHitMap = () => {
      try {
        mascotCanvas = document.createElement('canvas');
        mascotCanvas.width = mascotImage.naturalWidth;
        mascotCanvas.height = mascotImage.naturalHeight;
        mascotCtx = mascotCanvas.getContext('2d');
        mascotCtx.drawImage(mascotImage, 0, 0);
        mascotImgData = mascotCtx.getImageData(0, 0, mascotCanvas.width, mascotCanvas.height);
      } catch (e) {
        console.warn("Failed to init mascot hitmap (CORS or canvas error):", e);
      }
    };

    if (mascotImage.complete) {
      initMascotHitMap();
    } else {
      mascotImage.addEventListener('load', initMascotHitMap);
    }

    // 特定の座標が不透明かどうか判定
    const isPixelOpaque = (clientX, clientY) => {
      if (!mascotImgData) return true; // ヒットマップ未初期化時は全て当たり判定ありとする

      const rect = mascotImage.getBoundingClientRect();
      const xRatio = (clientX - rect.left) / rect.width;
      const yRatio = (clientY - rect.top) / rect.height;

      const pixelX = Math.floor(xRatio * mascotCanvas.width);
      const pixelY = Math.floor(yRatio * mascotCanvas.height);

      if (pixelX < 0 || pixelX >= mascotCanvas.width || pixelY < 0 || pixelY >= mascotCanvas.height) {
        return false;
      }

      const index = (pixelY * mascotCanvas.width + pixelX) * 4;
      const alpha = mascotImgData.data[index + 3];

      return alpha > 30; // アルファ値が30以上なら当たり判定ありとする
    };

    // ドラッグ＆クリック共通ロジック
    const onStart = (clientX, clientY) => {
      isDragging = true;
      hasDragged = false;
      startX = clientX;
      startY = clientY;
      
      const rect = mascotContainer.getBoundingClientRect();
      initialLeft = rect.left;
      initialBottom = window.innerHeight - rect.bottom;

      // 移動中のトランジション遅延を一時的にオフ
      mascotImage.style.transition = 'none';
      mascotContainer.style.transition = 'none';
    };

    const onMove = (clientX, clientY) => {
      if (!isDragging) return;

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      // 一定以上の移動でドラッグ判定
      if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
        hasDragged = true;
      }

      // 新しい座標の計算
      const newLeft = initialLeft + deltaX;
      const newBottom = initialBottom - deltaY;

      // 画面端の制限（はみ出しすぎ防止）
      const rect = mascotContainer.getBoundingClientRect();
      const minLeft = -rect.width / 2;
      const maxLeft = window.innerWidth - rect.width / 2;
      const minBottom = -rect.height + 60; // 最低60pxは画面に残す
      const maxBottom = window.innerHeight - 120;

      mascotContainer.style.left = `${Math.max(minLeft, Math.min(maxLeft, newLeft))}px`;
      mascotContainer.style.bottom = `${Math.max(minBottom, Math.min(maxBottom, newBottom))}px`;
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;

      // トランジションを有効化に戻す
      mascotImage.style.transition = '';
      mascotContainer.style.transition = '';

      // ドラッグされず、単純なクリックだった場合のみボイスを再生
      if (!hasDragged) {
        const randomIndex = Math.floor(Math.random() * voiceFiles.length);
        const audio = new Audio(voiceFiles[randomIndex]);
        audio.play().catch(err => console.warn('Audio play failed:', err));

        // ジャンプアニメーションをトリガー
        mascotImage.classList.remove('jump-animate');
        void mascotImage.offsetWidth; // リフロー
        mascotImage.classList.add('jump-animate');
      }
    };

    // マウス操作的監視
    mascotImage.addEventListener('mousedown', (e) => {
      // 透過ピクセルならクリックを貫通させて無視
      if (!isPixelOpaque(e.clientX, e.clientY)) {
        mascotContainer.style.pointerEvents = 'none';
        const backendElement = document.elementFromPoint(e.clientX, e.clientY);
        if (backendElement) {
          const clonedEvent = new MouseEvent(e.type, e);
          backendElement.dispatchEvent(clonedEvent);
        }
        setTimeout(() => {
          mascotContainer.style.pointerEvents = 'auto';
        }, 0);
        return;
      }

      e.preventDefault();
      onStart(e.clientX, e.clientY);

      const mouseMoveHandler = (moveEvt) => {
        onMove(moveEvt.clientX, moveEvt.clientY);
      };

      const mouseUpHandler = () => {
        onEnd();
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
      };

      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
    });

    // タッチ操作の監視（モバイルデバイス）
    mascotImage.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        // 透過ピクセルならタッチイベントを貫通させて無視
        if (!isPixelOpaque(touch.clientX, touch.clientY)) {
          mascotContainer.style.pointerEvents = 'none';
          const backendElement = document.elementFromPoint(touch.clientX, touch.clientY);
          if (backendElement) {
            const clonedEvent = new TouchEvent(e.type, e);
            backendElement.dispatchEvent(clonedEvent);
          }
          setTimeout(() => {
            mascotContainer.style.pointerEvents = 'auto';
          }, 0);
          return;
        }
        onStart(touch.clientX, touch.clientY);
      }
    });

    mascotImage.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    });

    mascotImage.addEventListener('touchend', () => {
      onEnd();
    });

    // アニメーション終了時のクラスクリーンアップ
    mascotImage.addEventListener('animationend', () => {
      mascotImage.classList.remove('jump-animate');
    });
  }
});
