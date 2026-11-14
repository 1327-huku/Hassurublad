(() => {
  'use strict';

  // 二重読み込み防止
  if (window.__HASSURUBLAD_ADDON_LOADED__) return;
  window.__HASSURUBLAD_ADDON_LOADED__ = true;

  // ==========================================
  // 1. 状態管理 & 定数設定
  // ==========================================
  const ADDON_VERSION = 'v3.0 RAW';
  const STORAGE_RECIPES = 'hassurublad_my_recipes_v1';
  const STORAGE_ROLL = 'hassurublad_film_roll_v1';
  const MAX_CANVAS_PIXELS = 16000000; // iOS Safari安全上限 (約16MP)

  const RAW_EXTENSIONS = [
    'arw', 'cr2', 'cr3', 'nef', 'nrw', 'raf', 'dng',
    'orf', 'rw2', 'pef', 'srw', '3fr', 'iiq', 'raw', 'x3f'
  ];

  const addonState = {
    dateMode: 'off',       // 'off' | 'today' | '90s' | 'custom'
    customDate: '98 08 24',
    frameMode: 'off',      // 'off' | '6x6' | 'polaroid' | 'cinema'
    leakSeed: 0,           // 0 = OFF, >0 = 光漏れシード値
    leakOpacity: 0.65,
    shakeEnabled: false,
    originalBitmap: null,  // Exif補正済みの元画像
    originalDataUrl: null, // フォールバック用DataURL
    isApplying: false,
    interceptHostExport: false,
    bypassHostClick: false,
    bypassFileHook: false,
    onHostCanvasCaptured: null,
    activeTab: 'raw',
    // RAW現像パラメータ
    raw: {
      isRawFile: false,
      fileName: '',
      formatLabel: '',
      origDims: '',
      sourceCanvas: null,  // トーン調整前の高精細ベース画像
      ev: 0,               // -2.0 ~ +2.0
      temp: 0,             // -50 ~ +50
      tint: 0,             // -50 ~ +50
      highlights: 0,       // -100 ~ +100
      shadows: 0           // -100 ~ +100
    }
  };

  let filmRoll = loadJson(STORAGE_ROLL, []);
  let myRecipes = loadJson(STORAGE_RECIPES, [null, null, null, null, null]);

  // プレビュー用「素の現像画像」保持キャンバス
  const cleanCanvas = createInternalCanvas();

  function createInternalCanvas(w = 0, h = 0) {
    const c = document.createElement('canvas');
    c._hbInternal = true;
    if (w > 0) c.width = w;
    if (h > 0) c.height = h;
    return c;
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJson(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Storage limit exceeded:', e);
      return false;
    }
  }

  function getMainCanvas() {
    return document.getElementById('mainCanvas') || document.querySelector('canvas');
  }

  function getSafeDimensions(w, h, maxPixels = MAX_CANVAS_PIXELS) {
    const pixels = w * h;
    if (pixels <= maxPixels) return { w, h };
    const scale = Math.sqrt(maxPixels / pixels);
    return {
      w: Math.round(w * scale),
      h: Math.round(h * scale)
    };
  }

  function isRawFileName(name) {
    if (!name) return false;
    const ext = name.split('.').pop().toLowerCase();
    return RAW_EXTENSIONS.includes(ext);
  }

  // ==========================================
  // 2. iOSでRAWファイルが選択できるようにファイル入力を拡張
  // ==========================================
  function unlockFileInputs() {
    document.querySelectorAll('input[type="file"]').forEach((inp) => {
      // iOS Safariではaccept="image/*"があると.ARW/.CR3/.NEFがグレーアウトするため制限を解除
      if (inp.hasAttribute('accept')) {
        inp.removeAttribute('accept');
      }
    });
  }

  unlockFileInputs();
  const domObserver = new MutationObserver(() => unlockFileInputs());
  domObserver.observe(document.documentElement, { childList: true, subtree: true });

  // ==========================================
  // 3. ブラウザ標準APIフック（描画検知 & フル解像度書き出し横取り）
  // ==========================================
  const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  const origPutImageData = CanvasRenderingContext2D.prototype.putImageData;
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  const origAnchorClick = HTMLAnchorElement.prototype.click;

  let hostRenderScheduled = false;

  function captureCleanCanvas() {
    const main = getMainCanvas();
    if (!main || !main.width || !main.height) return;
    cleanCanvas.width = main.width;
    cleanCanvas.height = main.height;
    origDrawImage.call(cleanCanvas.getContext('2d'), main, 0, 0);

    if (!addonState.originalBitmap && !addonState.originalDataUrl) {
      try {
        addonState.originalDataUrl = origToDataURL.call(cleanCanvas, 'image/jpeg', 0.95);
      } catch (e) {}
    }
  }

  function onHostCanvasDraw(ctx) {
    const main = getMainCanvas();
    if (!main || ctx.canvas !== main || addonState.isApplying) return;

    if (!hostRenderScheduled) {
      hostRenderScheduled = true;
      setTimeout(() => {
        hostRenderScheduled = false;
        captureCleanCanvas();
        applyVisualsFromClean();
      }, 0);
    }
  }

  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    const res = origDrawImage.apply(this, args);
    onHostCanvasDraw(this);
    return res;
  };

  CanvasRenderingContext2D.prototype.putImageData = function (...args) {
    const res = origPutImageData.apply(this, args);
    onHostCanvasDraw(this);
    return res;
  };

  function buildFinalCanvasFromHost(sourceCanvas) {
    const main = getMainCanvas();
    const out = createInternalCanvas(sourceCanvas.width, sourceCanvas.height);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (sourceCanvas === main && cleanCanvas.width > 0) {
      origDrawImage.call(ctx, cleanCanvas, 0, 0, out.width, out.height);
    } else {
      origDrawImage.call(ctx, sourceCanvas, 0, 0);
    }

    const hasEffect =
      addonState.dateMode !== 'off' ||
      addonState.frameMode !== 'off' ||
      addonState.leakSeed > 0;

    if (hasEffect) {
      renderEffectsOnCanvas(ctx, out.width, out.height);
    }

    if (addonState.frameMode === '6x6' && out.width !== out.height) {
      const sq = Math.min(out.width, out.height);
      const sqCanvas = createInternalCanvas(sq, sq);
      origDrawImage.call(
        sqCanvas.getContext('2d'),
        out,
        (out.width - sq) / 2,
        (out.height - sq) / 2,
        sq,
        sq,
        0,
        0,
        sq,
        sq
      );
      return sqCanvas;
    }

    return out;
  }

  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    if (!this._hbInternal && addonState.interceptHostExport && this.width > 10) {
      const finalCanvas = buildFinalCanvasFromHost(this);
      if (addonState.onHostCanvasCaptured) {
        const cb = addonState.onHostCanvasCaptured;
        addonState.onHostCanvasCaptured = null;
        addonState.interceptHostExport = false;
        cb(finalCanvas);
        return 'data:,';
      }
      return origToDataURL.apply(finalCanvas, args);
    }
    return origToDataURL.apply(this, args);
  };

  HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
    if (!this._hbInternal && addonState.interceptHostExport && this.width > 10) {
      const finalCanvas = buildFinalCanvasFromHost(this);
      if (addonState.onHostCanvasCaptured) {
        const cb = addonState.onHostCanvasCaptured;
        addonState.onHostCanvasCaptured = null;
        addonState.interceptHostExport = false;
        cb(finalCanvas);
        return;
      }
      return origToBlob.call(finalCanvas, callback, ...args);
    }
    return origToBlob.call(this, callback, ...args);
  };

  HTMLAnchorElement.prototype.click = function (...args) {
    if (addonState.interceptHostExport && this.hasAttribute('download')) {
      return;
    }
    return origAnchorClick.apply(this, args);
  };

  // ==========================================
  // 4. マルチメーカーRAWデコード＆現像エンジン
  // ==========================================
  function getJpegDimensions(bytes, start, end) {
    let i = start + 2;
    while (i + 9 < end) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      // SOF0 ~ SOF3, SOF5 ~ SOF7, SOF9 ~ SOF11, SOF13 ~ SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        return { w, h };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
      } else {
        if (i + 3 >= end) break;
        const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
        if (segLen < 2) break;
        i += 2 + segLen;
      }
    }
    return { w: 0, h: 0 };
  }

  // TIFF / RAWヘッダからExif Orientation (0x0112) を読み取る
  function readRawOrientation(buffer) {
    try {
      const view = new DataView(buffer);
      if (view.byteLength < 16) return 1;

      // Fujifilm RAF ヘッダ対応 ("FUJIFILMCCD-RAW")
      let tiffOffset = 0;
      if (
        view.getUint8(0) === 0x46 &&
        view.getUint8(1) === 0x55 &&
        view.getUint8(2) === 0x4a &&
        view.getUint8(3) === 0x49
      ) {
        if (view.byteLength > 92) {
          // RAF内のJPEG開始オフセット(offset 84)内のExifを見るか、TIFFオフセット(offset 100)を見る
          const jpegOff = view.getUint32(84, false);
          if (jpegOff > 0 && jpegOff + 32 < view.byteLength) {
            // JPEG内のAPP1 Exifを探す
            for (let p = jpegOff; p < Math.min(jpegOff + 4096, view.byteLength - 12); p++) {
              if (
                view.getUint32(p, false) === 0x45786966 && // "Exif"
                view.getUint16(p + 4, false) === 0x0000
              ) {
                tiffOffset = p + 6;
                break;
              }
            }
          }
        }
      }

      const bom = view.getUint16(tiffOffset, false);
      if (bom !== 0x4949 && bom !== 0x4d4d) return 1;
      const little = bom === 0x4949;
      const ifd0 = view.getUint32(tiffOffset + 4, little);
      const dirPos = tiffOffset + ifd0;
      if (dirPos + 2 >= view.byteLength) return 1;

      const entries = view.getUint16(dirPos, little);
      for (let i = 0; i < entries; i++) {
        const entryPos = dirPos + 2 + i * 12;
        if (entryPos + 12 > view.byteLength) break;
        const tag = view.getUint16(entryPos, little);
        if (tag === 0x0112) {
          return view.getUint16(entryPos + 8, little) || 1;
        }
      }
    } catch (e) {}
    return 1;
  }

  // RAWバイナリから最大解像度の内包イメージを高速抽出
  function extractLargestEmbeddedImage(buffer) {
    const bytes = new Uint8Array(buffer);
    const len = bytes.length;
    const candidates = [];

    let i = 0;
    while (i < len - 4) {
      // JPEG SOI (FF D8 FF)
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
        const start = i;
        let end = -1;
        // SOIから次のEOI (FF D9) をスキャン（最小20KB以上のデータのみ有効）
        let j = start + 4;
        while (j < len - 1) {
          if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
            const size = j + 2 - start;
            if (size > 20480) {
              const dims = getJpegDimensions(bytes, start, j + 2);
              if (dims.w >= 320 && dims.h >= 240) {
                end = j + 2;
                candidates.push({
                  start,
                  end,
                  size,
                  w: dims.w,
                  h: dims.h,
                  pixels: dims.w * dims.h
                });
                break;
              }
            }
          }
          j++;
        }
        i = end > start ? end : i + 3;
      } else {
        i++;
      }
    }

    if (candidates.length === 0) return null;
    // 総画素数が最大の画像を優先（同じならバイトサイズ最大）
    candidates.sort((a, b) => b.pixels - a.pixels || b.size - a.size);
    const best = candidates[0];
    return {
      blob: new Blob([bytes.subarray(best.start, best.end)], { type: 'image/jpeg' }),
      w: best.w,
      h: best.h
    };
  }

  // 非圧縮16bit/14bit/12bit DNG・TIFFセンサーデータ直接デモザイク（フォールバック用）
  function decodeUncompressedBayerRaw(buffer) {
    try {
      const view = new DataView(buffer);
      const bom = view.getUint16(0, false);
      if (bom !== 0x4949 && bom !== 0x4d4d) return null;
      const little = bom === 0x4949;
      const ifd0 = view.getUint32(4, little);

      const parseIfd = (offset) => {
        const tags = {};
        if (offset <= 0 || offset + 2 >= view.byteLength) return tags;
        const count = view.getUint16(offset, little);
        for (let i = 0; i < count; i++) {
          const p = offset + 2 + i * 12;
          if (p + 12 > view.byteLength) break;
          const tag = view.getUint16(p, little);
          const type = view.getUint16(p + 2, little);
          const num = view.getUint32(p + 4, little);
          let val = 0;
          if (type === 3 && num === 1) val = view.getUint16(p + 8, little);
          else if (type === 4 && num === 1) val = view.getUint32(p + 8, little);
          else val = view.getUint32(p + 8, little);
          tags[tag] = { type, num, val, rawOffset: p + 8 };
        }
        return tags;
      };

      const mainTags = parseIfd(ifd0);
      // SubIFD (0x014a) にフルサイズセンサーデータがある場合
      let targetTags = mainTags;
      if (mainTags[0x014a] && mainTags[0x014a].val > 0) {
        const subTags = parseIfd(mainTags[0x014a].val);
        if (subTags[0x0100] && subTags[0x0101]) {
          targetTags = subTags;
        }
      }

      const w = targetTags[0x0100]?.val || 0;
      const h = targetTags[0x0101]?.val || 0;
      const bps = targetTags[0x0102]?.val || 16;
      const comp = targetTags[0x0103]?.val || 1;
      const stripOff = targetTags[0x0111]?.val || 0;

      // 非圧縮 (compression === 1) かつ 12〜16bit センサーデータのみ対応
      if (w < 400 || h < 300 || comp !== 1 || stripOff <= 0) return null;
      const bytesPerSample = bps > 8 ? 2 : 1;
      if (stripOff + w * h * bytesPerSample > view.byteLength) return null;

      // 8x8グリッドサンプリングで高精細プレビュー生成（高速かつメモリ安全）
      const step = Math.max(2, Math.ceil(Math.sqrt((w * h) / 4000000)));
      const outW = Math.floor(w / step);
      const outH = Math.floor(h / step);
      const canvas = createInternalCanvas(outW, outH);
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(outW, outH);
      const dst = imgData.data;

      // 最大輝度サンプリング（オート露出スケーリング）
      let maxVal = 1;
      for (let y = 0; y < h - 2; y += step * 8) {
        for (let x = 0; x < w - 2; x += step * 8) {
          const idx = stripOff + (y * w + x) * bytesPerSample;
          const v = bytesPerSample === 2 ? view.getUint16(idx, little) : view.getUint8(idx);
          if (v > maxVal) maxVal = v;
        }
      }

      const invMax = 1 / maxVal;
      for (let oy = 0; oy < outH; oy++) {
        const sy = Math.min(h - 2, (oy * step) & ~1);
        for (let ox = 0; ox < outW; ox++) {
          const sx = Math.min(w - 2, (ox * step) & ~1);
          const p00 = stripOff + (sy * w + sx) * bytesPerSample;
          const p01 = p00 + bytesPerSample;
          const p10 = stripOff + ((sy + 1) * w + sx) * bytesPerSample;
          const p11 = p10 + bytesPerSample;

          const rRaw = bytesPerSample === 2 ? view.getUint16(p00, little) : view.getUint8(p00);
          const g1Raw = bytesPerSample === 2 ? view.getUint16(p01, little) : view.getUint8(p01);
          const g2Raw = bytesPerSample === 2 ? view.getUint16(p10, little) : view.getUint8(p10);
          const bRaw = bytesPerSample === 2 ? view.getUint16(p11, little) : view.getUint8(p11);

          // リニア→sRGBガンマ変換 (1/2.2乗) + デイライトホワイトバランス補正
          const r = Math.min(255, Math.pow(Math.min(1, rRaw * invMax * 1.45), 0.45) * 255);
          const g = Math.min(255, Math.pow(Math.min(1, ((g1Raw + g2Raw) * 0.5) * invMax), 0.45) * 255);
          const b = Math.min(255, Math.pow(Math.min(1, bRaw * invMax * 1.35), 0.45) * 255);

          const di = (oy * outW + ox) * 4;
          dst[di] = r;
          dst[di + 1] = g;
          dst[di + 2] = b;
          dst[di + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      return { canvas, w, h };
    } catch (e) {
      return null;
    }
  }

  // Exif Orientation に従ってキャンバスを回転補正
  function drawWithOrientation(sourceImg, orientation, targetW, targetH) {
    const swap = orientation >= 5 && orientation <= 8;
    const outW = swap ? targetH : targetW;
    const outH = swap ? targetW : targetH;
    const canvas = createInternalCanvas(outW, outH);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, outW, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, outW, outH); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, outH); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, outW, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, outW, outH); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, outH); break;
      default: break;
    }
    origDrawImage.call(ctx, sourceImg, 0, 0, targetW, targetH);
    ctx.restore();
    return canvas;
  }

  // RAWトーンカーブ＆ホワイトバランス現像処理
  function renderDevelopedRawCanvas() {
    const src = addonState.raw.sourceCanvas;
    if (!src || !src.width || !src.height) return null;

    const { ev, temp, tint, highlights, shadows } = addonState.raw;
    const isNeutral =
      ev === 0 && temp === 0 && tint === 0 && highlights === 0 && shadows === 0;

    if (isNeutral) return src;

    const out = createInternalCanvas(src.width, src.height);
    const ctx = out.getContext('2d');
    origDrawImage.call(ctx, src, 0, 0);

    const imgData = ctx.getImageData(0, 0, out.width, out.height);
    const d = imgData.data;

    // 露光ゲイン (EV)
    const evMult = Math.pow(2, ev * 0.85);
    // 色温度 & 色かぶりゲイン
    const rGain = (1 + (temp / 100) * 0.42 + (tint / 100) * 0.14) * evMult;
    const gGain = (1 - (tint / 100) * 0.24) * evMult;
    const bGain = (1 - (temp / 100) * 0.42 + (tint / 100) * 0.14) * evMult;

    const hiAmt = highlights / 100; // -1 ~ +1
    const shAmt = shadows / 100;    // -1 ~ +1

    // 256段階のルックアップテーブル＋輝度マスクで高速処理
    const rLut = new Float32Array(256);
    const gLut = new Float32Array(256);
    const bLut = new Float32Array(256);

    for (let i = 0; i < 256; i++) {
      // 擬似リニア空間でEVとWBを適用し、ハイライトをロールオフ（粘り）させる
      const linR = Math.pow(i / 255, 2.0) * rGain;
      const linG = Math.pow(i / 255, 2.0) * gGain;
      const linB = Math.pow(i / 255, 2.0) * bGain;

      // ソフトニー圧縮（白飛び防止）
      const compR = linR / (1 + Math.max(0, linR - 0.85) * 0.45);
      const compG = linG / (1 + Math.max(0, linG - 0.85) * 0.45);
      const compB = linB / (1 + Math.max(0, linB - 0.85) * 0.45);

      rLut[i] = Math.pow(Math.min(1.3, compR), 0.5) * 255;
      gLut[i] = Math.pow(Math.min(1.3, compG), 0.5) * 255;
      bLut[i] = Math.pow(Math.min(1.3, compB), 0.5) * 255;
    }

    for (let i = 0; i < d.length; i += 4) {
      let r = rLut[d[i]];
      let g = gLut[d[i + 1]];
      let b = bLut[d[i + 2]];

      if (hiAmt !== 0 || shAmt !== 0) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        let toneShift = 0;
        if (hiAmt !== 0 && lum > 0.45) {
          const wHi = (lum - 0.45) / 0.55;
          toneShift += hiAmt * (wHi * wHi) * 58;
        }
        if (shAmt !== 0 && lum < 0.55) {
          const wSh = (0.55 - lum) / 0.55;
          toneShift += shAmt * (wSh * wSh) * 62;
        }
        r += toneShift;
        g += toneShift;
        b += toneShift;
      }

      d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }

    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  // デコード済みキャンバスを本体の <input type="file"> に注入してフィルム現像パイプラインを起動
  function injectCanvasIntoHost(canvas, baseName = 'developed_raw.jpg') {
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) {
      // 万が一inputが見つからない場合はmainCanvasへ直接描画
      const main = getMainCanvas();
      if (main) {
        main.width = canvas.width;
        main.height = canvas.height;
        origDrawImage.call(main.getContext('2d'), canvas, 0, 0);
        captureCleanCanvas();
        applyVisualsFromClean();
      }
      return;
    }

    // 現在の本体スライダー値を退避（画像差し替え時にリセットされた場合の復元用）
    const savedSliders = getAllSliders().map((s) => ({ el: s, val: s.value }));

    origToBlob.call(canvas, (blob) => {
      if (!blob) return;
      const safeName = baseName.replace(/\.[^.]+$/, '') + '.jpg';
      const file = new File([blob], safeName, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;

        addonState.bypassFileHook = true;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        addonState.bypassFileHook = false;

        // 本体側がスライダーを初期化していたら元の値を再適用
        setTimeout(() => {
          savedSliders.forEach(({ el, val }) => {
            if (el && el.value !== val) {
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
        }, 120);
      } catch (err) {
        addonState.bypassFileHook = false;
        console.warn('DataTransfer injection fallback:', err);
      }
    }, 'image/jpeg', 0.96);
  }

  async function processRawFile(file) {
    const ext = file.name.split('.').pop().toUpperCase();
    showToast(`⏳ ${ext} RAWファイルを現像デコード中...`);

    try {
      const buffer = await file.arrayBuffer();
      const orientation = readRawOrientation(buffer);
      const embedded = extractLargestEmbeddedImage(buffer);

      let rawBaseCanvas = null;
      let origW = 0;
      let origH = 0;

      if (embedded) {
        origW = embedded.w;
        origH = embedded.h;
        const imgUrl = URL.createObjectURL(embedded.blob);
        const img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = imgUrl;
        });
        URL.revokeObjectURL(imgUrl);

        const safe = getSafeDimensions(img.naturalWidth || origW, img.naturalHeight || origH);
        rawBaseCanvas = drawWithOrientation(img, orientation, safe.w, safe.h);
      } else {
        const bayer = decodeUncompressedBayerRaw(buffer);
        if (bayer) {
          origW = bayer.w;
          origH = bayer.h;
          rawBaseCanvas = drawWithOrientation(bayer.canvas, orientation, bayer.canvas.width, bayer.canvas.height);
        }
      }

      if (!rawBaseCanvas) {
        showToast(`⚠️ この ${ext} 形式は非対応か破損しています`);
        return;
      }

      // 元画像（Before用）とRAWソースを保存
      addonState.originalBitmap = rawBaseCanvas;
      addonState.originalDataUrl = null;
      addonState.raw = {
        isRawFile: true,
        fileName: file.name,
        formatLabel: `${ext} RAW`,
        origDims: origW && origH ? `${origW}×${origH} → ${rawBaseCanvas.width}×${rawBaseCanvas.height}px` : `${rawBaseCanvas.width}×${rawBaseCanvas.height}px`,
        sourceCanvas: rawBaseCanvas,
        ev: 0,
        temp: 0,
        tint: 0,
        highlights: 0,
        shadows: 0
      };

      injectCanvasIntoHost(rawBaseCanvas, file.name);

      // RAW現像タブを自動で開いてすぐ調整できるようにする
      addonState.activeTab = 'raw';
      drawer.classList.add('open');
      drawer.querySelectorAll('.hb-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === 'raw');
      });
      renderDrawerBody();

      showToast(`✅ ${ext} RAW読み込み完了！ (${rawBaseCanvas.width}×${rawBaseCanvas.height})`);
    } catch (err) {
      console.error('RAW decode error:', err);
      showToast('⚠️ RAWファイルの読み込みに失敗しました');
    }
  }

  // ==========================================
  // 5. ファイル選択の総合ハンドラ（RAW & 通常画像）
  // ==========================================
  document.addEventListener('change', async (e) => {
    if (addonState.bypassFileHook) return;
    if (e.target && e.target.type === 'file' && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // RAWファイルの場合は専用デコーダへ分岐
      if (isRawFileName(file.name)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        await processRawFile(file);
        return;
      }

      // 通常のJPEG/PNG/HEICの場合もRAW現像タブでトーン調整できるようベース画像を保持
      addonState.originalBitmap = null;
      addonState.originalDataUrl = null;

      try {
        let decoded = null;
        if (typeof createImageBitmap === 'function') {
          decoded = await createImageBitmap(file);
        } else {
          const dataUrl = await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = (ev) => res(ev.target.result);
            reader.readAsDataURL(file);
          });
          addonState.originalDataUrl = dataUrl;
          decoded = await new Promise((res) => {
            const img = new Image();
            img.onload = () => res(img);
            img.src = dataUrl;
          });
        }

        if (decoded) {
          addonState.originalBitmap = decoded;
          const dw = decoded.naturalWidth || decoded.width;
          const dh = decoded.naturalHeight || decoded.height;
          const safe = getSafeDimensions(dw, dh);
          const baseC = createInternalCanvas(safe.w, safe.h);
          origDrawImage.call(baseC.getContext('2d'), decoded, 0, 0, safe.w, safe.h);

          const ext = file.name.split('.').pop().toUpperCase();
          addonState.raw = {
            isRawFile: false,
            fileName: file.name,
            formatLabel: ext,
            origDims: `${safe.w}×${safe.h}px`,
            sourceCanvas: baseC,
            ev: 0,
            temp: 0,
            tint: 0,
            highlights: 0,
            shadows: 0
          };
          if (drawer.classList.contains('open') && addonState.activeTab === 'raw') {
            renderDrawerBody();
          }
        }
      } catch (err) {
        console.warn('Image decode warning:', err);
      }
    }
  }, true);

  // ==========================================
  // 6. スタイル注入（本体デザインに統一）
  // ==========================================
  const style = document.createElement('style');
  style.textContent = `
    #hb-addon-fab {
      position: fixed;
      right: 14px;
      bottom: 18px;
      z-index: 9990;
      background: linear-gradient(135deg, #f5a623, #d9820b);
      color: #0e0f12;
      border: none;
      border-radius: 999px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.05em;
      box-shadow: 0 6px 20px rgba(245, 166, 35, 0.45);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      touch-action: manipulation;
    }
    #hb-addon-fab:active { transform: scale(0.95); }

    #hb-addon-drawer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9995;
      background: #17191f;
      border-top: 1px solid #2c303b;
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.85);
      color: #f0f2f5;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      transform: translateY(105%);
      transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    }
    #hb-addon-drawer.open { transform: translateY(0); }

    .hb-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid #2c303b;
      gap: 6px;
    }
    .hb-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
    }
    .hb-tab {
      background: #1f222a;
      color: #949ba8;
      border: 1px solid #2c303b;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .hb-tab.active {
      background: #f5a623;
      color: #0e0f12;
      border-color: #f5a623;
    }
    .hb-ver-badge {
      font-size: 10px;
      color: #6b7280;
      font-family: monospace;
      white-space: nowrap;
    }
    .hb-close {
      background: #1f222a;
      color: #f0f2f5;
      border: 1px solid #2c303b;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      font-size: 15px;
      cursor: pointer;
      flex-shrink: 0;
    }

    .hb-body {
      padding: 14px 16px 28px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .hb-card {
      background: #1f222a;
      border: 1px solid #2c303b;
      border-radius: 12px;
      padding: 12px;
    }
    .hb-card-title {
      font-size: 12px;
      font-weight: 700;
      color: #f5a623;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hb-slider-row {
      margin-bottom: 10px;
    }
    .hb-slider-row:last-child {
      margin-bottom: 0;
    }
    .hb-slider-head {
      display: flex;
      justify-content: space-between;
      font-size: 11.5px;
      color: #d0d5dd;
      margin-bottom: 4px;
    }
    .hb-slider-val {
      font-family: monospace;
      color: #f5a623;
      font-weight: 700;
    }
    .hb-range {
      width: 100%;
      accent-color: #f5a623;
    }
    .hb-btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .hb-chip {
      background: #17191f;
      color: #f0f2f5;
      border: 1px solid #2c303b;
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 12px;
      cursor: pointer;
      flex: 1 1 auto;
      text-align: center;
      touch-action: manipulation;
    }
    .hb-chip.active {
      background: rgba(245, 166, 35, 0.18);
      border-color: #f5a623;
      color: #f5a623;
      font-weight: 700;
    }
    .hb-action-btn {
      width: 100%;
      background: #f5a623;
      color: #0e0f12;
      border: none;
      border-radius: 10px;
      padding: 12px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      margin-top: 6px;
      touch-action: manipulation;
    }
    .hb-action-btn.secondary {
      background: #2c303b;
      color: #f0f2f5;
    }
    .hb-recipe-slot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #17191f;
      border: 1px solid #2c303b;
      border-radius: 8px;
      padding: 7px 10px;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .hb-roll-strip {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding: 6px 0;
      min-height: 44px;
    }
    .hb-roll-thumb {
      width: 40px;
      height: 40px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #f5a623;
      flex-shrink: 0;
    }
    #hb-toast {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      background: rgba(23, 25, 31, 0.96);
      border: 1px solid #f5a623;
      color: #f0f2f5;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      z-index: 10020;
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s ease;
      white-space: nowrap;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    }
    #hb-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    #hb-flash {
      position: fixed;
      inset: 0;
      background: #fff;
      z-index: 10015;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease-out;
    }
  `;
  document.head.appendChild(style);

  function showToast(msg) {
    let toast = document.getElementById('hb-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hb-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function triggerShutterFlash() {
    let flash = document.getElementById('hb-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'hb-flash';
      document.body.appendChild(flash);
    }
    flash.style.opacity = '0.85';
    if (navigator.vibrate) navigator.vibrate(25);
    setTimeout(() => { flash.style.opacity = '0'; }, 90);
  }

  // ==========================================
  // 7. ビジュアルエフェクト描画エンジン
  // ==========================================
  function seededRandom(seed) {
    const x = Math.sin(seed * 9999.91) * 10000;
    return x - Math.floor(x);
  }

  function renderEffectsOnCanvas(ctx, w, h) {
    // --- A. ライトリーク（光漏れ） ---
    if (addonState.leakSeed > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const s = addonState.leakSeed;
      const alpha = addonState.leakOpacity;

      const x1 = seededRandom(s + 1) * w;
      const y1 = seededRandom(s + 2) * h;
      const r1 = Math.max(w, h) * (0.45 + seededRandom(s + 3) * 0.45);
      const grad1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
      grad1.addColorStop(0, `rgba(255, 110, 20, ${alpha})`);
      grad1.addColorStop(0.45, `rgba(255, 45, 55, ${alpha * 0.55})`);
      grad1.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, w, h);

      const x2 = seededRandom(s + 4) * w;
      const y2 = seededRandom(s + 5) * h;
      const r2 = Math.max(w, h) * 0.4;
      const grad2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
      grad2.addColorStop(0, `rgba(255, 210, 90, ${alpha * 0.8})`);
      grad2.addColorStop(1, 'rgba(255, 160, 0, 0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // --- B. フレーム & 6x6 スクエア ---
    let contentRect = { x: 0, y: 0, w, h };

    if (addonState.frameMode === '6x6') {
      const temp = createInternalCanvas(w, h);
      origDrawImage.call(temp.getContext('2d'), ctx.canvas, 0, 0);

      const sq = Math.min(w, h);
      const sx = (w - sq) / 2;
      const sy = (h - sq) / 2;

      ctx.save();
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, w, h);

      const border = Math.round(sq * 0.055);
      const inner = sq - border * 2;
      const dx = (w - sq) / 2 + border;
      const dy = (h - sq) / 2 + border;

      origDrawImage.call(ctx, temp, sx, sy, sq, sq, dx, dy, inner, inner);

      // ハッセルブラッド風 Vノッチ
      ctx.fillStyle = '#09090b';
      [0.28, 0.72].forEach((pos) => {
        ctx.beginPath();
        ctx.moveTo(dx - 1, dy + inner * pos - border * 0.25);
        ctx.lineTo(dx + border * 0.35, dy + inner * pos);
        ctx.lineTo(dx - 1, dy + inner * pos + border * 0.25);
        ctx.closePath();
        ctx.fill();
      });

      // フィルムエッジ印字
      ctx.fillStyle = 'rgba(245, 166, 35, 0.85)';
      ctx.font = `bold ${Math.max(11, Math.round(border * 0.36))}px monospace`;
      ctx.fillText('HASSURUBLAD 6x6   120 FILM   ► 12', dx, dy - border * 0.3);

      contentRect = { x: dx, y: dy, w: inner, h: inner };
      ctx.restore();
    } else if (addonState.frameMode === 'polaroid') {
      const temp = createInternalCanvas(w, h);
      origDrawImage.call(temp.getContext('2d'), ctx.canvas, 0, 0);

      ctx.save();
      ctx.fillStyle = '#f4f2ed';
      ctx.fillRect(0, 0, w, h);
      const pad = Math.round(Math.min(w, h) * 0.055);
      const bottomPad = Math.round(h * 0.16);
      const iw = w - pad * 2;
      const ih = h - pad - bottomPad;
      origDrawImage.call(ctx, temp, 0, 0, w, h, pad, pad, iw, ih);
      contentRect = { x: pad, y: pad, w: iw, h: ih };
      ctx.restore();
    } else if (addonState.frameMode === 'cinema') {
      const bar = Math.round(h * 0.11);
      ctx.save();
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
      contentRect = { x: 0, y: bar, w, h: h - bar * 2 };
      ctx.restore();
    }

    // --- C. フィルム日付印字（デートバック） ---
    if (addonState.dateMode !== 'off') {
      let dateText = '';
      if (addonState.dateMode === 'today') {
        const d = new Date();
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dateText = `'${yy} ${mm} ${dd}`;
      } else if (addonState.dateMode === '90s') {
        dateText = `'98 08 24`;
      } else {
        dateText = `'${addonState.customDate.replace(/^'/, '')}`;
      }

      ctx.save();
      const fontSize = Math.max(16, Math.round(contentRect.w * 0.036));
      ctx.font = `bold ${fontSize}px "Courier New", monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(255, 80, 0, 0.95)';
      ctx.shadowBlur = Math.round(fontSize * 0.45);
      ctx.fillStyle = '#ff7b1c';

      const tx = contentRect.x + contentRect.w - fontSize * 0.9;
      const ty = contentRect.y + contentRect.h - fontSize * 0.7;
      ctx.fillText(dateText, tx, ty);
      ctx.fillText(dateText, tx, ty);
      ctx.restore();
    }
  }

  function applyVisualsFromClean() {
    if (addonState.isApplying) return;
    const canvas = getMainCanvas();
    if (!canvas) return;
    if (!cleanCanvas.width || !cleanCanvas.height) {
      captureCleanCanvas();
    }
    if (!cleanCanvas.width || !cleanCanvas.height) return;

    addonState.isApplying = true;
    try {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      origDrawImage.call(ctx, cleanCanvas, 0, 0);

      const hasEffect =
        addonState.dateMode !== 'off' ||
        addonState.frameMode !== 'off' ||
        addonState.leakSeed > 0;

      if (hasEffect) {
        renderEffectsOnCanvas(ctx, canvas.width, canvas.height);
      }
    } finally {
      addonState.isApplying = false;
    }
  }

  setTimeout(() => {
    if (!cleanCanvas.width) captureCleanCanvas();
  }, 200);

  // ==========================================
  // 8. フル解像度書き出し & iOS PWA 100%確実保存モーダル
  // ==========================================
  function findHostSaveButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find((b) => {
      if (b.id && b.id.startsWith('hb-')) return false;
      if (b.closest('#hb-addon-drawer') || b.closest('#hb-save-modal')) return false;
      const txt = (b.textContent || '').trim();
      return txt === '保存' || txt.includes('保存');
    });
  }

  function getSourceDimensions(imgOrBitmap) {
    if (!imgOrBitmap) return { w: 0, h: 0 };
    return {
      w: imgOrBitmap.naturalWidth || imgOrBitmap.width || 0,
      h: imgOrBitmap.naturalHeight || imgOrBitmap.height || 0
    };
  }

  function generateFullResProcessedCanvas() {
    return new Promise((resolve) => {
      const hostSaveBtn = findHostSaveButton();

      const buildFallbackFullRes = () => {
        const src = getMainCanvas();
        if (!src) {
          resolve(null);
          return;
        }

        let targetW = src.width;
        let targetH = src.height;
        const origDims = getSourceDimensions(addonState.originalBitmap);
        if (origDims.w > 0 && origDims.h > 0) {
          const safe = getSafeDimensions(origDims.w, origDims.h);
          targetW = safe.w;
          targetH = safe.h;
        }

        const out = createInternalCanvas(targetW, targetH);
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const base = cleanCanvas.width > 0 ? cleanCanvas : src;
        origDrawImage.call(ctx, base, 0, 0, targetW, targetH);

        const hasEffect =
          addonState.dateMode !== 'off' ||
          addonState.frameMode !== 'off' ||
          addonState.leakSeed > 0;

        if (hasEffect) {
          renderEffectsOnCanvas(ctx, targetW, targetH);
        }

        if (addonState.frameMode === '6x6' && targetW !== targetH) {
          const sq = Math.min(targetW, targetH);
          const sqOut = createInternalCanvas(sq, sq);
          origDrawImage.call(
            sqOut.getContext('2d'),
            out,
            (targetW - sq) / 2,
            (targetH - sq) / 2,
            sq,
            sq,
            0,
            0,
            sq,
            sq
          );
          resolve(sqOut);
          return;
        }

        resolve(out);
      };

      if (!hostSaveBtn) {
        buildFallbackFullRes();
        return;
      }

      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          addonState.interceptHostExport = false;
          addonState.onHostCanvasCaptured = null;
          buildFallbackFullRes();
        }
      }, 2200);

      addonState.interceptHostExport = true;
      addonState.onHostCanvasCaptured = (capturedCanvas) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(capturedCanvas);
        }
      };

      addonState.bypassHostClick = true;
      try {
        hostSaveBtn.click();
      } finally {
        addonState.bypassHostClick = false;
      }
    });
  }

  function presentSaveModal(canvas, filename, titleText = '現像完了') {
    const quality = 0.97;
    const dimsText = `${canvas.width} × ${canvas.height} px`;
    const dataUrl = origToDataURL.call(canvas, 'image/jpeg', quality);

    let readyBlob = null;
    origToBlob.call(canvas, (blob) => {
      readyBlob = blob;
    }, 'image/jpeg', quality);

    let modal = document.getElementById('hb-save-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hb-save-modal';
      modal.style.cssText = `
        position: fixed; inset: 0; z-index: 10010;
        background: rgba(9, 10, 13, 0.96);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 18px; color: #f0f2f5; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      `;
      document.body.appendChild(modal);
    }

    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    modal.innerHTML = `
      <div style="font-size:15px;font-weight:800;color:#f5a623;margin-bottom:4px;">${titleText}</div>
      <div style="font-size:11px;color:#949ba8;margin-bottom:10px;">出力解像度: <b style="color:#f0f2f5;">${dimsText}</b></div>
      <img src="${dataUrl}" style="max-width:100%;max-height:54vh;border-radius:10px;border:1px solid #2c303b;box-shadow:0 8px 28px rgba(0,0,0,0.75);object-fit:contain;">
      <div style="font-size:12px;color:#d0d5dd;margin-top:12px;text-align:center;line-height:1.5;">
        上の画像を<b>長押し →「写真に保存」</b><br>または下のボタンから写真アプリに保存できます
      </div>
      <div style="display:flex;gap:10px;width:100%;max-width:340px;margin-top:14px;">
        ${canNativeShare ? `<button id="hb-modal-share" style="flex:2;background:#f5a623;color:#0e0f12;border:none;border-radius:999px;padding:12px 16px;font-size:13px;font-weight:800;cursor:pointer;">📤 共有 / 写真に保存</button>` : ''}
        <button id="hb-modal-close" style="flex:1;background:#2c303b;color:#f0f2f5;border:none;border-radius:999px;padding:12px 16px;font-size:13px;font-weight:700;cursor:pointer;">閉じる</button>
      </div>
    `;
    modal.style.display = 'flex';

    const shareBtn = modal.querySelector('#hb-modal-share');
    if (shareBtn) {
      shareBtn.onclick = async () => {
        try {
          if (!readyBlob) {
            const res = await fetch(dataUrl);
            readyBlob = await res.blob();
          }
          const file = new File([readyBlob], filename, { type: 'image/jpeg' });
          await navigator.share({
            files: [file],
            title: 'HASSURUBLAD'
          });
        } catch (err) {
          if (err && err.name !== 'AbortError') {
            showToast('上の画像を長押しして「写真に保存」してください');
          }
        }
      };
    }

    modal.querySelector('#hb-modal-close').onclick = () => {
      modal.style.display = 'none';
    };
  }

  // 本体上部の「💾 保存」ボタンを乗っ取ってフル画質保存モーダルへ統一
  document.addEventListener('click', async (e) => {
    if (addonState.bypassHostClick) return;
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    if (btn.id && btn.id.startsWith('hb-')) return;
    if (btn.closest('#hb-addon-drawer') || btn.closest('#hb-save-modal')) return;

    const txt = (btn.textContent || '').trim();
    if (txt === '保存' || txt.includes('保存')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showToast('⏳ フル画質で現像中...');
      const fullCanvas = await generateFullResProcessedCanvas();
      if (fullCanvas) {
        presentSaveModal(fullCanvas, `hassurublad_${Date.now()}.jpg`, '💾 フル画質現像完了');
      } else {
        showToast('⚠️ 画像の書き出しに失敗しました');
      }
    }
  }, true);

  // ==========================================
  // 9. Before / After 2枚並べ保存
  // ==========================================
  async function exportBeforeAfter() {
    showToast('⏳ Before / After をフル画質で生成中...');
    const afterCanvas = await generateFullResProcessedCanvas();
    if (!afterCanvas) {
      showToast('⚠️ 画像が見つかりませんでした');
      return;
    }

    const renderCompareCanvas = (beforeSource) => {
      const singleMaxPixels = Math.floor(MAX_CANVAS_PIXELS * 0.45);
      let w = afterCanvas.width;
      let h = afterCanvas.height;
      if (w * h > singleMaxPixels) {
        const scale = Math.sqrt(singleMaxPixels / (w * h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const gap = Math.max(12, Math.round(w * 0.015));
      const labelH = Math.max(44, Math.round(h * 0.055));

      const out = createInternalCanvas(w * 2 + gap, h + labelH);
      const ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.fillStyle = '#0e0f12';
      ctx.fillRect(0, 0, out.width, out.height);

      if (beforeSource) {
        const bDims = getSourceDimensions(beforeSource);
        if (addonState.frameMode === '6x6' && bDims.w > 0 && bDims.h > 0 && bDims.w !== bDims.h) {
          const sq = Math.min(bDims.w, bDims.h);
          origDrawImage.call(
            ctx,
            beforeSource,
            (bDims.w - sq) / 2,
            (bDims.h - sq) / 2,
            sq,
            sq,
            0,
            0,
            w,
            h
          );
        } else {
          origDrawImage.call(ctx, beforeSource, 0, 0, w, h);
        }
      }
      origDrawImage.call(ctx, afterCanvas, w + gap, 0, w, h);

      ctx.fillStyle = '#949ba8';
      ctx.font = `bold ${Math.max(16, Math.round(labelH * 0.45))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('BEFORE', w / 2, h + labelH * 0.68);

      ctx.fillStyle = '#f5a623';
      ctx.fillText('AFTER  •  HASSURUBLAD', w + gap + w / 2, h + labelH * 0.68);

      presentSaveModal(out, `hassurublad_compare_${Date.now()}.jpg`, '🌓 Before / After 比較画像');
    };

    if (addonState.originalBitmap) {
      renderCompareCanvas(addonState.originalBitmap);
      return;
    }

    if (addonState.originalDataUrl) {
      const img = new Image();
      img.onload = () => renderCompareCanvas(img);
      img.onerror = () => renderCompareCanvas(cleanCanvas.width ? cleanCanvas : afterCanvas);
      img.src = addonState.originalDataUrl;
      return;
    }

    renderCompareCanvas(cleanCanvas.width ? cleanCanvas : afterCanvas);
  }

  // ==========================================
  // 10. Myレシピ / シェイク / 24枚撮りロール
  // ==========================================
  function getAllSliders() {
    return Array.from(document.querySelectorAll('input[type="range"]')).filter(
      (el) => !el.id.startsWith('hb-')
    );
  }

  function saveRecipe(slotIdx) {
    const defaultName = `マイレシピ #${slotIdx + 1}`;
    const name = prompt('レシピの名前を入力してください（例：放課後の夕焼け）', defaultName);
    if (name === null) return;

    const sliders = getAllSliders().map((s) => s.value);
    myRecipes[slotIdx] = {
      name: name.trim() || defaultName,
      sliders,
      raw: {
        ev: addonState.raw.ev,
        temp: addonState.raw.temp,
        tint: addonState.raw.tint,
        highlights: addonState.raw.highlights,
        shadows: addonState.raw.shadows
      },
      addon: {
        dateMode: addonState.dateMode,
        customDate: addonState.customDate,
        frameMode: addonState.frameMode,
        leakSeed: addonState.leakSeed,
        leakOpacity: addonState.leakOpacity
      }
    };
    if (saveJson(STORAGE_RECIPES, myRecipes)) {
      renderDrawerBody();
      showToast(`💾「${myRecipes[slotIdx].name}」を保存しました`);
    } else {
      showToast('⚠️ 保存容量がいっぱいです');
    }
  }

  function loadRecipe(slotIdx) {
    const rec = myRecipes[slotIdx];
    if (!rec) return;

    if (rec.raw && addonState.raw.sourceCanvas) {
      Object.assign(addonState.raw, rec.raw);
      const devCanvas = renderDevelopedRawCanvas();
      if (devCanvas) injectCanvasIntoHost(devCanvas, addonState.raw.fileName || 'recipe.jpg');
    }

    setTimeout(() => {
      const sliders = getAllSliders();
      rec.sliders.forEach((val, idx) => {
        if (sliders[idx]) {
          sliders[idx].value = val;
          sliders[idx].dispatchEvent(new Event('input', { bubbles: true }));
          sliders[idx].dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      if (rec.addon) {
        Object.assign(addonState, rec.addon);
      }
      applyVisualsFromClean();
      renderDrawerBody();
      showToast(`✨「${rec.name}」を呼び出しました`);
    }, 150);
  }

  let lastShakeTime = 0;

  function randomizeDevelopment() {
    const sliders = getAllSliders();
    sliders.forEach((s) => {
      const hint = `${s.id} ${s.name} ${s.className}`.toLowerCase();
      if (hint.includes('split') || hint.includes('zoom')) return;

      const min = parseFloat(s.min || 0);
      const max = parseFloat(s.max || 100);
      const step = parseFloat(s.step || 1);
      const center = (min + max) / 2;
      const span = (max - min) * 0.65;
      let val = center + (Math.random() - 0.5) * span;
      val = Math.round(val / step) * step;
      s.value = Math.min(max, Math.max(min, val));
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });

    if (Math.random() < 0.4) {
      addonState.leakSeed = Math.floor(Math.random() * 1000) + 1;
    } else {
      addonState.leakSeed = 0;
    }
    applyVisualsFromClean();
    renderDrawerBody();
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    showToast('🎲 おまかせ現像を実行しました！');
  }

  window.addEventListener('devicemotion', (e) => {
    if (!addonState.shakeEnabled) return;
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const total = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
    const now = Date.now();
    if (total > 34 && now - lastShakeTime > 1500) {
      lastShakeTime = now;
      randomizeDevelopment();
    }
  });

  async function toggleShakeMode() {
    if (!addonState.shakeEnabled) {
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function'
      ) {
        try {
          const res = await DeviceMotionEvent.requestPermission();
          if (res !== 'granted') {
            showToast('⚠️ モーションセンサーが許可されませんでした');
            return;
          }
        } catch (err) {
          showToast('⚠️ センサー許可エラー');
          return;
        }
      }
      addonState.shakeEnabled = true;
      showToast('📳 シェイク現像 ON！スマホを振ってみてください');
    } else {
      addonState.shakeEnabled = false;
      showToast('シェイク現像 OFF');
    }
    renderDrawerBody();
  }

  function shootToFilmRoll() {
    if (filmRoll.length >= 24) {
      showToast('🎞️ 24枚撮り切りました！コンタクトシートを現像できます');
      return;
    }
    const src = getMainCanvas();
    if (!src) return;

    triggerShutterFlash();

    const thumbW = 320;
    const thumbH = Math.round((src.height / src.width) * thumbW);
    const tCanvas = createInternalCanvas(thumbW, thumbH);
    origDrawImage.call(tCanvas.getContext('2d'), src, 0, 0, thumbW, thumbH);

    const compressed = origToDataURL.call(tCanvas, 'image/jpeg', 0.75);
    filmRoll.push(compressed);

    if (!saveJson(STORAGE_ROLL, filmRoll)) {
      filmRoll.pop();
      showToast('⚠️ ブラウザ保存容量の上限に達しました。現像してリセットしてください');
      return;
    }

    renderDrawerBody();
    const left = 24 - filmRoll.length;
    if (left === 0) {
      showToast('🎉 24枚撮り切り完了！「コンタクトシート現像」を押そう！');
    } else {
      showToast(`📸 記録完了！（残り ${left} 枚）`);
    }
  }

  function exportContactSheet() {
    if (filmRoll.length === 0) {
      showToast('まだ1枚も撮影されていません');
      return;
    }

    const cols = 4;
    const rows = 6;
    const cellW = 420;
    const cellH = 420;
    const pad = 36;
    const headerH = 110;

    const out = createInternalCanvas(cols * cellW + pad * 2, rows * cellH + headerH + pad);
    const ctx = out.getContext('2d');

    ctx.fillStyle = '#090a0d';
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.fillStyle = '#f5a623';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('HASSURUBLAD  •  CONTACT SHEET (24 EXP)', pad, 68);

    let loaded = 0;
    filmRoll.forEach((dataUrl, idx) => {
      const img = new Image();
      img.onload = () => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const x = pad + c * cellW;
        const y = headerH + r * cellH;

        ctx.fillStyle = '#f5a623';
        ctx.font = 'bold 18px monospace';
        ctx.fillText(`#${String(idx + 1).padStart(2, '0')}A`, x + 14, y + 24);

        const boxW = cellW - 28;
        const boxH = cellH - 48;
        const ratio = Math.min(boxW / img.width, boxH / img.height);
        const dw = img.width * ratio;
        const dh = img.height * ratio;
        origDrawImage.call(
          ctx,
          img,
          x + 14 + (boxW - dw) / 2,
          y + 32 + (boxH - dh) / 2,
          dw,
          dh
        );

        loaded++;
        if (loaded === filmRoll.length) {
          presentSaveModal(out, `hassurublad_contact_sheet_${Date.now()}.jpg`, '🎞️ コンタクトシート現像完了');
        }
      };
      img.src = dataUrl;
    });
  }

  // ==========================================
  // 11. UIパネル構築
  // ==========================================
  const fab = document.createElement('button');
  fab.id = 'hb-addon-fab';
  fab.innerHTML = '🎞️ LAB+';
  document.body.appendChild(fab);

  const drawer = document.createElement('div');
  drawer.id = 'hb-addon-drawer';
  drawer.innerHTML = `
    <div class="hb-header">
      <div class="hb-tabs">
        <button class="hb-tab active" data-tab="raw">1. RAW現像</button>
        <button class="hb-tab" data-tab="effects">2. エフェクト</button>
        <button class="hb-tab" data-tab="tools">3. ツール</button>
        <span class="hb-ver-badge">${ADDON_VERSION}</span>
      </div>
      <button class="hb-close" id="hb-close-btn">✕</button>
    </div>
    <div class="hb-body" id="hb-drawer-body"></div>
  `;
  document.body.appendChild(drawer);

  fab.addEventListener('click', () => {
    if (!cleanCanvas.width) captureCleanCanvas();
    drawer.classList.add('open');
    renderDrawerBody();
  });

  drawer.querySelector('#hb-close-btn').addEventListener('click', () => {
    drawer.classList.remove('open');
  });

  drawer.querySelectorAll('.hb-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      drawer.querySelectorAll('.hb-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      addonState.activeTab = tab.dataset.tab;
      renderDrawerBody();
    });
  });

  function applyRawAdjustments() {
    if (!addonState.raw.sourceCanvas) {
      // 初期サンプル画像の場合はcleanCanvasをベースにする
      if (cleanCanvas.width > 0) {
        const base = createInternalCanvas(cleanCanvas.width, cleanCanvas.height);
        origDrawImage.call(base.getContext('2d'), cleanCanvas, 0, 0);
        addonState.raw.sourceCanvas = base;
      } else {
        return;
      }
    }
    showToast('⏳ RAWトーンを現像反映中...');
    setTimeout(() => {
      const devCanvas = renderDevelopedRawCanvas();
      if (devCanvas) {
        injectCanvasIntoHost(devCanvas, addonState.raw.fileName || 'developed.jpg');
      }
    }, 10);
  }

  function renderDrawerBody() {
    const body = document.getElementById('hb-drawer-body');
    if (!body) return;

    if (addonState.activeTab === 'raw') {
      const r = addonState.raw;
      const statusBadge = r.fileName
        ? `<span style="color:#f5a623;font-family:monospace;">${r.formatLabel} • ${r.origDims}</span>`
        : `<span style="color:#949ba8;">未選択（ARW / CR3 / NEF / RAF / DNG 対応）</span>`;

      body.innerHTML = `
        <div class="hb-card">
          <div class="hb-card-title">
            <span>📷 RAWファイル読み込み</span>
            ${statusBadge}
          </div>
          <button class="hb-action-btn" id="hb-open-raw-btn" style="margin-top:0;">📂 RAW / 写真を選択して現像する</button>
          <div style="font-size:11px;color:#949ba8;margin-top:6px;line-height:1.4;">
            Sony(.ARW) / Canon(.CR2/.CR3) / Nikon(.NEF) / Fujifilm(.RAF) / Adobe・iPhone(.DNG) / Hasselblad(.3FR) など2400万画素クラスも直接開けます
          </div>
        </div>

        <div class="hb-card">
          <div class="hb-card-title">
            <span>🎚️ RAW現像パラメータ（露出・WB・階調）</span>
            <button class="hb-chip" id="hb-raw-reset" style="padding:3px 8px;font-size:11px;flex:0;">リセット</button>
          </div>

          <div class="hb-slider-row">
            <div class="hb-slider-head"><span>☀️ 露光量 (Exposure)</span><span class="hb-slider-val" id="hb-val-ev">${r.ev > 0 ? '+' + r.ev.toFixed(1) : r.ev.toFixed(1)} EV</span></div>
            <input type="range" class="hb-range" id="hb-raw-ev" min="-2" max="2" step="0.1" value="${r.ev}">
          </div>

          <div class="hb-slider-row">
            <div class="hb-slider-head"><span>🌡️ 色温度 (Temp 青 ↔ 暖色)</span><span class="hb-slider-val" id="hb-val-temp">${r.temp > 0 ? '+' + r.temp : r.temp}</span></div>
            <input type="range" class="hb-range" id="hb-raw-temp" min="-50" max="50" step="1" value="${r.temp}">
          </div>

          <div class="hb-slider-row">
            <div class="hb-slider-head"><span>🎨 色かぶり補正 (Tint 緑 ↔ 紫)</span><span class="hb-slider-val" id="hb-val-tint">${r.tint > 0 ? '+' + r.tint : r.tint}</span></div>
            <input type="range" class="hb-range" id="hb-raw-tint" min="-50" max="50" step="1" value="${r.tint}">
          </div>

          <div class="hb-slider-row">
            <div class="hb-slider-head"><span>☁️ ハイライト復元 (白飛び抑制)</span><span class="hb-slider-val" id="hb-val-hi">${r.highlights > 0 ? '+' + r.highlights : r.highlights}</span></div>
            <input type="range" class="hb-range" id="hb-raw-hi" min="-100" max="100" step="5" value="${r.highlights}">
          </div>

          <div class="hb-slider-row">
            <div class="hb-slider-head"><span>🌑 シャドウ持ち上げ (暗部復元)</span><span class="hb-slider-val" id="hb-val-sh">${r.shadows > 0 ? '+' + r.shadows : r.shadows}</span></div>
            <input type="range" class="hb-range" id="hb-raw-sh" min="-100" max="100" step="5" value="${r.shadows}">
          </div>
        </div>
      `;

      body.querySelector('#hb-open-raw-btn').addEventListener('click', () => {
        unlockFileInputs();
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
          fileInput.click();
        } else {
          const tempInp = document.createElement('input');
          tempInp.type = 'file';
          tempInp.onchange = (ev) => {
            if (ev.target.files && ev.target.files[0]) {
              processRawFile(ev.target.files[0]);
            }
          };
          tempInp.click();
        }
      });

      const bindRawSlider = (sliderId, valId, prop, fmt) => {
        const sl = body.querySelector(sliderId);
        const vl = body.querySelector(valId);
        sl.addEventListener('input', () => {
          const v = parseFloat(sl.value);
          addonState.raw[prop] = v;
          vl.textContent = fmt(v);
        });
        sl.addEventListener('change', () => {
          applyRawAdjustments();
        });
      };

      bindRawSlider('#hb-raw-ev', '#hb-val-ev', 'ev', (v) => `${v > 0 ? '+' + v.toFixed(1) : v.toFixed(1)} EV`);
      bindRawSlider('#hb-raw-temp', '#hb-val-temp', 'temp', (v) => `${v > 0 ? '+' + v : v}`);
      bindRawSlider('#hb-raw-tint', '#hb-val-tint', 'tint', (v) => `${v > 0 ? '+' + v : v}`);
      bindRawSlider('#hb-raw-hi', '#hb-val-hi', 'highlights', (v) => `${v > 0 ? '+' + v : v}`);
      bindRawSlider('#hb-raw-sh', '#hb-val-sh', 'shadows', (v) => `${v > 0 ? '+' + v : v}`);

      body.querySelector('#hb-raw-reset').addEventListener('click', () => {
        addonState.raw.ev = 0;
        addonState.raw.temp = 0;
        addonState.raw.tint = 0;
        addonState.raw.highlights = 0;
        addonState.raw.shadows = 0;
        renderDrawerBody();
        applyRawAdjustments();
      });

    } else if (addonState.activeTab === 'effects') {
      body.innerHTML = `
        <div class="hb-card">
          <div class="hb-card-title"><span>📅 フィルム日付印字（デートバック）</span></div>
          <div class="hb-btn-row">
            <button class="hb-chip ${addonState.dateMode === 'off' ? 'active' : ''}" data-date="off">OFF</button>
            <button class="hb-chip ${addonState.dateMode === 'today' ? 'active' : ''}" data-date="today">今日</button>
            <button class="hb-chip ${addonState.dateMode === '90s' ? 'active' : ''}" data-date="90s">'98 08 24</button>
            <button class="hb-chip ${addonState.dateMode === 'custom' ? 'active' : ''}" data-date="custom">日付指定</button>
          </div>
        </div>

        <div class="hb-card">
          <div class="hb-card-title"><span>🖼️ フレーム ＆ ハッセル風 6×6</span></div>
          <div class="hb-btn-row">
            <button class="hb-chip ${addonState.frameMode === 'off' ? 'active' : ''}" data-frame="off">OFF</button>
            <button class="hb-chip ${addonState.frameMode === '6x6' ? 'active' : ''}" data-frame="6x6">6×6 黒ネガ縁</button>
            <button class="hb-chip ${addonState.frameMode === 'polaroid' ? 'active' : ''}" data-frame="polaroid">白枠ポラ</button>
            <button class="hb-chip ${addonState.frameMode === 'cinema' ? 'active' : ''}" data-frame="cinema">シネマ黒帯</button>
          </div>
        </div>

        <div class="hb-card">
          <div class="hb-card-title">
            <span>☀️ ライトリーク（光漏れ）</span>
            <span>${addonState.leakSeed > 0 ? Math.round(addonState.leakOpacity * 100) + '%' : 'OFF'}</span>
          </div>
          <div class="hb-btn-row">
            <button class="hb-chip active" id="hb-leak-gen">✨ ランダム光漏れ</button>
            <button class="hb-chip" id="hb-leak-off">解除</button>
          </div>
          <input type="range" id="hb-leak-slider" min="0.2" max="1" step="0.05" value="${addonState.leakOpacity}" style="width:100%;margin-top:8px;">
        </div>

        <button class="hb-action-btn" id="hb-export-effect">💾 フル画質で保存（エフェクト適用）</button>
      `;

      body.querySelectorAll('[data-date]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.date;
          if (mode === 'custom') {
            const val = prompt('印字する日付を入力（例: 99 12 31）', addonState.customDate);
            if (val !== null && val.trim()) addonState.customDate = val.trim();
          }
          addonState.dateMode = mode;
          applyVisualsFromClean();
          renderDrawerBody();
        });
      });

      body.querySelectorAll('[data-frame]').forEach((btn) => {
        btn.addEventListener('click', () => {
          addonState.frameMode = btn.dataset.frame;
          applyVisualsFromClean();
          renderDrawerBody();
        });
      });

      body.querySelector('#hb-leak-gen').addEventListener('click', () => {
        addonState.leakSeed = Math.floor(Math.random() * 10000) + 1;
        applyVisualsFromClean();
        renderDrawerBody();
      });

      body.querySelector('#hb-leak-off').addEventListener('click', () => {
        addonState.leakSeed = 0;
        applyVisualsFromClean();
        renderDrawerBody();
      });

      body.querySelector('#hb-leak-slider').addEventListener('input', (e) => {
        addonState.leakOpacity = parseFloat(e.target.value);
        if (addonState.leakSeed === 0) addonState.leakSeed = 1;
        applyVisualsFromClean();
      });

      body.querySelector('#hb-export-effect').addEventListener('click', async () => {
        showToast('⏳ フル画質で現像中...');
        const c = await generateFullResProcessedCanvas();
        if (c) {
          presentSaveModal(c, `hassurublad_film_${Date.now()}.jpg`, '💾 フル画質現像写真');
        }
      });
    } else {
      const slotsHtml = myRecipes
        .map((rec, i) => {
          if (rec) {
            return `
              <div class="hb-recipe-slot">
                <span>🎨 <b>${rec.name}</b></span>
                <div style="display:flex;gap:6px;">
                  <button class="hb-chip active" data-load-rec="${i}" style="padding:4px 8px;">読込</button>
                  <button class="hb-chip" data-save-rec="${i}" style="padding:4px 8px;">上書</button>
                </div>
              </div>
            `;
          }
          return `
            <div class="hb-recipe-slot">
              <span style="color:#949ba8;">スロット ${i + 1}（空き）</span>
              <button class="hb-chip" data-save-rec="${i}" style="padding:4px 10px;">＋ 現在の設定を保存</button>
            </div>
          `;
        })
        .join('');

      const thumbsHtml = filmRoll
        .map((src) => `<img src="${src}" class="hb-roll-thumb">`)
        .join('');

      body.innerHTML = `
        <div class="hb-card">
          <div class="hb-card-title">
            <span>🎞️ フィルム24枚撮り切りモード</span>
            <span>残り ${24 - filmRoll.length} / 24 枚</span>
          </div>
          <div class="hb-roll-strip">${thumbsHtml || '<span style="color:#949ba8;font-size:11px;">下のボタンで撮った写真がここに並びます</span>'}</div>
          <button class="hb-action-btn" id="hb-roll-shoot">📸 シャッターを切る（ロールに記録）</button>
          <div class="hb-btn-row" style="margin-top:6px;">
            <button class="hb-chip active" id="hb-roll-sheet">🖼️ コンタクトシート現像 (${filmRoll.length}枚)</button>
            <button class="hb-chip" id="hb-roll-reset">🔄 新フィルム装填</button>
          </div>
        </div>

        <div class="hb-card">
          <div class="hb-card-title"><span>🎲 おまかせ現像 ＆ 比較書き出し</span></div>
          <div class="hb-btn-row">
            <button class="hb-chip ${addonState.shakeEnabled ? 'active' : ''}" id="hb-shake-toggle">
              📳 シェイク現像: ${addonState.shakeEnabled ? 'ON' : 'OFF'}
            </button>
            <button class="hb-chip" id="hb-random-now">🎲 今すぐランダム現像</button>
          </div>
          <button class="hb-action-btn secondary" id="hb-compare-export">🌓 Before / After 2枚並べ保存</button>
        </div>

        <div class="hb-card">
          <div class="hb-card-title"><span>🧪 Myレシピ（最大5個保存）</span></div>
          ${slotsHtml}
        </div>
      `;

      body.querySelector('#hb-roll-shoot').addEventListener('click', shootToFilmRoll);
      body.querySelector('#hb-roll-sheet').addEventListener('click', exportContactSheet);
      body.querySelector('#hb-roll-reset').addEventListener('click', () => {
        if (confirm('現在のフィルムをリセットして新しい24枚撮りフィルムを入れますか？')) {
          filmRoll = [];
          saveJson(STORAGE_ROLL, filmRoll);
          renderDrawerBody();
          showToast('🎞️ 新しい24枚撮りフィルムを装填しました');
        }
      });

      body.querySelector('#hb-shake-toggle').addEventListener('click', toggleShakeMode);
      body.querySelector('#hb-random-now').addEventListener('click', randomizeDevelopment);
      body.querySelector('#hb-compare-export').addEventListener('click', exportBeforeAfter);

      body.querySelectorAll('[data-save-rec]').forEach((btn) => {
        btn.addEventListener('click', () => saveRecipe(Number(btn.dataset.saveRec)));
      });
      body.querySelectorAll('[data-load-rec]').forEach((btn) => {
        btn.addEventListener('click', () => loadRecipe(Number(btn.dataset.loadRec)));
      });
    }
  }
})();
