/* Motor de Aurora: compone capas renderizadas (WebP + máscaras) según el diseño elegido y las anima.
   Contrato público (compatible con reconocimientof/frontend/avatar/engine.js):
     const av = new AuroraEngine(svgEl, estado); av.greet(); av.lookAt(x, y); av.setExpression('feliz'); av.playAudio(url)
   Tinte: <image base/> + <rect fill=color mask=tint mix-blend-mode:multiply/> + <image hi mix-blend-mode:screen/>  (ver pipeline/tint.py) */
(function () {
  const P = () => window.PIEZAS, C = () => window.CATALOGO;
  const f = n => +(+n).toFixed(2);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IMG = (window.PIEZAS_BASE || 'img') + '/';
  const PERS = {
    amable: { bob: .045, spd: 1.4, blink: [2.2, 4.6], sacc: [1.6, 3.2], tilt: 3, expr: 'feliz', wave: 16, flap: .9 },
    energica: { bob: .08, spd: 2.6, blink: [1.6, 3.2], sacc: [.8, 1.6], tilt: 5, expr: 'feliz', wave: 8, flap: 1.8 },
    curiosa: { bob: .045, spd: 1.6, blink: [2, 4], sacc: [.6, 1.3], tilt: 9, expr: 'atenta', wave: 18, flap: 1.1 },
    serena: { bob: .03, spd: .9, blink: [3, 6], sacc: [2.6, 4.6], tilt: 2, expr: 'atenta', wave: 24, flap: .6 }
  };
  const EXPR = { feliz: { smile: 1, open: 0, eye: 1 }, atenta: { smile: .55, open: 0, eye: 1 }, sorpresa: { smile: .05, open: .72, eye: 1.14 }, pensando: { smile: -.25, open: 0, eye: .9 } };
  const opt = (q, id) => { const Q = C().preguntas.find(x => x.id === q); return Q && Q.opciones.find(o => o.id === id) || null; };
  const color = (q, id, key) => { const o = opt(q, id); return o ? (o[key || 'c']) : '#ffffff'; };
  const esc = s => String(s).replace(/[^a-z0-9_-]/gi, '_');
  const zona = id => (C().zonas.find(z => z.id === id) || C().zonas[0]);
  const zonaColor = id => { const z = zona(id); return z.grad ? { grad: z.grad } : z.c; };
  const lucesColor = st => (st.nivel === 'organica' ? null : color('luces', st.luces || 'cian', 'g'));
  const CARBON = '#2B3033';
  const DARK = '#141A3A';
  const MEZCLA_BLANCO = 0.12; // igual que pipeline/tint.py
  const suavizar = hex => hex; // el modelo difuso + reflejos no necesita ajuste de color
  const mix = (a, b, t) => { const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const A = h(a), B = h(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  /* ---------- resolución del diseño a capas ---------- */
  function resolver(st) {
    const B = P().bases[st.base]; if (!B) return null;
    const robot = st.nivel === 'robot', L = B.layers;
    const lvk = robot ? 'robot-' + st.cabello : st.nivel;
    const A = B.levels[lvk] || B.levels[robot ? 'robot-ovalada' : 'organica'] || Object.values(B.levels)[0];
    if (!A) return null;
    const has = n => !!L[n];
    const conAlas = ['aurora', 'pequenas', 'luz'].includes(st.alas);
    const hairTint = st.cabelloColor ? color('cabelloColor', st.cabelloColor) : color('tono', st.tono);
    // paleta -> zonas (si no hay alas, los rastros de mariposa usan la paleta natural)
    const punta = conAlas ? (st.alasPunta || 'naranja') : 'naranja';
    const out = [];
    if (conAlas) ['L', 'R'].forEach(s => { const n = `wing-${st.alas}-${s}`; if (has(n)) out.push({ n, tint: zonaColor(st.alasBase || 'blanco'), zonas: { punta: zonaColor(punta), mancha: ['mancha', 'moteado'].includes(st.alasPatron) ? zonaColor(st.alasMancha || 'negro') : null, borde: st.alasPatron === 'moteado' ? zonaColor(st.alasBorde || 'sepia') : null }, luz: st.alas === 'luz', cls: 'wing' + s, root: L[n].root }); });
    out.push({ n: `body-${st.nivel}`, tint: color('tono', st.tono) });
    if (st.base === 'mascota' && st.cabello === 'pelusa' && has('pelusa')) out.push({ n: 'pelusa' });
    if (st.detalles.includes('bufanda') && has('bufanda')) out.push({ n: 'bufanda' });
    if (st.detalles.includes('broche') && has('broche')) out.push({ n: 'broche' });
    const peinado = ['largo', 'coleta', 'mono', 'bob'].includes(st.cabello);
    if (peinado && has(`hairB-${st.cabello}`)) out.push({ n: `hairB-${st.cabello}`, tint: hairTint, cls: 'headG' });
    out.push({ n: robot ? `head-robot-${st.cabello}` : `head-${st.nivel}`, tint: color('tono', st.tono), cls: 'headG' });
    if (!robot) ['L', 'R'].forEach(s => { const n = `eye${s}-${st.ojos}`; if (has(n)) out.push({ n, tint: color('ojosColor', st.ojosColor), cls: 'headG eye' + s }); });
    if (peinado && has(`hairF-${st.cabello}`)) out.push({ n: `hairF-${st.cabello}`, tint: hairTint, cls: 'headG' });
    if (st.base === 'mascota' && st.cabello === 'copete' && has('copete')) out.push({ n: 'copete', tint: hairTint, cls: 'headG' });
    if (st.antenas && st.antenas !== 'sin') { const n = 'ant-' + (robot ? (st.antenas === 'led' ? 'led' : st.antenas + 'R') : st.antenas); if (has(n)) out.push({ n, tint: zonaColor(punta), cls: 'headG ant', base: L[n].base, leds: L[n].leds }); }
    if (st.detalles.includes('auriculares')) { const n = 'auric-' + (robot ? 'robot' : 'organica'); if (has(n)) out.push({ n, cls: 'headG', leds: L[n].leds }); }
    out.push({ n: `armR-${st.nivel}`, tint: color('tono', st.tono), cls: 'armG' });
    return { B, A, L, out: out.filter(i => has(i.n)), robot, lvk };
  }

  function imgTag(base, L, n, extra) {
    const l = L[n]; return `<image href="${IMG}${base}/${n}${extra || ''}.webp" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}"/>`;
  }
  function capa(base, L, item, P_) {
    const l = L[item.n], id = P_ + esc(item.n);
    let s = '', defs = '';
    const hasTint = item.tint && l.masks && l.masks.includes('tint');
    if (hasTint) {
      defs += `<mask id="${id}m" maskUnits="userSpaceOnUse" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}">${imgTag(base, L, item.n, '.mask')}</mask>`;
      let fill = suavizar(item.tint);
      if (item.tint && item.tint.grad) {
        defs += `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">${item.tint.grad.map((c, i) => `<stop offset="${i / (item.tint.grad.length - 1)}" stop-color="${suavizar(c)}"/>`).join('')}</linearGradient>`; fill = `url(#${id}g)`;
      }
      s += `<g style="isolation:isolate">${imgTag(base, L, item.n)}<g style="mix-blend-mode:multiply"><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="${fill}" mask="url(#${id}m)"/></g>`;
      // las zonas van antes de sumar los reflejos (ver más abajo)
      if (item.zonas) {
        // zonas sobre la base ya teñida: punta (multiply sobre la luz del render), mancha y borde (color plano con la sombra del render)
        const zonaRect = (key, col, op, blend) => {
          if (!col || !l.masks.includes(key)) return '';
          let fill = suavizar(col);
          if (col.grad) { defs += `<linearGradient id="${id}${key}g" x1="0" y1="0" x2="1" y2="0">${col.grad.map((c, i) => `<stop offset="${i / (col.grad.length - 1)}" stop-color="${suavizar(c)}"/>`).join('')}</linearGradient>`; fill = `url(#${id}${key}g)`; }
          defs += `<mask id="${id}${key}" maskUnits="userSpaceOnUse" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}">${imgTag(base, L, item.n, '.' + key)}</mask>`;
          return `<g style="mix-blend-mode:${blend}"><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="${fill}" opacity="${op}" mask="url(#${id}${key})"/></g>`;
        };
        s += zonaRect('punta', item.zonas.punta, 1, 'multiply');
        s += zonaRect('mancha', item.zonas.mancha, .92, 'multiply');
        s += zonaRect('borde', item.zonas.borde, .9, 'multiply');
        if (item.luz) s += `<g style="mix-blend-mode:screen">${imgTag(base, L, item.n)}</g>`;
      }
      if (l.spec) s += `<image href="${IMG}${base}/${item.n}.spec.webp" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" style="mix-blend-mode:plus-lighter"/>`;
      s += `</g>`;
    } else s += imgTag(base, L, item.n);
    return { s, defs };
  }

  /* ---------- cara (SVG) ---------- */
  function caraRobot(A, st, P_) {
    const v = A.visor; if (!v) return '';
    const g = lucesColor(st) || '#7DF6FB', cx = v.c[0], cy = v.c[1], rx = v.rx, rz = v.rz;
    const ex = rx * .4, ey = cy - rz * .12;
    let eye;
    if (st.ojos === 'almendrados') eye = sd => `<path d="M${f(cx + sd * ex - rx * .2)},${f(ey + rz * .05)}C${f(cx + sd * ex - rx * .08)},${f(ey - rz * .32)} ${f(cx + sd * ex + rx * .12)},${f(ey - rz * .34)} ${f(cx + sd * ex + rx * .2)},${f(ey - rz * .04)}C${f(cx + sd * ex + rx * .08)},${f(ey + rz * .22)} ${f(cx + sd * ex - rx * .1)},${f(ey + rz * .24)} ${f(cx + sd * ex - rx * .2)},${f(ey + rz * .05)}Z" fill="${g}"/>`;
    else eye = sd => `<rect x="${f(cx + sd * ex - rx * .095)}" y="${f(ey - rz * .28)}" width="${f(rx * .19)}" height="${f(rz * .56)}" rx="${f(rx * .095)}" fill="${g}"/>`;
    return `<clipPath id="${P_}vc"><rect x="${f(cx - rx * .97)}" y="${f(cy - rz * .95)}" width="${f(rx * 1.94)}" height="${f(rz * 1.9)}" rx="${f(Math.min(rx, rz) * .5)}"/></clipPath>
      <g clip-path="url(#${P_}vc)"><rect x="${f(cx - rx)}" y="${f(cy - rz)}" width="${f(rx * 2)}" height="${f(rz * 2)}" fill="url(#${P_}px)"/><rect class="flash" x="${f(cx - rx)}" y="${f(cy - rz)}" width="${f(rx * 2)}" height="${f(rz * 2)}" fill="${g}" opacity="0"/></g>
      <g filter="url(#${P_}gl)">${[-1, 1].map(sd => `<g class="eye" data-cx="${f(cx + sd * ex)}" data-cy="${f(ey)}">${eye(sd)}</g>`).join('')}
      ${st.detalles.includes('mejillas') ? [-1, 1].map(sd => `<path d="M${f(cx + sd * ex - rx * .1)},${f(ey + rz * .5)}l${f(rx * .06)},${f(-rz * .12)}M${f(cx + sd * ex)},${f(ey + rz * .5)}l${f(rx * .06)},${f(-rz * .12)}M${f(cx + sd * ex + rx * .1)},${f(ey + rz * .5)}l${f(rx * .06)},${f(-rz * .12)}" stroke="#FF8FB8" stroke-width="${f(rx * .03)}" stroke-linecap="round" opacity=".9"/>`).join('') : ''}
      ${mouthTag({ x: cx, y: cy + rz * .42, w: rx * .2, k: st.boca }, g)}</g>`;
  }
  function caraOrganica(A, st, P_, s) {
    let out = '';
    const m = A.mouth; if (!m) return '';
    const dark = '#5A2235';
    if (st.detalles.includes('mejillas') && A.eyeL && A.eyeR) [[A.eyeL, -1], [A.eyeR, 1]].forEach(([e, sd]) => { out += `<ellipse cx="${f(e[0] + sd * s * .12)}" cy="${f(e[1] + s * .3)}" rx="${f(s * .17)}" ry="${f(s * .09)}" fill="#FF7FA0" opacity=".4" filter="url(#${P_}soft2)"/>`; });
    if (st.detalles.includes('pecas') && A.eyeL && A.eyeR) [[A.eyeL, -1], [A.eyeR, 1]].forEach(([e, sd]) => { [[-.08, .22], [0, .27], [.09, .23], [.04, .32]].forEach(([dx, dz]) => { out += `<circle cx="${f(e[0] + sd * s * .1 + dx * s)}" cy="${f(e[1] + dz * s)}" r="${f(s * .018)}" fill="#7DF6FB" opacity=".9" filter="url(#${P_}gl)"/>`; }); });
    out += mouthTag({ x: m[0], y: m[1], w: (st.base === 'humanoide' ? .11 : .15) * s, k: st.boca }, dark);
    return out;
  }
  function mouthTag(mi, col) {
    const md = mouthD(mi, 1, 0);
    return `<path class="mouth" d="${md.d}" data-x="${f(mi.x)}" data-y="${f(mi.y)}" data-w="${f(mi.w)}" data-k="${mi.k}" fill="${md.fill ? col : 'none'}" stroke="${col}" stroke-width="${f(mi.w * (md.fill ? .08 : .18))}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  function mouthD(mi, smile, open) {
    const { x, y, k } = mi; let w = mi.w;
    if (k === 'pequena') w *= .6;
    const fill = k === 'abierta' || open > .12;
    const yu = y + smile * w * .5 - open * w * .1, yl = y + smile * w * .5 + (k === 'abierta' ? w * .55 : w * .14) + open * w * 1.15;
    if (!fill) return { d: `M${f(x - w)},${f(y)}Q${f(x)},${f(yu + w * .3)} ${f(x + w)},${f(y)}`, fill: false };
    return { d: `M${f(x - w)},${f(y)}Q${f(x)},${f(yu)} ${f(x + w)},${f(y)}Q${f(x)},${f(yl)} ${f(x - w)},${f(y)}Z`, fill: true };
  }

  /* ---------- composición completa ---------- */
  function build(st, P_) {
    const R = resolver(st); if (!R) return { svg: '', R };
    const { B, A, L, out, robot } = R, s = A.scale, base = st.base;
    let defs = `<filter id="${P_}gl" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur in="SourceGraphic" stdDeviation="${f(s * .012)}" result="a"/><feGaussianBlur in="SourceGraphic" stdDeviation="${f(s * .045)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="${P_}soft" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${f(s * .06)}"/></filter>
      <filter id="${P_}soft2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${f(s * .05)}"/></filter>
      <pattern id="${P_}px" width="${f(s * .045)}" height="${f(s * .045)}" patternUnits="userSpaceOnUse"><rect width="${f(s * .02)}" height="${f(s * .02)}" fill="${lucesColor(st) || '#7DF6FB'}" opacity=".07"/></pattern>`;
    const ledColor = lucesColor(st) || '#7DF6FB';
    const led = p => `<circle class="led" cx="${p[0]}" cy="${p[1]}" r="${f(s * .12)}" fill="${ledColor}" opacity=".5" filter="url(#${P_}soft)" style="mix-blend-mode:screen"/>`;
    const leds = A.leds || {};
    const sh = A.floor ? `<ellipse class="shadow" cx="${A.floor[0]}" cy="${f(A.floor[1] + s * .02)}" rx="${f(s * 1.05)}" ry="${f(s * .13)}" fill="#000" opacity=".5" filter="url(#${P_}soft2)"/><ellipse cx="${A.floor[0]}" cy="${f(A.floor[1] + s * .02)}" rx="${f(s * 1.45)}" ry="${f(s * .24)}" fill="none" stroke="#7DF6FB" stroke-opacity=".16" stroke-width="2"/>` : '';
    let body = '', wings = '', head = '', arm = '';
    const face = robot ? caraRobot(A, st, P_) : caraOrganica(A, st, P_, s);
    out.forEach(item => {
      const c = capa(base, L, item, P_); defs += c.defs;
      let g = c.s;
      if (item.leds && item.leds.length) g += item.leds.map(led).join('');
      if (item.cls && item.cls.startsWith('wing')) { wings += `<g class="${item.cls}" data-rx="${item.root ? item.root[0] : 0}" data-ry="${item.root ? item.root[1] : 0}">${g}</g>`; return; }
      if (item.cls && item.cls.includes('headG')) {
        if (item.cls.includes('eye')) { const e = item.cls.includes('eyeL') ? A.eyeL : A.eyeR; head += `<g class="eye" data-cx="${e[0]}" data-cy="${e[1]}">${g}</g>`; return; }
        if (item.cls.includes('ant')) { head += `<g class="ant" data-bx="${item.base ? item.base[0] : 0}" data-by="${item.base ? item.base[1] : 0}">${g}</g>`; return; }
        head += g; return;
      }
      if (item.cls === 'armG') { arm += g; return; }
      body += g;
      if (item.n.startsWith('body')) body += (leds.body || []).map(led).join('');
    });
    head = head.replace(/(<g class="eye")/, m => m); // orden: cabeza, luces, cara
    head += (leds.head || []).map(led).join('') + face;
    const svg = `<defs>${defs}</defs>${sh}<g class="fig">${wings}${body}<g class="headG">${head}</g><g class="armG">${arm}</g></g>`;
    return { svg, R };
  }

  function viewBox(st, vista) {
    const R = resolver(st); if (!R) return '0 0 900 1080';
    const { B, A } = R, s = A.scale;
    if (vista === 'head') { const c = A.headC || A.neck; const size = s * 2.9; return `${f(c[0] - size / 2)} ${f(c[1] - size * .62)} ${f(size)} ${f(size)}`; }
    if (vista === 'face') { const c = A.headC || A.neck; const size = s * 2.0; return `${f(c[0] - size / 2)} ${f(c[1] - size * .5)} ${f(size)} ${f(size)}`; }
    return B.view.join(' ');
  }
  let thumbN = 0;
  function thumbSVG(st, vista) {
    const id = 't' + (thumbN++) + '_';
    try { const b = build(st, id); return `<svg viewBox="${viewBox(st, vista)}" aria-hidden="true">${b.svg}</svg>`; }
    catch (e) { console.error('thumb', e); return ''; }
  }

  /* ---------- motor animado ---------- */
  class AuroraEngine {
    constructor(svg, st) {
      this.svg = svg; this.st = null; this.R = {}; this.T = 0; this.last = performance.now();
      this.blinkAt = 1.2; this.blinkP = -1; this.dbl = false; this.saccAt = .8; this.waveT = -1; this.talkT = 0; this.popT = 9; this.lookT = 0; this.nextWave = 3.5;
      this.gz = { x: 0, y: 0 }; this.gt = { x: 0, y: 0 }; this.pointer = 0; this.manual = null; this.hold = 0; this.C = { smile: .8, open: 0, eye: 1 };
      this.audio = null; this.running = true;
      if (st) this.set(st);
      this._frame = this._frame.bind(this); requestAnimationFrame(this._frame);
      svg.addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(); this.lookAt((e.clientX - (r.left + r.width / 2)) / (r.width / 2), (e.clientY - (r.top + r.height * .36)) / (r.height / 2)); });
    }
    set(st, pop = true) {
      this.st = JSON.parse(JSON.stringify(st));
      const b = build(this.st, 's'); if (!b.R) return;
      this.svg.setAttribute('viewBox', viewBox(this.st, 'full')); this.svg.innerHTML = b.svg;
      const q = sel => this.svg.querySelector(sel), qa = sel => [...this.svg.querySelectorAll(sel)];
      this.R = { fig: q('.fig'), head: q('.headG'), arm: q('.armG'), sh: q('.shadow'), flash: q('.flash'), A: b.R.A, B: b.R.B, robot: b.R.robot,
        eyes: qa('.eye').map(e => ({ el: e, cx: +e.dataset.cx, cy: +e.dataset.cy })), mouth: q('.mouth'), leds: qa('.led'), veins: qa('.vein'),
        wings: qa('.wingL,.wingR').map(w => ({ el: w, rx: +w.dataset.rx, ry: +w.dataset.ry, s: w.classList.contains('wingL') ? -1 : 1 })),
        ants: qa('.ant').map(a => ({ el: a, bx: +a.dataset.bx, by: +a.dataset.by })) };
      if (this.R.mouth) { const m = this.R.mouth.dataset; this.R.mi = { x: +m.x, y: +m.y, w: +m.w, k: m.k }; }
      if (pop) this.popT = 0;
    }
    greet() { if (this.waveT < 0) { this.waveT = 0; this.talkT = 1.4; } }
    lookAt(x, y) { this.gt.x = Math.max(-1, Math.min(1, x)); this.gt.y = Math.max(-1, Math.min(1, y)); this.pointer = 1.5; }
    setExpression(name, seconds = 2.6) { if (EXPR[name]) { this.manual = name; this.hold = seconds; if (name === 'feliz') this.talkT = .9; this.popT = .3; } }
    playAudio(url) {
      return new Promise(res => { try { const a = new Audio(url); this.audio = a; a.onended = () => { this.audio = null; res(); }; a.onerror = () => { this.audio = null; res(); }; a.play().catch(() => { this.audio = null; res(); }); } catch (e) { res(); } });
    }
    lookAround() { this.lookT = 2.4; this.saccAt = 0; }
    stop() { this.running = false; }
    _frame(now) {
      if (!this.running) return;
      const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.T += dt;
      const R = this.R; if (!R.fig || !this.st) { requestAnimationFrame(this._frame); return; }
      const T = this.T, p = PERS[this.st.personalidad] || PERS.amable, s = R.A.scale, rnd = (a, b) => a + Math.random() * (b - a), ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.hold -= dt; let ex = this.manual && this.hold > 0 ? this.manual : (this.waveT >= 0 || this.talkT > 0 ? 'feliz' : p.expr); if (this.hold <= 0) this.manual = null;
      const E = EXPR[ex], k = 1 - Math.exp(-dt * 9); for (const key in E) this.C[key] += (E[key] - this.C[key]) * k;
      // mirada
      if (this.pointer > 0) this.pointer -= dt;
      else if (this.lookT > 0) { this.lookT -= dt; if (T > this.saccAt) { this.gt.x = rnd(-1, 1); this.gt.y = rnd(-.7, .5); this.saccAt = T + rnd(.35, .7); } }
      else if (T > this.saccAt) { if (Math.random() < .4) { this.gt.x = 0; this.gt.y = 0; } else { this.gt.x = rnd(-.8, .8); this.gt.y = rnd(-.5, .4); } this.saccAt = T + rnd(...p.sacc); }
      let tx = this.gt.x, ty = this.gt.y; if (ex === 'pensando') { tx = -.65; ty = -.8; }
      const gk = 1 - Math.exp(-dt * 12); this.gz.x += (tx - this.gz.x) * gk; this.gz.y += (ty - this.gz.y) * gk;
      // parpadeo
      let sy = 1; if (this.blinkP < 0 && T > this.blinkAt) this.blinkP = 0;
      if (this.blinkP >= 0) { this.blinkP += dt / .17; if (this.blinkP >= 1) { this.blinkP = -1; if (!this.dbl && Math.random() < .25) { this.dbl = true; this.blinkAt = T + .1; } else { this.dbl = false; this.blinkAt = T + rnd(...p.blink); } } else sy = Math.max(.06, 1 - Math.sin(Math.PI * this.blinkP)); }
      // flote y rebote
      const bob = reduced ? 0 : Math.sin(T * p.spd) * s * p.bob * (this.st.base === 'humanoide' ? .4 : 1);
      this.popT += dt; const pe = this.popT < 1.4 ? Math.exp(-this.popT * 5) * Math.cos(this.popT * 20) : 0;
      const fy = R.A.floor ? R.A.floor[1] : R.B.view[1] + R.B.view[3];
      R.fig.setAttribute('transform', `translate(0,${f(bob)}) translate(${R.B.size[0] / 2},${f(fy)}) scale(${(1 + .04 * pe).toFixed(4)},${(1 - .04 * pe).toFixed(4)}) translate(${-R.B.size[0] / 2},${f(-fy)})`);
      if (R.sh) R.sh.setAttribute('opacity', (.5 * (1 - bob / (s * 1.2))).toFixed(3));
      if (R.flash) R.flash.setAttribute('opacity', (this.popT < 1 ? Math.exp(-this.popT * 6) * .35 : 0).toFixed(3));
      // cabeza
      const n = R.A.neck, tilt = (reduced ? 0 : Math.sin(T * .7) * p.tilt * .4) + this.gz.x * p.tilt * .5 + (ex === 'pensando' ? -5 : 0);
      R.head.setAttribute('transform', `rotate(${f(tilt)} ${n[0]} ${n[1]}) translate(${f(this.gz.x * s * .02)} ${f(this.gz.y * s * .015)})`);
      const ox = this.gz.x * s * (R.robot ? .05 : .03), oy = this.gz.y * s * (R.robot ? .035 : .02);
      for (const e of R.eyes) e.el.setAttribute('transform', `translate(${f(ox)} ${f(oy)}) translate(${e.cx} ${e.cy}) scale(${this.C.eye.toFixed(3)} ${(sy * this.C.eye).toFixed(3)}) translate(${-e.cx} ${-e.cy})`);
      // boca
      if (R.mouth) {
        let open = this.C.open;
        const talking = this.talkT > 0 || (this.audio && !this.audio.paused);
        if (this.talkT > 0) this.talkT -= dt;
        if (talking) open += .15 + .35 * Math.abs(Math.sin(T * 17) * Math.sin(T * 6.1 + 1));
        const md = mouthD(R.mi, this.C.smile, open); R.mouth.setAttribute('d', md.d);
        R.mouth.setAttribute('fill', md.fill ? R.mouth.getAttribute('stroke') : 'none'); R.mouth.setAttribute('stroke-width', f(R.mi.w * (md.fill ? .08 : .18)));
      }
      // brazo
      const sp = R.A.shoulder, up = this.st.base === 'humanoide' ? -150 : -138; let ang = reduced ? 0 : Math.sin(T * 1.1) * 1.5;
      let waving = false;
      if (this.waveT >= 0) { this.waveT += dt; const w = this.waveT; waving = true;
        if (w < .4) ang = up * ease(w / .4); else if (w < 1.9) ang = up + Math.sin((w - .4) * 13) * 14; else if (w < 2.35) ang = up * (1 - ease((w - 1.9) / .45)); else this.waveT = -1; }
      R.arm.setAttribute('transform', `rotate(${f(ang)} ${sp[0]} ${sp[1]})`);
      // alas: aleteo desde la raíz, lento en reposo y vivo al saludar
      const flapSpd = (waving ? 7 : 1.6) * p.flap, flapAmt = waving ? .28 : .1;
      const fl = reduced ? 0 : (Math.sin(T * flapSpd) * .5 + .5) * flapAmt + pe * .1;
      for (const w of R.wings) w.el.setAttribute('transform', `translate(${w.rx} ${w.ry}) scale(${(1 - fl).toFixed(4)} ${(1 - fl * .12).toFixed(4)}) rotate(${f(-w.s * fl * 14)}) translate(${-w.rx} ${-w.ry})`);
      for (const a of R.ants) a.el.setAttribute('transform', `rotate(${f(reduced ? 0 : Math.sin(T * 2.1) * 3 + pe * 4)} ${a.bx} ${a.by})`);
      const lv = (.4 + .3 * Math.sin(T * 2.2)) * (talkingNow(this) ? 1.3 : 1); for (const l of R.leds) l.setAttribute('opacity', lv.toFixed(3));
      const vv = .55 + .35 * Math.sin(T * 1.7); for (const v of R.veins) v.setAttribute('opacity', vv.toFixed(3));
      if (!reduced && T > this.nextWave && this.waveT < 0) { this.greet(); this.nextWave = T + p.wave + rnd(0, 4); }
      requestAnimationFrame(this._frame);
    }
  }
  function talkingNow(e) { return e.talkT > 0 || (e.audio && !e.audio.paused); }

  window.AuroraEngine = AuroraEngine;
  window.AuroraCompose = { build, resolver, thumbSVG, viewBox, PERS, opt, color };
})();
