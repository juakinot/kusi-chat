/* Kusi Chat · interfaz del MVP1 (chat del agricultor + panel del técnico).
 * Datos de agricultores, respuestas y validación del técnico: SIMULADOS [SU]. */
(function () {
  'use strict';
  var E = window.KusiEngine;
  var LS = 'kusi-chat-mvp1-v2';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var fmt = function (iso) { try { return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return iso; } };
  var signo = function (n) { return (n > 0 ? '+' : '') + n; };

  /* Agricultores simulados por zona: días desde la siembra [SU]. */
  var SIMS = {
    huancayo: [18, 35, 48, 60, 72, 85, 95, 110, 130, 155],
    jauja: [22, 40, 58, 66, 80, 98, 125, 140],
    junin: [15, 30, 45, 62, 88, 105],
    puno: [20, 38, 52, 64, 78, 100, 128, 150]
  };

  /* ---------- Estado ---------- */
  function haceDias(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }
  function seed() {
    var z = {
      huancayo: E.nuevaZona({ offset: 3, respuestas: 18,
        ajustes: [{ cuando: haceDias(6), delta: 3, n: 6, tarde: 5, temprano: 0, pregunta: 'q2' }],
        validada: { por: 'Técnico (simulado)', en: haceDias(4), offset: 3 } }),
      jauja: E.nuevaZona({ offset: 3, respuestas: 11,
        ajustes: [{ cuando: haceDias(2), delta: 3, n: 5, tarde: 4, temprano: 0, pregunta: 'q2' }] }),
      junin: E.nuevaZona({ respuestas: 2, cal: { n: 2, tarde: 1, temprano: 0 } }),
      puno: E.nuevaZona({ respuestas: 0 })
    };
    return { zones: z, N: 5, clima: 'auto', farmer: null, consejos: [], casos: [], log: [
      { cuando: haceDias(6), zona: 'huancayo', texto: 'Ajuste de zona +3 días (datos simulados [SU])' },
      { cuando: haceDias(4), zona: 'huancayo', texto: 'Zona validada por técnico (simulado)' },
      { cuando: haceDias(2), zona: 'jauja', texto: 'Ajuste de zona +3 días (datos simulados [SU])' }
    ], seq: 0, casoSeq: 0 };
  }
  function load() { try { var x = localStorage.getItem(LS); return x ? JSON.parse(x) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { /* sin almacenamiento: sigue funcionando en memoria */ } }
  var S = load() || seed();
  var view = { sub: 'zonas', sel: null, openZone: null };
  var zonaInfo = function (id) { return E.ZONES.filter(function (z) { return z.id === id; })[0]; };

  /* ---------- Clima ---------- */
  function getForecast(zone) {
    if (S.clima !== 'auto') return Promise.resolve(E.escenario(S.clima));
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 6000);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + zone.lat + '&longitude=' + zone.lon +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max' +
      '&hourly=relative_humidity_2m&timezone=America%2FLima&forecast_days=5';
    return fetch(url, { signal: ctrl.signal }).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      var dias = j.daily.time.map(function (f, i) {
        var hrs = (j.hourly.relative_humidity_2m || []).slice(i * 24, i * 24 + 24).filter(function (v) { return v != null; });
        var hr = hrs.length ? hrs.reduce(function (a, b) { return a + b; }, 0) / hrs.length : 70;
        var n = function (v, d) { return v == null ? d : v; };
        return { fecha: f, tmin: n(j.daily.temperature_2m_min[i], 5), tmax: n(j.daily.temperature_2m_max[i], 17),
          lluvia: n(j.daily.precipitation_sum[i], 0), prob: n(j.daily.precipitation_probability_max[i], 0), hr: hr };
      });
      if (!dias.length) throw new Error('sin datos');
      return { fuente: 'Open-Meteo (pronóstico real)', consultado: new Date().toISOString(), dias: dias };
    }).catch(function () {
      clearTimeout(t);
      var f = E.escenario('tranquilo');
      f.fuente = 'Pronóstico de ejemplo: no hubo conexión con Open-Meteo [SU]';
      return f;
    });
  }

  /* ---------- Chat ---------- */
  var msgs = $('#messages'), chipsBox = $('#chips'), freeForm = $('#freeform'), freeInput = $('#free');
  var onFree = null, runId = 0;

  function add(cls, html) {
    var d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
  }
  var bot = function (h) { return add('bot', h); };
  var me = function (t) { return add('me', esc(t)); };
  function typing() { return add('bot typing', '<span class="dots"><i></i><i></i><i></i></span>'); }
  var NUNCA = function () { return new Promise(function () { }); }; // detiene una conversación anterior tras "Empezar"
  function botTyping(html, ms) {
    var r = runId, t = typing();
    return sleep(ms || 550).then(function () { t.remove(); if (r !== runId) return NUNCA(); return bot(html); });
  }
  function chipBtn(o, done) {
    var b = document.createElement('button'); b.type = 'button';
    b.className = 'chip' + (o.cls ? ' ' + o.cls : ''); b.textContent = o.label;
    b.onclick = function () { chipsBox.innerHTML = ''; onFree = null; me(o.label); done(o.value); };
    return b;
  }
  function ask(options) {
    return new Promise(function (res) {
      chipsBox.innerHTML = '';
      options.forEach(function (o) { chipsBox.appendChild(chipBtn(o, res)); });
      onFree = function (txt) { chipsBox.innerHTML = ''; onFree = null; me(txt); res({ free: txt }); };
      var first = chipsBox.querySelector('button'); if (first && window.matchMedia('(min-width:1000px)').matches) first.focus({ preventScroll: true });
    });
  }
  /* Pregunta con botones; si la persona escribe algo libre, se deriva a un técnico y se vuelve a preguntar. */
  function pick(options) {
    return ask(options).then(function (v) {
      if (v && typeof v === 'object' && v.free !== undefined) {
        return derivar(v.free).then(function () { return pick(options); });
      }
      return v;
    });
  }
  function askDate() {
    return new Promise(function (res) {
      chipsBox.innerHTML = '';
      var box = document.createElement('div'); box.className = 'datebox';
      var inp = document.createElement('input'); inp.type = 'date'; inp.setAttribute('aria-label', 'Fecha de siembra');
      var hoy = new Date(); inp.max = hoy.toISOString().slice(0, 10);
      var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'chip'; ok.textContent = 'Listo';
      ok.onclick = function () {
        if (!inp.value) return;
        var dias = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(inp.value + 'T00:00:00')) / 86400000);
        if (dias < 0 || dias > 300) { inp.value = ''; inp.focus(); return; }
        chipsBox.innerHTML = ''; me('Sembré el ' + inp.value.split('-').reverse().join('/')); res(dias);
      };
      box.appendChild(inp); box.appendChild(ok); chipsBox.appendChild(box);
    });
  }

  function crearCaso(motivo, detalle) {
    S.casoSeq += 1;
    var f = S.farmer;
    S.casos.unshift({ id: 'K-' + String(S.casoSeq).padStart(3, '0'), cuando: new Date().toISOString(), zona: f ? f.zonaId : null,
      agricultor: 'Tú (demo)', motivo: motivo, detalle: detalle || '', estado: 'Pendiente' });
    save(); renderPanel();
  }
  function categoria(txt) {
    var t = txt.toLowerCase();
    if (/mancha|negr|ranch|podrid|pudr/.test(t)) return 'Posible enfermedad (manchas o pudrición)';
    if (/gusano|plaga|insect|gorgojo|polilla|come/.test(t)) return 'Posible plaga';
    if (/amarill|seca|marchit/.test(t)) return 'Hojas amarillas o secas';
    if (/helada|frio|frío|hielo/.test(t)) return 'Posible daño por frío';
    return 'Consulta fuera de las reglas del sistema';
  }
  function derivar(txt) {
    var motivo = categoria(txt);
    crearCaso(motivo, txt);
    return botTyping('Gracias por contarme: <b>' + esc(motivo.toLowerCase()) + '</b>. Desde aquí no puedo asegurar qué es y <b>no quiero darte un consejo equivocado</b>. ' +
      'Ya lo anoté para que <b>un técnico de tu zona lo revise</b>. Mientras tanto, toma una foto de la planta para mostrársela.', 700);
  }

  function speak(text) {
    try {
      var s = window.speechSynthesis; s.cancel();
      var u = new SpeechSynthesisUtterance(text);
      var v = s.getVoices().filter(function (x) { return /^es/i.test(x.lang); });
      var pref = v.filter(function (x) { return /PE|MX|US|419/i.test(x.lang); })[0] || v[0];
      if (pref) u.voice = pref; u.lang = pref ? pref.lang : 'es-ES'; u.rate = 0.9; s.speak(u);
    } catch (e) { /* sin voz disponible */ }
  }

  function porQue(entry) {
    var aj = entry.offset !== 0 ? 'Desfase de ' + signo(entry.offset) + ' días, basado en ' + entry.nResp + ' respuestas de agricultores de la zona.' : 'Sin ajuste: se usa la regla general.';
    var val = entry.validadaPor ? 'Validada por ' + esc(entry.validadaPor) + '.' : 'Aún sin validar por un técnico.';
    return '<dl><dt>Registro</dt><dd>' + entry.id + '</dd>' +
      '<dt>Regla</dt><dd>' + entry.regla.id + ' · ' + esc(entry.regla.nombre) + '</dd>' +
      '<dt>Se aplica si</dt><dd>' + esc(entry.regla.umbral) + '</dd>' +
      '<dt>Tus datos</dt><dd>' + esc(entry.datos) + '</dd>' +
      '<dt>Clima</dt><dd>' + esc(entry.clima.fuente) + '</dd>' +
      '<dt>Tu zona</dt><dd>' + aj + '</dd>' +
      '<dt>Confianza</dt><dd>Nivel ' + entry.nivel + ' · ' + E.NIVEL_TEXTO[entry.nivel] + '. ' + val + '</dd>' +
      '<dt>Fuente técnica</dt><dd>' + esc(entry.regla.fuente) + '</dd></dl>';
  }

  var F = null; // agricultor en la conversación

  function consejo() {
    var zi = zonaInfo(F.zonaId), zs = S.zones[F.zonaId];
    var r0 = runId, t = typing();
    return getForecast(zi).then(function (fc) {
      return sleep(500).then(function () {
        t.remove();
        if (r0 !== runId) return NUNCA();
        var r = E.evaluar(F.das, zs.offset, fc);
        var nivel = E.nivelZona(zs);
        S.seq += 1;
        var entry = {
          id: 'C-' + String(S.seq).padStart(4, '0'), cuando: new Date().toISOString(), agricultor: 'Tú (demo)', zona: F.zonaId,
          das: F.das, etapa: r.etapa.nombre, diasEfectivos: r.diasEfectivos, offset: zs.offset, nivel: nivel,
          nResp: zs.ajustes.reduce(function (a, x) { return a + x.n; }, 0),
          regla: r.regla, datos: r.datos, mensaje: r.mensaje,
          clima: { fuente: fc.fuente, consultado: fc.consultado || null },
          validadaPor: zs.validada ? zs.validada.por : null
        };
        S.consejos.unshift(entry); S.consejos = S.consejos.slice(0, 60); save(); renderPanel();
        var node = bot('<div class="advice">' +
          '<div class="adv-head"><span class="lvl lvl' + nivel + '">' + E.NIVEL_TEXTO[nivel] + '</span>' +
          '<span>Tu papa está en: <b>' + esc(r.etapa.nombre) + '</b> · día ' + F.das + '</span></div>' +
          '<p class="adv-text">' + esc(r.mensaje) + '</p>' +
          '<div class="adv-actions">' + (window.speechSynthesis ? '<button type="button" data-say>🔊 Escuchar</button>' : '') +
          '<button type="button" data-why>¿De dónde sale?</button></div>' +
          '<div class="why" hidden>' + porQue(entry) + '</div>' +
          (nivel === 1 ? '<small>Esta es una guía general: tu zona aún no tiene ajustes con respuestas de agricultores.</small>' : '') +
          '</div>');
        var say = node.querySelector('[data-say]'); if (say) say.onclick = function () { speak(r.mensaje); };
        node.querySelector('[data-why]').onclick = function () { var w = node.querySelector('.why'); w.hidden = !w.hidden; msgs.scrollTop = msgs.scrollHeight; };
        return entry;
      });
    });
  }

  function seguimiento() {
    var zs = S.zones[F.zonaId];
    var q = E.preguntaPara(F.das, zs.offset);
    if (!q) {
      return botTyping('Una pregunta más: <b>¿tus plantas se ven sanas y parejas?</b>').then(function () {
        return pick([{ label: '✅ Sí, se ven bien', value: 'si' }, { label: '⚠️ Veo algo raro', value: 'no' }]);
      }).then(function (a) {
        if (a === 'si') return botTyping('¡Qué bueno! Sigue con lo indicado y vuelve a escribirme la próxima semana.');
        return botTyping('Cuéntame qué ves:').then(function () {
          return pick([{ label: '🍂 Manchas en las hojas', value: 'manchas en las hojas' }, { label: '🟡 Hojas amarillas o secas', value: 'hojas amarillas o secas' },
            { label: '🐛 Insectos o gusanos', value: 'insectos o gusanos en las plantas' }, { label: '❓ Otra cosa', value: 'otra consulta' }]);
        }).then(function (m) { return derivar(m); });
      });
    }
    return botTyping('Para mejorar los consejos de tu zona: <b>' + q.texto + '</b>').then(function () {
      return pick([{ label: '✅ Sí', value: 'si' }, { label: '❌ Todavía no', value: 'no' }, { label: '🤷 No sé', value: 'ns', cls: 'ghost' }]);
    }).then(function (a) {
      if (a === 'ns') return botTyping('No hay problema. Cuando lo veas, me cuentas.');
      var res = E.registrarRespuesta(zs, q.id, F.das, a, S.N);
      S.log.unshift({ cuando: new Date().toISOString(), zona: F.zonaId, texto: 'Respuesta de “Tú (demo)”: ' + (a === 'si' ? 'sí' : 'todavía no') + ' · ' + q.texto });
      if (res.ajustado) S.log.unshift({ cuando: new Date().toISOString(), zona: F.zonaId, texto: 'Ajuste de zona ' + signo(res.delta) + ' días por respuestas que contradicen la regla' });
      save(); renderPanel();
      return botTyping('¡Gracias! Tu respuesta ayuda a mejorar los consejos de <b>tu zona</b>.' +
        (res.ajustado ? '<br><small>Con las respuestas de varios agricultores, la zona se ajustó.</small>' : ''));
    });
  }

  function menu(id) {
    return pick([
      { label: '🔄 Ver el consejo otra vez', value: 'again' },
      { label: '🧑‍🌾 Hablar con un técnico', value: 'tec' },
      { label: '✏️ Cambiar mis datos', value: 'edit', cls: 'ghost' },
      { label: '🧹 Empezar de nuevo', value: 'reset', cls: 'ghost' }
    ]).then(function (v) {
      if (id !== runId) return;
      if (v === 'again') return consejo().then(function () { return menu(id); });
      if (v === 'tec') { crearCaso('Solicitud del agricultor', 'Pidió hablar con un técnico'); return botTyping('Listo. Avisé a un técnico de tu zona para que te contacte.').then(function () { return menu(id); }); }
      if (v === 'edit') return registro(id);
      if (v === 'reset') return flow();
    });
  }

  function registro(id) {
    F = { cultivo: 'papa', das: null, zonaId: null };
    return botTyping('<span class="step">Paso 1 de 3</span> ¿Qué cultivo tienes sembrado?').then(function () {
      return (function cultivo() {
        return pick([{ label: '🥔 Papa', value: 'papa' }, { label: 'Otro cultivo', value: 'otro', cls: 'ghost' }]).then(function (v) {
          if (v === 'otro') {
            crearCaso('Cultivo aún no cubierto', 'Pidió ayuda con otro cultivo');
            return botTyping('Por ahora te ayudo con <b>papa</b>. Anoté tu cultivo para sumarlo pronto. Si tienes papa, toca el botón.').then(cultivo);
          }
        });
      })();
    }).then(function () {
      return botTyping('<span class="step">Paso 2 de 3</span> ¿Hace cuánto sembraste?');
    }).then(function () {
      return pick([{ label: 'Hace 2 semanas', value: 15 }, { label: 'Hace 1 mes', value: 30 }, { label: 'Hace 2 meses', value: 60 },
        { label: 'Hace 3 meses', value: 90 }, { label: 'Hace 4 meses', value: 120 }, { label: 'Hace 5 meses o más', value: 155 },
        { label: '📅 Elegir fecha', value: 'fecha', cls: 'ghost' }]);
    }).then(function (v) {
      if (v === 'fecha') return botTyping('Elige la fecha en que sembraste:', 300).then(askDate);
      return v;
    }).then(function (dias) {
      F.das = dias;
      return botTyping('<span class="step">Paso 3 de 3</span> ¿En qué zona está tu chacra?');
    }).then(function () {
      return (function zona() {
        var opts = E.ZONES.map(function (z) { return { label: z.nombre + ' (' + z.alt + ')', value: z.id }; });
        opts.push({ label: '❓ No sé cuál elegir', value: 'ayuda', cls: 'ghost' });
        return pick(opts).then(function (v) {
          if (v === 'ayuda') return botTyping('Elige el valle o la meseta más <b>cerca de tu chacra</b>. Si dudas, elige <b>Valle del Mantaro</b>; un técnico lo puede corregir después.').then(zona);
          return v;
        });
      })();
    }).then(function (zid) {
      F.zonaId = zid;
      S.farmer = { zonaId: zid, das: F.das }; save(); renderPanel();
      var zi = zonaInfo(zid);
      return botTyping('Gracias. Tienes papa sembrada hace <b>' + F.das + ' días</b> en <b>' + esc(zi.nombre) + '</b>. Reviso tu etapa y el clima de los próximos días…', 600);
    }).then(consejo).then(seguimiento).then(function () { return menu(id); });
  }

  function flow() {
    runId += 1; var id = runId; onFree = null;
    msgs.innerHTML = ''; chipsBox.innerHTML = '';
    return botTyping('<b>¡Hola! Soy Kusi</b> 🌱, tu ayudante para la chacra. Te haré <b>3 preguntas cortas</b>. Solo toca los botones.', 450)
      .then(function () {
        return botTyping('<small>Para darte consejos, guardo <b>tu zona, tu cultivo y tus respuestas</b>. Solo los uso para ayudarte y para mejorar los consejos de tu zona (Ley 29733). Si sigues, aceptas.</small>', 500);
      })
      .then(function () {
        return (function consentimiento() {
          return pick([{ label: '✅ Acepto, continuar', value: 'si' }, { label: 'No acepto', value: 'no', cls: 'ghost' }]).then(function (v) {
            if (v === 'si') return;
            return botTyping('Entiendo. Sin tu permiso no guardo datos. Si cambias de idea, toca el botón.').then(consentimiento);
          });
        })();
      })
      .then(function () { return registro(id); });
  }

  freeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = freeInput.value.trim(); if (!t) return;
    freeInput.value = '';
    if (onFree) onFree(t); else { me(t); derivar(t); }
  });
  $('#restart').onclick = function () { flow(); };

  /* ---------- Panel ---------- */
  var SUBS = [['zonas', 'Zonas'], ['resumen', 'Resumen para el Estado'], ['consejos', 'Consejos y trazabilidad'], ['casos', 'Casos derivados'], ['reglas', 'Reglas'], ['demo', 'Demostración']];
  function agricultoresEn(zid) { return SIMS[zid].length + (S.farmer && S.farmer.zonaId === zid ? 1 : 0); }
  function pendientes() { return S.casos.filter(function (c) { return c.estado === 'Pendiente'; }).length; }

  function renderPanel() {
    var tabs = $('#subtabs'); tabs.innerHTML = '';
    SUBS.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = s[1] + (s[0] === 'casos' && pendientes() ? ' (' + pendientes() + ')' : '');
      if (view.sub === s[0]) b.className = 'on';
      b.onclick = function () { view.sub = s[0]; renderPanel(); };
      tabs.appendChild(b);
    });
    var badge = $('#badge'); var p = pendientes(); badge.hidden = !p; badge.textContent = p;
    var body = $('#panel-body');
    ({ zonas: vZonas, resumen: vResumen, consejos: vConsejos, casos: vCasos, reglas: vReglas, demo: vDemo })[view.sub](body);
  }

  function vZonas(body) {
    var html = '<p class="note">Cada zona combina cultivo, altitud y provincia. El nivel de confianza sube cuando las respuestas de los agricultores ajustan la regla (nivel 2) y un técnico la valida (nivel 3). Cantidad mínima de respuestas para ajustar: <b>' + S.N + ' [SU]</b>.</p><div class="grid">';
    E.ZONES.forEach(function (zi) {
      var z = S.zones[zi.id], n = E.nivelZona(z), pct = Math.min(100, Math.round(100 * z.cal.n / S.N));
      html += '<article class="zcard"><header><div><h3>' + esc(zi.nombre) + '</h3><p class="muted">' + esc(zi.lugar) + ' · ' + zi.alt + ' · papa</p></div>' +
        '<span class="lvl lvl' + n + '">Nivel ' + n + ' · ' + E.NIVEL_TEXTO[n] + '</span></header>' +
        '<div class="kv"><div><b>' + agricultoresEn(zi.id) + '</b><span>agricultores</span></div><div><b>' + z.respuestas + '</b><span>respuestas</span></div><div><b>' + signo(z.offset) + '</b><span>días de desfase</span></div></div>' +
        '<div><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><p class="muted">Muestra hacia el próximo ajuste: ' + z.cal.n + ' de ' + S.N + ' respuestas' + contradiccion(z) + '</p></div>' +
        '<div class="acts"><button class="btn" data-sim="' + zi.id + '">Simular 6 respuestas que contradicen la regla</button>' +
        '<button class="btn primary" data-val="' + zi.id + '"' + (n !== 2 ? ' disabled' : '') + ' title="' + (n === 3 ? 'Ya está validada' : n === 1 ? 'Primero la zona necesita un ajuste por respuestas' : 'Simula la validación del técnico') + '">' + (n === 3 ? '✔ Validada' : 'Validar zona (técnico simulado)') + '</button></div>' +
        '<details><summary>Historial de ajustes y actividad</summary>' + historial(zi.id) + '</details>' +
        '<details><summary>Agricultores de la zona (simulados)</summary>' + tablaAgricultores(zi.id) + '</details></article>';
    });
    body.innerHTML = html + '</div>';
    body.querySelectorAll('[data-sim]').forEach(function (b) { b.onclick = function () { simular(b.getAttribute('data-sim')); }; });
    body.querySelectorAll('[data-val]').forEach(function (b) { b.onclick = function () { validar(b.getAttribute('data-val')); }; });
  }
  function contradiccion(z) {
    if (!z.cal.n) return '';
    var c = z.cal.tarde + z.cal.temprano, pc = Math.round(100 * c / z.cal.n);
    return '. Contradicen la regla: ' + c + ' de ' + z.cal.n + ' (' + pc + ' %; se ajusta con ≥ ' + Math.round(100 * E.UMBRAL_CONTRADICCION) + ' % [SU])';
  }
  function historial(zid) {
    var z = S.zones[zid], out = '';
    if (z.ajustes.length) {
      out += '<p class="muted">Ajustes aplicados:</p><ul>' + z.ajustes.map(function (a) {
        var q = E.QUESTIONS.filter(function (x) { return x.id === a.pregunta; })[0];
        var contra = a.delta > 0 ? a.tarde : a.temprano;
        return '<li>' + fmt(a.cuando) + ': ' + signo(a.delta) + ' días. ' + contra + ' de ' + a.n + ' respuestas contradecían la regla' + (q ? ' (“' + esc(q.texto) + '”)' : '') + '.</li>';
      }).join('') + '</ul>';
    } else out += '<p class="muted">Sin ajustes todavía: se usa la regla general.</p>';
    var ev = S.log.filter(function (l) { return l.zona === zid; }).slice(0, 6);
    if (ev.length) out += '<p class="muted">Actividad reciente:</p><ul>' + ev.map(function (l) { return '<li>' + fmt(l.cuando) + ': ' + esc(l.texto) + '</li>'; }).join('') + '</ul>';
    if (z.validada) out += '<p class="muted">Validada por ' + esc(z.validada.por) + ' el ' + fmt(z.validada.en) + ' (desfase ' + signo(z.validada.offset) + ' días).</p>';
    return out;
  }
  function tablaAgricultores(zid) {
    var z = S.zones[zid];
    var rows = SIMS[zid].map(function (d, i) {
      return '<tr><td>Sim-' + String(i + 1).padStart(2, '0') + '</td><td>' + d + '</td><td>' + esc(E.etapaPara(d, z.offset).etapa.nombre) + '</td></tr>';
    });
    if (S.farmer && S.farmer.zonaId === zid) rows.push('<tr><td>Tú (demo)</td><td>' + S.farmer.das + '</td><td>' + esc(E.etapaPara(S.farmer.das, z.offset).etapa.nombre) + '</td></tr>');
    return '<div class="tablewrap"><table><thead><tr><th>Agricultor</th><th>Días desde siembra</th><th>Etapa estimada (con ajuste)</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function simular(zid) {
    var z = S.zones[zid], q = E.QUESTIONS[1], ajustes = 0;
    for (var i = 0; i < 6; i++) {
      var r = E.registrarRespuesta(z, q.id, q.limite + z.offset + 8, 'no', S.N);
      if (r.ajustado) ajustes += 1;
    }
    S.log.unshift({ cuando: new Date().toISOString(), zona: zid, texto: 'Se simularon 6 respuestas “todavía no” a “' + q.texto + '” (datos simulados [SU])' });
    if (ajustes) S.log.unshift({ cuando: new Date().toISOString(), zona: zid, texto: 'Ajuste de zona ' + signo(E.PASO_AJUSTE) + ' días por respuestas que contradicen la regla' });
    save(); renderPanel();
  }
  function validar(zid) {
    E.validarZona(S.zones[zid], 'Técnico (simulado)');
    S.log.unshift({ cuando: new Date().toISOString(), zona: zid, texto: 'Zona validada por técnico (simulado)' });
    save(); renderPanel();
  }

  function vResumen(body) {
    var zs = E.ZONES.map(function (z) { return E.nivelZona(S.zones[z.id]); });
    var cal = zs.filter(function (n) { return n >= 2; }).length;
    var agr = E.ZONES.reduce(function (a, z) { return a + agricultoresEn(z.id); }, 0);
    var resp = E.ZONES.reduce(function (a, z) { return a + S.zones[z.id].respuestas; }, 0);
    var k = [[E.ZONES.length, 'zonas piloto'], [cal + ' de ' + E.ZONES.length, 'zonas calibradas (nivel 2 o 3)'], [zs.filter(function (n) { return n === 3; }).length, 'zonas validadas por técnico'],
      [agr, 'agricultores en la red (simulados)'], [resp, 'respuestas acumuladas'], [pendientes(), 'casos pendientes para el técnico']];
    body.innerHTML = '<p class="note">Vista para quien decide: dónde ya hay consejos calibrados, dónde falta mandar un técnico y qué casos esperan atención. Cifras de la demostración, simuladas [SU].</p>' +
      '<div class="grid">' + k.map(function (x) { return '<div class="zcard"><b style="font-size:28px">' + x[0] + '</b><span class="muted">' + x[1] + '</span></div>'; }).join('') + '</div>' +
      '<h3>Dónde mandar un técnico primero</h3><ul>' + E.ZONES.map(function (z) {
        var n = E.nivelZona(S.zones[z.id]);
        return '<li><b>' + esc(z.nombre) + '</b>: ' + (n === 1 ? 'guía general, sin ajustes. Prioridad alta para calibrar.' : n === 2 ? 'ajustada con respuestas, falta la validación de un técnico.' : 'validada por un técnico.') + '</li>';
      }).join('') + '</ul>' +
      '<h3>Indicadores que mediríamos en el piloto</h3><div class="tablewrap"><table><thead><tr><th>Indicador</th><th>Cómo se mide</th><th>Meta</th></tr></thead><tbody>' +
      '<tr><td>Adopción</td><td>% de agricultores registrados que vuelven a usar el servicio en las 2 semanas siguientes</td><td>A definir en el piloto</td></tr>' +
      '<tr><td>Cumplimiento</td><td>% que reporta haber hecho la acción recomendada (pregunta de seguimiento)</td><td>A definir en el piloto</td></tr>' +
      '<tr><td>Pérdidas evitadas</td><td>Comparar parcelas que siguieron los consejos con parcelas vecinas que no, en la misma zona y cultivo</td><td>A definir en el piloto</td></tr>' +
      '<tr><td>Cobertura calibrada</td><td>% de zonas en nivel 2 o 3</td><td>A definir en el piloto</td></tr>' +
      '<tr><td>Atención de casos</td><td>Tiempo entre que se deriva un caso y un técnico lo atiende</td><td>A definir en el piloto</td></tr></tbody></table></div>';
  }

  function csvCelda(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function descargarCSV() {
    var cab = ['registro', 'fecha', 'agricultor', 'zona', 'dias_desde_siembra', 'etapa', 'dias_con_ajuste', 'desfase_zona_dias', 'nivel_confianza', 'respuestas_que_respaldan_ajuste', 'regla', 'respaldo_de_la_regla', 'fuente', 'datos_usados', 'fuente_clima', 'validada_por', 'consejo'];
    var filas = S.consejos.map(function (c) {
      return [c.id, c.cuando, c.agricultor, zonaInfo(c.zona).nombre, c.das, c.etapa, c.diasEfectivos, c.offset, c.nivel, c.nResp, c.regla.id + ' ' + c.regla.nombre, c.regla.estado, c.regla.fuente, c.datos, c.clima.fuente, c.validadaPor || 'sin validar', c.mensaje].map(csvCelda).join(',');
    });
    var blob = new Blob(['\ufeff' + cab.join(',') + '\n' + filas.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kusi-chat-trazabilidad.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function vConsejos(body) {
    if (!S.consejos.length) { body.innerHTML = '<p class="empty">Todavía no hay consejos. Pídele uno a Kusi en la vista del agricultor y aparecerá aquí con su trazabilidad completa.</p>'; return; }
    var sel = S.consejos.filter(function (c) { return c.id === view.sel; })[0] || S.consejos[0];
    view.sel = sel.id;
    var rows = S.consejos.map(function (c) {
      return '<tr class="click' + (c.id === sel.id ? ' sel' : '') + '" data-id="' + c.id + '"><td>' + c.id + '</td><td>' + fmt(c.cuando) + '</td><td>' + esc(zonaInfo(c.zona).nombre) + '</td><td>' + esc(c.etapa) + '</td><td>' + c.regla.id + '</td><td><span class="lvl lvl' + c.nivel + '">N' + c.nivel + '</span></td></tr>';
    }).join('');
    body.innerHTML = '<p class="note">Cada consejo guarda su regla de origen, los datos usados, el ajuste de zona, el nivel de confianza y quién lo validó. Toca una fila para ver el detalle.</p>' +
      '<div class="formrow"><button class="btn primary" id="csv">⬇ Descargar registro de trazabilidad (CSV)</button></div>' +
      '<div class="tablewrap"><table><thead><tr><th>Registro</th><th>Fecha</th><th>Zona</th><th>Etapa</th><th>Regla</th><th>Nivel</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="detail"><h3 style="margin:0 0 8px">Trazabilidad del consejo ' + sel.id + '</h3><p style="margin:0 0 8px"><b>“' + esc(sel.mensaje) + '”</b></p>' + porQue(sel).replace(/<dl>/, '<dl>') + '</div>';
    body.querySelectorAll('tr[data-id]').forEach(function (tr) { tr.onclick = function () { view.sel = tr.getAttribute('data-id'); renderPanel(); }; });
    $('#csv').onclick = descargarCSV;
  }

  function vCasos(body) {
    if (!S.casos.length) { body.innerHTML = '<p class="empty">No hay casos derivados. Cuando un agricultor reporte algo que las reglas no cubren (manchas, plagas, otro cultivo) o pida un técnico, aparecerá aquí.</p>'; return; }
    body.innerHTML = '<p class="note">Casos que el sistema no debe resolver solo. Un técnico los atiende para no dar consejos equivocados.</p><div class="tablewrap"><table><thead><tr><th>Caso</th><th>Fecha</th><th>Zona</th><th>Motivo</th><th>Detalle</th><th>Estado</th></tr></thead><tbody>' +
      S.casos.map(function (c) {
        return '<tr><td>' + c.id + '</td><td>' + fmt(c.cuando) + '</td><td>' + (c.zona ? esc(zonaInfo(c.zona).nombre) : 'Sin definir') + '</td><td>' + esc(c.motivo) + '</td><td>' + esc(c.detalle) + '</td><td>' +
          (c.estado === 'Pendiente' ? '<button class="btn" data-ok="' + c.id + '">Marcar atendido</button>' : '<span class="pill">Atendido</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    body.querySelectorAll('[data-ok]').forEach(function (b) { b.onclick = function () { S.casos.forEach(function (c) { if (c.id === b.getAttribute('data-ok')) c.estado = 'Atendido'; }); save(); renderPanel(); }; });
  }

  function vReglas(body) {
    var nombres = {}; E.STAGES.forEach(function (s) { nombres[s.id] = s.nombre; });
    body.innerHTML = '<p class="note"><b>Respaldo de las reglas.</b> Fuente usada: ' + esc(E.INIA) + ' (Arcos et al., INIA, 2020). Ese manual es del altiplano de Puno, no define etapas ni requerimientos de agua, y no menciona la rancha. Las reglas marcadas <i>Parcial</i> o <i>Ilustrativa</i> tienen umbrales o acciones nuestras [SU] y deben validarse con un técnico antes de un uso real. La IA no decide qué recomendar: cada consejo sale de una regla.</p>' +
      '<div class="tablewrap"><table><thead><tr><th>Regla</th><th>Etapas</th><th>Se aplica si…</th><th>Prioridad</th><th>Respaldo y fuente</th></tr></thead><tbody>' +
      E.RULES.slice().sort(function (a, b) { return b.prioridad - a.prioridad; }).map(function (r) {
        return '<tr><td><b>' + r.id + '</b> · ' + esc(r.nombre) + '</td><td>' + r.etapas.map(function (e) { return esc(nombres[e]); }).join(', ') + '</td><td>' + esc(r.umbral) + '</td><td>' + r.prioridad + '</td><td><span class="pill">' + ({ respaldada: 'Respaldada por el manual', parcial: 'Parcial', ilustrativa: 'Ilustrativa [SU]' })[r.estado] + '</span><br><small>' + esc(r.fuente) + '</small></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<details style="margin-top:12px"><summary>Etapas de la papa usadas (días desde la siembra de referencia)</summary><ul>' +
      E.STAGES.map(function (s) { return '<li>Día ' + s.desde + ' en adelante: ' + esc(s.nombre) + '</li>'; }).join('') + '</ul></details>';
  }

  function vDemo(body) {
    body.innerHTML = '<p class="note">Controles para probar y presentar. Nada de esto aparece en la vista del agricultor.</p>' +
      '<div class="formrow"><label for="sel-clima"><b>Clima que usa el consejo:</b></label><select id="sel-clima">' +
      [['auto', 'Real (Open-Meteo)'], ['tranquilo', 'Escenario: tranquilo'], ['helada', 'Escenario: helada'], ['rancha', 'Escenario: lluvia con humedad (enfermedades de hojas)'], ['fuerte', 'Escenario: lluvia fuerte'], ['seco', 'Escenario: seco']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (S.clima === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="formrow"><label for="sel-n"><b>Respuestas mínimas para ajustar una zona (N) [SU]:</b></label><select id="sel-n">' +
      [3, 5, 8, 10].map(function (n) { return '<option' + (S.N === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
      '<div class="formrow"><button class="btn danger" id="reset-all">Reiniciar la demostración (borra consejos y casos)</button></div>' +
      '<details open><summary>Qué es real y qué es simulado</summary><table><thead><tr><th>Real</th><th>Simulado o ilustrativo [SU]</th></tr></thead><tbody><tr><td>Motor de reglas y cálculo de etapa<br>Pronóstico de Open-Meteo (si hay conexión)<br>Registro de trazabilidad de cada consejo<br>Ajuste de zona al acumular respuestas<br>Derivación de casos al técnico</td><td>Agricultores y sus respuestas<br>Validación del técnico<br>Umbrales de alerta y reglas sin respaldo en el manual INIA (marcadas en la pestaña Reglas)<br>Voz del audio (síntesis del navegador)<br>Número mínimo de respuestas (N) y tamaño del ajuste (3 días)</td></tr></tbody></table></details>' +
      '<details><summary>Qué falta para un piloto real</summary><ul><li>Reglas validadas con un agrónomo y con fichas técnicas para cada zona (el manual del INIA es del altiplano de Puno).</li><li>Canal real de WhatsApp (API de WhatsApp Business).</li><li>Base de datos central y acceso para técnicos.</li><li>Consentimiento explícito para guardar ubicación y datos del cultivo (Ley 29733).</li><li>Medir en el piloto: adopción, cumplimiento de consejos y pérdidas evitadas.</li></ul></details>';
    $('#sel-clima').onchange = function (e) { S.clima = e.target.value; save(); };
    $('#sel-n').onchange = function (e) { S.N = parseInt(e.target.value, 10); save(); };
    $('#reset-all').onclick = function () { S = seed(); save(); view.sel = null; renderPanel(); flow(); };
  }

  /* ---------- Vista móvil ---------- */
  document.querySelectorAll('.viewtabs button').forEach(function (b) {
    b.onclick = function () {
      document.body.setAttribute('data-view', b.getAttribute('data-v'));
      document.querySelectorAll('.viewtabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
    };
  });

  renderPanel();
  flow();
  window.__kusi = { get state() { return S; }, E: E }; // para pruebas
})();
