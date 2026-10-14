// Cálculo de contraste (WCAG) usado para los colores de acento
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp } = require('./entorno');

const a = cargarApp({ scripts: ['js/nucleo.js'] });
const plano = v => JSON.parse(JSON.stringify(v));

test('conversión de colores', () => {
    assert.deepEqual(plano(a.ev("hexARgb('#b87d4b')")), [184, 125, 75]);
    assert.deepEqual(plano(a.ev("hexARgb('#fff')")), [255, 255, 255]);
    assert.equal(a.ev("hexARgb('rojo')"), null);
    assert.equal(a.ev('rgbAHex([184, 125, 75])'), '#b87d4b');
});

test('contraste según WCAG', () => {
    assert.equal(Math.round(a.ev('contrasteColores([0,0,0], [255,255,255])')), 21);
    assert.equal(a.ev('contrasteColores([10,20,30], [10,20,30])'), 1);
    // Valor de referencia: #767676 sobre blanco es el gris más claro que cumple AA (4.54)
    assert.equal(a.ev('contrasteColores(hexARgb("#767676"), [255,255,255])').toFixed(2), '4.54');
});

test('varianteConContraste llega al mínimo cambiando lo menos posible', () => {
    const casos = [
        ['#b87d4b', '#3d3028', '#fffaf6', 5],   // canela sobre fondo claro
        ['#0ea5e9', '#3d3028', '#fffaf6', 5],   // cielo (muy claro) sobre fondo claro
        ['#6366f1', '#f1f5f9', '#131a29', 5],   // índigo sobre fondo oscuro
        ['#fbc02d', '#000000', '#ffffff', 4.6]  // amarillo como fondo de texto blanco
    ];
    for (const [base, hacia, fondo, objetivo] of casos) {
        const resultado = a.ev(`varianteConContraste(hexARgb('${base}'), hexARgb('${hacia}'), hexARgb('${fondo}'), ${objetivo})`);
        const contraste = a.ev(`contrasteColores(hexARgb('${resultado}'), hexARgb('${fondo}'))`);
        assert.ok(contraste >= objetivo, `${base} → ${resultado}: ${contraste.toFixed(2)}`);
    }
    // Si ya cumple, no se toca
    assert.equal(a.ev("varianteConContraste(hexARgb('#3d3028'), [0,0,0], [255,255,255], 4.5)"), '#3d3028');
});
