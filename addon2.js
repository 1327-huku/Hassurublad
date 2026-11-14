(() => {
  'use strict';

  // 二重読み込み防止
  if (window.__HASSURUBLAD_DLC2_LOADED__) return;
  window.__HASSURUBLAD_DLC2_LOADED__ = true;

  // ==========================================
  // 1. 状態管理 & 定数
  // ==========================================
  const DLC2_VERSION = 'DLC2 v1.0';
  const MAX_CANVAS_PIXELS = 16000000;

  const dlc2State = {
    activeTab: 'optics',
    isApplying: false,
    interceptHostExport: false,
    bypassHostClick: false,
    onHostCanvasCaptured: null,

    // ① シネマ・光学フィルター
    optics: {
      halation: 0,       // 0 ~ 100 (赤ハレーション)
      blackMist: 0,      // 0 ~ 100 (ブラックミスト拡散)
      splitTone: 'off',  // 'off' | 'tealOrange' | 'vintageGold' | 'cyberNight' | 'pastelFilm'
      splitAmt: 45,      // 0 ~ 100
      aberration: 0,     // 0 ~ 100 (レンズ色収差)
      vignette: 0        // 0 ~ 100 (周辺減光)
    },

    // ② Exifスタジオ & ギャラリー枠
    studio: {
      frameStyle: 'off', // 'off' | 'exifWhite' | 'exifBlack' | 'insta45' | 'blurMat'
      camera: 'HASSURUBLAD 500C/M',
      lens: 'PLANAR 80mm f/2.8',
      settings: '1/250s  f/4.0  ISO 400',
      customNote: ''
    },

    // ③ アナログ特殊撮影
    analog: {
      doubleImg: null,       // Image / Canvas
      doubleName: '',
      doubleMode: 'screen',  // 'screen' | 'lighten' | 'overlay'
      doubleOpacity: 0.55,
      halfImg: null,         // 2コマ目 Image / Canvas
      halfName: '',
      halfEnabled: false,
      halfOrientation: 'auto', // 'auto' | 'horizontal' | 'vertical'
      grain: 0,              // 0 ~ 100
      dust: 0                // 0 ~ 100
    }
  };

  // プリセット粒子ノイズパターン（高速合成用）
  const grainTile = createInternalCanvas(256, 256);
  (() => {
    const gctx = grainTile.getContext('2d');
    const id = gctx.createImageData(256, 256);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 255;
      const v = n > 0 ? 255 : 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = Math.min(255, Math.abs(n) * 0.45);
    }
    gctx.putImageData(id, 0, 0);
  })();

  // DLC1より前の素のベースキャンバス（DLC1と協調動作）
  const dlc2BaseCanvas = createInternalCanvas();

  function createInternalCanvas(w = 0, h = 0) {
    const c = document.createElement('canvas');
    c._hbInternal = true;
    c._hbDlc2Internal = true;
    if (w > 0) c.width = w;
    if (h > 0) c.height = h;
    return c;
  }

  function getMainCanvas() {
    return document.getElementById('mainCanvas') || document.querySelector('canvas');
  }

  function hasAnyDlc2Effect() {
    const o = dlc2State.optics;
    const s = dlc2State.studio;
    const a = dlc2State.analog;
    return (
      o.halation > 0 ||
      o.blackMist > 0 ||
      o.splitTone !== 'off' ||
      o.aberration > 0 ||
      o.vignette > 0 ||
      s.frameStyle !== 'off' ||
      (a.doubleImg !== null) ||
      (a.halfEnabled && a.halfImg !== null) ||
      a.grain > 0 ||
      a.dust > 0
    );
  }

  // ==========================================
  // 2. Exif メタデータ自動抽出パーサー（JPEG / RAW対応）
  // ==========================================
  async function extractExifMetadata(file) {
    try {
      // 先頭512KBだけ読んで高速解析
      const slice = file.slice(0, Math.min(file.size, 524288));
      const buffer = await slice.arrayBuffer();
      const view = new DataView(buffer);
      const len = view.byteLength;

      let tiffOffset = -1;

      // 1) TIFF / RAWダイレクトヘッダ (II / MM)
      if (len >= 8) {
        const bom = view.getUint16(0, false);
        if (bom === 0x4949 || bom === 0x4d4d) {
          tiffOffset = 0;
        }
      }

      // 2) JPEG / RAF 内の "Exif\0\0" マーカー探索
      if (tiffOffset < 0) {
        for (let i = 0; i < len - 12; i++) {
          if (
            view.getUint32(i, false) === 0x45786966 &&
            view.getUint16(i + 4, false) === 0x0000
          ) {
            tiffOffset = i + 6;
            break;
          }
        }
      }

      if (tiffOffset < 0 || tiffOffset + 8 >= len) return null;

      const bom = view.getUint16(tiffOffset, false);
      if (bom !== 0x4949 && bom !== 0x4d4d) return null;
      const little = bom === 0x4949;

      const readAscii = (offset, count) => {
        if (offset < 0 || offset + count > len) return '';
        let out = '';
        for (let i = 0; i < count; i++) {
          const ch = view.getUint8(offset + i);
          if (ch === 0) break;
          if (ch >= 32 && ch <= 126) out += String.fromCharCode(ch);
        }
        return out.trim();
      };

      const readRational = (offset) => {
        if (offset < 0 || offset + 8 > len) return 0;
        const num = view.getUint32(offset, little);
        const den = view.getUint32(offset + 4, little);
        return den ? num / den : 0;
      };

      const parseIfd = (ifdRelOffset) => {
        const pos = tiffOffset + ifdRelOffset;
        if (pos < 0 || pos + 2 > len) return {};
        const count = view.getUint16(pos, little);
        const res = {};
        for (let i = 0; i < count; i++) {
          const ep = pos + 2 + i * 12;
          if (ep + 12 > len) break;
          const tag = view.getUint16(ep, little);
          const type = view.getUint16(ep + 2, little);
          const num = view.getUint32(ep + 4, little);
          const valOff = view.getUint32(ep + 8, little);

          if (type === 2) {
            // ASCII
            const strPos = num <= 4 ? ep + 8 : tiffOffset + valOff;
            res[tag] = readAscii(strPos, num);
          } else if (type === 3) {
            res[tag] = num === 1 ? view.getUint16(ep + 8, little) : valOff;
          } else if (type === 4) {
            res[tag] = valOff;
          } else if (type === 5) {
            res[tag] = readRational(tiffOffset + valOff);
          }
        }
        return res;
      };

      const ifd0Offset = view.getUint32(tiffOffset + 4, little);
      const ifd0 = parseIfd(ifd0Offset);
      const exifIfdOffset = ifd0[0x8769];
      const exif = exifIfdOffset ? parseIfd(exifIfdOffset) : {};

      const make = (ifd0[0x010f] || '').toUpperCase();
      const model = (ifd0[0x0110] || '').toUpperCase();
      let cameraStr = model || make;
      if (make && model && !model.startsWith(make.split(' ')[0])) {
        cameraStr = `${make.split(' ')[0]} ${model}`;
      }

      const lensModel = exif[0xa434] || '';
      const focalLen = exif[0x920a] ? `${Math.round(exif[0x920a])}mm` : '';
      const lensStr = lensModel || (focalLen ? `${focalLen} LENS` : '');

      const expTime = exif[0x829a];
      let shutterStr = '';
      if (expTime && expTime > 0) {
        shutterStr = expTime >= 1 ? `${expTime.toFixed(1)}s` : `1/${Math.round(1 / expTime)}s`;
      }

      const fNum = exif[0x829d];
      const fStr = fNum && fNum > 0 ? `f/${fNum.toFixed(1)}` : '';

      const isoVal = exif[0x8827];
      const isoStr = isoVal ? `ISO ${isoVal}` : '';

      const settingParts = [shutterStr, fStr, isoStr].filter(Boolean);

      if (!cameraStr && !lensStr && settingParts.length === 0) return null;

      return {
        camera: cameraStr || dlc2State.studio.camera,
        lens: lensStr || dlc2State.studio.lens,
        settings: settingParts.length > 0 ? settingParts.join('  ') : dlc2State.studio.settings
      };
    } catch (e) {
      return null;
    }
  }

  // メインのファイル選択時にExifを自動読み取りしてスタジオ枠に反映
  document.addEventListener('change', async (e) => {
    if (e.target && e.target.type === 'file' && !e.target.id.startsWith('hb-dlc2')) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const meta = await extractExifMetadata(file);
      if (meta) {
        dlc2State.studio.camera = meta.camera;
        dlc2State.studio.lens = meta.lens;
        dlc2State.studio.settings = meta.settings;
        if (drawer.classList.contains('open') && dlc2State.activeTab === 'studio') {
          renderDrawerBody();
        }
      }
    }
  }, true);

  // ==========================================
  // 3. キャンバス描画フック（本体・DLC1の後に合成）
  // ==========================================
  const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  const origPutImageData = CanvasRenderingContext2D.prototype.putImageData;
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const origToBlob = HTMLCanvasElement.prototype.toBlob;

  let renderScheduled = false;

  function captureDlc2Base() {
    const main = getMainCanvas();
    if (!main || !main.width || !main.height) return;
    dlc2BaseCanvas.width = main.width;
    dlc2BaseCanvas.height = main.height;
    origDrawImage.call(dlc2BaseCanvas.getContext('2d'), main, 0, 0);
  }

  function scheduleDlc2Render(ctx) {
    const main = getMainCanvas();
    if (!main || ctx.canvas !== main || dlc2State.isApplying) return;

    if (!renderScheduled) {
      renderScheduled = true;
      // DLC1のsetTimeout(0)処理が完了した直後に実行するため8ms遅延
      setTimeout(() => {
        renderScheduled = false;
        captureDlc2Base();
        if (hasAnyDlc2Effect()) {
          applyDlc2ToMainCanvas();
        }
      }, 8);
    }
  }

  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    const res = origDrawImage.apply(this, args);
    scheduleDlc2Render(this);
    return res;
  };

  CanvasRenderingContext2D.prototype.putImageData = function (...args) {
    const res = origPutImageData.apply(this, args);
    scheduleDlc2Render(this);
    return res;
  };

  // ==========================================
  // 4. DLC2 エフェクト＆合成描画エンジン
  // ==========================================
  function seededNoise(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function renderDlc2Pipeline(sourceCanvas) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    if (!w || !h) return sourceCanvas;

    let work = createInternalCanvas(w, h);
    let wctx = work.getContext('2d');
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = 'high';
    origDrawImage.call(wctx, sourceCanvas, 0, 0);

    const o = dlc2State.optics;
    const s = dlc2State.studio;
    const a = dlc2State.analog;

    // ------------------------------------------
    // STEP 1: アナログ多重露光（Double Exposure）
    // ------------------------------------------
    if (a.doubleImg) {
      wctx.save();
      wctx.globalCompositeOperation = a.doubleMode;
      wctx.globalAlpha = a.doubleOpacity;
      const iw = a.doubleImg.naturalWidth || a.doubleImg.width;
      const ih = a.doubleImg.naturalHeight || a.doubleImg.height;
      if (iw && ih) {
        // アスペクト比を維持してカバー描画
        const scale = Math.max(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        origDrawImage.call(wctx, a.doubleImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
      wctx.restore();
    }

    // ------------------------------------------
    // STEP 2: ハーフカメラ風 2コマ並べ（Half-Frame）
    // ------------------------------------------
    if (a.halfEnabled && a.halfImg) {
      const isVerticalStack =
        a.halfOrientation === 'vertical' ||
        (a.halfOrientation === 'auto' && w > h);

      const frameW = isVerticalStack ? Math.max(w, h) : Math.round(Math.max(w, h) * 1.35);
      const frameH = isVerticalStack ? Math.round(Math.max(w, h) * 1.35) : Math.max(w, h);
      const safeSize = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (frameW * frameH)));
      const outW = Math.round(frameW * safeSize);
      const outH = Math.round(frameH * safeSize);

      const halfCanvas = createInternalCanvas(outW, outH);
      const hctx = halfCanvas.getContext('2d');
      hctx.fillStyle = '#09090b';
      hctx.fillRect(0, 0, outW, outH);

      const pad = Math.round(Math.min(outW, outH) * 0.045);
      const gap = Math.round(pad * 0.85);

      const drawCoverBox = (imgSrc, bx, by, bw, bh) => {
        const sw = imgSrc.naturalWidth || imgSrc.width;
        const sh = imgSrc.naturalHeight || imgSrc.height;
        if (!sw || !sh) return;
        const sc = Math.max(bw / sw, bh / sh);
        const cw = bw / sc;
        const ch = bh / sc;
        origDrawImage.call(
          hctx,
          imgSrc,
          (sw - cw) / 2,
          (sh - ch) / 2,
          cw,
          ch,
          bx,
          by,
          bw,
          bh
        );
      };

      if (isVerticalStack) {
        const boxW = outW - pad * 2;
        const boxH = Math.floor((outH - pad * 2 - gap) / 2);
        drawCoverBox(work, pad, pad, boxW, boxH);
        drawCoverBox(a.halfImg, pad, pad + boxH + gap, boxW, boxH);
      } else {
        const boxW = Math.floor((outW - pad * 2 - gap) / 2);
        const boxH = outH - pad * 2;
        drawCoverBox(work, pad, pad, boxW, boxH);
        drawCoverBox(a.halfImg, pad + boxW + gap, pad, boxW, boxH);
      }

      // フィルムコマ番号印字
      hctx.fillStyle = 'rgba(245, 166, 35, 0.85)';
      hctx.font = `bold ${Math.max(11, Math.round(pad * 0.42))}px monospace`;
      hctx.fillText('12A  ►', pad, pad - Math.round(pad * 0.25));
      hctx.fillText('13   ►', isVerticalStack ? pad : pad + Math.floor((outW - pad * 2 - gap) / 2) + gap, isVerticalStack ? pad + Math.floor((outH - pad * 2 - gap) / 2) + gap - Math.round(pad * 0.22) : pad - Math.round(pad * 0.25));

      work = halfCanvas;
      wctx = hctx;
    }

    const curW = work.width;
    const curH = work.height;

    // ------------------------------------------
    // STEP 3: ピクセル光学処理（色収差 & スプリットトーン）
    // ------------------------------------------
    if (o.aberration > 0 || o.splitTone !== 'off') {
      const imgData = wctx.getImageData(0, 0, curW, curH);
      const d = imgData.data;
      const copy = o.aberration > 0 ? new Uint8ClampedArray(d) : null;
      const shiftPx = Math.max(1, Math.round((o.aberration / 100) * (curW * 0.012)));

      // スプリットトーンカラー定義
      const palettes = {
        tealOrange: { sh: [0, 48, 62], hi: [75, 36, 0] },
        vintageGold: { sh: [32, 22, 42], hi: [68, 52, 12] },
        cyberNight: { sh: [28, 10, 68], hi: [0, 58, 72] },
        pastelFilm: { sh: [24, 34, 48], hi: [56, 36, 44] }
      };
      const pal = palettes[o.splitTone] || null;
      const sFactor = (o.splitAmt / 100) * 0.65;

      for (let y = 0; y < curH; y++) {
        const rowOff = y * curW * 4;
        for (let x = 0; x < curW; x++) {
          const i = rowOff + x * 4;
          let r = d[i];
          let g = d[i + 1];
          let b = d[i + 2];

          // レンズ色収差（画面端に向かってRとBをずらす）
          if (copy) {
            const nx = (x / curW - 0.5) * 2;
            const localShift = Math.round(shiftPx * Math.abs(nx));
            if (localShift > 0) {
              const rx = Math.min(curW - 1, Math.max(0, x + localShift));
              const bx = Math.min(curW - 1, Math.max(0, x - localShift));
              r = copy[rowOff + rx * 4];
              b = copy[rowOff + bx * 4 + 2];
            }
          }

          // スプリットトーン（暗部と明部に別色を乗せる）
          if (pal) {
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const wSh = Math.pow(1 - lum, 1.6) * sFactor;
            const wHi = Math.pow(lum, 1.6) * sFactor;
            r += pal.sh[0] * wSh + pal.hi[0] * wHi;
            g += pal.sh[1] * wSh + pal.hi[1] * wHi;
            b += pal.sh[2] * wSh + pal.hi[2] * wHi;
          }

          d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
          d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
          d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        }
      }
      wctx.putImageData(imgData, 0, 0);
    }

    // ------------------------------------------
    // STEP 4: ブラックミスト（ハイライト拡散ブルーム）
    // ------------------------------------------
    if (o.blackMist > 0) {
      const scale = 0.25;
      const bw = Math.max(32, Math.round(curW * scale));
      const bh = Math.max(32, Math.round(curH * scale));
      const glowC = createInternalCanvas(bw, bh);
      const gctx = glowC.getContext('2d');
      origDrawImage.call(gctx, work, 0, 0, bw, bh);

      // 明部だけを抽出
      const gData = gctx.getImageData(0, 0, bw, bh);
      const gd = gData.data;
      for (let i = 0; i < gd.length; i += 4) {
        const lum = 0.299 * gd[i] + 0.587 * gd[i + 1] + 0.114 * gd[i + 2];
        const k = lum > 155 ? (lum - 155) / 100 : 0;
        gd[i] *= k;
        gd[i + 1] *= k;
        gd[i + 2] *= k;
      }
      gctx.putImageData(gData, 0, 0);

      wctx.save();
      wctx.globalCompositeOperation = 'screen';
      wctx.globalAlpha = (o.blackMist / 100) * 0.72;
      if ('filter' in wctx) {
        wctx.filter = `blur(${Math.max(4, Math.round(curW * 0.018))}px)`;
      }
      origDrawImage.call(wctx, glowC, 0, 0, curW, curH);
      wctx.restore();
    }

    // ------------------------------------------
    // STEP 5: シネマ・ハレーション（高輝度エッジの赤滲み）
    // ------------------------------------------
    if (o.halation > 0) {
      const scale = 0.25;
      const hw = Math.max(32, Math.round(curW * scale));
      const hh = Math.max(32, Math.round(curH * scale));
      const halC = createInternalCanvas(hw, hh);
      const hctx = halC.getContext('2d');
      origDrawImage.call(hctx, work, 0, 0, hw, hh);

      const hData = hctx.getImageData(0, 0, hw, hh);
      const hd = hData.data;
      for (let i = 0; i < hd.length; i += 4) {
        const lum = 0.299 * hd[i] + 0.587 * hd[i + 1] + 0.114 * hd[i + 2];
        if (lum > 205) {
          const strength = (lum - 205) / 50;
          hd[i] = 255 * strength;
          hd[i + 1] = 48 * strength;
          hd[i + 2] = 16 * strength;
        } else {
          hd[i] = hd[i + 1] = hd[i + 2] = 0;
        }
      }
      hctx.putImageData(hData, 0, 0);

      wctx.save();
      wctx.globalCompositeOperation = 'screen';
      wctx.globalAlpha = (o.halation / 100) * 0.9;
      if ('filter' in wctx) {
        wctx.filter = `blur(${Math.max(3, Math.round(curW * 0.012))}px)`;
      }
      origDrawImage.call(wctx, halC, 0, 0, curW, curH);
      wctx.restore();
    }

    // ------------------------------------------
    // STEP 6: 周辺減光（Vignette）
    // ------------------------------------------
    if (o.vignette > 0) {
      wctx.save();
      const cx = curW / 2;
      const cy = curH / 2;
      const maxR = Math.hypot(cx, cy);
      const innerR = maxR * (0.65 - (o.vignette / 100) * 0.35);
      const grad = wctx.createRadialGradient(cx, cy, innerR, cx, cy, maxR);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${(o.vignette / 100) * 0.82})`);
      wctx.fillStyle = grad;
      wctx.fillRect(0, 0, curW, curH);
      wctx.restore();
    }

    // ------------------------------------------
    // STEP 7: リアルグレイン（フィルム粒子）＆ ネガダスト
    // ------------------------------------------
    if (a.grain > 0) {
      wctx.save();
      wctx.globalCompositeOperation = 'overlay';
      wctx.globalAlpha = (a.grain / 100) * 0.65;
      const pat = wctx.createPattern(grainTile, 'repeat');
      if (pat) {
        wctx.fillStyle = pat;
        wctx.fillRect(0, 0, curW, curH);
      }
      wctx.restore();
    }

    if (a.dust > 0) {
      wctx.save();
      wctx.globalCompositeOperation = 'screen';
      const count = Math.round((a.dust / 100) * 65);
      for (let i = 1; i <= count; i++) {
        const dx = seededNoise(i * 3.1) * curW;
        const dy = seededNoise(i * 7.7) * curH;
        const alpha = 0.25 + seededNoise(i * 2.3) * 0.45;
        wctx.strokeStyle = `rgba(255, 248, 235, ${alpha})`;
        wctx.fillStyle = `rgba(255, 248, 235, ${alpha})`;

        if (i % 4 === 0) {
          // 細い繊維キズ
          wctx.lineWidth = Math.max(1, curW * 0.0008);
          wctx.beginPath();
          wctx.moveTo(dx, dy);
          wctx.quadraticCurveTo(
            dx + (seededNoise(i + 1) - 0.5) * curW * 0.025,
            dy + (seededNoise(i + 2) - 0.5) * curH * 0.025,
            dx + (seededNoise(i + 3) - 0.5) * curW * 0.04,
            dy + (seededNoise(i + 4) - 0.5) * curH * 0.04
          );
          wctx.stroke();
        } else {
          // 微細ダスト粒
          const rad = Math.max(0.8, seededNoise(i * 5.9) * (curW * 0.0014));
          wctx.beginPath();
          wctx.arc(dx, dy, rad, 0, Math.PI * 2);
          wctx.fill();
        }
      }
      wctx.restore();
    }

    // ------------------------------------------
    // STEP 8: Exifスタジオ枠 & ギャラリーマット仕上げ
    // ------------------------------------------
    if (s.frameStyle !== 'off') {
      if (s.frameStyle === 'exifWhite' || s.frameStyle === 'exifBlack') {
        const isDark = s.frameStyle === 'exifBlack';
        const sidePad = Math.round(curW * 0.045);
        const topPad = sidePad;
        const bottomPad = Math.max(76, Math.round(curH * 0.13));

        const framed = createInternalCanvas(curW + sidePad * 2, curH + topPad + bottomPad);
        const fctx = framed.getContext('2d');
        fctx.fillStyle = isDark ? '#0c0d10' : '#f7f6f2';
        fctx.fillRect(0, 0, framed.width, framed.height);

        origDrawImage.call(fctx, work, sidePad, topPad);

        // 微細な写真フチ線
        fctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
        fctx.lineWidth = 1;
        fctx.strokeRect(sidePad, topPad, curW, curH);

        const textCenterY = topPad + curH + bottomPad * 0.44;
        const mainFontSize = Math.max(14, Math.round(bottomPad * 0.22));
        const subFontSize = Math.max(11, Math.round(bottomPad * 0.16));

        fctx.textAlign = 'center';
        fctx.fillStyle = isDark ? '#f0f2f5' : '#181a1f';
        fctx.font = `800 ${mainFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        const titleLine = s.customNote
          ? `${s.camera}  •  ${s.customNote}`
          : `${s.camera}  |  ${s.lens}`;
        fctx.fillText(titleLine, framed.width / 2, textCenterY);

        fctx.fillStyle = isDark ? '#f5a623' : '#6b7280';
        fctx.font = `600 ${subFontSize}px "Courier New", monospace`;
        fctx.fillText(s.settings, framed.width / 2, textCenterY + mainFontSize * 1.35);

        work = framed;
      } else if (s.frameStyle === 'insta45') {
        // Instagram 4:5 ノーカット白マット
        const outW = Math.max(curW, Math.round(curH * 0.8));
        const outH = Math.round(outW * 1.25);
        const pad = Math.round(outW * 0.05);
        const boxW = outW - pad * 2;
        const boxH = outH - pad * 2;
        const sc = Math.min(boxW / curW, boxH / curH);
        const dw = Math.round(curW * sc);
        const dh = Math.round(curH * sc);

        const framed = createInternalCanvas(outW, outH);
        const fctx = framed.getContext('2d');
        fctx.fillStyle = '#ffffff';
        fctx.fillRect(0, 0, outW, outH);
        origDrawImage.call(fctx, work, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
        work = framed;
      } else if (s.frameStyle === 'blurMat') {
        // 1:1 ぼかし背景マット
        const sq = Math.max(curW, curH);
        const framed = createInternalCanvas(sq, sq);
        const fctx = framed.getContext('2d');

        // 背景に拡大ブラー画像
        fctx.save();
        if ('filter' in fctx) fctx.filter = `blur(${Math.max(18, Math.round(sq * 0.03))}px) brightness(0.65)`;
        const bgScale = Math.max(sq / curW, sq / curH) * 1.15;
        origDrawImage.call(
          fctx,
          work,
          (sq - curW * bgScale) / 2,
          (sq - curH * bgScale) / 2,
          curW * bgScale,
          curH * bgScale
        );
        fctx.restore();

        // 中央に元写真を影付き配置
        const innerMax = sq * 0.86;
        const sc = Math.min(innerMax / curW, innerMax / curH);
        const dw = Math.round(curW * sc);
        const dh = Math.round(curH * sc);
        const dx = (sq - dw) / 2;
        const dy = (sq - dh) / 2;

        fctx.save();
        fctx.shadowColor = 'rgba(0,0,0,0.65)';
        fctx.shadowBlur = Math.round(sq * 0.03);
        fctx.shadowOffsetY = Math.round(sq * 0.01);
        origDrawImage.call(fctx, work, dx, dy, dw, dh);
        fctx.restore();

        work = framed;
      }
    }

    return work;
  }

  function applyDlc2ToMainCanvas() {
    if (dlc2State.isApplying) return;
    const main = getMainCanvas();
    if (!main) return;
    if (!dlc2BaseCanvas.width || !dlc2BaseCanvas.height) {
      captureDlc2Base();
    }
    if (!dlc2BaseCanvas.width || !dlc2BaseCanvas.height) return;

    dlc2State.isApplying = true;
    try {
      const processed = renderDlc2Pipeline(dlc2BaseCanvas);
      if (main.width !== processed.width || main.height !== processed.height) {
        main.width = processed.width;
        main.height = processed.height;
      }
      const ctx = main.getContext('2d');
      ctx.clearRect(0, 0, main.width, main.height);
      origDrawImage.call(ctx, processed, 0, 0);
    } finally {
      dlc2State.isApplying = false;
    }
  }

  setTimeout(() => {
    if (!dlc2BaseCanvas.width) captureDlc2Base();
  }, 300);

  // ==========================================
  // 5. フル画質保存（DLC1と完全連携）
  // ==========================================
  function exportDlc2FullRes() {
    const main = getMainCanvas();
    if (!main) return;

    // すでにメインキャンバスにDLC1+DLC2が反映されているため、高画質JPEGで書き出し
    const source = hasAnyDlc2Effect()
      ? renderDlc2Pipeline(dlc2BaseCanvas.width ? dlc2BaseCanvas : main)
      : main;

    const quality = 0.97;
    const dimsText = `${source.width} × ${source.height} px`;
    const dataUrl = origToDataURL.call(source, 'image/jpeg', quality);

    let readyBlob = null;
    origToBlob.call(source, (blob) => {
      readyBlob = blob;
    }, 'image/jpeg', quality);

    let modal = document.getElementById('hb-dlc2-save-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hb-dlc2-save-modal';
      modal.style.cssText = `
        position: fixed; inset: 0; z-index: 10012;
        background: rgba(9, 10, 13, 0.96);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 18px; color: #f0f2f5; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      `;
      document.body.appendChild(modal);
    }

    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

    modal.innerHTML = `
      <div style="font-size:15px;font-weight:800;color:#38bdf8;margin-bottom:4px;">✨ DLC2 現像完了</div>
      <div style="font-size:11px;color:#949ba8;margin-bottom:10px;">出力解像度: <b style="color:#f0f2f5;">${dimsText}</b></div>
      <img src="${dataUrl}" style="max-width:100%;max-height:54vh;border-radius:10px;border:1px solid #2c303b;box-shadow:0 8px 28px rgba(0,0,0,0.75);object-fit:contain;">
      <div style="font-size:12px;color:#d0d5dd;margin-top:12px;text-align:center;line-height:1.5;">
        上の画像を<b>長押し →「写真に保存」</b><br>または下のボタンから写真アプリに保存できます
      </div>
      <div style="display:flex;gap:10px;width:100%;max-width:340px;margin-top:14px;">
        ${canNativeShare ? `<button id="hb-dlc2-share" style="flex:2;background:#38bdf8;color:#0e0f12;border:none;border-radius:999px;padding:12px 16px;font-size:13px;font-weight:800;cursor:pointer;">📤 共有 / 写真に保存</button>` : ''}
        <button id="hb-dlc2-close" style="flex:1;background:#2c303b;color:#f0f2f5;border:none;border-radius:999px;padding:12px 16px;font-size:13px;font-weight:700;cursor:pointer;">閉じる</button>
      </div>
    `;
    modal.style.display = 'flex';

    const shareBtn = modal.querySelector('#hb-dlc2-share');
    if (shareBtn) {
      shareBtn.onclick = async () => {
        try {
          if (!readyBlob) {
            const res = await fetch(dataUrl);
            readyBlob = await res.blob();
          }
          const file = new File([readyBlob], `hassurublad_dlc2_${Date.now()}.jpg`, { type: 'image/jpeg' });
          await navigator.share({
            files: [file],
            title: 'HASSURUBLAD DLC2'
          });
        } catch (err) {
          if (err && err.name !== 'AbortError') {
            showDlc2Toast('上の画像を長押しして「写真に保存」してください');
          }
        }
      };
    }

    modal.querySelector('#hb-dlc2-close').onclick = () => {
      modal.style.display = 'none';
    };
  }

  // ==========================================
  // 6. スタイル＆UI（画面左下に独立配置）
  // ==========================================
  const style = document.createElement('style');
  style.textContent = `
    #hb-dlc2-fab {
      position: fixed;
      left: 14px;
      bottom: 18px;
      z-index: 9990;
      background: linear-gradient(135deg, #38bdf8, #0284c7);
      color: #07131a;
      border: none;
      border-radius: 999px;
      padding: 10px 15px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      box-shadow: 0 6px 20px rgba(56, 189, 248, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      touch-action: manipulation;
    }
    #hb-dlc2-fab:active { transform: scale(0.95); }

    #hb-dlc2-drawer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9996;
      background: #14171d;
      border-top: 1px solid #2b3240;
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.88);
      color: #f0f2f5;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-height: 82vh;
      display: flex;
      flex-direction: column;
      transform: translateY(105%);
      transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    }
    #hb-dlc2-drawer.open { transform: translateY(0); }

    .hb2-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid #2b3240;
      gap: 6px;
    }
    .hb2-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
    }
    .hb2-tab {
      background: #1d222b;
      color: #949ba8;
      border: 1px solid #2b3240;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .hb2-tab.active {
      background: #38bdf8;
      color: #07131a;
      border-color: #38bdf8;
    }
    .hb2-badge {
      font-size: 10px;
      color: #6b7280;
      font-family: monospace;
      white-space: nowrap;
    }
    .hb2-close {
      background: #1d222b;
      color: #f0f2f5;
      border: 1px solid #2b3240;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      font-size: 15px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .hb2-body {
      padding: 14px 16px 28px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .hb2-card {
      background: #1d222b;
      border: 1px solid #2b3240;
      border-radius: 12px;
      padding: 12px;
    }
    .hb2-title {
      font-size: 12px;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hb2-row {
      margin-bottom: 10px;
    }
    .hb2-row:last-child { margin-bottom: 0; }
    .hb2-shead {
      display: flex;
      justify-content: space-between;
      font-size: 11.5px;
      color: #d0d5dd;
      margin-bottom: 4px;
    }
    .hb2-sval {
      font-family: monospace;
      color: #38bdf8;
      font-weight: 700;
    }
    .hb2-range {
      width: 100%;
      accent-color: #38bdf8;
    }
    .hb2-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .hb2-chip {
      background: #14171d;
      color: #f0f2f5;
      border: 1px solid #2b3240;
      border-radius: 8px;
      padding: 7px 9px;
      font-size: 11.5px;
      cursor: pointer;
      flex: 1 1 auto;
      text-align: center;
      touch-action: manipulation;
    }
    .hb2-chip.active {
      background: rgba(56, 189, 248, 0.18);
      border-color: #38bdf8;
      color: #38bdf8;
      font-weight: 700;
    }
    .hb2-input {
      width: 100%;
      box-sizing: border-box;
      background: #14171d;
      color: #f0f2f5;
      border: 1px solid #2b3240;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
      margin-top: 6px;
    }
    .hb2-btn {
      width: 100%;
      background: #38bdf8;
      color: #07131a;
      border: none;
      border-radius: 10px;
      padding: 12px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      margin-top: 4px;
      touch-action: manipulation;
    }
    .hb2-btn.secondary {
      background: #2b3240;
      color: #f0f2f5;
    }
    #hb-dlc2-toast {
      position: fixed;
      top: 52px;
      left: 50%;
      transform: translateX(-50%) translateY(-16px);
      background: rgba(20, 23, 29, 0.96);
      border: 1px solid #38bdf8;
      color: #f0f2f5;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      z-index: 10025;
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s ease;
      white-space: nowrap;
    }
    #hb-dlc2-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;
  document.head.appendChild(style);

  function showDlc2Toast(msg) {
    let t = document.getElementById('hb-dlc2-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'hb-dlc2-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  const fab = document.createElement('button');
  fab.id = 'hb-dlc2-fab';
  fab.innerHTML = '✨ DLC2';
  document.body.appendChild(fab);

  const drawer = document.createElement('div');
  drawer.id = 'hb-dlc2-drawer';
  drawer.innerHTML = `
    <div class="hb2-header">
      <div class="hb2-tabs">
        <button class="hb2-tab active" data-tab="optics">① 光学・シネマ</button>
        <button class="hb2-tab" data-tab="studio">② Exif・枠</button>
        <button class="hb2-tab" data-tab="analog">③ 多重・特殊</button>
        <span class="hb2-badge">${DLC2_VERSION}</span>
      </div>
      <button class="hb2-close" id="hb2-close-btn">✕</button>
    </div>
    <div class="hb2-body" id="hb2-drawer-body"></div>
  `;
  document.body.appendChild(drawer);

  fab.addEventListener('click', () => {
    if (!dlc2BaseCanvas.width) captureDlc2Base();
    drawer.classList.add('open');
    renderDrawerBody();
  });

  drawer.querySelector('#hb2-close-btn').addEventListener('click', () => {
    drawer.classList.remove('open');
  });

  drawer.querySelectorAll('.hb2-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      drawer.querySelectorAll('.hb2-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      dlc2State.activeTab = tab.dataset.tab;
      renderDrawerBody();
    });
  });

  function loadExtraImageFile(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  function renderDrawerBody() {
    const body = document.getElementById('hb2-drawer-body');
    if (!body) return;

    if (dlc2State.activeTab === 'optics') {
      const o = dlc2State.optics;
      body.innerHTML = `
        <div class="hb2-card">
          <div class="hb2-title">
            <span>🎞️ シネマ光学フィルター</span>
            <button class="hb2-chip" id="hb2-opt-reset" style="padding:3px 8px;font-size:11px;flex:0;">リセット</button>
          </div>

          <div class="hb2-row">
            <div class="hb2-shead"><span>🔴 ハレーション (CineStill風 赤滲み)</span><span class="hb2-sval" id="v-hal">${o.halation}%</span></div>
            <input type="range" class="hb2-range" id="s-hal" min="0" max="100" step="5" value="${o.halation}">
          </div>

          <div class="hb2-row">
            <div class="hb2-shead"><span>🌫️ ブラックミスト (ハイライト拡散)</span><span class="hb2-sval" id="v-mist">${o.blackMist}%</span></div>
            <input type="range" class="hb2-range" id="s-mist" min="0" max="100" step="5" value="${o.blackMist}">
          </div>

          <div class="hb2-row">
            <div class="hb2-shead"><span>🌈 レンズ色収差 (RGBズレ)</span><span class="hb2-sval" id="v-abr">${o.aberration}%</span></div>
            <input type="range" class="hb2-range" id="s-abr" min="0" max="100" step="5" value="${o.aberration}">
          </div>

          <div class="hb2-row">
            <div class="hb2-shead"><span>🌑 周辺減光 (Vignette)</span><span class="hb2-sval" id="v-vig">${o.vignette}%</span></div>
            <input type="range" class="hb2-range" id="s-vig" min="0" max="100" step="5" value="${o.vignette}">
          </div>
        </div>

        <div class="hb2-card">
          <div class="hb2-title">
            <span>🎨 スプリットトーン（映画カラーグレーディング）</span>
            <span class="hb2-sval" id="v-spl">${o.splitAmt}%</span>
          </div>
          <div class="hb2-chips">
            <button class="hb2-chip ${o.splitTone === 'off' ? 'active' : ''}" data-split="off">OFF</button>
            <button class="hb2-chip ${o.splitTone === 'tealOrange' ? 'active' : ''}" data-split="tealOrange">ティール&オレンジ</button>
            <button class="hb2-chip ${o.splitTone === 'vintageGold' ? 'active' : ''}" data-split="vintageGold">レトロゴールド</button>
            <button class="hb2-chip ${o.splitTone === 'cyberNight' ? 'active' : ''}" data-split="cyberNight">ナイトシネマ</button>
            <button class="hb2-chip ${o.splitTone === 'pastelFilm' ? 'active' : ''}" data-split="pastelFilm">パステルネガ</button>
          </div>
          <input type="range" class="hb2-range" id="s-spl" min="10" max="100" step="5" value="${o.splitAmt}" style="margin-top:8px;">
        </div>

        <button class="hb2-btn" id="hb2-export-1">💾 フル画質で保存（DLC2適用）</button>
      `;

      const bindOpt = (id, vid, key) => {
        const sl = body.querySelector(id);
        const vl = body.querySelector(vid);
        sl.addEventListener('input', () => {
          o[key] = Number(sl.value);
          vl.textContent = `${o[key]}%`;
          applyDlc2ToMainCanvas();
        });
      };

      bindOpt('#s-hal', '#v-hal', 'halation');
      bindOpt('#s-mist', '#v-mist', 'blackMist');
      bindOpt('#s-abr', '#v-abr', 'aberration');
      bindOpt('#s-vig', '#v-vig', 'vignette');

      const splSl = body.querySelector('#s-spl');
      const splVl = body.querySelector('#v-spl');
      splSl.addEventListener('input', () => {
        o.splitAmt = Number(splSl.value);
        splVl.textContent = `${o.splitAmt}%`;
        if (o.splitTone !== 'off') applyDlc2ToMainCanvas();
      });

      body.querySelectorAll('[data-split]').forEach((btn) => {
        btn.addEventListener('click', () => {
          o.splitTone = btn.dataset.split;
          applyDlc2ToMainCanvas();
          renderDrawerBody();
        });
      });

      body.querySelector('#hb2-opt-reset').addEventListener('click', () => {
        Object.assign(o, {
          halation: 0, blackMist: 0, splitTone: 'off', splitAmt: 45, aberration: 0, vignette: 0
        });
        applyDlc2ToMainCanvas();
        renderDrawerBody();
      });

      body.querySelector('#hb2-export-1').addEventListener('click', exportDlc2FullRes);

    } else if (dlc2State.activeTab === 'studio') {
      const s = dlc2State.studio;
      body.innerHTML = `
        <div class="hb2-card">
          <div class="hb2-title"><span>🖼️ Exifギャラリー枠 ＆ SNSノーカット余白</span></div>
          <div class="hb2-chips">
            <button class="hb2-chip ${s.frameStyle === 'off' ? 'active' : ''}" data-fstyle="off">OFF</button>
            <button class="hb2-chip ${s.frameStyle === 'exifWhite' ? 'active' : ''}" data-fstyle="exifWhite">白Exif枠</button>
            <button class="hb2-chip ${s.frameStyle === 'exifBlack' ? 'active' : ''}" data-fstyle="exifBlack">黒Exif枠</button>
            <button class="hb2-chip ${s.frameStyle === 'insta45' ? 'active' : ''}" data-fstyle="insta45">Insta 4:5白枠</button>
            <button class="hb2-chip ${s.frameStyle === 'blurMat' ? 'active' : ''}" data-fstyle="blurMat">1:1 ぼかし背景</button>
          </div>
        </div>

        <div class="hb2-card">
          <div class="hb2-title"><span>📷 撮影データ印字テキスト（写真から自動読取・編集可）</span></div>
          <input type="text" class="hb2-input" id="inp-cam" placeholder="カメラ名" value="${s.camera}">
          <input type="text" class="hb2-input" id="inp-lens" placeholder="レンズ名" value="${s.lens}">
          <input type="text" class="hb2-input" id="inp-set" placeholder="シャッター / F値 / ISO" value="${s.settings}">
          <input type="text" class="hb2-input" id="inp-note" placeholder="撮影地やメモ（任意・空欄ならレンズ表示）" value="${s.customNote}">
        </div>

        <button class="hb2-btn" id="hb2-export-2">💾 フル画質で保存（Exif枠適用）</button>
      `;

      body.querySelectorAll('[data-fstyle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          s.frameStyle = btn.dataset.fstyle;
          applyDlc2ToMainCanvas();
          renderDrawerBody();
        });
      });

      const bindInp = (id, key) => {
        body.querySelector(id).addEventListener('input', (e) => {
          s[key] = e.target.value;
          if (s.frameStyle === 'exifWhite' || s.frameStyle === 'exifBlack') {
            applyDlc2ToMainCanvas();
          }
        });
      };

      bindInp('#inp-cam', 'camera');
      bindInp('#inp-lens', 'lens');
      bindInp('#inp-set', 'settings');
      bindInp('#inp-note', 'customNote');

      body.querySelector('#hb2-export-2').addEventListener('click', exportDlc2FullRes);

    } else {
      const a = dlc2State.analog;
      body.innerHTML = `
        <div class="hb2-card">
          <div class="hb2-title">
            <span>🌓 多重露光（Double Exposure）</span>
            <span style="font-size:11px;color:#949ba8;">${a.doubleName || '未選択'}</span>
          </div>
          <div class="hb2-chips">
            <button class="hb2-chip active" id="hb2-pick-dbl">＋ 重ねる写真を選ぶ</button>
            ${a.doubleImg ? `<button class="hb2-chip" id="hb2-clear-dbl">解除</button>` : ''}
          </div>
          ${a.doubleImg ? `
            <div class="hb2-chips" style="margin-top:8px;">
              <button class="hb2-chip ${a.doubleMode === 'screen' ? 'active' : ''}" data-dmode="screen">光合成(Screen)</button>
              <button class="hb2-chip ${a.doubleMode === 'lighten' ? 'active' : ''}" data-dmode="lighten">比較(明)</button>
              <button class="hb2-chip ${a.doubleMode === 'overlay' ? 'active' : ''}" data-dmode="overlay">オーバーレイ</button>
            </div>
            <div class="hb2-row" style="margin-top:8px;">
              <div class="hb2-shead"><span>重ねる濃さ</span><span class="hb2-sval" id="v-dbl">${Math.round(a.doubleOpacity * 100)}%</span></div>
              <input type="range" class="hb2-range" id="s-dbl" min="0.1" max="1" step="0.05" value="${a.doubleOpacity}">
            </div>
          ` : ''}
        </div>

        <div class="hb2-card">
          <div class="hb2-title">
            <span>🎞️ ハーフカメラ風 2コマ並べ（Half-Frame）</span>
            <span style="font-size:11px;color:#949ba8;">${a.halfName || '未選択'}</span>
          </div>
          <div class="hb2-chips">
            <button class="hb2-chip active" id="hb2-pick-half">＋ 2コマ目の写真を選ぶ</button>
            ${a.halfImg ? `<button class="hb2-chip" id="hb2-clear-half">解除</button>` : ''}
          </div>
          ${a.halfImg ? `
            <div class="hb2-chips" style="margin-top:8px;">
              <button class="hb2-chip ${a.halfOrientation === 'auto' ? 'active' : ''}" data-hori="auto">自動レイアウト</button>
              <button class="hb2-chip ${a.halfOrientation === 'horizontal' ? 'active' : ''}" data-hori="horizontal">左右2コマ</button>
              <button class="hb2-chip ${a.halfOrientation === 'vertical' ? 'active' : ''}" data-hori="vertical">上下2コマ</button>
            </div>
          ` : ''}
        </div>

        <div class="hb2-card">
          <div class="hb2-title"><span>✨ リアルフィルム粒子 ＆ ネガダスト</span></div>
          <div class="hb2-row">
            <div class="hb2-shead"><span>🎞️ 銀塩グレイン（粒子感）</span><span class="hb2-sval" id="v-grn">${a.grain}%</span></div>
            <input type="range" class="hb2-range" id="s-grn" min="0" max="100" step="5" value="${a.grain}">
          </div>
          <div class="hb2-row">
            <div class="hb2-shead"><span>🧹 ネガダスト（ホコリ・微細キズ）</span><span class="hb2-sval" id="v-dst">${a.dust}%</span></div>
            <input type="range" class="hb2-range" id="s-dst" min="0" max="100" step="5" value="${a.dust}">
          </div>
        </div>

        <button class="hb2-btn" id="hb2-export-3">💾 フル画質で保存（特殊現像適用）</button>
      `;

      // 多重露光ファイル選択
      body.querySelector('#hb2-pick-dbl').addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.onchange = async (ev) => {
          const f = ev.target.files && ev.target.files[0];
          if (!f) return;
          const img = await loadExtraImageFile(f);
          if (img) {
            a.doubleImg = img;
            a.doubleName = f.name;
            applyDlc2ToMainCanvas();
            renderDrawerBody();
            showDlc2Toast('🌓 多重露光を合成しました');
          }
        };
        inp.click();
      });

      const clearDbl = body.querySelector('#hb2-clear-dbl');
      if (clearDbl) {
        clearDbl.addEventListener('click', () => {
          a.doubleImg = null;
          a.doubleName = '';
          applyDlc2ToMainCanvas();
          renderDrawerBody();
        });
      }

      body.querySelectorAll('[data-dmode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          a.doubleMode = btn.dataset.dmode;
          applyDlc2ToMainCanvas();
          renderDrawerBody();
        });
      });

      const dblSl = body.querySelector('#s-dbl');
      if (dblSl) {
        dblSl.addEventListener('input', () => {
          a.doubleOpacity = parseFloat(dblSl.value);
          body.querySelector('#v-dbl').textContent = `${Math.round(a.doubleOpacity * 100)}%`;
          applyDlc2ToMainCanvas();
        });
      }

      // ハーフカメラ2コマ目選択
      body.querySelector('#hb2-pick-half').addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.onchange = async (ev) => {
          const f = ev.target.files && ev.target.files[0];
          if (!f) return;
          const img = await loadExtraImageFile(f);
          if (img) {
            a.halfImg = img;
            a.halfName = f.name;
            a.halfEnabled = true;
            applyDlc2ToMainCanvas();
            renderDrawerBody();
            showDlc2Toast('🎞️ ハーフカメラ2コマ構成を作成しました');
          }
        };
        inp.click();
      });

      const clearHalf = body.querySelector('#hb2-clear-half');
      if (clearHalf) {
        clearHalf.addEventListener('click', () => {
          a.halfImg = null;
          a.halfName = '';
          a.halfEnabled = false;
          applyDlc2ToMainCanvas();
          renderDrawerBody();
        });
      }

      body.querySelectorAll('[data-hori]').forEach((btn) => {
        btn.addEventListener('click', () => {
          a.halfOrientation = btn.dataset.hori;
          applyDlc2ToMainCanvas();
          renderDrawerBody();
        });
      });

      // グレイン＆ダスト
      const grnSl = body.querySelector('#s-grn');
      grnSl.addEventListener('input', () => {
        a.grain = Number(grnSl.value);
        body.querySelector('#v-grn').textContent = `${a.grain}%`;
        applyDlc2ToMainCanvas();
      });

      const dstSl = body.querySelector('#s-dst');
      dstSl.addEventListener('input', () => {
        a.dust = Number(dstSl.value);
        body.querySelector('#v-dst').textContent = `${a.dust}%`;
        applyDlc2ToMainCanvas();
      });

      body.querySelector('#hb2-export-3').addEventListener('click', exportDlc2FullRes);
    }
  }
})();
