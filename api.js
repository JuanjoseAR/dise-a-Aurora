/* Cliente de la API. Si window.API_URL está vacío, usa un modo demostración local (solo para probar la página). */
(function () {
  const URL = window.API_URL || '';
  const SES = {
    get token() { try { return sessionStorage.getItem('aurora.token') || ''; } catch (e) { return ''; } },
    set token(v) { try { sessionStorage.setItem('aurora.token', v); } catch (e) {} },
    get colab() { try { return JSON.parse(localStorage.getItem('aurora.colab') || 'null'); } catch (e) { return null; } },
    set colab(v) { try { localStorage.setItem('aurora.colab', JSON.stringify(v)); } catch (e) {} },
    get admin() { try { return sessionStorage.getItem('aurora.admin') || ''; } catch (e) { return ''; } },
    set admin(v) { try { sessionStorage.setItem('aurora.admin', v); } catch (e) {} }
  };
  async function real(body) {
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    return r.json();
  }
  /* ----- modo demostración: misma forma de respuestas, datos en localStorage, sin seguridad real ----- */
  const demo = {
    db() { try { return JSON.parse(localStorage.getItem('aurora.demo') || 'null') || { estado: { rondaA: 'abierta', galeria: 'no', rondaB: 'no_iniciada' }, votosA: [], votosB: [], desempates: {} }; } catch (e) { return { estado: { rondaA: 'abierta', galeria: 'no', rondaB: 'no_iniciada' }, votosA: [], votosB: [], desempates: {} }; } },
    save(d) { localStorage.setItem('aurora.demo', JSON.stringify(d)); },
    async call(b) {
      const d = this.db(), col = window.COLABORADORES;
      const voted = (lista, id) => lista.some(v => !v.anulado && String(v.colaboradorId) === String(id));
      const mark = c => ({ id: c.id, nombre: c.nombre, votoA: voted(d.votosA, c.id), votoB: voted(d.votosB, c.id) });
      const YA = { ok: false, error: 'ya_voto', mensaje: 'Ya hay un voto registrado con este nombre. Si no fuiste tú, avisa al organizador.' };
      switch (b.action) {
        case 'acceso': return b.codigo.trim().toLowerCase() === 'ccsm-diseñoaurora4.0' ? { ok: true, token: 'demo', estado: d.estado } : { ok: false, error: 'codigo', mensaje: 'Código de acceso incorrecto.' };
        case 'estado': return { ok: true, estado: d.estado, colaboradores: col.map(mark) };
        case 'votar': {
          if (d.estado.rondaA !== 'abierta') return { ok: false, error: 'cerrada', mensaje: 'La votación está cerrada.' };
          if (voted(d.votosA, b.colaboradorId)) return YA;
          const c = col.find(x => String(x.id) === String(b.colaboradorId)); if (!c) return { ok: false, error: 'invalido', mensaje: 'Elige tu nombre de la lista.' };
          const v = { votoId: 'A-' + Math.random().toString(16).slice(2, 8), colaboradorId: c.id, nombre: c.nombre, fecha: new Date().toISOString(), eleccion: b.eleccion, anulado: false };
          d.votosA.push(v); this.save(d); return { ok: true, votoId: v.votoId };
        }
        case 'resultadosA': if (!voted(d.votosA, b.colaboradorId)) return { ok: false, error: 'sin_voto', mensaje: 'Los resultados se ven después de votar.' }; return Object.assign({ ok: true, estado: d.estado }, this.resA(d));
        case 'galeria': if (d.estado.galeria !== 'si') return { ok: false, error: 'galeria_cerrada', mensaje: 'La galería aún no está habilitada.' };
          return { ok: true, estado: d.estado, disenos: d.votosA.filter(v => !v.anulado).map(v => ({ disenoId: v.votoId, eleccion: v.eleccion })), disenosPropios: d.votosA.filter(v => !v.anulado && String(v.colaboradorId) === String(b.colaboradorId)).map(v => v.votoId) };
        case 'votarB': {
          if (d.estado.rondaB !== 'abierta') return { ok: false, error: 'cerrada', mensaje: 'La ronda de diseños no está abierta.' };
          const c = col.find(x => String(x.id) === String(b.colaboradorId)); if (!c) return { ok: false, error: 'invalido', mensaje: 'Elige tu nombre de la lista.' };
          const dis = d.votosA.find(v => !v.anulado && v.votoId === b.disenoId); if (!dis) return { ok: false, error: 'invalido', mensaje: 'Ese diseño no existe o fue anulado.' };
          if (String(dis.colaboradorId) === String(c.id)) return { ok: false, error: 'propio', mensaje: 'No puedes votar por tu propio diseño.' };
          if (voted(d.votosB, c.id)) return YA;
          d.votosB.push({ votoId: 'B-' + Math.random().toString(16).slice(2, 8), colaboradorId: c.id, nombre: c.nombre, fecha: new Date().toISOString(), disenoId: b.disenoId, anulado: false }); this.save(d); return { ok: true };
        }
        case 'resultadosB': if (!voted(d.votosB, b.colaboradorId)) return { ok: false, error: 'sin_voto', mensaje: 'Los resultados se ven después de votar.' }; return Object.assign({ ok: true, estado: d.estado }, this.resB(d));
        case 'admin': {
          if (b.clave !== 'demo') return { ok: false, error: 'admin', mensaje: 'Clave de administración incorrecta (en demostración es: demo).' };
          if (b.op === 'estado') return { ok: true, estado: d.estado, resultadosA: this.resA(d), resultadosB: this.resB(d) };
          if (b.op === 'set') { d.estado[{ RONDA_A: 'rondaA', GALERIA: 'galeria', RONDA_B: 'rondaB' }[b.clavePropiedad]] = b.valor; this.save(d); return { ok: true, estado: d.estado }; }
          if (b.op === 'votos') return { ok: true, votosA: d.votosA, votosB: d.votosB, colaboradores: col.map(mark) };
          if (b.op === 'anular') { const v = d.votosA.concat(d.votosB).find(x => x.votoId === b.votoId); if (v) v.anulado = true; this.save(d); return { ok: !!v }; }
          if (b.op === 'csv') { const rows = b.ronda === 'B' ? d.votosB : d.votosA; return { ok: true, nombre: 'votos_demo.csv', csv: rows.map(r => [r.votoId, r.nombre, r.fecha, JSON.stringify(r.eleccion || r.disenoId)].join(',')).join('\n') }; }
          if (b.op === 'desempate') { if (b.opcion) d.desempates[b.pregunta] = b.opcion; else delete d.desempates[b.pregunta]; this.save(d); return { ok: true, desempates: d.desempates }; }
          if (b.op === 'reiniciar') { if (b.confirmar !== 'BORRAR TODO') return { ok: false, error: 'invalido', mensaje: 'Escribe BORRAR TODO para confirmar.' }; localStorage.removeItem('aurora.demo'); return { ok: true }; }
          return { ok: false, error: 'accion' };
        }
        default: return { ok: false, error: 'accion' };
      }
    },
    resA(d) {
      const P = window.CATALOGO.preguntas.map(p => p.id);
      const lista = d.votosA.filter(v => !v.anulado), conteo = {}, dis = {}; P.forEach(k => conteo[k] = {});
      lista.forEach(v => { const e = v.eleccion; P.forEach(k => (k === 'detalles' ? (e.detalles.length ? e.detalles : ['ninguno']) : [e[k]]).forEach(x => { if (x) conteo[k][x] = (conteo[k][x] || 0) + 1; })); const s = JSON.stringify(e); if (!dis[s]) dis[s] = { n: 0, eleccion: e, ejemplo: v.votoId }; dis[s].n++; });
      const ganador = {}, empates = {};
      P.forEach(k => { const pares = Object.entries(conteo[k]).sort((a, b) => b[1] - a[1]); if (!pares.length) { ganador[k] = null; return; } const top = pares.filter(p => p[1] === pares[0][1]); if (top.length > 1) empates[k] = top.map(p => p[0]); ganador[k] = d.desempates[k] && conteo[k][d.desempates[k]] === pares[0][1] ? d.desempates[k] : pares[0][0]; });
      { const det = Object.entries(conteo.detalles).sort((a, b) => b[1] - a[1]); ganador.detalles = det.length && det[0][0] === 'ninguno' ? ['ninguno'] : det.filter(p => p[0] !== 'ninguno').slice(0, 2).filter(p => p[1] / lista.length >= .25).map(p => p[0]); }
      return { participacion: { votos: lista.length, colaboradores: window.COLABORADORES.length }, conteo, ganador, empates, desempates: d.desempates, top3: Object.values(dis).sort((a, b) => b.n - a.n).slice(0, 3) };
    },
    resB(d) {
      const vb = d.votosB.filter(v => !v.anulado), c = {}; vb.forEach(v => c[v.disenoId] = (c[v.disenoId] || 0) + 1);
      return { participacion: { votos: vb.length, colaboradores: window.COLABORADORES.length }, podio: Object.entries(c).map(([id, n]) => ({ disenoId: id, n, eleccion: (d.votosA.find(v => v.votoId === id) || {}).eleccion || null })).sort((a, b) => b.n - a.n) };
    }
  };
  window.API = {
    demo: !URL, SES,
    call: body => (URL ? real(body) : demo.call(body)),
    withToken: body => window.API.call(Object.assign({ token: SES.token }, body)),
    admin: body => window.API.call(Object.assign({ action: 'admin', clave: SES.admin }, body))
  };
})();
