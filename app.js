/* Flujo de la página: acceso → bienvenida → armador → revisión → confirmación → resultados; galería y ronda B; panel del dueño. */
(function () {
  const $ = id => document.getElementById(id);
  const CAT = window.CATALOGO, Q = id => CAT.preguntas.find(p => p.id === id);
  const { thumbSVG, opt, color } = window.AuroraCompose;
  const API = window.API, SES = API.SES;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const html = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let estado = { rondaA: 'abierta', galeria: 'no', rondaB: 'no_iniciada' }, colabs = [];
  let av = null, screen = '';

  /* ---------- estado del diseño (v2) ---------- */
  const ZONAS = CAT.zonas, PALETAS = CAT.paletas;
  const DEF = { base: 'caricaturesca', nivel: 'robot', alas: 'aurora', paleta: 'natural', alasBase: 'blanco', alasPunta: 'naranja', alasMancha: 'negro', alasBorde: 'sepia', alasPatron: 'moteado', luces: 'cian', tono: 'blanco', cabello: 'ovalada', cabelloColor: 'noche', antenas: 'led', ojos: 'ovalos', ojosColor: 'cian', boca: 'sonrisa', detalles: [], personalidad: 'amable' };
  let S = JSON.parse(JSON.stringify(DEF));
  const TONO_MAP = { porcelana: 'blanco', durazno: 'blanco', canela: 'perla', oliva: 'crema', cacao: 'carbon', ebano: 'carbon', blanco: 'porcelana', perla: 'durazno', carbon: 'cacao', crema: 'oliva' };
  const aplica = (qid, st) => { const q = Q(qid); if (!q || !q.aplicaSi) return true; return Object.entries(q.aplicaSi).every(([k, l]) => l.includes(st[k])); };
  const conAlas = st => ['aurora', 'pequenas', 'luz'].includes(st.alas);
  function valida(q, o, st) {
    if (!o) return 'No existe';
    if (o.nivel && !o.nivel.includes(st.nivel)) return o.motivo || 'No aplica para esta versión';
    if (o.base && !o.base.includes(st.base)) return o.motivo || 'No aplica para esta base';
    return null;
  }
  const zonasPara = zid => ZONAS.filter(z => !z.soloZona || z.soloZona.includes(zid));
  function aplicarPaleta(st) {
    if (!conAlas(st)) return st;
    const pal = PALETAS[st.paleta];
    if (pal) Object.assign(st, pal);
    return st;
  }
  function coerce(st) {
    const q = id => Q(id).opciones;
    if (!q('nivel').find(o => o.id === st.nivel && !valida('nivel', o, st))) st.nivel = q('nivel').find(o => !valida('nivel', o, st)).id;
    const tonoOk = q('tono').find(o => o.id === st.tono && !valida('tono', o, st));
    if (!tonoOk) st.tono = TONO_MAP[st.tono] && !valida('tono', opt('tono', TONO_MAP[st.tono]), st) ? TONO_MAP[st.tono] : q('tono').find(o => !valida('tono', o, st)).id;
    ['cabello', 'antenas', 'ojos', 'alasPatron', 'paleta', 'luces'].forEach(k => { if (!q(k).find(o => o.id === st[k] && !valida(k, o, st))) st[k] = q(k).find(o => !valida(k, o, st)).id; });
    if (st.base === 'actual' && st.cabello !== 'actual' && !['ovalada', 'cuadrada', 'visera'].includes(st.cabello)) st.cabello = 'actual';
    ['alasBase', 'alasPunta', 'alasMancha', 'alasBorde'].forEach(z => { if (!zonasPara(z).find(x => x.id === st[z])) st[z] = PALETAS.natural[z]; });
    if (!st.cabelloColor) st.cabelloColor = 'noche';
    st.detalles = st.detalles.filter(d => d !== 'ninguno' && !valida('detalles', opt('detalles', d), st)).slice(0, 2);
    return st;
  }
  const necesitaColorCabello = st => aplica('cabelloColor', st);
  function eleccionParaEnviar() {
    const e = JSON.parse(JSON.stringify(S));
    CAT.preguntas.forEach(q => { if (!aplica(q.id, e)) e[q.id] = q.multi ? [] : ''; });
    if (!e.detalles.length) e.detalles = ['ninguno'];
    return e;
  }

  /* ---------- pantallas ---------- */
  const SCREENS = ['s-acceso', 's-bienvenida', 's-grid', 's-admin'];
  function show(id) { SCREENS.forEach(s => { $(s).hidden = s !== id; }); screen = id; $('topnav').hidden = id === 's-acceso' || id === 's-admin'; window.scrollTo({ top: 0, behavior: 'auto' }); }
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.k); toast.k = setTimeout(() => t.classList.remove('on'), 2200); }
  function refreshNav() {
    const g = $('navGaleria'); g.disabled = estado.galeria !== 'si'; g.classList.toggle('on', estado.galeria === 'si');
    g.title = estado.galeria === 'si' ? 'Mira los diseños que armaron tus compañeros' : 'Aún no está habilitada la galería';
    $('navResultados').hidden = !SES.colab;
    ['navArmar', 'navGaleria', 'navResultados'].forEach(id => $(id).removeAttribute('aria-current'));
    if (modo === 'galeria') $('navGaleria').setAttribute('aria-current', 'page');
    else if (modo === 'resultados') $('navResultados').setAttribute('aria-current', 'page');
    else if (screen === 's-grid') $('navArmar').setAttribute('aria-current', 'page');
  }
  function ensureAv() { if (!av) av = new AuroraEngine($('av'), S); return av; }

  /* ---------- acceso ---------- */
  async function cargarEstado() {
    const r = await API.withToken({ action: 'estado' });
    if (!r.ok) { if (r.error === 'sesion') { SES.token = ''; show('s-acceso'); $('stAcceso').textContent = r.mensaje; $('stAcceso').className = 'status warn'; } return false; }
    estado = r.estado; colabs = r.colaboradores; refreshNav(); return true;
  }
  $('fAcceso').addEventListener('submit', async e => {
    e.preventDefault(); const st = $('stAcceso'); st.textContent = 'Verificando…'; st.className = 'status';
    try {
      const r = await API.call({ action: 'acceso', codigo: $('codigo').value });
      if (!r.ok) { st.textContent = r.mensaje || 'Código incorrecto.'; st.className = 'status bad'; return; }
      SES.token = r.token; estado = r.estado; st.textContent = '';
      if (await cargarEstado()) entrar();
    } catch (err) { st.textContent = 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.'; st.className = 'status bad'; }
  });
  function entrar() {
    show('s-bienvenida'); refreshNav();
    const c = SES.colab; $('bYaVote').hidden = !c;
    $('stBienvenida').textContent = estado.rondaA !== 'abierta' ? 'La votación de características está cerrada. Puedes ver la galería si está habilitada.' : (c ? `Ya votaste como ${c.nombre}.` : '');
    $('stBienvenida').className = 'status ' + (estado.rondaA !== 'abierta' ? 'warn' : 'ok');
  }
  $('bEmpezar').onclick = () => { modo = 'armador'; cur = 0; show('s-grid'); ensureAv().set(S); renderStep(); refreshNav(); setTimeout(() => av.greet(), 500); };
  $('bYaVote').onclick = () => verResultados();
  $('navArmar').onclick = () => { modo = 'armador'; if (cur === CONFIRM) cur = DONE; $('nav').hidden = false; $('next').hidden = false; $('liveLabel').textContent = 'Vista en vivo'; show('s-grid'); ensureAv().set(S, false); renderStep(); refreshNav(); };
  $('navGaleria').onclick = () => verGaleria();
  $('navResultados').onclick = () => verResultados();

  /* ---------- armador (v2) ---------- */
  const ALL_STEPS = [
    { q: 'base', vista: 'full' }, { q: 'nivel', vista: 'head' }, { q: 'alas', vista: 'full' }, { q: 'paleta', colores: true, vista: 'full' },
    { q: 'tono', swOnly: true }, { q: 'cabello', sw: 'cabelloColor', vista: 'head', titulo: 'Peinado' }, { q: 'antenas', vista: 'head' }, { q: 'ojos', sw: 'ojosColor', vista: 'face', titulo: 'Estilo' },
    { q: 'boca', vista: 'face' }, { q: 'detalles', vista: 'head', multi: 2 }, { q: 'personalidad', pers: true }];
  const steps = () => ALL_STEPS.filter(st => aplica(st.q, S));
  const DONE = 99, CONFIRM = 100;
  let cur = 0, modo = 'armador', picked = null;
  function tituloPaso(st) {
    if (st.q === 'cabello') return S.nivel === 'robot' ? 'Carcasa' : S.base === 'mascota' ? 'Copete' : 'Cabello';
    return Q(st.q).nombre;
  }
  function preguntaPaso(st) {
    if (st.q === 'cabello') return S.nivel === 'robot' ? '¿Qué forma tiene la carcasa de su cabeza?' : S.base === 'mascota' ? '¿Lleva copete?' : '¿Cómo lleva el cabello?';
    if (st.q === 'tono') return S.nivel === 'robot' ? '¿De qué color es su carcasa?' : S.base === 'mascota' ? '¿De qué color es su pelaje?' : '¿Qué tono de piel tiene?';
    return Q(st.q).pregunta;
  }
  const ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 17c-3-7-9-9-12-7-3 3 1 10 7 11-6 1-9 6-6 8 3 2 8-1 11-6 3 5 8 8 11 6 3-2 0-7-6-8 6-1 10-8 7-11-3-2-9 0-12 7z" fill="currentColor"/></svg>';
  function renderRail() {
    const L = steps(); $('rail').hidden = modo !== 'armador';
    $('rail').innerHTML = L.map((s, i) => `<li><button type="button" data-go="${i}" ${i === cur ? 'aria-current="step"' : ''} class="${i < cur || cur >= DONE ? 'done' : ''}"><span>${i === cur ? ICON : i + 1}</span>${tituloPaso(s)}</button></li>`).join('');
  }
  function swatchBtn(field, c, on, bg) { return `<button type="button" data-f="${field}" data-v="${c.id}" aria-pressed="${on}" aria-label="${html(c.nombre)}" title="${html(c.nombre)}" style="background:${bg}"></button>`; }
  function swatches(field, title) {
    const q = Q(field); const sel = opt(field, S[field]) || q.opciones[0];
    return `<div class="block"><h2>${title || q.nombre}</h2><div class="sw">${q.opciones.map(c => { if (valida(field, c, S)) return ''; return swatchBtn(field, c, S[field] === c.id, c.grad ? `linear-gradient(135deg,${c.grad.join(',')})` : (field === 'luces' ? c.g : c.c)); }).join('')}</div><div class="sw-name">Elegido: <b>${html(sel.nombre)}</b></div></div>`;
  }
  function zonaSwatches(zid, title) {
    const sel = ZONAS.find(z => z.id === S[zid]) || ZONAS[0];
    return `<div class="block"><h2>${title}</h2><div class="sw">${zonasPara(zid).map(z => swatchBtn(zid, z, S[zid] === z.id, z.grad ? `linear-gradient(135deg,${z.grad.join(',')})` : z.c)).join('')}</div><div class="sw-name">Elegido: <b>${html(sel.nombre)}</b></div></div>`;
  }
  function optCard(field, o, c, vista, on, why, multi) {
    return `<button type="button" class="opt" data-f="${field}" data-v="${o.id}" ${multi ? 'data-multi="1"' : ''} aria-pressed="${on}" ${why ? 'disabled' : ''}><div class="thumb">${why ? '' : thumbSVG(c, vista)}</div><b>${html(o.nombre)}</b>${o.sub ? `<small>${html(o.sub)}</small>` : ''}${why ? `<span class="why">${html(why)}</span>` : ''}</button>`;
  }
  function renderStep() {
    renderRail(); const body = $('body'); $('nav').hidden = false; $('back').disabled = cur === 0; $('next').disabled = false; $('next').hidden = false;
    if (cur === DONE) return renderRevision();
    if (cur === CONFIRM) return renderConfirmacion();
    const L = steps(); if (cur >= L.length) cur = L.length - 1;
    const st = L[cur], q = Q(st.q);
    $('eyebrow').textContent = `Paso ${cur + 1} de ${L.length}`; $('q').textContent = preguntaPaso(st); $('help').textContent = q.ayuda;
    let h = '';
    const copia = () => coerce(JSON.parse(JSON.stringify(S)));
    if (st.pers) {
      h += `<div class="pers">${q.opciones.map(o => `<button type="button" class="opt" data-f="personalidad" data-v="${o.id}" aria-pressed="${S.personalidad === o.id}"><b>${o.nombre}</b><small>${o.sub}</small></button>`).join('')}</div>`;
    } else if (st.colores) {
      h += `<div class="block"><h2>Paletas de Aurora</h2><div class="opts">${q.opciones.map(o => { const c = copia(); c.paleta = o.id; aplicarPaleta(c); return optCard('paleta', o, c, 'full', S.paleta === o.id, null); }).join('')}</div></div>`;
      if (S.paleta === 'personalizada') {
        h += zonaSwatches('alasBase', 'Base de las alas') + zonaSwatches('alasPunta', 'Punta de las alas');
        if (aplica('alasMancha', S)) h += zonaSwatches('alasMancha', 'Mancha');
        if (aplica('alasBorde', S)) h += zonaSwatches('alasBorde', 'Borde');
      }
      const qp = Q('alasPatron');
      h += `<div class="block"><h2>Patrón</h2><div class="opts">${qp.opciones.map(o => { const c = copia(); c.alasPatron = o.id; return optCard('alasPatron', o, c, 'full', S.alasPatron === o.id, valida('alasPatron', o, S)); }).join('')}</div></div>`;
      if (aplica('luces', S)) h += swatches('luces', 'Luces (LED y pantalla)');
    } else if (!st.swOnly) {
      h += `<div class="block">${st.sw ? `<h2>${st.titulo || 'Forma'}</h2>` : ''}<div class="opts">${q.opciones.map(o => {
        const why = valida(st.q, o, S);
        const c = copia(); let on;
        if (st.multi) { if (o.id === 'ninguno') { on = !S.detalles.length; c.detalles = []; } else { on = S.detalles.includes(o.id); c.detalles = [o.id]; } }
        else { c[st.q] = o.id; on = S[st.q] === o.id; coerce(c); if (st.q === 'alas') aplicarPaleta(c); }
        return optCard(st.q, o, c, st.vista, on, why, st.multi);
      }).join('')}</div></div>`;
    }
    if (st.sw === 'cabelloColor' && necesitaColorCabello(S)) h += swatches('cabelloColor', 'Color del cabello');
    if (st.sw === 'ojosColor') h += aplica('ojosColor', S) ? swatches('ojosColor', 'Color de ojos') : (aplica('luces', S) ? swatches('luces', 'Color de la luz') : '');
    if (st.swOnly) h += swatches('tono', S.nivel === 'robot' ? 'Carcasa' : S.base === 'mascota' ? 'Pelaje' : 'Piel');
    body.innerHTML = h;
    $('next').textContent = cur === L.length - 1 ? 'Revisar mi diseño' : 'Siguiente';
  }
  $('body').addEventListener('click', e => {
    const b = e.target.closest('button[data-f]'); if (!b || b.disabled) return;
    const fld = b.dataset.f, v = b.dataset.v;
    if (b.dataset.multi) {
      if (v === 'ninguno') S.detalles = [];
      else { const i = S.detalles.indexOf(v); if (i >= 0) S.detalles.splice(i, 1); else if (S.detalles.length >= 2) { toast('Máximo 2 detalles. Quita uno para cambiarlo.'); return; } else S.detalles.push(v); }
    } else S[fld] = v;
    if (['alasBase', 'alasPunta', 'alasMancha', 'alasBorde'].includes(fld)) S.paleta = 'personalizada';
    if (fld === 'paleta' || fld === 'alas') aplicarPaleta(S);
    coerce(S); ensureAv().set(S); renderStep();
    if (fld === 'base' || fld === 'nivel' || fld === 'personalidad' || fld === 'alas') av.greet();
  });
  $('rail').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b) return; cur = +b.dataset.go; renderStep(); });
  $('next').onclick = () => {
    if (modo !== 'armador') return;
    if (cur === CONFIRM) return verResultados();
    if (cur === DONE) return enviarVoto();
    if (cur >= steps().length - 1) { cur = DONE; renderStep(); av.greet(); }
    else { cur++; renderStep(); }
    if (innerWidth <= 860) $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('back').onclick = () => { if (modo !== 'armador') return; if (cur === DONE) cur = steps().length - 1; else if (cur > 0) cur--; renderStep(); };
  $('rand').onclick = () => {
    const pick = q => { const l = Q(q).opciones.filter(o => !valida(q, o, S)); return l[Math.floor(Math.random() * l.length)].id; };
    S.base = pick('base'); S.nivel = pick('nivel'); ['alas', 'paleta', 'alasPatron', 'luces', 'tono', 'cabello', 'cabelloColor', 'antenas', 'ojos', 'ojosColor', 'boca', 'personalidad'].forEach(k => { S[k] = pick(k); });
    if (S.paleta === 'personalizada') ['alasBase', 'alasPunta', 'alasMancha', 'alasBorde'].forEach(z => { const l = zonasPara(z); S[z] = l[Math.floor(Math.random() * l.length)].id; });
    aplicarPaleta(S);
    S.detalles = Q('detalles').opciones.filter(o => o.id !== 'ninguno' && !valida('detalles', o, S) && Math.random() < .35).map(o => o.id).slice(0, 2);
    coerce(S); ensureAv().set(S); if (modo === 'armador') renderStep(); av.greet();
  };
  $('stage').addEventListener('click', e => { const b = e.target.closest('[data-act],[data-expr]'); if (!b || !av) return; if (b.dataset.act === 'wave') av.greet(); else if (b.dataset.act === 'look') av.lookAround(); else av.setExpression(b.dataset.expr); });

  /* ---------- ficha ---------- */
  const nombreOpcion = (q, id) => { const Qq = Q(q); if (Qq && Qq.tipo === 'zona') { const z = ZONAS.find(x => x.id === id); return z ? z.nombre : (id || '—'); } const o = opt(q, id); return o ? o.nombre : (id || '—'); };
  function fichaHTML(e) {
    const alas = conAlas(e);
    const rows = [['Base', nombreOpcion('base', e.base)], ['Nivel', nombreOpcion('nivel', e.nivel)], ['Alas', nombreOpcion('alas', e.alas)]];
    if (alas) {
      const zonas = [['base', e.alasBase], ['punta', e.alasPunta]].concat(['mancha', 'moteado'].includes(e.alasPatron) ? [['mancha', e.alasMancha]] : []).concat(e.alasPatron === 'moteado' ? [['borde', e.alasBorde]] : []);
      rows.push(['Colores', e.paleta === 'personalizada' ? 'Personalizada: ' + zonas.map(([k, v]) => `${k} ${nombreOpcion('alas' + k[0].toUpperCase() + k.slice(1), v).toLowerCase()}`).join(', ') : nombreOpcion('paleta', e.paleta)]);
      rows.push(['Patrón', nombreOpcion('alasPatron', e.alasPatron)]);
    }
    if (aplica('luces', e)) rows.push(['Luces', nombreOpcion('luces', e.luces)]);
    rows.push([e.nivel === 'robot' ? 'Carcasa' : e.base === 'mascota' ? 'Pelaje' : 'Piel', nombreOpcion('tono', e.tono)]);
    rows.push([e.nivel === 'robot' ? 'Cabeza' : e.base === 'mascota' ? 'Copete' : 'Cabello', nombreOpcion('cabello', e.cabello) + (aplica('cabelloColor', e) && e.cabelloColor ? ' · ' + nombreOpcion('cabelloColor', e.cabelloColor) : '')]);
    rows.push(['Antenas', nombreOpcion('antenas', e.antenas)]);
    rows.push(['Ojos', nombreOpcion('ojos', e.ojos) + (aplica('ojosColor', e) ? ' · ' + nombreOpcion('ojosColor', e.ojosColor) : '')]);
    rows.push(['Boca', nombreOpcion('boca', e.boca)]);
    const det = (e.detalles || []).filter(d => d !== 'ninguno');
    rows.push(['Detalles', det.length ? det.map(d => nombreOpcion('detalles', d)).join(', ') : 'Ninguno'], ['Personalidad', nombreOpcion('personalidad', e.personalidad)]);
    return `<div class="ficha"><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${html(v)}</dd>`).join('')}</dl></div>`;
  }

  /* ---------- combobox de colaboradores ---------- */
  function combobox(container, ronda, onPick) {
    const key = ronda === 'B' ? 'votoB' : 'votoA';
    container.innerHTML = `<div class="field"><label for="cbIn">Tu nombre completo</label><div class="combo"><input id="cbIn" type="text" role="combobox" aria-expanded="false" aria-controls="cbList" aria-autocomplete="list" placeholder="Escribe tu nombre o apellido para buscarlo" autocomplete="off"><ul id="cbList" role="listbox" hidden></ul></div><p class="hint">Solo puedes elegir un nombre de la lista de colaboradores. Tu nombre queda asociado a tu voto y solo se usa para esta votación.</p></div><div id="cbPicked" hidden></div>`;
    const inp = container.querySelector('#cbIn'), list = container.querySelector('#cbList'), pk = container.querySelector('#cbPicked');
    let items = [], idx = -1;
    const render = () => {
      const t = norm(inp.value); const words = t.split(' ').filter(Boolean);
      items = colabs.filter(c => words.every(w => norm(c.nombre).includes(w))).slice(0, 40);
      list.innerHTML = items.length ? items.map((c, i) => { const v = c[key]; let n = html(c.nombre); words.forEach(w => { n = n.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<mark>$1</mark>'); }); return `<li role="option" id="cbo${i}" aria-selected="${i === idx}" class="${v ? 'voted' : ''}" data-i="${i}"><span>${n}</span><span class="st ${v ? '' : 'ok'}">${v ? 'Ya votó' : 'Disponible'}</span></li>`; }).join('') : `<li class="empty">No encuentro ese nombre. Revisa la escritura o avisa al organizador.</li>`;
      list.hidden = false; inp.setAttribute('aria-expanded', 'true');
    };
    const choose = i => { const c = items[i]; if (!c) return; if (c[key]) { toast('Ya hay un voto registrado con este nombre. Si no fuiste tú, avisa al organizador.'); return; }
      picked = { id: c.id, nombre: c.nombre }; list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.value = ''; inp.parentElement.parentElement.hidden = true;
      pk.hidden = false; pk.innerHTML = `<div class="picked"><div><small class="hint">Votas como</small><br><b>${html(c.nombre)}</b></div><button class="ghost" type="button" id="cbChange">Cambiar</button></div>`;
      pk.querySelector('#cbChange').onclick = () => { picked = null; pk.hidden = true; inp.parentElement.parentElement.hidden = false; inp.focus(); onPick(null); };
      onPick(picked); };
    inp.addEventListener('input', () => { idx = -1; render(); });
    inp.addEventListener('focus', () => render());
    inp.addEventListener('keydown', e => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); render(); list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (idx >= 0) choose(idx); }
      else if (e.key === 'Escape') { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
    });
    list.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
    document.addEventListener('click', e => { if (!container.contains(e.target)) { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); } });
  }

  /* ---------- revisión y envío ---------- */
  let confirmando = false;
  function renderRevision() {
    picked = null; confirmando = false;
    $('eyebrow').textContent = 'Revisión'; $('q').textContent = 'Así imaginas a Aurora'; $('help').textContent = 'Revisa tu ficha. Puedes volver a cualquier paso desde la barra de arriba. Cuando estés conforme, elige tu nombre y envía tu voto.';
    const cerrada = estado.rondaA !== 'abierta';
    $('body').innerHTML = fichaHTML(S) + (cerrada ? `<div class="lock"><b>La votación está cerrada</b>Ya no se reciben diseños. Si la galería está habilitada, puedes ver los diseños enviados.</div>` : `<div id="cb"></div><p class="hint"><b>Tu voto es definitivo.</b> Una vez enviado no se puede cambiar. Si te equivocas, avisa al organizador para que lo anule y puedas volver a votar.</p><p class="status" id="stVoto" aria-live="polite"></p>`);
    $('next').textContent = 'Enviar mi voto'; $('next').disabled = true; $('back').disabled = false;
    if (!cerrada) combobox($('cb'), 'A', c => { $('next').disabled = !c; $('next').textContent = 'Enviar mi voto'; confirmando = false; });
    else $('next').hidden = true;
  }
  async function enviarVoto() {
    if (!picked) return;
    const st = $('stVoto');
    if (!confirmando) { confirmando = true; $('next').textContent = 'Confirmar y enviar'; st.textContent = `Vas a enviar tu diseño como ${picked.nombre}. Es definitivo. Pulsa de nuevo para confirmar.`; st.className = 'status warn'; return; }
    $('next').disabled = true; st.textContent = 'Enviando…'; st.className = 'status';
    try {
      const r = await API.withToken({ action: 'votar', colaboradorId: picked.id, eleccion: eleccionParaEnviar() });
      if (!r.ok) {
        st.textContent = r.mensaje || 'No se pudo guardar el voto.'; st.className = 'status bad'; $('next').disabled = false; confirmando = false; $('next').textContent = 'Enviar mi voto';
        if (r.error === 'ya_voto') { const c = colabs.find(x => x.id === picked.id); if (c) c.votoA = true; }
        if (r.error === 'sesion') { SES.token = ''; show('s-acceso'); }
        return;
      }
      SES.colab = picked; const c = colabs.find(x => x.id === picked.id); if (c) c.votoA = true;
      cur = CONFIRM; renderStep(); av.greet(); refreshNav();
    } catch (e) { st.textContent = 'No se pudo conectar. Tu voto no se envió. Intenta de nuevo.'; st.className = 'status bad'; $('next').disabled = false; confirmando = false; }
  }
  function renderConfirmacion() {
    $('eyebrow').textContent = 'Voto guardado'; $('q').textContent = `¡Gracias, ${SES.colab ? SES.colab.nombre.split(' ').slice(-2).join(' ') : ''}!`; $('help').textContent = 'Tu diseño quedó registrado como tu voto. Aurora te saluda.';
    $('body').innerHTML = `<div class="lock" style="border-style:solid;border-color:var(--cyan)"><b>Tu voto quedó guardado</b>Esta es la ficha que enviaste. Los resultados ya están disponibles para ti.</div>` + fichaHTML(S);
    $('next').textContent = 'Ver resultados'; $('next').disabled = false; $('next').hidden = false; $('back').disabled = true;
    $('rail').hidden = true;
  }

  /* ---------- resultados (ronda A) ---------- */
  const pct = (k, n) => n ? Math.round(k / n * 100) : 0;
  const limpiar = G => Object.fromEntries(Object.entries(G || {}).filter(([k, v]) => v !== null && v !== undefined && v !== ''));
  async function verResultados() {
    modo = 'resultados'; show('s-grid'); refreshNav(); $('rail').hidden = true; $('nav').hidden = true; $('liveLabel').textContent = 'Diseño en vivo';
    $('eyebrow').textContent = 'Resultados'; $('q').textContent = 'Así va la votación'; $('help').textContent = 'Cargando…'; $('body').innerHTML = '';
    const c = SES.colab;
    if (!c) { $('help').textContent = ''; $('body').innerHTML = `<div class="lock"><b>Vota primero</b>Los resultados se muestran después de tu voto para no influir en tu elección.</div>`; return; }
    const r = await API.withToken({ action: 'resultadosA', colaboradorId: c.id });
    if (!r.ok) { $('help').textContent = ''; $('body').innerHTML = `<div class="lock"><b>${r.error === 'sin_voto' ? 'Vota primero' : 'No disponible'}</b>${html(r.mensaje || '')}</div>`; if (r.error === 'sesion') { SES.token = ''; show('s-acceso'); } return; }
    estado = r.estado || estado; refreshNav();
    const n = r.participacion.votos, tot = r.participacion.colaboradores;
    $('help').textContent = `${n} ${n === 1 ? 'voto' : 'votos'} de ${tot} colaboradores (${pct(n, tot)}%). ${estado.rondaA === 'abierta' ? 'La votación sigue abierta.' : 'La votación está cerrada.'}`;
    const G = limpiar(r.ganador); const g = coerce(Object.assign(JSON.parse(JSON.stringify(DEF)), G, { detalles: (G.detalles || []).filter(d => d !== 'ninguno') }));
    const preguntas = CAT.preguntas.filter(p => Object.keys(r.conteo[p.id] || {}).length);
    const wins = preguntas.map(p => { const cnt = r.conteo[p.id] || {}; const pares = Object.entries(cnt).sort((a, b) => b[1] - a[1]); if (!pares.length) return ''; const tie = r.empates && r.empates[p.id]; const w = p.id === 'detalles' ? pares.slice(0, 2) : [pares.find(x => x[0] === G[p.id]) || pares[0]];
      return `<div class="win ${tie ? 'tie' : ''}"><small>${html(p.nombre)}</small>${w.map(([id, k]) => `<b>${html(nombreOpcion(p.id, id))}</b><span class="pct">${k} · ${pct(k, n)}%</span>`).join('')}${tie ? `<span class="pct" style="color:var(--warn)">Empate</span>` : ''}</div>`; }).join('');
    const top3 = (r.top3 || []).map((d, i) => `<button type="button" class="card" data-top="${i}"><div class="thumb">${thumbSVG(d.eleccion, 'full')}</div><span class="votes">${d.n} ${d.n === 1 ? 'voto' : 'votos'}</span><span class="n">Diseño completo #${i + 1}</span></button>`).join('');
    $('body').innerHTML = `<div class="kpis"><div class="kpi"><small>Votos</small><b>${n}</b></div><div class="kpi"><small>Participación</small><b>${pct(n, tot)}%</b></div><div class="kpi"><small>Diseños distintos</small><b>${Object.keys(r.conteo.base || {}).length ? (r.top3 || []).length >= 3 ? '3+' : (r.top3 || []).length : 0}</b></div></div>
      <div class="block"><h2>Diseño ganador por consenso</h2><p class="hint">Se arma con la opción más votada de cada pregunta. Está en la vista en vivo.</p><div class="row"><button class="ghost" type="button" id="verGanador">Ver en vivo</button></div></div>
      <div class="block"><h2>Lo más elegido por pregunta</h2><div class="winners">${wins}</div></div>
      <div class="block"><h2>Los diseños completos más repetidos</h2>${top3 ? `<div class="cards">${top3}</div>` : '<p class="hint">Aún no hay diseños repetidos.</p>'}</div>
      ${estado.galeria === 'si' ? `<div class="row"><button class="primary" type="button" id="irGaleria">Ver diseños de tus compañeros</button></div>` : ''}`;
    ensureAv().set(g); av.greet();
    $('verGanador').onclick = () => { av.set(g); av.greet(); };
    $('body').querySelectorAll('[data-top]').forEach(b => { b.onclick = () => { av.set(r.top3[+b.dataset.top].eleccion); av.greet(); }; });
    const ig = $('irGaleria'); if (ig) ig.onclick = () => verGaleria();
  }

  /* ---------- galería y ronda B ---------- */
  async function verGaleria() {
    modo = 'galeria'; show('s-grid'); refreshNav(); $('rail').hidden = true; $('nav').hidden = true; $('liveLabel').textContent = 'Diseño en vivo';
    $('eyebrow').textContent = 'Galería'; $('q').textContent = 'Los diseños de tus compañeros'; $('help').textContent = 'Cargando…'; $('body').innerHTML = '';
    const c = SES.colab;
    const r = await API.withToken({ action: 'galeria', colaboradorId: c ? c.id : null });
    if (!r.ok) { $('help').textContent = ''; $('body').innerHTML = `<div class="lock"><b>Galería no disponible</b>${html(r.mensaje || '')}</div>`; if (r.error === 'sesion') { SES.token = ''; show('s-acceso'); } return; }
    estado = r.estado || estado; refreshNav();
    const propios = new Set(r.disenosPropios || []);
    const abiertaB = estado.rondaB === 'abierta';
    let yaVotoB = false, resB = null;
    if (c) { const cc = colabs.find(x => x.id === c.id); yaVotoB = !!(cc && cc.votoB); }
    if (yaVotoB || estado.rondaB === 'cerrada') { const rb = await API.withToken({ action: 'resultadosB', colaboradorId: c ? c.id : null }); if (rb.ok) resB = rb; }
    const votosDe = id => resB ? ((resB.podio.find(p => p.disenoId === id) || {}).n || 0) : null;
    const orden = resB ? r.disenos.slice().sort((a, b) => votosDe(b.disenoId) - votosDe(a.disenoId)) : r.disenos;
    $('help').textContent = `${r.disenos.length} ${r.disenos.length === 1 ? 'diseño enviado' : 'diseños enviados'}. Sin nombres: cada diseño tiene un número.` + (abiertaB ? ' La ronda de diseños está abierta: elige uno y vota.' : estado.rondaB === 'no_iniciada' ? ' La ronda de votación por diseño aún no empieza.' : ' La ronda de diseños está cerrada.');
    let sel = null;
    const cards = orden.map((d, i) => `<button type="button" class="card" data-id="${d.disenoId}" aria-pressed="false">${propios.has(d.disenoId) ? '<span class="tag">Tu diseño</span>' : ''}<div class="thumb">${thumbSVG(d.eleccion, 'full')}</div><span class="n">Diseño ${String(r.disenos.indexOf(d) + 1).padStart(3, '0')}</span>${resB ? `<span class="votes">${votosDe(d.disenoId)} ${votosDe(d.disenoId) === 1 ? 'voto' : 'votos'}</span>` : ''}</button>`).join('');
    $('body').innerHTML = `${resB ? `<div class="kpis"><div class="kpi"><small>Votos por diseño</small><b>${resB.participacion.votos}</b></div><div class="kpi"><small>Diseño más votado</small><b>${resB.podio[0] ? 'Diseño ' + String(r.disenos.findIndex(d => d.disenoId === resB.podio[0].disenoId) + 1).padStart(3, '0') : '—'}</b></div></div>` : ''}
      <div class="cards" id="gal">${cards || '<p class="hint">Aún no hay diseños.</p>'}</div>
      ${abiertaB && !yaVotoB ? `<div class="block" id="votoB"><h2>Vota por un diseño</h2><p class="hint" id="selB">Toca un diseño para verlo en vivo y seleccionarlo. No puedes votar por el tuyo.</p><div id="cbB"></div><p class="status" id="stB" aria-live="polite"></p><div class="row"><button class="primary" type="button" id="bVotarB" disabled>Votar por este diseño</button></div><p class="hint"><b>Tu voto es definitivo.</b></p></div>` : ''}
      ${yaVotoB ? `<p class="status ok">Ya votaste en la ronda de diseños. Los conteos se muestran en cada tarjeta.</p>` : ''}`;
    let pickedB = c ? { id: c.id, nombre: c.nombre } : null;
    const upd = () => { const b = $('bVotarB'); if (b) b.disabled = !(sel && pickedB && !propios.has(sel)); };
    if (abiertaB && !yaVotoB) { if (!c) combobox($('cbB'), 'B', p => { pickedB = p; upd(); }); else $('cbB').innerHTML = `<div class="picked"><div><small class="hint">Votas como</small><br><b>${html(c.nombre)}</b></div></div>`; }
    $('gal').addEventListener('click', e => { const b = e.target.closest('.card'); if (!b) return; sel = b.dataset.id; $('gal').querySelectorAll('.card').forEach(x => x.setAttribute('aria-pressed', x === b)); const d = r.disenos.find(x => x.disenoId === sel); ensureAv().set(d.eleccion); av.greet();
      const s = $('selB'); if (s) s.textContent = propios.has(sel) ? 'Este es tu diseño: no puedes votar por él.' : `Seleccionaste el diseño ${String(r.disenos.indexOf(d) + 1).padStart(3, '0')}.`; upd(); });
    const bv = $('bVotarB'); let conf = false;
    if (bv) bv.onclick = async () => {
      const st = $('stB');
      if (!conf) { conf = true; bv.textContent = 'Confirmar mi voto'; st.textContent = 'Es definitivo. Pulsa de nuevo para confirmar.'; st.className = 'status warn'; return; }
      bv.disabled = true; st.textContent = 'Enviando…'; st.className = 'status';
      const rv = await API.withToken({ action: 'votarB', colaboradorId: pickedB.id, disenoId: sel });
      if (!rv.ok) { st.textContent = rv.mensaje || 'No se pudo guardar.'; st.className = 'status bad'; bv.disabled = false; conf = false; bv.textContent = 'Votar por este diseño'; return; }
      SES.colab = pickedB; const cc = colabs.find(x => x.id === pickedB.id); if (cc) cc.votoB = true; toast('Voto guardado'); av.greet(); verGaleria();
    };
    if (orden[0]) { ensureAv().set(orden[0].eleccion, false); }
  }

  /* ---------- panel del dueño ---------- */
  async function verAdmin() {
    show('s-admin'); const p = $('s-admin');
    if (!SES.admin) {
      p.innerHTML = `<div class="head"><span class="eyebrow">Panel del dueño</span><h1>Clave de administración</h1><p>Este panel muestra nombres y permite abrir o cerrar la votación. Solo para el organizador.</p></div><form class="field" id="fAdmin"><label for="adminKey">Clave</label><input id="adminKey" type="password" autocomplete="current-password"><p class="status" id="stAdmin"></p><div class="row"><button class="primary" type="submit">Entrar al panel</button><button class="ghost" type="button" id="adminSalir">Volver a la página</button></div></form>`;
      $('adminSalir').onclick = () => { location.hash = ''; salirAdmin(); };
      $('fAdmin').onsubmit = async e => { e.preventDefault(); SES.admin = $('adminKey').value; const r = await API.admin({ op: 'estado' }); if (!r.ok) { SES.admin = ''; $('stAdmin').textContent = r.mensaje || 'Clave incorrecta.'; $('stAdmin').className = 'status bad'; return; } verAdmin(); };
      return;
    }
    p.innerHTML = `<div class="head"><span class="eyebrow">Panel del dueño</span><h1>Operación de la votación</h1><p>Cargando…</p></div>`;
    const [r, v] = await Promise.all([API.admin({ op: 'estado' }), API.admin({ op: 'votos' })]);
    if (!r.ok || !v.ok) { SES.admin = ''; return verAdmin(); }
    estado = r.estado; const A = r.resultadosA, B = r.resultadosB;
    const seg = (prop, vals, labels) => `<div class="seg">${vals.map((x, i) => `<button type="button" data-prop="${prop}" data-val="${x}" aria-pressed="${estado[{ RONDA_A: 'rondaA', GALERIA: 'galeria', RONDA_B: 'rondaB' }[prop]] === x}">${labels[i]}</button>`).join('')}</div>`;
    const G = limpiar(A.ganador), n = A.participacion.votos;
    const g = coerce(Object.assign(JSON.parse(JSON.stringify(DEF)), G, { detalles: (G.detalles || []).filter(d => d !== 'ninguno') }));
    const empates = Object.entries(A.empates || {});
    const tablaA = v.votosA.map(x => `<tr class="${x.anulado ? 'off' : ''}"><td>${html(x.nombre)}</td><td class="mini">${html(String(x.fecha).replace('T', ' ').slice(0, 16))}</td><td class="mini">${html(Object.entries(x.eleccion).map(([k, val]) => `${k}:${Array.isArray(val) ? val.join('+') : val}`).join(' '))}</td><td>${x.anulado ? 'Anulado' : `<button class="danger" type="button" data-anular="${x.votoId}">Anular</button>`}</td></tr>`).join('');
    const tablaB = v.votosB.map(x => `<tr class="${x.anulado ? 'off' : ''}"><td>${html(x.nombre)}</td><td class="mini">${html(String(x.fecha).replace('T', ' ').slice(0, 16))}</td><td class="mini">${html(x.disenoId)}</td><td>${x.anulado ? 'Anulado' : `<button class="danger" type="button" data-anular="${x.votoId}">Anular</button>`}</td></tr>`).join('');
    const podio = (B.podio || []).slice(0, 5).map((d, i) => `<div class="card" style="cursor:default"><div class="thumb">${d.eleccion ? thumbSVG(d.eleccion, 'full') : ''}</div><span class="votes">${d.n} ${d.n === 1 ? 'voto' : 'votos'}</span><span class="n">${html(d.disenoId)} · ${html((v.votosA.find(x => x.votoId === d.disenoId) || {}).nombre || '')}</span></div>`).join('');
    p.innerHTML = `<div class="head"><span class="eyebrow">Panel del dueño</span><h1>Operación de la votación</h1><p>${n} votos de características · ${B.participacion.votos} votos por diseño · ${v.colaboradores.length} colaboradores.</p></div>
      <div class="switches">
        <div class="switch"><b>Ronda A · características</b><span class="state">${estado.rondaA}</span>${seg('RONDA_A', ['abierta', 'cerrada'], ['Abierta', 'Cerrada'])}</div>
        <div class="switch"><b>Galería "Ver diseños"</b><span class="state">${estado.galeria === 'si' ? 'habilitada' : 'deshabilitada'}</span>${seg('GALERIA', ['no', 'si'], ['Deshabilitada', 'Habilitada'])}</div>
        <div class="switch"><b>Ronda B · diseño completo</b><span class="state">${estado.rondaB}</span>${seg('RONDA_B', ['no_iniciada', 'abierta', 'cerrada'], ['Sin iniciar', 'Abierta', 'Cerrada'])}</div>
      </div>
      <div class="block"><h2>Ganador por consenso (ronda A)</h2><div class="grid" style="grid-template-columns:minmax(0,320px) minmax(0,1fr)"><div class="thumb" id="adminThumb">${thumbSVG(g, 'full')}</div><div class="block">${fichaHTML(g)}<div class="row"><button class="primary" type="button" id="expPng">Exportar PNG (alta resolución)</button><button class="ghost" type="button" id="expJson">Descargar paquete (JSON del diseño)</button></div><p class="hint">El paquete de capas completo se genera con <code>pipeline/export_ganador.py</code> a partir del JSON.</p></div></div></div>
      ${empates.length ? `<div class="block"><h2>Empates por resolver</h2>${empates.map(([q, ops]) => `<div class="row"><span>${html(Q(q).nombre)}:</span><div class="seg">${ops.map(o => `<button type="button" data-des="${q}" data-op="${o}" aria-pressed="${(A.desempates || {})[q] === o}">${html(nombreOpcion(q, o))}</button>`).join('')}</div></div>`).join('')}</div>` : '<p class="hint">No hay empates en la ronda A.</p>'}
      <div class="block"><h2>Podio ronda B</h2>${podio ? `<div class="cards">${podio}</div>` : '<p class="hint">Aún no hay votos por diseño.</p>'}</div>
      <div class="block"><h2>Votos ronda A</h2><div class="row"><button class="ghost" type="button" data-csv="A">Exportar CSV ronda A</button><button class="ghost" type="button" data-csv="B">Exportar CSV ronda B</button></div><div class="wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Fecha</th><th>Elecciones</th><th></th></tr></thead><tbody>${tablaA || '<tr><td colspan="4">Sin votos</td></tr>'}</tbody></table></div></div>
      <div class="block"><h2>Votos ronda B</h2><div class="wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Fecha</th><th>Diseño</th><th></th></tr></thead><tbody>${tablaB || '<tr><td colspan="4">Sin votos</td></tr>'}</tbody></table></div></div>
      <div class="block"><h2>Colaboradores</h2><div class="wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Ronda A</th><th>Ronda B</th></tr></thead><tbody>${v.colaboradores.map(c => `<tr><td>${html(c.nombre)}</td><td>${c.votoA ? 'Votó' : '—'}</td><td>${c.votoB ? 'Votó' : '—'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="row"><button class="ghost" type="button" id="adminRefrescar">Actualizar</button><button class="ghost" type="button" id="adminCerrar">Salir del panel</button><button class="danger" type="button" id="adminReset">Borrar todos los votos…</button></div>`;
    p.querySelectorAll('[data-prop]').forEach(b => { b.onclick = async () => { const r2 = await API.admin({ op: 'set', clavePropiedad: b.dataset.prop, valor: b.dataset.val }); if (r2.ok) { toast('Guardado'); verAdmin(); } else toast(r2.mensaje || 'Error'); }; });
    p.querySelectorAll('[data-anular]').forEach(b => { b.onclick = async () => { if (!confirm('¿Anular este voto? La persona podrá volver a votar.')) return; const r2 = await API.admin({ op: 'anular', votoId: b.dataset.anular }); toast(r2.ok ? 'Voto anulado' : (r2.mensaje || 'Error')); verAdmin(); }; });
    p.querySelectorAll('[data-des]').forEach(b => { b.onclick = async () => { const r2 = await API.admin({ op: 'desempate', pregunta: b.dataset.des, opcion: b.getAttribute('aria-pressed') === 'true' ? '' : b.dataset.op }); if (r2.ok) verAdmin(); }; });
    p.querySelectorAll('[data-csv]').forEach(b => { b.onclick = async () => { const r2 = await API.admin({ op: 'csv', ronda: b.dataset.csv }); if (!r2.ok) return toast('Error'); descargar(r2.nombre, new Blob(['﻿' + r2.csv], { type: 'text/csv;charset=utf-8' })); }; });
    $('adminRefrescar').onclick = () => verAdmin();
    $('adminCerrar').onclick = () => { SES.admin = ''; location.hash = ''; salirAdmin(); };
    $('adminReset').onclick = async () => { const t = prompt('Esto borra todos los votos y marcas. Escribe BORRAR TODO para confirmar.'); if (t === null) return; const r2 = await API.admin({ op: 'reiniciar', confirmar: t }); toast(r2.ok ? 'Votos borrados' : (r2.mensaje || 'No se borró')); verAdmin(); };
    $('expJson').onclick = () => descargar('aurora-ganadora.json', new Blob([JSON.stringify({ version: CAT.version, diseno: g, resultados: { participacion: A.participacion, ganador: A.ganador, desempates: A.desempates, podioB: B.podio } }, null, 2)], { type: 'application/json' }));
    $('expPng').onclick = async () => { toast('Generando PNG…'); try { const blob = await exportarPNG(g, 3); descargar('aurora-ganadora.png', blob); } catch (e) { toast('No se pudo exportar: ' + e.message); } };
  }
  function descargar(nombre, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  async function exportarPNG(st, escala) {
    // Serializa el SVG con las imágenes embebidas (data URI) y lo dibuja en un canvas: mismas capas, mismo tinte.
    const b = window.AuroraCompose.build(st, 'x'); const vb = window.AuroraCompose.viewBox(st, 'full').split(' ').map(Number);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb.join(' ')}" width="${vb[2] * escala}" height="${vb[3] * escala}">${b.svg}</svg>`;
    const hrefs = [...new Set([...svg.matchAll(/href="([^"]+\.webp)"/g)].map(m => m[1]))];
    for (const h of hrefs) { const blob = await (await fetch(h)).blob(); const data = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); svg = svg.split(`href="${h}"`).join(`href="${data}"`); }
    const img = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG no cargó')); img.src = url; });
    try { await img.decode(); } catch (e) {}
    await new Promise(r => setTimeout(r, 600));
    const c = document.createElement('canvas'); c.width = Math.round(vb[2] * escala); c.height = Math.round(vb[3] * escala); const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
    await new Promise(r => setTimeout(r, 400)); ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }

  /* ---------- arranque ---------- */
  async function salirAdmin() { if (SES.token && await cargarEstado()) entrar(); else show('s-acceso'); }
  function route() { if (location.hash === '#admin') return verAdmin(); if (screen === 's-admin') salirAdmin(); }
  window.addEventListener('hashchange', route);
  (async () => {
    if (API.demo) { $('demoNote').hidden = false; $('demoNote').innerHTML = '<span class="demo-banner">Modo demostración: no hay servidor configurado (config.js). Los votos se guardan solo en este navegador. Clave del panel: <b>demo</b>.</span>'; }
    if (location.hash === '#admin') return verAdmin();
    if (SES.token && await cargarEstado()) entrar(); else show('s-acceso');
  })();
})();
