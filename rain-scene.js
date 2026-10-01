/*!
 * RainScene 1.0.0 · 밤 도시 비 배경
 * Canvas 2D, 의존성 없음. 사용법은 README.md를 참고하세요.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RainScene = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';

  const DEFAULTS = {
    intensity: 0.55,            // 0 이슬비 … 1 폭우
    wind: 0.2,                  // -1 왼쪽으로 … 1 오른쪽으로 들이치는 바람
    lightning: true,            // 멀리서 가끔 치는 번개
    parallax: true,             // 마우스를 따라 배경이 살짝 움직이는 깊이감
    grain: true,                // 필름 그레인 (어두운 그라데이션의 계단 현상도 가려 줌)
    autoplay: true,
    respectReducedMotion: true, // OS의 '동작 줄이기'가 켜져 있으면 정지 화면으로 시작
    quality: 'auto',            // 'auto' | 'high' | 'low'
    maxDpr: 2,
    seed: 7                     // 건물·불빛 배치를 정하는 값
  };

  // ── 색 ──────────────────────────────────────────────────────────
  const COLOR = {
    sky: [[0, [3, 6, 14]], [0.45, [7, 12, 27]], [0.8, [15, 22, 42]], [1, [36, 34, 52]]],
    ground: [[0, [7, 9, 14]], [0.15, [6, 8, 13]], [1, [2, 3, 6]]],
    domes: [[255, 138, 80], [255, 150, 96], [70, 150, 196], [196, 84, 150]],
    cityFarTop: [21, 25, 38], cityFarBottom: [44, 39, 48],
    cityNearTop: [9, 11, 18], cityNearBottom: [24, 21, 27],
    cloudTop: [13, 19, 36], cloudBottom: [60, 56, 74],
    cloudLit: [190, 200, 255],
    mist: [62, 70, 92], mistLow: [88, 82, 92],
    haze: [255, 160, 112],
    rain: [186, 208, 236],
    rainLit: [246, 228, 204],
    flash: [168, 184, 255],
    windowWarm: [255, 190, 112],
    windowCool: [176, 212, 255]
  };

  // 도시 불빛 색과 비중
  const LIGHTS = [
    { rgb: [255, 166, 82], w: 30 },  // 나트륨 가로등
    { rgb: [255, 214, 162], w: 18 }, // 따뜻한 백색
    { rgb: [255, 122, 64], w: 9 },   // 주황 간판
    { rgb: [184, 216, 255], w: 13 }, // 차가운 LED
    { rgb: [78, 206, 204], w: 8 },   // 청록 네온
    { rgb: [255, 66, 78], w: 10 },   // 빨간 미등·신호
    { rgb: [255, 88, 166], w: 5 },   // 분홍 네온
    { rgb: [112, 240, 156], w: 3 }   // 초록 신호
  ];
  const HEADLIGHT = 1;
  const TAILLIGHT = 5;

  // 빗줄기 3겹. z: 0 먼 곳 … 1 바로 앞. speed·len은 화면 높이 대비 비율, count는 1440×900 폭우 기준
  //  fine: 먼 비, 가늘고 촘촘한 결 / streak: 초점이 맞은 중간 비 / soft: 렌즈 가까이라 번진 굵은 비
  const LAYERS = [
    { z0: 0.0, z1: 0.33, count: 900, speed: [0.85, 1.05], len: [0.014, 0.022], width: 0.7, alpha: 0.14, style: 'fine', splash: 0, curtain: 0.5 },
    { z0: 0.33, z1: 0.68, count: 300, speed: [1.35, 1.65], len: [0.028, 0.042], width: 1.0, alpha: 0.2, style: 'streak', splash: 0.55, curtain: 0.35 },
    { z0: 0.68, z1: 1.0, count: 80, speed: [2.1, 2.6], len: [0.05, 0.08], width: 1.3, alpha: 0.24, style: 'soft', splash: 0.9, curtain: 0 }
  ];

  // 빗줄기 뒤 배경의 밝기(0~255) 구간. 빗줄기는 어두운 하늘에선 거의 안 보이고, 불빛을 등지면 환하게 보인다
  const LIT_STEPS = [16, 34, 64];
  const LIT_ALPHA = [0.5, 1.0, 1.8, 2.7];

  const QUALITY = [
    { dpr: 1, bg: 0.34, rain: 0.55, splash: 0.3, lens: false },
    { dpr: 1.5, bg: 0.42, rain: 0.8, splash: 0.5, lens: true },
    { dpr: 2, bg: 0.5, rain: 1, splash: 0.75, lens: true }
  ];

  const MARGIN = 18;   // 시차 효과로 밀려도 가장자리가 드러나지 않게 두는 여백(px)
  const LM_CELL = 16;  // 밝기 지도 한 칸(px)
  const GRAIN = 160;   // 그레인 타일(px)
  const STRIPS = 28;   // 바닥 반사를 일렁이게 나누는 띠 수

  // ── 유틸 ─────────────────────────────────────────────────────────
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mixc = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + clamp(a, 0, 1).toFixed(3) + ')';

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) {
    let u = 0;
    while (u === 0) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  }
  function pick(rnd, list) {
    let total = 0;
    for (const it of list) total += it.w;
    let r = rnd() * total;
    for (let i = 0; i < list.length; i++) {
      r -= list[i].w;
      if (r <= 0) return i;
    }
    return list.length - 1;
  }
  function css(el, styles) {
    for (const k in styles) el.style[k] = styles[k];
  }

  // x 방향으로 이어지는(타일 가능한) 값 노이즈
  function valueNoise(rnd, fx, fy) {
    const grid = new Float32Array(fx * (fy + 1));
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    return function (u, v) {
      const x = u * fx, y = v * fy;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const tx = x - x0, ty = y - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const xa = ((x0 % fx) + fx) % fx, xb = (xa + 1) % fx;
      const ya = Math.min(y0, fy), yb = Math.min(y0 + 1, fy);
      const a = grid[ya * fx + xa], b = grid[ya * fx + xb];
      const c = grid[yb * fx + xa], d = grid[yb * fx + xb];
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  }
  function fbmField(rnd, w, h, fx, fy, octaves) {
    const fns = [];
    for (let o = 0; o < octaves; o++) fns.push(valueNoise(rnd, fx << o, fy << o));
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0, amp = 1, total = 0;
        for (let o = 0; o < octaves; o++) {
          v += fns[o](x / w, y / h) * amp;
          total += amp;
          amp *= 0.5;
        }
        out[y * w + x] = v / total;
      }
    }
    return out;
  }

  // ── 미리 그려 두는 스프라이트 ─────────────────────────────────────
  function discSprite(mk, rgb) {
    const S = 64, cv = mk(S, S), c = cv.getContext('2d');
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(rgb, 0.8));
    g.addColorStop(0.6, rgba(rgb, 0.86));
    g.addColorStop(0.8, rgba(rgb, 0.95)); // 가장자리가 살짝 밝은 렌즈 보케
    g.addColorStop(0.9, rgba(rgb, 0.42));
    g.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    return cv;
  }
  function glowSprite(mk, rgb) {
    const S = 64, cv = mk(S, S), c = cv.getContext('2d');
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(rgb, 1));
    g.addColorStop(0.1, rgba(rgb, 0.62));
    g.addColorStop(0.3, rgba(rgb, 0.22));
    g.addColorStop(0.6, rgba(rgb, 0.06));
    g.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    return cv;
  }
  // 젖은 바닥에 길게 끌리는 불빛: 위가 밝고 아래로 사라지는 세로 줄
  function streakSprite(mk, rgb) {
    const w = 32, h = 128, cv = mk(w, h), c = cv.getContext('2d');
    let g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, rgba(rgb, 0));
    g.addColorStop(0.3, rgba(rgb, 0.3));
    g.addColorStop(0.5, rgba(rgb, 1));
    g.addColorStop(0.7, rgba(rgb, 0.3));
    g.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.08, 'rgba(0,0,0,1)');
    g.addColorStop(0.35, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    return cv;
  }
  function paintField(mk, field, w, h, lo, hi, env, top, bottom, alphaMax) {
    const cv = mk(w, h), c = cv.getContext('2d');
    const img = c.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1), e = env(v) * alphaMax;
      const col = mixc(top, bottom, v);
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        d[p] = col[0];
        d[p + 1] = col[1];
        d[p + 2] = col[2];
        d[p + 3] = 255 * smoothstep(lo, hi, field[y * w + x]) * e;
      }
    }
    c.putImageData(img, 0, 0);
    return cv;
  }
  function makeFog(mk, seed) {
    const rnd = mulberry32((seed | 0) * 31337 + 5);
    const cloudF = fbmField(rnd, 512, 160, 3, 2, 5);
    const mistF = fbmField(rnd, 512, 96, 4, 2, 4);
    const puddleF = fbmField(rnd, 256, 96, 5, 3, 4);
    const cloudEnv = v => smoothstep(0, 0.3, v) * (1 - smoothstep(0.8, 1, v));
    const bandEnv = v => smoothstep(0, 0.5, v) * (1 - smoothstep(0.5, 1, v));
    const white = [255, 255, 255];
    return {
      cloud: paintField(mk, cloudF, 512, 160, 0.44, 0.74, cloudEnv, COLOR.cloudTop, COLOR.cloudBottom, 0.92),
      cloudLit: paintField(mk, cloudF, 512, 160, 0.4, 0.7, cloudEnv, COLOR.cloudLit, COLOR.cloudLit, 0.75),
      mist: paintField(mk, mistF, 512, 96, 0.36, 0.7, bandEnv, COLOR.mist, COLOR.mistLow, 0.85),
      haze: paintField(mk, mistF, 512, 96, 0.3, 0.75, bandEnv, COLOR.haze, COLOR.haze, 1),
      puddle: paintField(mk, puddleF, 256, 96, 0.42, 0.62, () => 1, white, white, 1)
    };
  }
  function grainTile(mk) {
    const cv = mk(GRAIN, GRAIN), c = cv.getContext('2d');
    const img = c.createImageData(GRAIN, GRAIN), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const light = Math.random() < 0.5;
      d[i] = d[i + 1] = d[i + 2] = light ? 255 : 0;
      d[i + 3] = Math.random() * (light ? 16 : 30); // 흰 점은 더 옅게: 검은 부분이 들뜨지 않도록
    }
    c.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  // ── 장면 ─────────────────────────────────────────────────────────
  function createScene(host, opt) {
    const doc = host.ownerDocument || document;
    const win = doc.defaultView || window;
    const rand = Math.random;
    const mk = (w, h) => {
      const cv = doc.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(w));
      cv.height = Math.max(1, Math.ceil(h));
      return cv;
    };

    if (win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const rootEl = doc.createElement('div');
    rootEl.className = 'rain-scene';
    rootEl.setAttribute('aria-hidden', 'true');
    const fill = { position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' };
    css(rootEl, Object.assign({ overflow: 'hidden', pointerEvents: 'none', background: '#03050a', isolation: 'isolate' }, fill));
    const bgCanvas = doc.createElement('canvas');
    const fgCanvas = doc.createElement('canvas');
    for (const cv of [bgCanvas, fgCanvas]) {
      css(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block' });
    }
    const vignette = doc.createElement('div');
    css(vignette, Object.assign({ background: 'radial-gradient(130% 95% at 50% 42%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%)' }, fill));
    const grain = doc.createElement('div');
    css(grain, {
      position: 'absolute', top: -GRAIN + 'px', right: -GRAIN + 'px', bottom: -GRAIN + 'px', left: -GRAIN + 'px', opacity: '0.55', willChange: 'transform',
      backgroundImage: 'url(' + grainTile(mk) + ')', backgroundSize: GRAIN + 'px ' + GRAIN + 'px'
    });
    grain.hidden = !opt.grain;
    rootEl.append(bgCanvas, fgCanvas, vignette, grain);
    host.insertBefore(rootEl, host.firstChild);
    const bg = bgCanvas.getContext('2d', { alpha: false });
    const fg = fgCanvas.getContext('2d');
    const canFilter = typeof bg.filter === 'string';

    // 상태
    let W = 0, H = 0, dpr = 1, s = 0.5, horizonY = 0, areaScale = 1, bandH = 1;
    let qLevel = opt.quality === 'low' ? 0 : 2;
    let staticCv = null, farCv = null, nearCv = null, towers = [];
    let flipCv = null, flipCtx = null, reflCv = null, reflCtx = null, maskCv = null;
    let lights = [], bigLights = [], lmap = new Uint8Array(1), cols = 1, rows = 1;
    let layers = [];
    const sprite = rgb => ({ disc: discSprite(mk, rgb), glow: glowSprite(mk, rgb), streak: streakSprite(mk, rgb) });
    const sprites = LIGHTS.map(l => sprite(l.rgb)).concat(LIGHTS.map(l => sprite(mixc(l.rgb, COLOR.haze, 0.3))));
    let fog = makeFog(mk, opt.seed);
    let t = 0, last = 0, raf = 0, frameNo = 0;
    let playing = false, visible = true, destroyed = false;
    let intensity = clamp(+opt.intensity || 0, 0, 1), intensityT = intensity;
    let wind = clamp(+opt.wind || 0, -1, 1), windT = wind, slant = wind * 0.3;
    let parX = 0, parT = 0;
    let cloudOff = 0, mistOff = 0, hazeOff = 0, grainT = 0;
    let flashes = [], strikeX = 0, strikeY = 0, nextStrike = Infinity;
    let perfAcc = 0, perfN = 0, perfWarm = 0;
    const ripples = [], sprays = [], lens = [], lanes = [];

    // ── 세계 만들기 (크기가 바뀔 때마다) ─────────────────────────────
    function rebuild() {
      const oldW = W, oldH = H;
      const r = rootEl.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      const q = QUALITY[qLevel];
      dpr = Math.max(1, Math.min(win.devicePixelRatio || 1, opt.maxDpr, q.dpr));
      s = q.bg;
      fgCanvas.width = Math.round(W * dpr);
      fgCanvas.height = Math.round(H * dpr);
      bgCanvas.width = Math.ceil(W * s);
      bgCanvas.height = Math.ceil(H * s);
      horizonY = Math.round(H * (W / H < 0.8 ? 0.7 : 0.64));
      areaScale = clamp((W * H) / (1440 * 900), 0.35, 2.2);
      buildStatic();
      buildCity();
      buildGround();
      placeLights();
      initLanes();
      drawBg();
      buildLightMap();
      fitLayers(oldW, oldH);
      ripples.length = 0;
      sprays.length = 0;
    }

    function buildStatic() {
      staticCv = mk(W * s, H * s);
      const c = staticCv.getContext('2d');
      c.setTransform(s, 0, 0, s, 0, 0);
      let g = c.createLinearGradient(0, 0, 0, horizonY);
      for (const st of COLOR.sky) g.addColorStop(st[0], rgba(st[1], 1));
      c.fillStyle = g;
      c.fillRect(0, 0, W, horizonY + 1);
      g = c.createLinearGradient(0, horizonY, 0, H);
      for (const st of COLOR.ground) g.addColorStop(st[0], rgba(st[1], 1));
      c.fillStyle = g;
      c.fillRect(0, horizonY, W, H - horizonY);

      // 도시 광해: 지구마다 다른 색으로 하늘에 번지는 빛
      c.globalCompositeOperation = 'lighter';
      const rnd = mulberry32(opt.seed * 7 + 3);
      const domes = 3 + Math.round(W / 520);
      for (let k = 0; k < domes; k++) {
        const x = ((k + 0.15 + rnd() * 0.7) / domes) * W;
        const rx = W * lerp(0.16, 0.3, rnd()), ry = H * lerp(0.2, 0.38, rnd());
        const col = COLOR.domes[pick(rnd, [{ w: 5 }, { w: 3 }, { w: 2 }, { w: 1 }])];
        c.save();
        c.translate(x, horizonY);
        c.scale(rx / ry, 1);
        g = c.createRadialGradient(0, 0, 0, 0, 0, ry);
        g.addColorStop(0, rgba(col, 0.2));
        g.addColorStop(0.35, rgba(col, 0.08));
        g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g;
        c.fillRect(-ry, -ry, ry * 2, ry);
        c.restore();
      }
    }

    function buildCity() {
      const rnd = mulberry32(opt.seed * 7919 + 11);
      const cw = W + MARGIN * 2;
      const unit = clamp(Math.min(W, H) / 900, 0.55, 1.4);
      farCv = skyline(rnd, cw, { top: COLOR.cityFarTop, bottom: COLOR.cityFarBottom, hMin: 0.06, hMax: 0.15, wMin: 16, wMax: 54, tower: 0.07, win: 0.03, blur: 3.2, unit }).cv;
      const near = skyline(rnd, cw, { top: COLOR.cityNearTop, bottom: COLOR.cityNearBottom, hMin: 0.03, hMax: 0.15, wMin: 24, wMax: 84, tower: 0.15, win: 0.075, blur: 1.8, unit });
      nearCv = near.cv;
      towers = near.tops;
    }

    // 건물 실루엣: 아래쪽은 거리 불빛을 받아 밝고, 전체를 살짝 흐리게(초점 밖) 처리
    function skyline(rnd, cw, p) {
      const ls = canFilter ? s : s * 0.55;
      const low = mk(cw * ls, (horizonY + 16) * ls);
      const c = low.getContext('2d');
      c.setTransform(ls, 0, 0, ls, 0, 0);
      const fill = c.createLinearGradient(0, horizonY - H * 0.38, 0, horizonY);
      fill.addColorStop(0, rgba(p.top, 1));
      fill.addColorStop(0.7, rgba(mixc(p.top, p.bottom, 0.45), 1));
      fill.addColorStop(1, rgba(p.bottom, 1));
      const tops = [];
      const hRef = Math.min(H, W * 1.3); // 세로 화면에서 건물이 지나치게 높아지지 않게
      let x = 0;
      while (x < cw) {
        const w = lerp(p.wMin, p.wMax, rnd()) * p.unit;
        let h = hRef * lerp(p.hMin, p.hMax, Math.pow(rnd(), 1.5));
        const tower = rnd() < p.tower;
        if (tower) h *= lerp(1.5, 2.1, rnd());
        const top = horizonY - h;
        c.fillStyle = fill;
        c.fillRect(x, top, w + 0.6, h + 16);
        if (rnd() < 0.3) {
          const iw = w * lerp(0.3, 0.7, rnd()), ih = h * lerp(0.05, 0.14, rnd());
          c.fillRect(x + (w - iw) * rnd(), top - ih, iw, ih + 1);
        }
        if (tower && rnd() < 0.7) {
          const ah = hRef * lerp(0.015, 0.035, rnd());
          c.fillRect(x + w / 2 - 0.7, top - ah, 1.4, ah + 1);
          tops.push({ x: x + w / 2, y: top - ah, ph: rnd() * 2.4 });
        }
        if (p.win) drawWindows(c, rnd, x, top, w, h, p.win);
        x += w + (rnd() < 0.22 ? rnd() * 16 * p.unit : 0);
      }
      const out = mk(cw * s, (horizonY + 16) * s);
      const oc = out.getContext('2d');
      if (canFilter) oc.filter = 'blur(' + (p.blur * s).toFixed(2) + 'px)';
      oc.drawImage(low, 0, 0, out.width, out.height);
      return { cv: out, tops };
    }

    // 창문: 층마다 띄엄띄엄 켜진 불 (격자가 드러나지 않게 듬성듬성)
    function drawWindows(c, rnd, bx, top, w, h, density) {
      const cw = 4.6, ch = 6.4;
      const nc = Math.floor((w - 3) / cw), nr = Math.floor((h - 8) / ch);
      if (nc < 1 || nr < 1) return;
      const ox = bx + (w - nc * cw) / 2 + 1;
      const busy = rnd() < 0.12 ? 3.2 : lerp(0.2, 1.3, rnd()); // 야근하는 사무실 건물은 더 환하게
      for (let r = 0; r < nr; r++) {
        const floor = rnd() < 0.35 ? 2.2 : 0.6; // 불 켜진 층이 띠처럼 몰린다
        for (let k = 0; k < nc; k++) {
          if (rnd() > density * busy * floor) continue;
          c.fillStyle = rgba(rnd() < 0.72 ? COLOR.windowWarm : COLOR.windowCool, lerp(0.35, 0.9, rnd()));
          c.fillRect(ox + k * cw, top + 5 + r * ch, 2.4, 3);
        }
      }
    }

    // 바닥 반사용 캔버스와 물웅덩이 마스크(웅덩이는 더 또렷이 비치고, 아래로 갈수록 흐려짐)
    function buildGround() {
      const gw = Math.ceil(W * s), gh = Math.max(1, Math.ceil((H - horizonY) * s));
      bandH = Math.min(horizonY * 0.9, H * 0.14);
      flipCv = mk(gw, Math.max(1, Math.round(bandH * s)));
      flipCtx = flipCv.getContext('2d');
      reflCv = mk(gw, gh);
      reflCtx = reflCv.getContext('2d');
      maskCv = mk(gw, gh);
      const m = maskCv.getContext('2d');
      m.fillStyle = 'rgba(255,255,255,0.32)';
      m.fillRect(0, 0, gw, gh);
      m.globalAlpha = 0.68;
      m.drawImage(fog.puddle, 0, 0, gw, gh);
      m.globalAlpha = 1;
      m.globalCompositeOperation = 'destination-in';
      const g = m.createLinearGradient(0, 0, 0, gh);
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(0.08, 'rgba(0,0,0,1)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.62)');
      g.addColorStop(1, 'rgba(0,0,0,0.24)');
      m.fillStyle = g;
      m.fillRect(0, 0, gw, gh);
    }

    function placeLights() {
      const rnd = mulberry32(opt.seed * 104729 + 3);
      const cw = W + MARGIN * 2;
      const unit = clamp(Math.min(W, H) / 900, 0.6, 1.3);
      const nC = 4 + Math.round(W / 420);
      const centers = [];
      for (let k = 0; k < nC; k++) centers.push(rnd());
      const xAt = clustered => {
        let u = clustered && rnd() < 0.7 ? centers[(rnd() * nC) | 0] + gauss(rnd) * 0.05 : rnd();
        u -= Math.floor(u);
        return u * cw - MARGIN;
      };
      const light = (x, y, r, a, par) => ({
        x, y, r, a, par, col: pick(rnd, LIGHTS),
        f: lerp(0.2, 1.1, rnd()), ph: rnd() * 6.283, flick: rnd() < 0.05, fp: lerp(5, 12, rnd()), glint: false
      });
      lights = [];
      // 거리 높이의 작고 또렷한 불빛 (가로등·간판·차)
      const nStreet = Math.round(clamp(W / 12, 30, 160));
      for (let i = 0; i < nStreet; i++) {
        const y = horizonY - Math.abs(gauss(rnd)) * 0.014 * H - rnd() * 0.004 * H;
        lights.push(light(xAt(true), y, lerp(1.1, 2.6, rnd()) * unit, lerp(0.55, 1, rnd()), 0.5));
      }
      // 조금 더 가까운, 초점이 나간 중간 보케
      const nMid = Math.round(clamp(W / 34, 14, 64));
      for (let i = 0; i < nMid; i++) {
        const depth = rnd();
        const y = horizonY - Math.abs(gauss(rnd)) * lerp(0.02, 0.085, depth) * H + lerp(-0.004, 0.014, rnd()) * H;
        const m = light(xAt(true), y, lerp(3, 13, depth) * unit, lerp(0.42, 0.14, depth) * lerp(0.7, 1.1, rnd()), lerp(0.6, 1, depth));
        m.col += LIGHTS.length; // 안개에 묻혀 채도가 낮은 색 세트
        lights.push(m);
      }
      // 밝은 불빛 몇 개만 젖은 바닥에 긴 줄로 끌린다
      lights.slice().sort((p, q) => q.a * q.r - p.a * p.r).slice(0, Math.round(lights.length * 0.22)).forEach(l => (l.glint = true));
      // 카메라 바로 앞의 크고 흐린 보케: 화면 양옆 낮은 곳에 두어 구도를 감싼다 (바닥에 비치지 않음)
      bigLights = [];
      const nBig = Math.round(clamp(W / 260, 2, 7));
      for (let i = 0; i < nBig; i++) {
        const u = rnd() < 0.5 ? rnd() * 0.22 : 1 - rnd() * 0.22;
        const y = horizonY + lerp(-0.16, 0.12, rnd()) * H;
        bigLights.push(light(u * cw - MARGIN, y, lerp(22, 48, rnd()) * unit, lerp(0.05, 0.11, rnd()), 1.6));
      }
    }

    function initLanes() {
      lanes.length = 0;
      lanes.push({ dir: 1, y: horizonY + H * 0.004, col: TAILLIGHT, a: 0.8, cars: [], timer: rand() * 2 });
      lanes.push({ dir: -1, y: horizonY + H * 0.009, col: HEADLIGHT, a: 0.9, cars: [], timer: rand() * 2 });
      for (const ln of lanes) for (let k = 0; k < 3; k++) ln.cars.push(newCar(ln, rand() * W));
    }
    function newCar(ln, x) {
      return {
        x: x != null ? x : ln.dir > 0 ? -MARGIN - 30 : W + MARGIN + 30,
        v: lerp(16, 42, rand()) * clamp(W / 1440, 0.5, 1.5),
        sep: lerp(3.5, 6.5, rand()),
        r: lerp(1.1, 1.8, rand())
      };
    }

    // 배경을 한 번 그린 뒤 칸별 밝기를 읽어 둔다: 빗줄기·물튀김을 뒤 배경 밝기에 맞춰 밝힘
    function buildLightMap() {
      cols = Math.max(2, Math.ceil(W / LM_CELL));
      rows = Math.max(2, Math.ceil(H / LM_CELL));
      const bw = bgCanvas.width, bh = bgCanvas.height;
      const tmp = mk(bw, bh);
      const tc = tmp.getContext('2d', { willReadFrequently: true });
      tc.drawImage(bgCanvas, 0, 0);
      let data;
      try {
        data = tc.getImageData(0, 0, bw, bh).data;
      } catch {
        lmap = new Uint8Array(cols * rows); // 읽기가 막힌 환경: 밝기 반응 없이 그린다
        return;
      }
      const sum = new Float32Array(cols * rows), cnt = new Float32Array(cols * rows), peak = new Float32Array(cols * rows);
      const k = 1 / (s * LM_CELL);
      for (let y = 0; y < bh; y++) {
        const j = Math.min(rows - 1, (y * k) | 0);
        for (let x = 0; x < bw; x++) {
          const i = Math.min(cols - 1, (x * k) | 0), p = (y * bw + x) * 4, cell = j * cols + i;
          const v = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
          sum[cell] += v;
          cnt[cell]++;
          if (v > peak[cell]) peak[cell] = v;
        }
      }
      lmap = new Uint8Array(cols * rows);
      for (let i = 0; i < lmap.length; i++) lmap[i] = clamp(0.6 * (sum[i] / (cnt[i] || 1)) + 0.4 * peak[i], 0, 255);
    }
    function lum(x, y) {
      let i = (x / LM_CELL) | 0, j = (y / LM_CELL) | 0;
      if (i < 0) i = 0; else if (i >= cols) i = cols - 1;
      if (j < 0) j = 0; else if (j >= rows) j = rows - 1;
      return lmap[j * cols + i];
    }
    function litBucket(x, y) {
      const v = lum(x, y);
      return v < LIT_STEPS[0] ? 0 : v < LIT_STEPS[1] ? 1 : v < LIT_STEPS[2] ? 2 : 3;
    }

    // ── 빗줄기 ─────────────────────────────────────────────────────
    function makeLayer(def, cap) {
      return {
        def, cap, n: 0,
        x: new Float32Array(cap), y: new Float32Array(cap), z: new Float32Array(cap),
        vy: new Float32Array(cap), len: new Float32Array(cap), gy: new Float32Array(cap),
        alive: new Uint8Array(cap),
        idx: [new Int32Array(cap), new Int32Array(cap), new Int32Array(cap), new Int32Array(cap)],
        cnt: new Int32Array(4)
      };
    }
    // 원근: 먼 빗방울은 지평선 근처에, 가까운 빗방울은 화면 아래쪽에 떨어진다
    const groundAt = z => horizonY + (H * 1.15 - horizonY) * Math.pow(z, 1.6);

    function updateCounts() {
      const nf = (0.06 + 0.94 * Math.pow(intensity, 1.25)) * QUALITY[qLevel].rain;
      for (const L of layers) L.n = Math.min(L.cap, Math.round(L.def.count * areaScale * nf));
    }
    function fitLayers(oldW, oldH) {
      const keep = layers.length === LAYERS.length && oldW > 1 && oldH > 1;
      layers = LAYERS.map((def, k) => {
        const L = makeLayer(def, Math.ceil(def.count * areaScale) + 4);
        const old = keep ? layers[k] : null;
        if (old) {
          // 크기만 바뀌었으면 빗방울을 그대로 옮겨 장면이 튀지 않게 한다
          const sx = W / oldW, sy = H / oldH, m = Math.min(L.cap, old.cap);
          for (let i = 0; i < m; i++) {
            if (!old.alive[i]) continue;
            L.alive[i] = 1;
            L.z[i] = old.z[i];
            L.x[i] = old.x[i] * sx;
            L.y[i] = old.y[i] * sy;
            L.vy[i] = old.vy[i] * sy;
            L.len[i] = old.len[i] * sy;
            L.gy[i] = groundAt(L.z[i]);
          }
        }
        return L;
      });
      updateCounts();
      for (const L of layers) for (let i = 0; i < L.n; i++) if (!L.alive[i]) spawn(L, i, true);
    }
    function refill() {
      for (const L of layers) L.alive.fill(0);
      updateCounts();
      for (const L of layers) for (let i = 0; i < L.n; i++) spawn(L, i, true);
    }

    // 빗줄기가 균일하지 않고 바람에 실려 몰려다니는 '비의 커튼'
    function curtain(x, amount) {
      if (!amount) return 1;
      const u = x / Math.max(W, 1);
      const v = 0.5 + 0.32 * Math.sin(6.283 * (u * 1.3 - t * 0.05 * (1 + wind))) + 0.18 * Math.sin(6.283 * (u * 3.1 + t * 0.09) + 1.7);
      return 1 - amount + amount * v;
    }
    function spawn(L, i, anywhere) {
      const d = L.def;
      const z = lerp(d.z0, d.z1, rand());
      const k = (z - d.z0) / (d.z1 - d.z0);
      L.z[i] = z;
      L.vy[i] = H * lerp(d.speed[0], d.speed[1], k * 0.6 + rand() * 0.4);
      L.len[i] = H * lerp(d.len[0], d.len[1], k * 0.5 + rand() * 0.5) * (0.85 + 0.3 * intensity);
      L.gy[i] = groundAt(z);
      const travel = L.gy[i] + L.len[i];
      const left = -20 - Math.max(0, slant) * travel, right = W + 20 - Math.min(0, slant) * travel;
      let x = 0;
      for (let tries = 0; tries < 3; tries++) {
        x = anywhere ? lerp(-20, W + 20, rand()) : lerp(left, right, rand());
        if (rand() < curtain(x, d.curtain)) break;
      }
      L.x[i] = x;
      L.y[i] = anywhere ? lerp(-L.len[i], L.gy[i], rand()) : -L.len[i] - rand() * H * 0.15;
      L.alive[i] = 1;
    }

    function stepRain(dt) {
      const q = QUALITY[qLevel];
      updateCounts();
      for (const L of layers) {
        const sp = L.def.splash * q.splash;
        for (let i = 0; i < L.cap; i++) {
          if (!L.alive[i]) {
            if (i < L.n) spawn(L, i, false);
            continue;
          }
          const vy = L.vy[i];
          L.y[i] += vy * dt;
          L.x[i] += vy * slant * dt;
          if (L.y[i] >= L.gy[i]) {
            if (sp) splash(L.x[i], L.gy[i], L.z[i], sp);
            if (i < L.n) spawn(L, i, false);
            else L.alive[i] = 0;
          }
        }
      }
    }

    function splash(x, y, z, chance) {
      if (y > H + 4 || x < -10 || x > W + 10 || rand() > chance) return;
      const sc = ((0.3 + z) * H) / 900;
      const v = lum(x, y);
      const lit = v < LIT_STEPS[0] ? 0 : v < LIT_STEPS[1] ? 1 : 2;
      if (ripples.length < 420) ripples.push({ x, y, r: lerp(2.5, 6.5, rand()) * sc, age: 0, life: lerp(0.32, 0.5, rand()), lit });
      const k = rand() < 0.5 ? 1 : rand() < 0.7 ? 2 : 3;
      for (let j = 0; j < k && sprays.length < 700; j++) {
        sprays.push({ x, y, y0: y, vx: (rand() - 0.5) * 70 * sc + slant * 40 * sc, vy: -lerp(80, 190, rand()) * sc, g: 1700 * sc, age: 0, lit });
      }
    }
    function stepSplashes(dt) {
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age += dt;
        if (r.age >= r.life) {
          ripples[i] = ripples[ripples.length - 1];
          ripples.pop();
        }
      }
      for (let i = sprays.length - 1; i >= 0; i--) {
        const p = sprays[i];
        p.age += dt;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > p.y0 || p.age > 0.6) {
          sprays[i] = sprays[sprays.length - 1];
          sprays.pop();
        }
      }
    }

    // 카메라 바로 앞을 스치는 굵고 흐릿한 빗줄기
    function stepLens(dt) {
      const want = QUALITY[qLevel].lens ? Math.round(intensity * 3) : 0;
      while (lens.length < want) lens.push({ on: false, wait: rand() * 3, x: 0, y: 0, v: 0, len: 0, w: 0, a: 0 });
      if (lens.length > want) lens.length = want;
      for (const d of lens) {
        if (!d.on) {
          d.wait -= dt;
          if (d.wait <= 0) {
            d.on = true;
            d.x = rand() * W;
            d.len = H * lerp(0.22, 0.4, rand());
            d.y = -d.len;
            d.v = H * lerp(3, 3.8, rand());
            d.w = lerp(9, 18, rand());
            d.a = lerp(0.018, 0.032, rand());
          }
          continue;
        }
        d.y += d.v * dt;
        d.x += d.v * slant * dt;
        if (d.y - d.len > H) {
          d.on = false;
          d.wait = lerp(0.3, 3.5, rand());
        }
      }
    }

    function stepCars(dt) {
      for (const ln of lanes) {
        ln.timer -= dt;
        if (ln.timer <= 0) {
          if (ln.cars.length < 7) ln.cars.push(newCar(ln));
          ln.timer = lerp(1.5, 6, rand());
        }
        for (let i = ln.cars.length - 1; i >= 0; i--) {
          const car = ln.cars[i];
          car.x += ln.dir * car.v * dt;
          if (car.x < -MARGIN - 60 || car.x > W + MARGIN + 60) ln.cars.splice(i, 1);
        }
      }
    }

    // ── 번개 ───────────────────────────────────────────────────────
    function scheduleStrike(first) {
      nextStrike = t + (first ? lerp(6, 12, rand()) : lerp(14, 34, rand()) * lerp(1.6, 0.7, intensity));
    }
    function strike() {
      strikeX = lerp(0.12, 0.88, rand()) * W;
      strikeY = lerp(0.02, 0.25, rand()) * H;
      // 1초 안에 최대 세 번만 번쩍인다 (광과민성 기준)
      flashes = [{ t0: t, a: lerp(0.75, 1, rand()), d: 0.11 }, { t0: t + lerp(0.12, 0.22, rand()), a: lerp(0.5, 0.85, rand()), d: 0.26 }];
      if (rand() < 0.35) flashes.push({ t0: t + lerp(0.42, 0.62, rand()), a: lerp(0.25, 0.45, rand()), d: 0.4 });
    }
    function flashLevel() {
      let L = 0;
      for (const f of flashes) {
        const u = t - f.t0;
        if (u < 0) continue;
        L += f.a * (u < 0.035 ? u / 0.035 : Math.exp(-(u - 0.035) / f.d));
      }
      return Math.min(L, 1.2);
    }

    // ── 한 프레임 ───────────────────────────────────────────────────
    function step(dt) {
      intensity += (intensityT - intensity) * (1 - Math.exp(-dt * 1.2));
      wind += (windT - wind) * (1 - Math.exp(-dt * 0.8));
      const gust = (0.6 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.91 + 1.7) + 0.1 * Math.sin(t * 2.3 + 0.3)) * 0.07 * (0.5 + intensity);
      slant = wind * 0.3 + gust;
      parX += ((opt.parallax ? parT : 0) - parX) * (1 - Math.exp(-dt * 2.2));
      cloudOff += dt * (2 + 14 * wind);
      mistOff += dt * (5 + 22 * wind);
      hazeOff += dt * (8 + 30 * wind);
      stepRain(dt);
      stepSplashes(dt);
      stepLens(dt);
      stepCars(dt);
      if (opt.lightning && !reduced() && t >= nextStrike) {
        strike();
        scheduleStrike(false);
      }
      if (flashes.length && t - flashes[flashes.length - 1].t0 > 3) flashes = [];
      grainT += dt;
      if (grainT > 0.083) {
        grainT = 0;
        grain.style.transform = 'translate(' + ((rand() * GRAIN - GRAIN / 2) | 0) + 'px,' + ((rand() * GRAIN - GRAIN / 2) | 0) + 'px)';
      }
    }

    function tile(c, tex, off, y, tw, th) {
      let x = (off % tw) - tw;
      if (x <= -tw) x += tw;
      for (; x < W; x += tw) c.drawImage(tex, x, y, tw, th);
    }

    function drawBg() {
      const c = bg;
      c.setTransform(s, 0, 0, s, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.drawImage(staticCv, 0, 0, W, H);
      const L = flashLevel();
      if (L > 0.003) {
        // 하늘 전체가 밝아지고, 번개가 친 구름 속이 더 환해진다. 건물은 그 뒤에 그려 실루엣이 드러남
        c.globalCompositeOperation = 'lighter';
        let g = c.createLinearGradient(0, 0, 0, horizonY);
        g.addColorStop(0, rgba(COLOR.flash, 0.09 * L));
        g.addColorStop(1, rgba(COLOR.flash, 0.04 * L));
        c.fillStyle = g;
        c.fillRect(0, 0, W, horizonY);
        const R = Math.max(W, H) * 0.6;
        g = c.createRadialGradient(strikeX, strikeY, 0, strikeX, strikeY, R);
        g.addColorStop(0, rgba(COLOR.flash, 0.38 * L));
        g.addColorStop(0.3, rgba(COLOR.flash, 0.12 * L));
        g.addColorStop(1, rgba(COLOR.flash, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, W, horizonY);
      }
      const haze = 0.8 + 0.4 * intensity;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = Math.min(1, 0.85 * haze);
      tile(c, fog.cloud, cloudOff + parX * 2, -H * 0.03, W * 1.5, horizonY * 0.95);
      if (L > 0.003) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = Math.min(1, 0.7 * L);
        tile(c, fog.cloudLit, cloudOff + parX * 2, -H * 0.03, W * 1.5, horizonY * 0.95);
        c.globalCompositeOperation = 'source-over';
      }
      c.globalAlpha = 1;
      drawCity(c, farCv, parX * 3);
      c.globalAlpha = Math.min(1, 0.7 * haze);
      tile(c, fog.mist, mistOff + parX * 4, horizonY - H * 0.22, W * 1.3, H * 0.32);
      c.globalAlpha = 1;
      drawCity(c, nearCv, parX * 6);
      // 거리 불빛을 머금고 빛나는 낮은 안개
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(1, 0.22 * haze);
      tile(c, fog.haze, hazeOff + parX * 7, horizonY - H * 0.08, W * 0.95, H * 0.14);

      drawTowers(c);
      drawLights(c, lights, 1);
      drawCars(c);
      drawReflection(c);
      drawGlints(c);
      drawLights(c, bigLights, 0);
      if (L > 0.003) {
        const g = c.createLinearGradient(0, horizonY, 0, horizonY + (H - horizonY) * 0.6);
        g.addColorStop(0, rgba(COLOR.flash, 0.1 * L));
        g.addColorStop(1, rgba(COLOR.flash, 0));
        c.globalAlpha = 1;
        c.fillStyle = g;
        c.fillRect(0, horizonY, W, H - horizonY);
      }
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }

    // 흐림 처리로 투명해진 아래 가장자리가 보이지 않게 지평선에서 잘라 그린다
    function drawCity(c, cv, dx) {
      c.drawImage(cv, 0, 0, cv.width, Math.round(horizonY * s), -MARGIN + dx, 0, W + 2 * MARGIN, Math.round(horizonY * s) / s);
    }

    // 고층 건물 꼭대기의 항공 장애등
    function drawTowers(c) {
      const red = sprites[TAILLIGHT];
      for (const tw of towers) {
        const ph = (t + tw.ph) % 2.4;
        const a = ph < 0.9 ? Math.sin((ph / 0.9) * Math.PI) : 0;
        if (a < 0.01) continue;
        const x = tw.x - MARGIN + parX * 6;
        c.globalAlpha = 0.5 * a;
        c.drawImage(red.glow, x - 7, tw.y - 7, 14, 14);
        c.globalAlpha = 0.9 * a;
        c.drawImage(red.disc, x - 1.6, tw.y - 1.6, 3.2, 3.2);
      }
    }

    function lightAlpha(l) {
      let a = l.a * (1.08 - 0.32 * intensity) * (1 + 0.1 * Math.sin(t * l.f + l.ph)); // 비가 거셀수록 흐려짐
      if (l.flick) {
        const cyc = (t + l.ph * 10) % l.fp;
        if (cyc < 0.3 && Math.sin(cyc * 90) < 0) a *= 0.2; // 오래된 네온의 깜빡임
      }
      return a;
    }
    function drawLights(c, list, glowK) {
      for (const l of list) {
        const a = lightAlpha(l), sp = sprites[l.col];
        const x = l.x + parX * 10 * l.par;
        if (glowK) {
          const R = l.r * 4 + 6; // 빗속에서 번지는 빛무리
          c.globalAlpha = Math.min(1, a * 0.38 * glowK);
          c.drawImage(sp.glow, x - R, l.y - R, R * 2, R * 2);
        }
        c.globalAlpha = Math.min(1, a);
        c.drawImage(sp.disc, x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
    }
    function drawGlints(c) {
      const lenK = H / 900, shimmer = 0.2 + 0.25 * intensity;
      for (const l of lights) {
        if (!l.glint) continue;
        const a = lightAlpha(l), sp = sprites[l.col];
        const x = l.x + parX * 10 * l.par + Math.sin(t * 2.3 + l.ph) * 0.8;
        const top = Math.max(horizonY, l.y) + Math.max(0, horizonY - l.y) * 0.5;
        const len = (80 + l.r * 12) * lenK;
        const w = l.r * 1.4 + 2.5;
        const sh = 1 - shimmer + shimmer * Math.sin(t * l.f * 3.1 + l.ph * 2.3);
        c.globalAlpha = Math.min(1, a * 0.6 * sh);
        c.drawImage(sp.streak, x - w / 2, top, w, len);
      }
    }
    function drawCars(c) {
      for (const ln of lanes) {
        const sp = sprites[ln.col];
        for (const car of ln.cars) {
          for (let k = 0; k < 2; k++) {
            const x = car.x + k * car.sep + parX * 9;
            const R = car.r * 5;
            c.globalAlpha = ln.a * 0.4;
            c.drawImage(sp.glow, x - R, ln.y - R, R * 2, R * 2);
            c.globalAlpha = ln.a;
            c.drawImage(sp.disc, x - car.r, ln.y - car.r, car.r * 2, car.r * 2);
          }
        }
      }
    }

    // 지평선 위 띠를 뒤집어 아래로 늘이고, 띠마다 옆으로 흔들어 젖은 바닥의 일렁이는 반사를 만든다
    function drawReflection(c) {
      const fw = flipCv.width, fh = flipCv.height, gw = reflCv.width, gh = reflCv.height;
      const hy = Math.round(horizonY * s);
      flipCtx.setTransform(1, 0, 0, -1, 0, fh);
      flipCtx.globalCompositeOperation = 'copy';
      flipCtx.drawImage(bgCanvas, 0, Math.max(0, hy - fh), fw, fh, 0, 0, fw, fh);
      const r = reflCtx;
      r.setTransform(1, 0, 0, 1, 0, 0);
      r.globalCompositeOperation = 'source-over';
      r.globalAlpha = 1;
      r.clearRect(0, 0, gw, gh);
      const wob = (0.6 + 1.2 * intensity) * s;
      for (let k = 0; k < STRIPS; k++) {
        const u = k / STRIPS;
        const amp = wob * (0.4 + 2.8 * u);
        const dx = Math.sin(t * 1.9 + k * 0.83) * amp + Math.sin(t * 3.7 + k * 1.9) * amp * 0.4;
        const spread = (1.2 + 2.4 * u) * s;
        const sy = u * fh, sh = fh / STRIPS, dy = u * gh, dh = gh / STRIPS + 1;
        r.globalAlpha = 0.36;
        r.drawImage(flipCv, 0, sy, fw, sh, dx - spread, dy - dh * 0.6, gw, dh * 2.2);
        r.drawImage(flipCv, 0, sy, fw, sh, dx + spread, dy - dh * 0.6, gw, dh * 2.2);
      }
      r.globalAlpha = 1;
      r.globalCompositeOperation = 'destination-in';
      r.drawImage(maskCv, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 1;
      c.drawImage(reflCv, 0, hy);
      c.setTransform(s, 0, 0, s, 0, 0);
    }

    function drawFg() {
      const c = fg;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.clearRect(0, 0, W, H);
      const boost = 1 + 1.5 * flashLevel();
      c.lineCap = 'butt';
      for (const L of layers) drawRainLayer(c, L, boost);
      drawSplashes(c, boost);
      drawLens(c, boost);
    }

    const LIT_COLORS = [COLOR.rain, COLOR.rain, mixc(COLOR.rain, COLOR.rainLit, 0.55), COLOR.rainLit];
    function strokeDrops(c, L, idx, n, part) {
      const sx = slant;
      c.beginPath();
      for (let j = 0; j < n; j++) {
        const i = idx[j], x = L.x[i], y = L.y[i], l = L.len[i] * part;
        c.moveTo(x, y);
        c.lineTo(x - sx * l, y - l);
      }
      c.stroke();
    }
    function drawRainLayer(c, L, boost) {
      const d = L.def, cnt = L.cnt;
      cnt.fill(0);
      for (let i = 0; i < L.cap; i++) {
        if (!L.alive[i] || L.y[i] < 0 || L.x[i] < -60 || L.x[i] > W + 60) continue;
        const b = litBucket(L.x[i], L.y[i]);
        L.idx[b][cnt[b]++] = i;
      }
      for (let b = 0; b < 4; b++) {
        const n = cnt[b];
        if (!n) continue;
        const idx = L.idx[b], a = d.alpha * LIT_ALPHA[b] * boost, col = LIT_COLORS[b];
        if (d.style === 'soft') {
          // 초점 밖: 넓고 옅은 번짐 위에 가는 심
          c.lineWidth = d.width * 2.6;
          c.strokeStyle = rgba(col, a * 0.32);
          strokeDrops(c, L, idx, n, 1);
          c.lineWidth = d.width;
          c.strokeStyle = rgba(col, a * 0.8);
          strokeDrops(c, L, idx, n, 1);
        } else if (d.style === 'streak') {
          // 꼬리는 옅게, 앞쪽 머리는 진하게: 떨어지는 방향이 읽힌다
          c.lineWidth = d.width;
          c.strokeStyle = rgba(col, a * 0.5);
          strokeDrops(c, L, idx, n, 1);
          c.strokeStyle = rgba(col, a);
          strokeDrops(c, L, idx, n, 0.42);
        } else {
          c.lineWidth = d.width;
          c.strokeStyle = rgba(col, a);
          strokeDrops(c, L, idx, n, 1);
        }
      }
    }

    const RIPPLE_ALPHA = [0.17, 0.32, 0.6];
    const SPRAY_ALPHA = [0.2, 0.45, 0.85];
    function drawSplashes(c, boost) {
      c.lineWidth = 0.9;
      for (let lit = 0; lit < 3; lit++) {
        for (let young = 0; young < 2; young++) {
          c.strokeStyle = rgba(lit === 2 ? COLOR.rainLit : COLOR.rain, RIPPLE_ALPHA[lit] * (young ? 1 : 0.45) * boost);
          c.beginPath();
          let any = false;
          for (const r of ripples) {
            if (r.lit !== lit) continue;
            const k = r.age / r.life;
            if ((k < 0.5) !== !!young) continue;
            const rx = r.r * (0.25 + 0.75 * (1 - (1 - k) * (1 - k)));
            c.moveTo(r.x + rx, r.y);
            c.ellipse(r.x, r.y, rx, rx * 0.3, 0, 0, Math.PI * 2);
            any = true;
          }
          if (any) c.stroke();
        }
      }
      c.lineWidth = 1;
      for (let lit = 0; lit < 3; lit++) {
        c.strokeStyle = rgba(lit === 2 ? COLOR.rainLit : COLOR.rain, SPRAY_ALPHA[lit] * boost);
        c.beginPath();
        let any = false;
        for (const p of sprays) {
          if (p.lit !== lit) continue;
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.014, p.y - p.vy * 0.014);
          any = true;
        }
        if (any) c.stroke();
      }
    }

    function drawLens(c, boost) {
      if (!lens.length) return;
      c.lineCap = 'round';
      for (const d of lens) {
        if (!d.on) continue;
        c.beginPath();
        c.moveTo(d.x, d.y);
        c.lineTo(d.x - slant * d.len, d.y - d.len);
        c.strokeStyle = rgba(COLOR.rainLit, d.a * boost);
        c.lineWidth = d.w;
        c.stroke();
        c.lineWidth = d.w * 0.55;
        c.stroke();
        c.lineWidth = d.w * 0.25;
        c.stroke();
      }
      c.lineCap = 'butt';
    }

    // 저품질에서는 배경을 두 프레임에 한 번만 그린다. full이면 항상 전부 그림 (정지 화면 등)
    function render(full) {
      if (full || qLevel > 0 || (frameNo & 1) === 0 || flashes.length) drawBg();
      drawFg();
    }

    function frame(now) {
      raf = win.requestAnimationFrame(frame);
      const raw = (now - last) / 1000;
      last = now;
      const dt = raw > 0 ? Math.min(raw, 0.05) : 0;
      t += dt;
      frameNo++;
      step(dt);
      render();
      monitor(raw);
    }

    // 프레임이 꾸준히 40fps 아래로 떨어지면 품질을 한 단계 낮춘다 (올리지는 않음: 깜빡임 방지)
    function monitor(raw) {
      if (opt.quality !== 'auto' || qLevel === 0 || !(raw > 0) || raw > 0.25) return;
      perfWarm += raw;
      if (perfWarm < 2.5) return;
      perfAcc += raw;
      perfN++;
      if (perfAcc < 2) return;
      const avg = perfAcc / perfN;
      perfAcc = 0;
      perfN = 0;
      if (avg > 1 / 40) {
        qLevel--;
        perfWarm = 0;
        rebuild();
      }
    }

    function prewarm(seconds) {
      refill();
      const dt = 1 / 60;
      for (let k = 0; k < seconds * 60; k++) {
        stepRain(dt);
        stepSplashes(dt);
      }
    }

    // ── 재생 제어 ──────────────────────────────────────────────────
    const mq = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function reduced() {
      return !!(opt.respectReducedMotion && mq && mq.matches);
    }
    function sync() {
      const run = playing && visible && !doc.hidden && !destroyed;
      if (run && !raf) {
        last = win.performance.now();
        raf = win.requestAnimationFrame(frame);
      } else if (!run && raf) {
        win.cancelAnimationFrame(raf);
        raf = 0;
      }
    }
    function play() {
      if (destroyed) return;
      playing = true;
      sync();
    }
    function pause() {
      playing = false;
      sync();
    }
    function onMotionPref() {
      if (reduced()) pause();
      else if (opt.autoplay) play();
    }
    function onPointer(e) {
      if (e.pointerType === 'touch') return;
      parT = clamp((e.clientX / (win.innerWidth || 1)) * 2 - 1, -1, 1);
    }
    function onLeave() {
      parT = 0;
    }

    function set(o) {
      o = o || {};
      if ('intensity' in o) intensityT = clamp(+o.intensity || 0, 0, 1);
      if ('wind' in o) windT = clamp(+o.wind || 0, -1, 1);
      if ('lightning' in o) {
        opt.lightning = !!o.lightning;
        if (opt.lightning) scheduleStrike(false);
        else {
          flashes = [];
          nextStrike = Infinity;
        }
      }
      if ('parallax' in o) opt.parallax = !!o.parallax;
      if ('grain' in o) {
        opt.grain = !!o.grain;
        grain.hidden = !opt.grain;
      }
      if ('quality' in o) {
        opt.quality = o.quality;
        qLevel = o.quality === 'low' ? 0 : 2;
        perfWarm = 0;
        rebuild();
      }
      if ('seed' in o) {
        opt.seed = o.seed | 0;
        fog = makeFog(mk, opt.seed);
        rebuild();
      }
      if (!raf && W) {
        // 멈춘 상태에서는 바로 반영한 정지 화면을 다시 그린다
        intensity = intensityT;
        wind = windT;
        slant = wind * 0.3;
        prewarm(0.6);
        render(true);
      }
      return api;
    }

    function destroy() {
      if (destroyed) return;
      pause();
      destroyed = true;
      if (ro) ro.disconnect();
      else win.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      win.removeEventListener('pointermove', onPointer);
      doc.documentElement.removeEventListener('pointerleave', onLeave);
      doc.removeEventListener('visibilitychange', sync);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', onMotionPref);
        else if (mq.removeListener) mq.removeListener(onMotionPref);
      }
      rootEl.remove();
    }

    function onResize() {
      const r = rootEl.getBoundingClientRect();
      if (Math.round(r.width) === W && Math.round(r.height) === H) return;
      rebuild();
      if (!raf) render(true);
    }

    const api = {
      set,
      play,
      pause,
      toggle() {
        if (playing) pause();
        else play();
        return playing;
      },
      strike() {
        if (!W) return;
        strike();
        if (!raf) {
          // 정지 화면에서는 번쩍이는 한 장면만 보여 주고 되돌린다
          for (const f of flashes) f.t0 -= 0.04;
          render(true);
          flashes = [];
          win.setTimeout(() => {
            if (!raf && !destroyed) render(true);
          }, 160);
        }
      },
      resize() {
        rebuild();
        if (!raf) render(true);
      },
      destroy,
      get playing() {
        return playing;
      },
      get reducedMotion() {
        return reduced();
      },
      get quality() {
        return ['low', 'medium', 'high'][qLevel];
      },
      get options() {
        return { intensity: intensityT, wind: windT, lightning: opt.lightning, parallax: opt.parallax, grain: opt.grain, quality: opt.quality, seed: opt.seed };
      },
      element: rootEl
    };

    const ro = 'ResizeObserver' in win ? new win.ResizeObserver(onResize) : null;
    const io = 'IntersectionObserver' in win
      ? new win.IntersectionObserver(entries => {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      })
      : null;

    rebuild();
    prewarm(0.8);
    render(true);
    scheduleStrike(true);
    if (ro) ro.observe(rootEl);
    else win.addEventListener('resize', onResize);
    if (io) io.observe(rootEl);
    win.addEventListener('pointermove', onPointer, { passive: true });
    doc.documentElement.addEventListener('pointerleave', onLeave);
    doc.addEventListener('visibilitychange', sync);
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onMotionPref);
      else if (mq.addListener) mq.addListener(onMotionPref);
    }
    playing = !!opt.autoplay && !reduced();
    sync();
    return api;
  }

  function mount(target, options) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('RainScene.mount: 대상 요소를 찾을 수 없어요.');
    return createScene(host, Object.assign({}, DEFAULTS, options || {}));
  }

  return { mount, defaults: Object.assign({}, DEFAULTS), version: VERSION };
});
