<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>AETHERIA STUDIO - 自動エモ現像エンジン</title>
<style>
  :root {
    --bg-dark: #0e0f12;
    --bg-panel: #17191f;
    --bg-card: #1f222a;
    --border: #2c303b;
    --text-main: #f0f2f5;
    --text-sub: #949ba8;
    --accent: #f5a623;
    --accent-glow: rgba(245, 166, 35, 0.35);
    --accent-hover: #ffb840;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif;
    background-color: var(--bg-dark);
    color: var(--text-main);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
  }

  /* Header */
  header {
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    padding: 12px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-badge {
    background: linear-gradient(135deg, #f5a623, #e06d1b);
    color: #111;
    font-weight: 800;
    font-size: 11px;
    padding: 3px 7px;
    border-radius: 4px;
    letter-spacing: 0.06em;
  }

  .brand h1 {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .brand span {
    color: var(--accent);
    font-weight: 400;
    font-size: 12px;
    margin-left: 6px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn {
    background: var(--bg-card);
    color: var(--text-main);
    border: 1px solid var(--border);
    padding: 8px 13px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .btn:hover {
    border-color: #4a5060;
    background: #272b36;
  }

  .btn:active {
    transform: scale(0.97);
  }

  .btn-primary {
    background: linear-gradient(135deg, #f5a623, #d97706);
    color: #0e0f12;
    border: none;
    box-shadow: 0 2px 12px var(--accent-glow);
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, #ffb73b, #e6820e);
  }

  /* Main Layout */
  .workspace {
    display: flex;
    flex: 1;
    min-height: calc(100vh - 56px);
  }

  /* Preview Area */
  .preview-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: radial-gradient(circle at center, #181a20 0%, #0b0c0e 100%);
    position: relative;
    user-select: none;
  }

  .canvas-wrapper {
    position: relative;
    max-width: 100%;
    max-height: 68vh;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.65);
    border: 1px solid var(--border);
    background: #000;
  }

  canvas {
    display: block;
    max-width: 100%;
    max-height: 68vh;
    width: auto;
    height: auto;
  }

  /* Split Comparison Line */
  .split-divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 8px rgba(0,0,0,0.8);
    pointer-events: none;
    display: none;
  }

  .split-handle {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--accent);
    color: #111;
    font-size: 12px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.6);
  }

  .preview-toolbar {
    margin-top: 14px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
  }

  .badge-status {
    position: absolute;
    top: 12px;
    left: 12px;
    background: rgba(14, 15, 18, 0.78);
    backdrop-filter: blur(6px);
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    color: var(--accent);
    border: 1px solid rgba(245, 166, 35, 0.3);
    pointer-events: none;
  }

  /* Control Sidebar */
  .controls-section {
    width: 360px;
    background: var(--bg-panel);
    border-left: 1px solid var(--border);
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .auto-engine-box {
    background: linear-gradient(145deg, #23201b, #1a1c23);
    border: 1px solid rgba(245, 166, 35, 0.45);
    border-radius: 10px;
    padding: 14px;
  }

  .auto-btn {
    width: 100%;
    padding: 12px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #f5a623 0%, #e67e22 100%);
    color: #0e0f12;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 16px var(--accent-glow);
    transition: transform 0.15s ease, filter 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .auto-btn:hover {
    filter: brightness(1.08);
  }

  .auto-btn:active {
    transform: scale(0.98);
  }

  .auto-desc {
    font-size: 11px;
    color: var(--text-sub);
    margin-top: 8px;
    line-height: 1.45;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-sub);
    margin-bottom: 8px;
  }

  /* Presets */
  .preset-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }

  .preset-btn {
    background: var(--bg-card);
    border: 1px solid var(--border);
    color: var(--text-main);
    padding: 8px 10px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .preset-btn:hover {
    border-color: var(--accent);
  }

  .preset-btn.active {
    background: rgba(245, 166, 35, 0.16);
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Sliders */
  .slider-group {
    display: flex;
    flex-direction: column;
    gap: 13px;
  }

  .slider-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .slider-label {
    color: var(--text-main);
    font-weight: 500;
  }

  .slider-val {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    min-width: 36px;
    text-align: right;
  }

  input[type="range"] {
    -webkit-appearance: none;
    width: 100%;
    height: 5px;
    background: #2b303c;
    border-radius: 4px;
    outline: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    box-shadow: 0 0 6px rgba(0, 0, 0, 0.5);
    border: 2px solid #fff;
  }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(80px);
    background: rgba(24, 26, 32, 0.95);
    border: 1px solid var(--accent);
    color: #fff;
    padding: 10px 18px;
    border-radius: 30px;
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    transition: transform 0.25s ease;
    z-index: 100;
    pointer-events: none;
  }

  .toast.show {
    transform: translateX(-50%) translateY(0);
  }

  /* Responsive */
  @media (max-width: 860px) {
    .workspace {
      flex-direction: column;
    }
    .preview-section {
      min-height: 44vh;
      padding: 12px;
    }
    canvas, .canvas-wrapper {
      max-height: 44vh;
    }
    .controls-section {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--border);
    }
  }
</style>
</head>
<body>

<header>
  <div class="brand">
    <span class="brand-badge">ENGINE v2.0</span>
    <h1>AETHERIA STUDIO <span>自動エモ現像エンジン</span></h1>
  </div>
  <div class="header-actions">
    <input type="file" id="fileInput" accept="image/*" style="display:none">
    <button class="btn" onclick="document.getElementById('fileInput').click()">📂 写真を開く</button>
    <button class="btn btn-primary" onclick="exportImage()">💾 高画質保存</button>
  </div>
</header>

<div class="workspace">
  <section class="preview-section" id="dropZone">
    <div class="canvas-wrapper" id="canvasWrapper">
      <span class="badge-status" id="statusBadge">AFTER（エモ現像適用中）</span>
      <canvas id="mainCanvas"></canvas>
      <div class="split-divider" id="splitDivider">
        <div class="split-handle">↔</div>
      </div>
    </div>

    <div class="preview-toolbar">
      <button class="btn" id="holdCompareBtn">👁 長押しで編集前を確認</button>
      <button class="btn" id="splitToggleBtn">◫ 左右分割比較: OFF</button>
      <button class="btn" onclick="applyPreset('reset')">↺ リセット</button>
    </div>
  </section>

  <aside class="controls-section">
    <div class="auto-engine-box">
      <button class="auto-btn" onclick="runAutoEmoEngine()">
        ✨ 自動エモ現像を実行
      </button>
      <p class="auto-desc">
        写真の輝度分布・逆光バランスを解析し、黄金色の光・黒浮きフェード・空気の滲みを最適値へ自動調律します。
      </p>
    </div>

    <div>
      <div class="section-title">Film & Backlight Presets</div>
      <div class="preset-grid">
        <button class="preset-btn active" data-preset="toyohashi" onclick="applyPreset('toyohashi')">🚃 夕暮れの路面電車</button>
        <button class="preset-btn" data-preset="afterschool" onclick="applyPreset('afterschool')">🌇 放課後の逆光ベール</button>
        <button class="preset-btn" data-preset="portra" onclick="applyPreset('portra')">🎞 昭和フィルム調</button>
        <button class="preset-btn" data-preset="morning" onclick="applyPreset('morning')">🌫 朝霧の線路</button>
      </div>
    </div>

    <div>
      <div class="section-title">Tone & Atmosphere Parameters</div>
      <div class="slider-group">
        <div class="slider-item">
          <div class="slider-header">
            <span class="slider-label">色温度（黄金アンバー）</span>
            <span class="slider-val" id="val-temp">+24</span>
          </div>
          <input type="range" id="param-temp" min="-50" max="50" value="24">
        </div>

        <div class="slider-item">
          <div class="slider-header">
            <span class="slider-label">色かぶり補正（夕暮れマゼンタ）</span>
            <span class="slider-val" id="val-tint">+6</span>
          </div>
          <input type="range" id="param-tint" min="-50" max="50" value="6">
        </div>

        <div class="slider-item">
          <div class="slider-header">
            <span class="slider-label">ハイライト抑制（白飛び防止）</span>
            <span class="slider-val" id="val-highlights">-45</span>
          </div>
          <input type="range" id="param-highlights" min="-100" max="50" value="-45">
        </div>

        <div class="slider-item">
          <div class="slider-header">
            <span class="slider-label">シャドウ持ち上げ（暗部救済）</span>
            <span class="slider-val" id="val-shadows">+35</span>
          </div>
          <input type="range" id="param-shadows" min="-50" max="100" value="35">
        </div>

        <div class="slider-item">
          <div class="slider-header">
            <span class="slider-label">黒のフェード（トーンカーブ黒浮き）</span>
            <span class="slider-val" id="val-fade">+28</span>
          </div>
          <input type="range" id="param-fade" min="0" max="60" value="28">
        </div>

        <div class="slider-item">
          <div class="slider-header">
            <span class="slider-label">かすみ・光のベール（マイナス効果）</span>
            <span class="slider-val" id="val-dehaze">-26</span>
          </div>
          <input type="range" id="param-dehaze" min="-50" max="30" value="-26">
        </div>

        <div class="slider-item">
          <div class="slider-header">
            <span class="slider-label">逆光ハレーション（光の滲み）</span>
            <span class="slider-val" id="val-halation">55</span>
          </div>
          <input type="range" id="param-halation" min="0" max="100" value="55">
        </div>

        <div class="slider-item">
          <div class="slider-header">
            <span class="slider-label">フィルム粒子（グレイン）</span>
            <span class="slider-val" id="val-grain">18</span>
          </div>
          <input type="range" id="param-grain" min="0" max="60" value="18">
        </div>
      </div>
    </div>
  </aside>
</div>

<div class="toast" id="toast"></div>

<script>
  // State
  const state = {
    temp: 24,
    tint: 6,
    highlights: -45,
    shadows: 35,
    fade: 28,
    dehaze: -26,
    halation: 55,
    grain: 18,
    showOriginal: false,
    splitMode: false,
    splitRatio: 0.5
  };

  const presets = {
    toyohashi:   { temp: 24, tint: 6,  highlights: -45, shadows: 35, fade: 28, dehaze: -26, halation: 55, grain: 18 },
    afterschool: { temp: 18, tint: 10, highlights: -55, shadows: 45, fade: 34, dehaze: -32, halation: 70, grain: 14 },
    portra:      { temp: 15, tint: 4,  highlights: -30, shadows: 25, fade: 22, dehaze: -10, halation: 25, grain: 28 },
    morning:     { temp: -8, tint: 2,  highlights: -40, shadows: 30, fade: 25, dehaze: -35, halation: 45, grain: 12 },
    reset:       { temp: 0,  tint: 0,  highlights: 0,   shadows: 0,  fade: 0,  dehaze: 0,   halation: 0,  grain: 0  }
  };

  let originalFullImage = null; // HTMLImageElement or Canvas
  let previewBaseCanvas = document.createElement('canvas');
  let previewEditedCanvas = document.createElement('canvas');
  const mainCanvas = document.getElementById('mainCanvas');
  const mainCtx = mainCanvas.getContext('2d');
  let renderPending = false;

  // Toast Notification
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // Generate Built-in Sunset Tram Sample Image
  function createBuiltInSample() {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 700;
    const ctx = c.getContext('2d');

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, 420);
    sky.addColorStop(0, '#c9b8a3');
    sky.addColorStop(0.55, '#ebd6b7');
    sky.addColorStop(1, '#fff3dc');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1000, 420);

    // Sun glow
    const sun = ctx.createRadialGradient(440, 260, 10, 440, 260, 320);
    sun.addColorStop(0, 'rgba(255, 250, 235, 0.95)');
    sun.addColorStop(0.4, 'rgba(255, 224, 170, 0.5)');
    sun.addColorStop(1, 'rgba(255, 224, 170, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, 1000, 500);

    // Distant city buildings
    ctx.fillStyle = '#8b837b';
    ctx.fillRect(620, 170, 80, 230);
    ctx.fillRect(720, 190, 95, 210);
    ctx.fillRect(830, 160, 75, 240);
    ctx.fillStyle = '#6e665f';
    ctx.fillRect(40, 60, 110, 340);

    // Road / Cobblestone surface
    const road = ctx.createLinearGradient(0, 380, 0, 700);
    road.addColorStop(0, '#b59b78');
    road.addColorStop(0.35, '#7c6852');
    road.addColorStop(1, '#4a3e33');
    ctx.fillStyle = road;
    ctx.fillRect(0, 380, 1000, 320);

    // Road specular reflection
    const refl = ctx.createRadialGradient(450, 430, 20, 450, 480, 280);
    refl.addColorStop(0, 'rgba(255, 235, 190, 0.65)');
    refl.addColorStop(1, 'rgba(255, 235, 190, 0)');
    ctx.fillStyle = refl;
    ctx.fillRect(0, 380, 1000, 320);

    // Tram tracks (perspective)
    ctx.strokeStyle = '#e8dcc8';
    ctx.lineWidth = 4;
    const tracks = [
      [390, 380, 70, 700],
      [430, 380, 240, 700],
      [520, 380, 460, 700],
      [560, 380, 630, 700]
    ];
    tracks.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // Tram body (Retro Silhouette)
    ctx.fillStyle = '#4e4842';
    ctx.fillRect(375, 185, 165, 195);
    ctx.fillStyle = '#d9cfbe';
    ctx.fillRect(382, 195, 151, 55);
    // Tram windows
    ctx.fillStyle = '#332f2c';
    ctx.fillRect(390, 205, 42, 38);
    ctx.fillRect(437, 205, 42, 38);
    ctx.fillRect(484, 205, 42, 38);
    // Headlight & tail lights
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(457, 315, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d9534f';
    ctx.fillRect(392, 332, 16, 8);
    ctx.fillRect(506, 332, 16, 8);

    // Utility poles & overhead wires
    ctx.strokeStyle = '#3d3732';
    ctx.fillStyle = '#3d3732';
    [180, 280, 340, 610, 760, 910].forEach((px, idx) => {
      const topY = 40 + (idx % 3) * 25;
      ctx.fillRect(px, topY, 6, 360 - topY);
      ctx.fillRect(px - 18, topY + 25, 42, 3);
      ctx.fillRect(px - 14, topY + 50, 34, 3);
    });

    // Wires
    ctx.lineWidth = 1.2;
    for (let w = 0; w < 6; w++) {
      ctx.beginPath();
      ctx.moveTo(0, 60 + w * 24);
      ctx.quadraticCurveTo(450, 130 + w * 18, 1000, 75 + w * 22);
      ctx.stroke();
    }

    return c;
  }

  // Load Image into Preview Buffer
  function loadSourceImage(imgElement) {
    originalFullImage = imgElement;
    const maxDim = 1100;
    let w = imgElement.width;
    let h = imgElement.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    previewBaseCanvas.width = w;
    previewBaseCanvas.height = h;
    previewEditedCanvas.width = w;
    previewEditedCanvas.height = h;
    mainCanvas.width = w;
    mainCanvas.height = h;

    const bCtx = previewBaseCanvas.getContext('2d');
    bCtx.drawImage(imgElement, 0, 0, w, h);

    requestRender();
  }

  // Core Pixel & Halation Processing Pipeline
  function processCanvas(sourceCanvas, targetCanvas, params) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    targetCanvas.width = w;
    targetCanvas.height = h;

    const sCtx = sourceCanvas.getContext('2d');
    const tCtx = targetCanvas.getContext('2d');
    const imgData = sCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Precompute parameters
    const tempR = params.temp * 0.65;
    const tempB = -params.temp * 0.65;
    const tintG = -params.tint * 0.45;
    const tintRB = params.tint * 0.25;

    const hiFactor = params.highlights / 100; // -1.0 to +0.5
    const shFactor = params.shadows / 100;    // -0.5 to +1.0
    const fadeOffset = params.fade * 0.85;    // 0 to 51
    const fadeScale = (255 - fadeOffset) / 255;

    // Dehaze minus creates warm sunlit atmospheric airlight
    const dehazeVal = params.dehaze / 100; // -0.5 to +0.3
    const veilAlpha = dehazeVal < 0 ? Math.abs(dehazeVal) * 0.42 : 0;
    const contrastBoost = dehazeVal > 0 ? 1 + dehazeVal * 0.5 : 1 + dehazeVal * 0.25;
    const airR = 248, airG = 228, airB = 198;

    const grainAmt = params.grain * 0.65;
    let seed = 1337;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 1. White Balance (Temp & Tint)
      r += tempR + tintRB;
      g += tintG;
      b += tempB + tintRB;

      // Normalized luminance (0..1)
      const lum = Math.max(0, Math.min(1, (0.299 * r + 0.587 * g + 0.114 * b) / 255));

      // 2. Highlights & Shadows Tone Mapping
      const hiWeight = lum * lum;
      const shWeight = (1 - lum) * (1 - lum);
      const toneShift = (hiFactor * hiWeight * 75) + (shFactor * shWeight * 85);

      r += toneShift;
      g += toneShift * 0.96;
      b += toneShift * 0.88; // Keep highlights slightly golden

      // 3. Contrast & Dehaze (Atmospheric Veil)
      r = (r - 128) * contrastBoost + 128;
      g = (g - 128) * contrastBoost + 128;
      b = (b - 128) * contrastBoost + 128;

      if (veilAlpha > 0) {
        // Stronger haze in midtones/highlights
        const localVeil = veilAlpha * (0.45 + 0.55 * lum);
        r = r * (1 - localVeil) + airR * localVeil;
        g = g * (1 - localVeil) + airG * localVeil;
        b = b * (1 - localVeil) + airB * localVeil;
      }

      // 4. Tone Curve Black Fade
      if (fadeOffset > 0) {
        r = fadeOffset + r * fadeScale;
        g = fadeOffset * 0.96 + g * fadeScale;
        b = fadeOffset * 0.92 + b * fadeScale;
      }

      // 5. Film Grain
      if (grainAmt > 0) {
        seed = (seed * 16807) % 2147483647;
        const noise = ((seed / 2147483647) - 0.5) * grainAmt;
        r += noise;
        g += noise;
        b += noise;
      }

      data[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }

    tCtx.putImageData(imgData, 0, 0);

    // 6. Golden Backlight Halation (Multi-pass downscale bloom - iOS Safari safe)
    if (params.halation > 0) {
      const bloomCanvas = document.createElement('canvas');
      const bw = Math.max(32, Math.round(w / 10));
      const bh = Math.max(32, Math.round(h / 10));
      bloomCanvas.width = bw;
      bloomCanvas.height = bh;
      const bCtx = bloomCanvas.getContext('2d');

      bCtx.drawImage(targetCanvas, 0, 0, bw, bh);
      const bData = bCtx.getImageData(0, 0, bw, bh);
      const bd = bData.data;

      for (let i = 0; i < bd.length; i += 4) {
        const l = (0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2]) / 255;
        // Extract bright threshold
        const bright = Math.max(0, (l - 0.58) / 0.42);
        const glow = bright * bright;
        bd[i]     = Math.min(255, bd[i] * glow * 1.15);
        bd[i + 1] = Math.min(255, bd[i + 1] * glow * 0.92);
        bd[i + 2] = Math.min(255, bd[i + 2] * glow * 0.62);
      }
      bCtx.putImageData(bData, 0, 0);

      // Extra soft pass
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = Math.max(16, Math.round(bw / 2));
      blurCanvas.height = Math.max(16, Math.round(bh / 2));
      const blCtx = blurCanvas.getContext('2d');
      blCtx.drawImage(bloomCanvas, 0, 0, blurCanvas.width, blurCanvas.height);

      tCtx.save();
      tCtx.globalCompositeOperation = 'screen';
      tCtx.globalAlpha = (params.halation / 100) * 0.78;
      tCtx.drawImage(blurCanvas, 0, 0, w, h);
      tCtx.globalAlpha = (params.halation / 100) * 0.42;
      tCtx.drawImage(bloomCanvas, 0, 0, w, h);
      tCtx.restore();
    }
  }

  // Render Loop
  function requestRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      processCanvas(previewBaseCanvas, previewEditedCanvas, state);
      compositeDisplay();
    });
  }

  function compositeDisplay() {
    const w = mainCanvas.width;
    const h = mainCanvas.height;
    mainCtx.clearRect(0, 0, w, h);

    const badge = document.getElementById('statusBadge');
    const divider = document.getElementById('splitDivider');

    if (state.showOriginal) {
      mainCtx.drawImage(previewBaseCanvas, 0, 0);
      badge.textContent = 'BEFORE（編集前オリジナル）';
      divider.style.display = 'none';
      return;
    }

    if (state.splitMode) {
      const splitX = Math.round(w * state.splitRatio);
      // Left: Original
      mainCtx.drawImage(previewBaseCanvas, 0, 0, splitX, h, 0, 0, splitX, h);
      // Right: Edited
      mainCtx.drawImage(previewEditedCanvas, splitX, 0, w - splitX, h, splitX, 0, w - splitX, h);

      divider.style.display = 'block';
      divider.style.left = (state.splitRatio * 100) + '%';
      badge.textContent = '◀ BEFORE ｜ AFTER ▶';
    } else {
      mainCtx.drawImage(previewEditedCanvas, 0, 0);
      divider.style.display = 'none';
      badge.textContent = 'AFTER（エモ現像適用中）';
    }
  }

  // Sync UI Sliders with State
  function syncSlidersFromState() {
    const keys = ['temp', 'tint', 'highlights', 'shadows', 'fade', 'dehaze', 'halation', 'grain'];
    keys.forEach(k => {
      const input = document.getElementById('param-' + k);
      const valSpan = document.getElementById('val-' + k);
      input.value = state[k];
      const v = state[k];
      valSpan.textContent = (v > 0 && k !== 'halation' && k !== 'grain') ? '+' + v : v;
    });
  }

  // Apply Preset
  function applyPreset(name) {
    const p = presets[name];
    if (!p) return;
    Object.assign(state, p);
    syncSlidersFromState();

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === name);
    });

    requestRender();
    if (name === 'reset') showToast('パラメータを初期状態に戻しました');
  }

  // Auto Emo Engine (Analyzes image luminance and optimizes parameters)
  function runAutoEmoEngine() {
    const w = previewBaseCanvas.width;
    const h = previewBaseCanvas.height;
    const ctx = previewBaseCanvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;

    let sumLum = 0;
    let darkPixels = 0;
    let brightPixels = 0;
    const total = data.length / 4;

    for (let i = 0; i < data.length; i += 16) {
      const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      sumLum += l;
      if (l < 0.25) darkPixels++;
      if (l > 0.78) brightPixels++;
    }

    const sampled = total / 4;
    const avgLum = sumLum / sampled;
    const darkRatio = darkPixels / sampled;
    const brightRatio = brightPixels / sampled;

    // Adaptive calculation
    state.temp = avgLum > 0.55 ? 26 : 22;
    state.tint = 7;
    state.highlights = Math.round(-35 - Math.min(55, brightRatio * 140));
    state.shadows = Math.round(25 + Math.min(60, darkRatio * 120));
    state.fade = 28;
    state.dehaze = -28;
    state.halation = Math.round(45 + Math.min(40, brightRatio * 90));
    state.grain = 18;

    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    syncSlidersFromState();
    requestRender();
    showToast('✨ 自動エモ現像：光のバランスを最適調律しました');
  }

  // Full Resolution Export
  function exportImage() {
    if (!originalFullImage) return;
    showToast('フル解像度で現像書き出し中...');
    setTimeout(() => {
      const fullSrc = document.createElement('canvas');
      fullSrc.width = originalFullImage.width;
      fullSrc.height = originalFullImage.height;
      fullSrc.getContext('2d').drawImage(originalFullImage, 0, 0);

      const fullOut = document.createElement('canvas');
      processCanvas(fullSrc, fullOut, state);

      const link = document.createElement('a');
      link.download = 'AETHERIA_emo_' + Date.now() + '.jpg';
      link.href = fullOut.toDataURL('image/jpeg', 0.95);
      link.click();
      showToast('💾 保存が完了しました！');
    }, 50);
  }

  // Event Listeners for Sliders
  ['temp', 'tint', 'highlights', 'shadows', 'fade', 'dehaze', 'halation', 'grain'].forEach(k => {
    const input = document.getElementById('param-' + k);
    input.addEventListener('input', (e) => {
      state[k] = Number(e.target.value);
      syncSlidersFromState();
      document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
      requestRender();
    });
  });

  // File Input & Drag-and-Drop
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        loadSourceImage(img);
        showToast('写真を読み込みました');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', (e) => e.preventDefault());
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        loadSourceImage(img);
        showToast('写真を読み込みました');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Hold Compare Button
  const holdBtn = document.getElementById('holdCompareBtn');
  const setHold = (val) => {
    state.showOriginal = val;
    compositeDisplay();
  };
  holdBtn.addEventListener('mousedown', () => setHold(true));
  holdBtn.addEventListener('mouseup', () => setHold(false));
  holdBtn.addEventListener('mouseleave', () => setHold(false));
  holdBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setHold(true); });
  holdBtn.addEventListener('touchend', () => setHold(false));

  // Split Mode Toggle & Drag
  const splitBtn = document.getElementById('splitToggleBtn');
  splitBtn.addEventListener('click', () => {
    state.splitMode = !state.splitMode;
    splitBtn.textContent = `◫ 左右分割比較: ${state.splitMode ? 'ON' : 'OFF'}`;
    compositeDisplay();
  });

  const canvasWrapper = document.getElementById('canvasWrapper');
  let draggingSplit = false;
  const updateSplitPos = (clientX) => {
    const rect = mainCanvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    state.splitRatio = Math.max(0.05, Math.min(0.95, ratio));
    compositeDisplay();
  };

  canvasWrapper.addEventListener('mousedown', (e) => {
    if (!state.splitMode) return;
    draggingSplit = true;
    updateSplitPos(e.clientX);
  });
  window.addEventListener('mousemove', (e) => {
    if (draggingSplit) updateSplitPos(e.clientX);
  });
  window.addEventListener('mouseup', () => draggingSplit = false);

  canvasWrapper.addEventListener('touchstart', (e) => {
    if (!state.splitMode) return;
    draggingSplit = true;
    updateSplitPos(e.touches[0].clientX);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (draggingSplit && e.touches[0]) updateSplitPos(e.touches[0].clientX);
  }, { passive: true });
  window.addEventListener('touchend', () => draggingSplit = false);

  // Initialize with Built-in Sample
  window.addEventListener('DOMContentLoaded', () => {
    const sample = createBuiltInSample();
    loadSourceImage(sample);
    syncSlidersFromState();
  });
</script>
</body>
</html>
