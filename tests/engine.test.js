const assert = require('assert');
const E = require('../engine.js');

// Etapas
assert.strictEqual(E.etapaPara(10, 0).etapa.id, 'emergencia');
assert.strictEqual(E.etapaPara(26, 0).etapa.id, 'vegetativo');
assert.strictEqual(E.etapaPara(60, 0).etapa.id, 'floracion');
assert.strictEqual(E.etapaPara(60, 6).etapa.id, 'vegetativo', 'con desfase +6 sigue en crecimiento');
assert.strictEqual(E.etapaPara(130, 0).etapa.id, 'maduracion');
assert.strictEqual(E.etapaPara(160, 0).etapa.id, 'cosecha');

// Escenarios y reglas
const regla = (das, esc, off = 0) => E.evaluar(das, off, E.escenario(esc)).regla.id;
assert.strictEqual(regla(40, 'helada'), 'R-01');
assert.strictEqual(regla(70, 'rancha'), 'R-02');
assert.strictEqual(regla(70, 'fuerte'), 'R-03');
assert.strictEqual(regla(160, 'fuerte'), 'R-04');
assert.strictEqual(regla(160, 'tranquilo'), 'R-08');
assert.strictEqual(regla(40, 'tranquilo'), 'R-05');
assert.strictEqual(regla(70, 'seco'), 'R-06');
assert.strictEqual(regla(130, 'tranquilo'), 'R-07');
assert.strictEqual(regla(10, 'tranquilo'), 'R-09');
assert.strictEqual(regla(10, 'helada'), 'R-01');
assert.strictEqual(regla(30, 'tranquilo'), 'R-05');
// Toda combinación etapa × escenario produce un consejo con fuente
['tranquilo', 'helada', 'rancha', 'fuerte', 'seco'].forEach(esc => {
  for (let d = 0; d <= 200; d += 5) {
    const r = E.evaluar(d, 0, E.escenario(esc));
    assert.ok(r.mensaje && r.regla.fuente && r.regla.id, `sin consejo día ${d} ${esc}`);
  }
});

// Ajuste por zona: 6 respuestas "no ya hay flores" cuando la regla decía que sí
const z = E.nuevaZona();
assert.strictEqual(E.nivelZona(z), 1);
let ultimo;
for (let i = 0; i < 5; i++) ultimo = E.registrarRespuesta(z, 'q2', 64, 'no', 5);
assert.ok(ultimo.ajustado && ultimo.delta === 3, 'debe ajustar +3');
assert.strictEqual(z.offset, 3);
assert.strictEqual(E.nivelZona(z), 2);
assert.strictEqual(E.etapaPara(58, z.offset).etapa.id, 'vegetativo', 'tras el ajuste, día 58 ya no es floración');
E.validarZona(z, 'Técnico (simulado)');
assert.strictEqual(E.nivelZona(z), 3);
// Un nuevo ajuste invalida la validación
for (let i = 0; i < 5; i++) E.registrarRespuesta(z, 'q2', 70, 'no', 5);
assert.strictEqual(E.nivelZona(z), 2);
// Respuestas que no contradicen no ajustan
const z2 = E.nuevaZona();
for (let i = 0; i < 6; i++) E.registrarRespuesta(z2, 'q2', 64, 'si', 5);
assert.strictEqual(z2.offset, 0);
// Dirección contraria
const z3 = E.nuevaZona();
for (let i = 0; i < 5; i++) E.registrarRespuesta(z3, 'q2', 50, 'si', 5);
assert.strictEqual(z3.offset, -3);
// Respuesta inválida
assert.strictEqual(E.registrarRespuesta(z3, 'q2', 50, 'tal vez', 5).ajustado, false);

// Pregunta de calibración
assert.strictEqual(E.preguntaPara(60, 0).id, 'q2');
assert.strictEqual(E.preguntaPara(5, 0), null);

console.log('OK: todas las pruebas del motor pasaron');
