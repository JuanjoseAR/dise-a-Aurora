/* Motor de Aurora (versión caribe): apila las capas de arma-a-aurora-caribe.html sobre la imagen base de cada estilo.
   La pila se multiplica sobre el fondo claro del estudio, así el blanco de la imagen base desaparece.
   Contrato:
     AuroraCompose.stackHTML(diseño)          capas como <img> posicionadas en % (sirve para vista en vivo y miniaturas)
     AuroraCompose.thumbHTML(diseño, vista)   miniatura encuadrada: full · face · eyes · body
     AuroraCompose.codigo(diseño)             código legible del diseño (AUR·TECNOLOGICA·…)
     AuroraCompose.png(diseño, escala)        Blob PNG con las mismas capas (exportación del panel)
     const av = new AuroraEngine(contenedor, diseño); av.set(diseño, pop); av.greet() */
(function () {
  const IMG = (window.PIEZAS_BASE || 'img/caribe') + '/';
  const P = () => window.PIEZAS, C = () => window.CATALOGO;
  const GROUPS = ['piel', 'cabello', 'ojos', 'lineas'];
  // lo que ya trae la imagen base de cada estilo (no tiene capa propia)
  const DEF = { estilo: 'tecnologica', piel: 'triguena', cabello: 'castano-oscuro', ojos: 'cafe-oscuro', lineas: 'camara' };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const opt = (q, id) => { const Q = C().preguntas.find(x => x.id === q); return Q && Q.opciones.find(o => o.id === id) || null; };

  function layers(st) {
    const estilo = P()[st.estilo] ? st.estilo : DEF.estilo, M = P()[estilo], n = M.size[0];
    const out = [{ g: 'base', src: `${IMG}${estilo}-base.webp`, x: 0, y: 0, w: n, h: n }];
    for (const g of GROUPS) {
      if (g === 'lineas' && estilo !== 'tecnologica') continue;
      const L = M.layers[g], k = st[g];
      if (!L || !k || !L[k]) continue;
      const [x, y, w, h] = L[k];
      out.push({ g, k, src: `${IMG}${estilo}-${g}-${k}.webp`, x, y, w, h });
    }
    return { n, out };
  }
  const pos = (l, n) => `left:${l.x / n * 100}%;top:${l.y / n * 100}%;width:${l.w / n * 100}%;height:${l.h / n * 100}%`;
  const imgTag = (l, n) => `<img alt="" class="g-${l.g}" src="${l.src}" style="${pos(l, n)}" draggable="false">`;
  function stackHTML(st) { const { n, out } = layers(st); return out.map(l => imgTag(l, n)).join(''); }

  // encuadres de las miniaturas: punto focal (% del lienzo) y zoom, por estilo
  const VIEWS = { full: { f: [50, 50], z: 1 }, face: { tecnologica: [51, 24], ejecutiva: [51, 26], z: 2.7 }, eyes: { tecnologica: [51, 23], ejecutiva: [51, 24.5], z: 5.2 }, body: { tecnologica: [50, 58], ejecutiva: [50, 55], z: 1.7 } };
  function thumbHTML(st, vista) {
    const V = VIEWS[vista] || VIEWS.full, f = V.f || V[st.estilo] || [50, 50], z = V.z;
    return `<div class="thumb"><div class="figure" style="transform:translate(${-z * (f[0] - 50)}%,${-z * (f[1] - 50)}%) scale(${z})"><div class="stack">${stackHTML(st)}</div></div></div>`;
  }
  const codigo = st => ['AUR', st.estilo, st.piel, st.cabello, st.ojos, st.estilo === 'tecnologica' ? st.lineas : '-'].join('·').toUpperCase();

  async function png(st, escala = 1) {
    const { n, out } = layers(st), s = Math.round(n * escala);
    const c = document.createElement('canvas'); c.width = s; c.height = s;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, s, s); // el fondo del estudio; la imagen base es opaca
    for (const l of out) {
      const im = new Image(); im.src = l.src;
      await im.decode();
      ctx.drawImage(im, l.x * escala, l.y * escala, l.w * escala, l.h * escala);
    }
    return new Promise(res => c.toBlob(res, 'image/png'));
  }

  /* Vista en vivo: cambia solo la capa que cambió, con fundido; rebote breve al cambiar */
  class AuroraEngine {
    constructor(el, st) { this.el = el; this.stack = el.querySelector('.stack'); this.fig = el.querySelector('.figure'); this.shown = null; if (st) this.set(st); }
    set(st, pop = true) {
      st = Object.assign({}, DEF, st);
      const prev = this.shown, { n, out } = layers(st);
      if (!prev || prev.estilo !== st.estilo || !this.stack.children.length) this.stack.innerHTML = out.map(l => imgTag(l, n)).join('');
      else for (const g of GROUPS) {
        if (prev[g] === st[g]) continue;
        const old = this.stack.querySelector('.g-' + g), l = out.find(x => x.g === g);
        if (l) {
          const im = new Image(); im.alt = ''; im.className = 'g-' + g; im.src = l.src; im.draggable = false; im.style.cssText = pos(l, n) + ';opacity:0';
          const later = GROUPS.slice(GROUPS.indexOf(g) + 1).map(x => '.g-' + x).join(',');
          this.stack.insertBefore(im, later ? this.stack.querySelector(later) : null);
          requestAnimationFrame(() => requestAnimationFrame(() => { im.style.opacity = ''; }));
        }
        if (old) { old.style.opacity = '0'; setTimeout(() => old.remove(), 400); }
      }
      this.shown = st;
      if (pop) this.greet();
    }
    greet() { if (reduced || !this.fig) return; this.fig.classList.remove('pop'); void this.fig.offsetWidth; this.fig.classList.add('pop'); clearTimeout(this._k); this._k = setTimeout(() => this.fig.classList.remove('pop'), 600); }
  }

  window.AuroraEngine = AuroraEngine;
  window.AuroraCompose = { DEF, GROUPS, layers, stackHTML, thumbHTML, codigo, png, opt };
})();
