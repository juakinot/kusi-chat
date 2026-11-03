/* Kusi Chat · motor de reglas (MVP1)
 * Funciones puras: etapa del cultivo, reglas con fuente, ajuste por zona y niveles de confianza.
 * IMPORTANTE: las reglas agronómicas son ILUSTRATIVAS [SU]. Deben validarse con fichas técnicas INIA/MIDAGRI. */
(function (root) {
  'use strict';

  var FUENTE_REGLA = 'Regla ilustrativa [SU]. Fuente técnica por validar: ficha INIA/MIDAGRI del cultivo de papa.';

  /* Zonas piloto: cultivo + rango de altitud + provincia (coordenadas aproximadas para el pronóstico). */
  var ZONES = [
    { id: 'huancayo', nombre: 'Valle del Mantaro', lugar: 'Huancayo, Junín', alt: '3 200–3 500 m', lat: -12.07, lon: -75.21 },
    { id: 'jauja', nombre: 'Valle de Jauja', lugar: 'Jauja, Junín', alt: '3 300–3 600 m', lat: -11.78, lon: -75.50 },
    { id: 'junin', nombre: 'Meseta de Junín', lugar: 'Junín, Junín', alt: '3 900–4 200 m', lat: -11.16, lon: -75.99 }
  ];

  /* Etapas de la papa (días desde la siembra de referencia). Valores ilustrativos [SU]. */
  var STAGES = [
    { id: 'emergencia', nombre: 'Brotando y saliendo', desde: 0 },
    { id: 'vegetativo', nombre: 'Creciendo (hojas y tallos)', desde: 26 },
    { id: 'floracion', nombre: 'Floración y formación de papitas', desde: 56 },
    { id: 'llenado', nombre: 'Engorde de papitas', desde: 91 },
    { id: 'maduracion', nombre: 'Maduración', desde: 121 },
    { id: 'cosecha', nombre: 'Lista para cosechar', desde: 151 }
  ];

  /* Preguntas de seguimiento que sirven para calibrar la zona: indican si una etapa ya empezó. */
  var QUESTIONS = [
    { id: 'q1', texto: '¿Ya salieron casi todas tus plantas?', limite: 26, ventana: [10, 45] },
    { id: 'q2', texto: '¿Ya ves botones o flores en tus plantas?', limite: 56, ventana: [40, 75] },
    { id: 'q3', texto: '¿Ya se cayeron la mayoría de las flores?', limite: 91, ventana: [75, 105] },
    { id: 'q4', texto: '¿Ya se están amarillando las hojas de abajo?', limite: 121, ventana: [105, 140] },
    { id: 'q5', texto: '¿Ya se secó casi todo el follaje?', limite: 151, ventana: [135, 170] }
  ];

  var PASO_AJUSTE = 3; // días que se corre la zona en cada ajuste [SU]
  var UMBRAL_CONTRADICCION = 0.6; // proporción mínima de respuestas que contradicen [SU]

  function etapaPara(das, offset) {
    var eff = das - (offset || 0);
    var actual = STAGES[0];
    for (var i = 0; i < STAGES.length; i++) { if (eff >= STAGES[i].desde) actual = STAGES[i]; }
    return { etapa: actual, diasEfectivos: eff };
  }

  function preguntaPara(das, offset) {
    var eff = das - (offset || 0);
    for (var i = 0; i < QUESTIONS.length; i++) {
      var q = QUESTIONS[i];
      if (eff >= q.ventana[0] && eff <= q.ventana[1]) return q;
    }
    return null;
  }

  /* ---------- Clima ---------- */
  function resumenClima(fc) {
    var d3 = fc.dias.slice(0, 3);
    var d5 = fc.dias.slice(0, 5);
    var sum = function (a, k) { return a.reduce(function (s, x) { return s + (x[k] || 0); }, 0); };
    var minT = Math.min.apply(null, d3.map(function (x) { return x.tmin; }));
    var diaMin = d3.filter(function (x) { return x.tmin === minT; })[0];
    var maxLluvia = Math.max.apply(null, d3.map(function (x) { return x.lluvia; }));
    var diaLluvia = d3.filter(function (x) { return x.lluvia === maxLluvia; })[0];
    return {
      minT: minT, diaMin: diaMin.fecha,
      maxLluvia: maxLluvia, diaLluvia: diaLluvia.fecha,
      diasLluvia: d3.filter(function (x) { return x.prob >= 50 || x.lluvia >= 1; }).length,
      hr: sum(d3, 'hr') / d3.length,
      tmax: sum(d3, 'tmax') / d3.length,
      lluvia2d: sum(fc.dias.slice(0, 2), 'lluvia'),
      lluvia5d: sum(d5, 'lluvia')
    };
  }

  /* ---------- Reglas ---------- */
  var T = function (s) { return String(Math.round(s * 10) / 10).replace('.', ','); };
  var dia = function (iso) {
    var n = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    var d = new Date(iso + 'T12:00:00');
    return n[d.getDay()];
  };

  var RULES = [
    { id: 'R-01', nombre: 'Aviso de helada', prioridad: 100,
      etapas: ['emergencia', 'vegetativo', 'floracion', 'llenado'],
      umbral: 'Temperatura mínima pronosticada ≤ 2 °C en los próximos 3 días',
      cond: function (c) { return c.cl.minT <= 2; },
      datos: function (c) { return 'Mínima de ' + T(c.cl.minT) + ' °C el ' + c.cl.diaMin; },
      mensaje: function (c) {
        return 'Se espera mucho frío el ' + dia(c.cl.diaMin) + ' (' + T(c.cl.minT) + ' °C). Una helada puede quemar las hojas. ' +
          'Riega ligero la tarde anterior y, si puedes, cubre las plantas pequeñas con paja.';
      } },
    { id: 'R-02', nombre: 'Riesgo de rancha', prioridad: 90,
      etapas: ['vegetativo', 'floracion', 'llenado'],
      umbral: 'Humedad media ≥ 80 %, lluvia en ≥ 2 de los próximos 3 días y temperatura máxima media entre 8 y 24 °C',
      cond: function (c) { return c.cl.hr >= 80 && c.cl.diasLluvia >= 2 && c.cl.tmax >= 8 && c.cl.tmax <= 24; },
      datos: function (c) { return 'Humedad media ' + Math.round(c.cl.hr) + ' %, ' + c.cl.diasLluvia + ' de 3 días con lluvia, máxima media ' + T(c.cl.tmax) + ' °C'; },
      mensaje: function () {
        return 'Vienen días húmedos y con lluvia: es cuando aparece la rancha (manchas oscuras en las hojas). ' +
          'Revisa tus plantas hoy y mañana. Si ves manchas, avísame o consulta a un técnico antes de echar cualquier producto.';
      } },
    { id: 'R-03', nombre: 'Aviso de lluvia fuerte', prioridad: 80,
      etapas: ['vegetativo', 'floracion', 'llenado', 'maduracion'],
      umbral: 'Lluvia pronosticada ≥ 20 mm en un día dentro de los próximos 3 días',
      cond: function (c) { return c.cl.maxLluvia >= 20; },
      datos: function (c) { return 'Lluvia de ' + T(c.cl.maxLluvia) + ' mm el ' + c.cl.diaLluvia; },
      mensaje: function (c) {
        return 'Se espera lluvia fuerte el ' + dia(c.cl.diaLluvia) + ' (' + T(c.cl.maxLluvia) + ' mm). ' +
          'Abre zanjas o salidas en tus surcos para que el agua no se quede en el terreno: el agua parada pudre las papas.';
      } },
    { id: 'R-04', nombre: 'Cosecha con lluvia cerca', prioridad: 85,
      etapas: ['cosecha'],
      umbral: 'Lluvia acumulada ≥ 5 mm en los próximos 2 días',
      cond: function (c) { return c.cl.lluvia2d >= 5; },
      datos: function (c) { return 'Lluvia acumulada de ' + T(c.cl.lluvia2d) + ' mm en 2 días'; },
      mensaje: function () {
        return 'Tu papa ya está lista, pero viene lluvia en los próximos 2 días. Si puedes, cosecha hoy; ' +
          'si no, espera un día seco. Cosechar con el terreno muy mojado maltrata las papas.';
      } },
    { id: 'R-05', nombre: 'Momento del aporque', prioridad: 60,
      etapas: ['vegetativo'],
      umbral: 'Entre el día 30 y el 55 desde la siembra (ajustado a la zona)',
      cond: function (c) { return c.eff >= 30 && c.eff <= 55; },
      datos: function (c) { return 'Día ' + c.eff + ' ajustado a la zona'; },
      mensaje: function () {
        return 'Es buen momento para el aporque: arrimar tierra al pie de cada planta. ' +
          'Hazlo con el suelo húmedo pero sin encharcar.';
      } },
    { id: 'R-06', nombre: 'Falta de agua', prioridad: 55,
      etapas: ['vegetativo', 'floracion', 'llenado'],
      umbral: 'Lluvia acumulada ≤ 1 mm en los próximos 5 días',
      cond: function (c) { return c.cl.lluvia5d <= 1; },
      datos: function (c) { return 'Lluvia acumulada de ' + T(c.cl.lluvia5d) + ' mm en 5 días'; },
      mensaje: function () {
        return 'No se esperan lluvias en los próximos días. La papa necesita humedad pareja para que las papitas engorden. ' +
          'Revisa el suelo: si a un dedo de profundidad está seco, riega temprano en la mañana o al caer la tarde.';
      } },
    { id: 'R-07', nombre: 'Preparar la cosecha', prioridad: 40,
      etapas: ['maduracion'],
      umbral: 'Etapa de maduración',
      cond: function () { return true; },
      datos: function (c) { return 'Etapa de maduración, día ' + c.eff; },
      mensaje: function () {
        return 'Tus plantas se preparan para la cosecha. Deja de regar. Cuando las hojas se amarillen, frota una papa con el pulgar: ' +
          'si la cáscara ya no se pela fácil, está lista.';
      } },
    { id: 'R-08', nombre: 'Tiempo de cosecha', prioridad: 45,
      etapas: ['cosecha'],
      umbral: 'Etapa de cosecha',
      cond: function () { return true; },
      datos: function (c) { return 'Etapa de cosecha, día ' + c.eff; },
      mensaje: function () {
        return 'Es tiempo de cosechar. Elige un día seco, saca las papas con cuidado para no golpearlas y déjalas reposar a la sombra antes de guardarlas.';
      } },
    { id: 'R-09', nombre: 'Revisar la brotación', prioridad: 20,
      etapas: ['emergencia'],
      umbral: 'Etapa de emergencia',
      cond: function () { return true; },
      datos: function (c) { return 'Etapa de emergencia, día ' + c.eff; },
      mensaje: function () {
        return 'Tu papa está saliendo. Revisa que las plantas salgan parejas. Si ves muchos huecos sin brotar, avísame.';
      } },
    { id: 'R-10', nombre: 'Humedad pareja en floración', prioridad: 20,
      etapas: ['floracion'],
      umbral: 'Etapa de floración',
      cond: function () { return true; },
      datos: function (c) { return 'Etapa de floración, día ' + c.eff; },
      mensaje: function () {
        return 'Tu papa está floreando y formando papitas. Mantén la humedad del terreno pareja y revisa las hojas por si aparecen manchas.';
      } },
    { id: 'R-11', nombre: 'Cuidar el engorde', prioridad: 20,
      etapas: ['llenado'],
      umbral: 'Etapa de engorde',
      cond: function () { return true; },
      datos: function (c) { return 'Etapa de engorde, día ' + c.eff; },
      mensaje: function () {
        return 'Tus papitas están engordando. Evita que el terreno se seque del todo o que se encharque.';
      } },
    { id: 'R-12', nombre: 'Seguimiento del crecimiento', prioridad: 10,
      etapas: ['vegetativo'],
      umbral: 'Etapa de crecimiento',
      cond: function () { return true; },
      datos: function (c) { return 'Etapa de crecimiento, día ' + c.eff; },
      mensaje: function () {
        return 'Tus plantas están creciendo. Revisa que estén parejas y sin hojas dañadas. Si ves algo raro, cuéntame.';
      } }
  ];

  /* Elige el consejo: de las reglas que aplican a la etapa y cuya condición se cumple, gana la de mayor prioridad. */
  function evaluar(das, offset, fc) {
    var e = etapaPara(das, offset);
    var cl = resumenClima(fc);
    var ctx = { das: das, eff: e.diasEfectivos, cl: cl };
    var candidatas = RULES.filter(function (r) {
      return r.etapas.indexOf(e.etapa.id) >= 0 && r.cond(ctx);
    }).sort(function (a, b) { return b.prioridad - a.prioridad; });
    var r = candidatas[0];
    return {
      regla: { id: r.id, nombre: r.nombre, umbral: r.umbral, fuente: FUENTE_REGLA },
      etapa: e.etapa, diasEfectivos: e.diasEfectivos,
      mensaje: r.mensaje(ctx),
      datos: r.datos(ctx) + ' · ' + das + ' días desde la siembra' + (offset ? ' (' + e.diasEfectivos + ' con el ajuste de la zona)' : ''),
      clima: cl
    };
  }

  /* ---------- Zonas: ajuste, niveles y validación ---------- */
  function nuevaZona(seed) {
    return Object.assign({ offset: 0, ajustes: [], cal: { n: 0, tarde: 0, temprano: 0 }, respuestas: 0, validada: null }, seed || {});
  }

  /* Nivel 1 = guía general, 2 = ajustada con respuestas de la zona, 3 = validada por técnico. */
  function nivelZona(z) {
    if (z.validada) return 3;
    if (z.ajustes.length > 0) return 2;
    return 1;
  }
  var NIVEL_TEXTO = { 1: 'Guía general', 2: 'Ajustado a tu zona', 3: 'Validado por un técnico' };

  /* Registra una respuesta sí/no de una pregunta de calibración y ajusta la zona si corresponde. */
  function registrarRespuesta(z, qid, das, respuesta, N, ahora) {
    var q = QUESTIONS.filter(function (x) { return x.id === qid; })[0];
    if (!q || (respuesta !== 'si' && respuesta !== 'no')) return { ajustado: false };
    z.respuestas += 1;
    var esperadoAlcanzado = (das - z.offset) >= q.limite;
    var alcanzado = respuesta === 'si';
    z.cal.n += 1;
    if (esperadoAlcanzado && !alcanzado) z.cal.tarde += 1;       // la zona va más lenta que la regla
    if (!esperadoAlcanzado && alcanzado) z.cal.temprano += 1;    // la zona va más rápida que la regla
    if (z.cal.n >= N) {
      var dir = 0;
      if (z.cal.tarde / z.cal.n >= UMBRAL_CONTRADICCION) dir = 1;
      else if (z.cal.temprano / z.cal.n >= UMBRAL_CONTRADICCION) dir = -1;
      if (dir !== 0) {
        var delta = dir * PASO_AJUSTE;
        z.offset += delta;
        z.ajustes.push({ cuando: ahora || new Date().toISOString(), delta: delta, n: z.cal.n, tarde: z.cal.tarde, temprano: z.cal.temprano, pregunta: q.id });
        z.validada = null; // un ajuste nuevo invalida la validación anterior
        z.cal = { n: 0, tarde: 0, temprano: 0 };
        return { ajustado: true, delta: delta };
      }
      z.cal = { n: 0, tarde: 0, temprano: 0 }; // hubo muestra suficiente pero sin contradicción clara
    }
    return { ajustado: false };
  }

  function validarZona(z, por, ahora) {
    z.validada = { por: por || 'Técnico (simulado)', en: ahora || new Date().toISOString(), offset: z.offset };
  }

  /* ---------- Clima: escenarios de demostración ---------- */
  function fechaMas(n) {
    var d = new Date(); d.setDate(d.getDate() + n);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function escenario(nombre) {
    var S = {
      tranquilo: { tmin: [5, 5, 4, 5, 5], tmax: [17, 18, 17, 18, 17], lluvia: [0.5, 1, 0.5, 2, 1], prob: [30, 30, 25, 40, 30], hr: [60, 62, 60, 65, 62] },
      helada:    { tmin: [3, -1, 2, 3, 4], tmax: [15, 14, 15, 16, 16], lluvia: [0, 0, 0, 0, 0], prob: [5, 5, 5, 5, 5], hr: [45, 42, 45, 48, 50] },
      rancha:    { tmin: [7, 7, 8, 7, 7], tmax: [15, 14, 15, 16, 15], lluvia: [6, 8, 4, 5, 3], prob: [85, 90, 80, 80, 70], hr: [90, 92, 90, 88, 86] },
      fuerte:    { tmin: [6, 6, 6, 7, 6], tmax: [16, 15, 15, 16, 16], lluvia: [3, 24, 12, 4, 2], prob: [80, 95, 90, 70, 60], hr: [70, 74, 72, 68, 66] },
      seco:      { tmin: [4, 4, 5, 4, 4], tmax: [20, 21, 20, 21, 20], lluvia: [0, 0, 0, 0, 0], prob: [5, 5, 5, 5, 5], hr: [38, 36, 40, 38, 36] }
    };
    var s = S[nombre] || S.tranquilo;
    return { fuente: 'Escenario de demostración [SU]', dias: s.tmin.map(function (_, i) {
      return { fecha: fechaMas(i), tmin: s.tmin[i], tmax: s.tmax[i], lluvia: s.lluvia[i], prob: s.prob[i], hr: s.hr[i] };
    }) };
  }

  var api = {
    ZONES: ZONES, STAGES: STAGES, RULES: RULES, QUESTIONS: QUESTIONS, FUENTE_REGLA: FUENTE_REGLA,
    PASO_AJUSTE: PASO_AJUSTE, UMBRAL_CONTRADICCION: UMBRAL_CONTRADICCION, NIVEL_TEXTO: NIVEL_TEXTO,
    etapaPara: etapaPara, preguntaPara: preguntaPara, resumenClima: resumenClima, evaluar: evaluar,
    nuevaZona: nuevaZona, nivelZona: nivelZona, registrarRespuesta: registrarRespuesta, validarZona: validarZona,
    escenario: escenario, dia: dia
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KusiEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
