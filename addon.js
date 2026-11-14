(() => {
  'use strict';

  // ==========================================
  // 1. 状態管理 & 初期設定
  // ==========================================
  const STORAGE_RECIPES = 'hassurublad_my_recipes_v1';
  const STORAGE_ROLL = 'hassurublad_film_roll_v1';

  const addonState = {
    dateMode: 'off',       // 'off' | 'today' | '90s' | 'custom'
    customDate: '98 08 24',
    frameMode: 'off',      // 'off' | '6x6' | 'polaroid' | 'cinema'
    leakSeed: 0,           // 0 = OFF, >0 = 光漏れシード値
    leakOpacity: 0.65,
    shakeEnabled: false,
    originalDataUrl: null,
    isApplying: false,
    activeTab: 'effects'
  };

  let filmRoll = loadJson(STORAGE_ROLL, []);
  let myRecipes = loadJson(STORAGE_RECIPES, [null, null, null, null, null]);

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
    } catch (e) {
      console.warn('Storage limit:', e);
    }
  }

  function getMainCanvas() {
    return document.getElementById('mainCanvas') || document.querySelector('canvas');
  }

  // ==========================================
  // 2. スタイル注入（本体デザインに統一）
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
      box-shadow: 0 6px 20px rgba(245, 166, 35, 0.4);
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
      box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.75);
      color: #f0f2f5;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-height: 76vh;
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
      padding: 14px 16px 26px;
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
      padding: 10px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      margin-top: 6px;
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
      background: rgba(23, 25, 31, 0.95);
      border: 1px solid #f5a623;
      color: #f0f2f5;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      z-index: 10000;
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s ease;
      white-space: nowrap;
    }
    #hb-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    #hb-flash {
      position: fixed;
      inset: 0;
      background: #fff;
      z-index: 10001;
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
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
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
  // 3. ビジュアルエフェクト描画エンジン
  // ==========================================
  function seededRandom(seed) {
    const x = Math.sin(seed * 9999.91) * 10000;
    return x - Math.floor(x);
  }

  function renderEffectsOnCanvas(ctx, w, h, isExport = false) {
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
      // プレビュー時は中央正方形を切り出し黒ネガ縁を表示
      const temp = document.createElement('canvas');
      temp.width = w;
      temp.height = h;
      temp.getContext('2d').drawImage(ctx.canvas, 0, 0);

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

      ctx.drawImage(temp, sx, sy, sq, sq, dx, dy, inner, inner);

      // ハッセルブラッド風 Vノッチ（左辺の2つの切り欠き）
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
      ctx.fillStyle = 'rgba(245, 166, 35, 0.75)';
      ctx.font = `bold ${Math.max(9, Math.round(border * 0.36))}px monospace`;
      ctx.fillText('HASSURUBLAD 6x6   120 FILM   ► 12', dx, dy - border * 0.3);

      contentRect = { x: dx, y: dy, w: inner, h: inner };
      ctx.restore();
    } else if (addonState.frameMode === 'polaroid') {
      const temp = document.createElement('canvas');
      temp.width = w;
      temp.height = h;
      temp.getContext('2d').drawImage(ctx.canvas, 0, 0);

      ctx.save();
      ctx.fillStyle = '#f4f2ed';
      ctx.fillRect(0, 0, w, h);
      const pad = Math.round(Math.min(w, h) * 0.055);
      const bottomPad = Math.round(h * 0.16);
      const iw = w - pad * 2;
      const ih = h - pad - bottomPad;
      ctx.drawImage(temp, 0, 0, w, h, pad, pad, iw, ih);
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
      const fontSize = Math.max(14, Math.round(contentRect.w * 0.036));
      ctx.font = `bold ${fontSize}px "Courier New", monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(255, 80, 0, 0.95)';
      ctx.shadowBlur = Math.round(fontSize * 0.45);
      ctx.fillStyle = '#ff7b1c';

      const tx = contentRect.x + contentRect.w - fontSize * 0.9;
      const ty = contentRect.y + contentRect.h - fontSize * 0.7;
      ctx.fillText(dateText, tx, ty);
      ctx.fillText(dateText, tx, ty); // 二重描画で発光感アップ
      ctx.restore();
    }
  }

  function applyVisualsToMainCanvas() {
    if (addonState.isApplying) return;
    const canvas = getMainCanvas();
    if (!canvas || !canvas.width || !canvas.height) return;

    const hasEffect =
      addonState.dateMode !== 'off' ||
      addonState.frameMode !== 'off' ||
      addonState.leakSeed > 0;

    if (!hasEffect) return;

    addonState.isApplying = true;
    try {
      const ctx = canvas.getContext('2d');
      renderEffectsOnCanvas(ctx, canvas.width, canvas.height, false);
    } finally {
      addonState.isApplying = false;
    }
  }

  // 既存操作の直後に自動でエフェクトを重ねる
  function scheduleApply() {
    requestAnimationFrame(() => {
      applyVisualsToMainCanvas();
    });
  }

  ['input', 'change', 'click', 'touchend', 'mouseup'].forEach((evt) => {
    document.addEventListener(evt, scheduleApply, true);
  });

  // ==========================================
  // 4. 書き出し・Before/After・コンタクトシート生成
  // ==========================================
  function createProcessedExportCanvas() {
    const src = getMainCanvas();
    if (!src) return null;

    // 6x6モードの書き出し時は真四角(1:1)の綺麗なキャンバスを生成
    if (addonState.frameMode === '6x6') {
      const sq = Math.min(src.width, src.height);
      const out = document.createElement('canvas');
      out.width = sq;
      out.height = sq;
      const ctx = out.getContext('2d');
      ctx.drawImage(src, (src.width - sq) / 2, (src.height - sq) / 2, sq, sq, 0, 0, sq, sq);
      return out;
    }

    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    out.getContext('2d').drawImage(src, 0, 0);
    return out;
  }

  function downloadCanvas(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/jpeg', 0.94);
    link.click();
  }

  // 元画像の自動キャプチャ（Before/After用）
  function captureInitialOriginal() {
    const c = getMainCanvas();
    if (c && c.width > 0 && !addonState.originalDataUrl) {
      addonState.originalDataUrl = c.toDataURL('image/jpeg', 0.9);
    }
  }
  setTimeout(captureInitialOriginal, 400);

  document.addEventListener('change', (e) => {
    if (e.target && e.target.type === 'file' && e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        addonState.originalDataUrl = ev.target.result;
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  }, true);

  function exportBeforeAfter() {
    const afterCanvas = createProcessedExportCanvas();
    if (!afterCanvas) return;

    const img = new Image();
    img.onload = () => {
      const w = afterCanvas.width;
      const h = afterCanvas.height;
      const gap = Math.round(w * 0.02);
      const labelH = Math.round(h * 0.06);

      const out = document.createElement('canvas');
      out.width = w * 2 + gap;
      out.height = h + labelH;
      const ctx = out.getContext('2d');

      ctx.fillStyle = '#0e0f12';
      ctx.fillRect(0, 0, out.width, out.height);

      ctx.drawImage(img, 0, 0, w, h);
      ctx.drawImage(afterCanvas, w + gap, 0, w, h);

      ctx.fillStyle = '#949ba8';
      ctx.font = `bold ${Math.max(14, Math.round(labelH * 0.45))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('BEFORE', w / 2, h + labelH * 0.68);

      ctx.fillStyle = '#f5a623';
      ctx.fillText('AFTER  •  HASSURUBLAD', w + gap + w / 2, h + labelH * 0.68);

      downloadCanvas(out, `hassurublad_compare_${Date.now()}.jpg`);
      showToast('🌓 Before / After 比較画像を保存しました！');
    };
    img.src = addonState.originalDataUrl || afterCanvas.toDataURL('image/jpeg', 0.9);
  }

  // ==========================================
  // 5. Myレシピ（スライダー＆エフェクト保存）
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
    saveJson(STORAGE_RECIPES, myRecipes);
    renderDrawerBody();
    showToast(`💾「${myRecipes[slotIdx].name}」を保存しました`);
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
    scheduleApply();
    renderDrawerBody();
    showToast(`✨「${rec.name}」を呼び出しました`);
  }

  // ==========================================
  // 6. シェイクでおまかせ現像
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
      // 極端になりすぎないよう中央65%の範囲でランダム化
      const center = (min + max) / 2;
      const span = (max - min) * 0.65;
      let val = center + (Math.random() - 0.5) * span;
      val = Math.round(val / step) * step;
      s.value = Math.min(max, Math.max(min, val));
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 40%の確率でランダム光漏れも追加
    if (Math.random() < 0.4) {
      addonState.leakSeed = Math.floor(Math.random() * 1000) + 1;
    } else {
      addonState.leakSeed = 0;
    }
    scheduleApply();
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
  // 7. フィルム24枚撮り切りモード（コンタクトシート）
  // ==========================================
  function shootToFilmRoll() {
    if (filmRoll.length >= 24) {
      showToast('🎞️ 24枚撮り切りました！コンタクトシートを現像できます');
      return;
    }
    const src = createProcessedExportCanvas();
    if (!src) return;

    triggerShutterFlash();

    // サムネイル圧縮保存
    const thumbW = 240;
    const thumbH = Math.round((src.height / src.width) * thumbW);
    const tCanvas = document.createElement('canvas');
    tCanvas.width = thumbW;
    tCanvas.height = thumbH;
    tCanvas.getContext('2d').drawImage(src, 0, 0, thumbW, thumbH);

    filmRoll.push(tCanvas.toDataURL('image/jpeg', 0.78));
    saveJson(STORAGE_ROLL, filmRoll);
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
    const cellW = 260;
    const cellH = 260;
    const pad = 24;
    const headerH = 80;

    const out = document.createElement('canvas');
    out.width = cols * cellW + pad * 2;
    out.height = rows * cellH + headerH + pad;
    const ctx = out.getContext('2d');

    ctx.fillStyle = '#090a0d';
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.fillStyle = '#f5a623';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('HASSURUBLAD  •  CONTACT SHEET (24 EXP)', pad, 48);

    let loaded = 0;
    filmRoll.forEach((dataUrl, idx) => {
      const img = new Image();
      img.onload = () => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const x = pad + c * cellW;
        const y = headerH + r * cellH;

        ctx.fillStyle = '#f5a623';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`#${String(idx + 1).padStart(2, '0')}A`, x + 10, y + 18);

        const boxW = cellW - 20;
        const boxH = cellH - 36;
        const ratio = Math.min(boxW / img.width, boxH / img.height);
        const dw = img.width * ratio;
        const dh = img.height * ratio;
        ctx.drawImage(
          img,
          x + 10 + (boxW - dw) / 2,
          y + 24 + (boxH - dh) / 2,
          dw,
          dh
        );

        loaded++;
        if (loaded === filmRoll.length) {
          downloadCanvas(out, `hassurublad_contact_sheet_${Date.now()}.jpg`);
          showToast('🎞️ コンタクトシートを現像・保存しました！');
        }
      };
      img.src = dataUrl;
    });
  }

  // ==========================================
  // 8. UIパネル構築
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
      </div>
      <button class="hb-close" id="hb-close-btn">✕</button>
    </div>
    <div class="hb-body" id="hb-drawer-body"></div>
  `;
  document.body.appendChild(drawer);

  fab.addEventListener('click', () => {
    captureInitialOriginal();
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

        <button class="hb-action-btn" id="hb-export-effect">💾 エフェクト付きで高画質保存</button>
      `;

      body.querySelectorAll('[data-date]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.date;
          if (mode === 'custom') {
            const val = prompt('印字する日付を入力（例: 99 12 31）', addonState.customDate);
            if (val !== null && val.trim()) addonState.customDate = val.trim();
          }
          addonState.dateMode = mode;
          scheduleApply();
          renderDrawerBody();
        });
      });

      body.querySelectorAll('[data-frame]').forEach((btn) => {
        btn.addEventListener('click', () => {
          addonState.frameMode = btn.dataset.frame;
          scheduleApply();
          renderDrawerBody();
        });
      });

      body.querySelector('#hb-leak-gen').addEventListener('click', () => {
        addonState.leakSeed = Math.floor(Math.random() * 10000) + 1;
        scheduleApply();
        renderDrawerBody();
      });

      body.querySelector('#hb-leak-off').addEventListener('click', () => {
        addonState.leakSeed = 0;
        scheduleApply();
        renderDrawerBody();
      });

      body.querySelector('#hb-leak-slider').addEventListener('input', (e) => {
        addonState.leakOpacity = parseFloat(e.target.value);
        if (addonState.leakSeed === 0) addonState.leakSeed = 1;
        scheduleApply();
      });

      body.querySelector('#hb-export-effect').addEventListener('click', () => {
        const c = createProcessedExportCanvas();
        if (c) {
          downloadCanvas(c, `hassurublad_film_${Date.now()}.jpg`);
          showToast('💾 写真を保存しました！');
        }
      });
    } else {
      // Tab 3: ツール・遊び
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

