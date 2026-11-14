(() => {
  'use strict';

  // 二重読み込み防止
  if (window.__HASSURUBLAD_ADDON_LOADED__) return;
  window.__HASSURUBLAD_ADDON_LOADED__ = true;

  // ==========================================
  // 1. 状態管理 & 定数設定
  // ==========================================
  const ADDON_VERSION = 'v2.1';
  const STORAGE_RECIPES = 'hassurublad_my_recipes_v1';
  const STORAGE_ROLL = 'hassurublad_film_roll_v1';
  const MAX_CANVAS_PIXELS = 16777216; // iOS Safari安全上限 (4096x4096 = 16.7MP)

  const addonState = {
    dateMode: 'off',       // 'off' | 'today' | '90s' | 'custom'
    customDate: '98 08 24',
    frameMode: 'off',      // 'off' | '6x6' | 'polaroid' | 'cinema'
    leakSeed: 0,           // 0 = OFF, >0 = 光漏れシード値
    leakOpacity: 0.65,
    shakeEnabled: false,
    originalBitmap: null,  // Exif補正済みの元画像 (ImageBitmap or HTMLImageElement)
    originalDataUrl: null, // サンプル画像等のフォールバック用DataURL
    isApplying: false,
    interceptHostExport: false,
    bypassHostClick: false,
    onHostCanvasCaptured: null,
    activeTab: 'effects'
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

  // ==========================================
  // 2. ブラウザ標準APIのフック（描画検知 & フル解像度書き出し横取り）
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

    // まだ元画像が記録されていない場合（起動直後のサンプル画像など）のみ初期キャプチャ
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

  // 本体が書き出すキャンバスにエフェクトを焼き込み、6x6なら1:1クロップする
  function buildFinalCanvasFromHost(sourceCanvas) {
    const main = getMainCanvas();
    const out = createInternalCanvas(sourceCanvas.width, sourceCanvas.height);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // mainCanvas自体の場合はすでにプレビューエフェクトが乗っているためcleanCanvasを使う
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

  // 本体保存時の toDataURL / toBlob を確実にキャッチ
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

  // 本体が <a download> で自動ダウンロードしようとした場合もブロックして二重発火を防ぐ
  HTMLAnchorElement.prototype.click = function (...args) {
    if (addonState.interceptHostExport && this.hasAttribute('download')) {
      return;
    }
    return origAnchorClick.apply(this, args);
  };

  // ==========================================
  // 3. スタイル注入（本体UIに調和するデザイン）
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
      box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.8);
      color: #f0f2f5;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-height: 78vh;
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
      padding: 12px 16px;
      border-bottom: 1px solid #2c303b;
    }
    .hb-tabs {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hb-tab {
      background: #1f222a;
      color: #949ba8;
      border: 1px solid #2c303b;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
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
    }

    .hb-body {
      padding: 14px 16px 28px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
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
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
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
  // 4. ビジュアルエフェクト描画エンジン
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
  // 5. 元画像の読み込み検知（2枚目以降のリセット＆Exif縦横補正）
  // ==========================================
  document.addEventListener('change', async (e) => {
    if (e.target && e.target.type === 'file' && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // 古い画像のキャッシュを完全クリア
      addonState.originalBitmap = null;
      addonState.originalDataUrl = null;

      try {
        if (typeof createImageBitmap === 'function') {
          // Exifの向きを自動補正してデコード
          addonState.originalBitmap = await createImageBitmap(file);
        } else {
          const reader = new FileReader();
          reader.onload = (ev) => {
            addonState.originalDataUrl = ev.target.result;
            const img = new Image();
            img.onload = () => {
              addonState.originalBitmap = img;
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(file);
        }
      } catch (err) {
        console.warn('Bitmap decode fallback:', err);
      }
    }
  }, true);

  // ==========================================
  // 6. フル解像度書き出し & iOS PWA 100%確実保存モーダル
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

  // 本体のフル解像度書き出しを2.2秒タイムアウトで安全に横取りする
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

  // iPhoneのユーザージェスチャー制限を100%回避する保存モーダル
  function presentSaveModal(canvas, filename, titleText = '現像完了') {
    const quality = 0.97;
    const dimsText = `${canvas.width} × ${canvas.height} px`;
    const dataUrl = origToDataURL.call(canvas, 'image/jpeg', quality);

    // Blobも事前生成して共有ボタン押下時に0msで渡せるようにする
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
  // 7. Before / After 2枚並べ保存
  // ==========================================
  async function exportBeforeAfter() {
    showToast('⏳ Before / After をフル画質で生成中...');
    const afterCanvas = await generateFullResProcessedCanvas();
    if (!afterCanvas) {
      showToast('⚠️ 画像が見つかりませんでした');
      return;
    }

    const renderCompareCanvas = (beforeSource) => {
      // 2枚並べてもiOSの上限を超えないよう1枚あたり最大約7.5MPに調整
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
        // 6x6時はBEFORE側も中央正方形に揃えて見栄えを統一
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
  // 8. Myレシピ（スライダー＆エフェクト保存）
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
  }

  // ==========================================
  // 9. シェイクでおまかせ現像
  // ==========================================
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

  // ==========================================
  // 10. フィルム24枚撮り切りモード（コンタクトシート）
  // ==========================================
  function shootToFilmRoll() {
    if (filmRoll.length >= 24) {
      showToast('🎞️ 24枚撮り切りました！コンタクトシートを現像できます');
      return;
    }
    const src = getMainCanvas();
    if (!src) return;

    triggerShutterFlash();

    // 24枚保存してもlocalStorage(5MB)を圧迫しない最適サイズ (約20KB/枚)
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
        <button class="hb-tab active" data-tab="effects">2. エフェクト</button>
        <button class="hb-tab" data-tab="tools">3. ツール・遊び</button>
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

  function renderDrawerBody() {
    const body = document.getElementById('hb-drawer-body');
    if (!body) return;

    if (addonState.activeTab === 'effects') {
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
