// Entrada rápida en lenguaje natural, repeticiones y racha
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp } = require('./entorno');

// Jueves 17 de septiembre de 2026, 10:00
const AHORA = '2026-09-17T10:00:00';
const plano = v => JSON.parse(JSON.stringify(v));

function app() {
    const a = cargarApp({ scripts: ['js/nucleo.js', 'js/tareas/datos.js', 'js/tareas/entrada.js'], ahora: AHORA });
    a.ev('cargarCategorias()');
    return a;
}

const analizar = (a, texto, ignorar) => {
    a.contexto.__texto = texto;
    a.contexto.__ignorar = ignorar || [];
    const r = plano(a.ev('analizarEntrada(__texto, new Set(__ignorar))'));
    delete r.fichas;
    return r;
};

test('detecta fecha y hora relativas', () => {
    const a = app();
    assert.deepEqual(analizar(a, 'Llamar al dentista mañana a las 17:30'), {
        texto: 'Llamar al dentista', fechaTarea: '2026-09-18', hora: '17:30', prioridad: null, categoria: null, repetir: null
    });
    assert.equal(analizar(a, 'Algo pasado mañana').fechaTarea, '2026-09-19');
    assert.equal(analizar(a, 'Revisar en 2 semanas').fechaTarea, '2026-10-01');
    assert.equal(analizar(a, 'Plan para la próxima semana').fechaTarea, '2026-09-21');
});

test('días de la semana: siempre el próximo', () => {
    const a = app();
    const r = analizar(a, 'Entregar informe el viernes a las 10');
    assert.equal(r.texto, 'Entregar informe');
    assert.equal(r.fechaTarea, '2026-09-18');
    assert.equal(r.hora, '10:00');
    // Hoy es jueves: «el jueves» es dentro de una semana
    assert.equal(analizar(a, 'Clase el jueves').fechaTarea, '2026-09-24');
});

test('fechas escritas con día y mes', () => {
    const a = app();
    const r = analizar(a, 'Examen de historia el 20 de noviembre !alta');
    assert.equal(r.texto, 'Examen de historia');
    assert.equal(r.fechaTarea, '2026-11-20');
    assert.equal(r.prioridad, 'alta');
    // Una fecha ya pasada este año se entiende como la del año que viene
    assert.equal(analizar(a, 'Pagar el 5/9').fechaTarea, '2027-09-05');
    assert.equal(analizar(a, 'Pagar el 30/09/2026').fechaTarea, '2026-09-30');
    // 31 de septiembre no existe: se pasa al 31 del mes siguiente
    assert.equal(analizar(a, 'Entregar el día 31').fechaTarea, '2026-10-31');
    assert.equal(analizar(a, 'Fecha imposible 31/02').fechaTarea, null);
});

test('hora sin fecha: hoy si aún no ha pasado, si no mañana', () => {
    const a = app();
    assert.deepEqual([analizar(a, 'Reunión 3pm').hora, analizar(a, 'Reunión 3pm').fechaTarea], ['15:00', '2026-09-17']);
    assert.deepEqual([analizar(a, 'Desayuno a las 8').hora, analizar(a, 'Desayuno a las 8').fechaTarea], ['08:00', '2026-09-18']);
    assert.equal(analizar(a, 'Cena a las 9 de la noche').hora, '21:00');
    assert.equal(analizar(a, 'Hora rara a las 25').hora, null);
});

test('prioridad, categoría y repetición', () => {
    const a = app();
    assert.equal(analizar(a, 'Algo urgente !!').prioridad, 'media');
    assert.equal(analizar(a, 'Algo !!!').prioridad, 'alta');
    const compra = analizar(a, 'Hacer la compra el sábado #comp');
    assert.equal(compra.categoria, 'compras');
    assert.equal(compra.texto, 'Hacer la compra');
    assert.equal(analizar(a, 'Etiqueta desconocida #inventada').texto, 'Etiqueta desconocida #inventada');

    const regar = analizar(a, 'Regar las plantas cada lunes');
    assert.deepEqual([regar.texto, regar.repetir, regar.fechaTarea], ['Regar las plantas', 'semanal', '2026-09-21']);
    const gym = analizar(a, 'Gimnasio entre semana');
    assert.deepEqual([gym.repetir, gym.fechaTarea], ['laborables', '2026-09-17']);
    assert.equal(analizar(a, 'Vitaminas cada día').repetir, 'diaria');
});

test('no confunde palabras que contienen otras', () => {
    const a = app();
    const r = analizar(a, 'Tapar el hoyo del jardín');
    assert.equal(r.fechaTarea, null);
    assert.equal(r.texto, 'Tapar el hoyo del jardín');
    // «la mañana» no es «mañana»
    assert.equal(analizar(a, 'Correr por la mañana').fechaTarea, null);
});

test('las fichas ignoradas se tratan como texto', () => {
    const a = app();
    const r = analizar(a, 'Ver la película Mañana', ['fecha']);
    assert.equal(r.fechaTarea, null);
    assert.equal(r.texto, 'Ver la película Mañana');
});

test('siguienteFecha para tareas que se repiten', () => {
    const a = app();
    const sig = (iso, rep) => a.ev(`siguienteFecha('${iso}', '${rep}')`);
    assert.equal(sig('2026-09-17', 'diaria'), '2026-09-18');
    assert.equal(sig('2026-09-18', 'laborables'), '2026-09-21'); // viernes -> lunes
    assert.equal(sig('2026-09-10', 'semanal'), '2026-09-17');    // nunca en el pasado
    assert.equal(sig('2026-08-31', 'mensual'), '2026-09-30');    // 31 -> último día del mes
    assert.equal(sig('2026-01-31', 'mensual'), '2026-09-30');
    assert.equal(sig('2026-09-17', 'mensual'), '2026-10-17');
});

test('racha de días seguidos completando tareas', () => {
    const a = app();
    const racha = stats => a.ev(`calcularRacha(${JSON.stringify(stats)})`);
    assert.equal(racha({}), 0);
    assert.equal(racha({ '2026-09-16': 1, '2026-09-15': 2 }), 2);             // hoy aún sin completar
    assert.equal(racha({ '2026-09-17': 1, '2026-09-16': 1, '2026-09-15': 2 }), 3);
    assert.equal(racha({ '2026-09-17': 1, '2026-09-15': 2 }), 1);             // un hueco corta la racha
    assert.equal(racha({ '2026-09-14': 5 }), 0);
});

test('cargarTareas respeta los campos existentes y completa los que faltan', () => {
    const a = cargarApp({
        scripts: ['js/nucleo.js', 'js/tareas/datos.js'],
        ahora: AHORA,
        localStorage: { tareasApp: JSON.stringify([{ texto: 'Sin id', prioridad: 'rara', campoPropio: 42 }]) }
    });
    a.ev('cargarCategorias(); cargarTareas()');
    const [t] = plano(a.ev('tareas'));
    assert.ok(t.id);
    assert.equal(t.prioridad, 'ninguna');
    assert.equal(t.campoPropio, 42);
    assert.deepEqual(t.subtareas, []);
    // Al asignar ids se guarda una vez, sin campos vacíos nuevos
    const guardada = JSON.parse(a.localStorage.getItem('tareasApp'))[0];
    assert.equal(guardada.id, t.id);
    assert.equal('subtareas' in guardada, false);
});
