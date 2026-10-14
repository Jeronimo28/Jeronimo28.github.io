// Festivos españoles, vacaciones propias, semanas A/B y clases de cada fecha
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp } = require('./entorno');

const plano = v => JSON.parse(JSON.stringify(v));

function app(localStorage = {}) {
    return cargarApp({ scripts: ['js/nucleo.js', 'js/festivos.js'], ahora: '2026-09-17T10:00:00', localStorage });
}

test('domingo de Pascua', () => {
    const a = app();
    const pascua = anio => a.ev(`fechaLocalISO(domingoPascua(${anio}))`);
    assert.equal(pascua(2019), '2019-04-21');
    assert.equal(pascua(2024), '2024-03-31');
    assert.equal(pascua(2025), '2025-04-20');
    assert.equal(pascua(2026), '2026-04-05');
    assert.equal(pascua(2027), '2027-03-28');
    assert.equal(pascua(2038), '2038-04-25');
});

test('festivos nacionales', () => {
    const a = app();
    const lista = plano(a.ev("festivosDelAnio(2026, '')"));
    assert.equal(lista.length, 10);
    assert.ok(lista.every(f => f.tipo === 'nacional'));
    assert.deepEqual(lista.map(f => f.fecha), [
        '2026-01-01', '2026-01-06', '2026-04-03', '2026-05-01', '2026-08-15',
        '2026-10-12', '2026-11-01', '2026-12-06', '2026-12-08', '2026-12-25'
    ]);
});

test('festivos autonómicos según la comunidad', () => {
    const a = app();
    const fechas = ccaa => plano(a.ev(`festivosDelAnio(2026, '${ccaa}')`)).map(f => `${f.fecha} ${f.nombre}`);

    const madrid = fechas('MD');
    assert.ok(madrid.includes('2026-04-02 Jueves Santo'));
    assert.ok(madrid.includes('2026-05-02 Fiesta de la Comunidad de Madrid'));
    assert.ok(!madrid.some(f => f.includes('Lunes de Pascua')));

    const cataluna = fechas('CT');
    assert.ok(!cataluna.some(f => f.includes('Jueves Santo')));
    assert.ok(cataluna.includes('2026-04-06 Lunes de Pascua'));
    assert.ok(cataluna.includes('2026-09-11 Diada Nacional de Catalunya'));
    assert.ok(cataluna.includes('2026-12-26 Sant Esteve'));

    // Ningún día repetido y lista ordenada en todas las comunidades
    for (const ccaa of Object.keys(plano(a.ev('COMUNIDADES')))) {
        const lista = plano(a.ev(`festivosDelAnio(2027, '${ccaa}')`)).map(f => f.fecha);
        assert.equal(new Set(lista).size, lista.length, `repetidos en ${ccaa}`);
        assert.deepEqual([...lista].sort(), lista);
    }
});

test('festivoDe tiene en cuenta desactivados, vacaciones propias y el interruptor', () => {
    const a = app({
        festivosApp: JSON.stringify({
            comunidad: 'MD',
            desactivados: ['2026-05-02'],
            propios: [{ id: 'nav', nombre: 'Navidad', desde: '2026-12-21', hasta: '2027-01-07' }, { desde: 'mal', nombre: 'inválido' }]
        })
    });
    assert.equal(a.ev("festivoDe('2026-10-12')").nombre, 'Fiesta Nacional de España');
    assert.equal(a.ev("festivoDe('2026-05-02')"), null);
    assert.equal(a.ev("festivoDe('2026-09-17')"), null);
    assert.deepEqual(plano(a.ev("festivoDe('2027-01-03')")), { fecha: '2027-01-03', nombre: 'Navidad', tipo: 'propio', id: 'nav' });
    assert.equal(a.ev('cargarConfigFestivos().propios.length'), 1);

    a.ev("guardarConfigFestivos({ ...cargarConfigFestivos(), activos: false })");
    assert.equal(a.ev("festivoDe('2026-10-12')"), null);
    assert.equal(a.ev("festivoDe('2026-12-25')").tipo, 'propio'); // las vacaciones siguen contando
});

test('semanas A/B', () => {
    const a = app({ semanasAB: JSON.stringify({ activo: true, referencia: '2026-09-14' }) });
    const semana = iso => a.ev(`semanaDe(leerFechaLocal('${iso}'))`);
    assert.equal(semana('2026-09-14'), 'A');
    assert.equal(semana('2026-09-20'), 'A'); // domingo de la misma semana
    assert.equal(semana('2026-09-21'), 'B');
    assert.equal(semana('2026-10-01'), 'A');
    assert.equal(semana('2026-09-10'), 'B'); // semanas anteriores a la referencia

    a.ev("fijarSemanaActual('B', leerFechaLocal('2026-09-17'))");
    assert.equal(semana('2026-09-17'), 'B');
    assert.equal(semana('2026-09-24'), 'A');

    a.ev("guardarSemanasAB({ ...cargarSemanasAB(), activo: false })");
    assert.equal(semana('2026-09-17'), null);
});

test('clasesDeFecha: día de la semana, semana A/B y festivos', () => {
    const clases = [
        { id: 'mates', asignatura: 'Mates', dia: 0, inicio: '09:00', fin: '10:00' },
        { id: 'quimica-a', asignatura: 'Química', dia: 0, inicio: '08:00', fin: '09:00', semana: 'A' },
        { id: 'fisica-b', asignatura: 'Física', dia: 0, inicio: '11:00', fin: '12:00', semana: 'B' },
        { id: 'martes', asignatura: 'Lengua', dia: 1, inicio: '09:00', fin: '10:00' }
    ];
    const a = cargarApp({
        scripts: ['js/nucleo.js', 'js/festivos.js', 'js/horario.js'],
        ahora: '2026-09-17T10:00:00',
        localStorage: {
            horarioApp: JSON.stringify(clases),
            semanasAB: JSON.stringify({ activo: true, referencia: '2026-09-14' })
        }
    });
    const ids = iso => plano(a.ev(`clasesDeFecha(leerFechaLocal('${iso}'))`)).clases.map(c => c.id);
    assert.deepEqual(ids('2026-09-14'), ['quimica-a', 'mates']); // lunes semana A, ordenadas por hora
    assert.deepEqual(ids('2026-09-21'), ['mates', 'fisica-b']);  // lunes semana B
    assert.deepEqual(ids('2026-09-15'), ['martes']);
    const festivo = plano(a.ev("clasesDeFecha(leerFechaLocal('2026-10-12'))"));
    assert.deepEqual(festivo.clases, []);
    assert.equal(festivo.festivo.nombre, 'Fiesta Nacional de España');

    // Sin semanas alternas, todas las clases del día
    a.ev("guardarSemanasAB({ activo: false, referencia: '2026-09-14' })");
    assert.deepEqual(ids('2026-09-21'), ['quimica-a', 'mates', 'fisica-b']);
});

test('guardarClases no añade «semana» a las clases normales', () => {
    const a = cargarApp({ scripts: ['js/nucleo.js', 'js/festivos.js', 'js/horario.js'] });
    a.ev("guardarClases([{ id: '1', asignatura: 'A', dia: 0, inicio: '09:00', fin: '10:00', semana: null }, { id: '2', asignatura: 'B', dia: 0, inicio: '09:00', fin: '10:00', semana: 'B' }])");
    const guardadas = JSON.parse(a.localStorage.getItem('horarioApp'));
    assert.equal('semana' in guardadas[0], false);
    assert.equal(guardadas[1].semana, 'B');
});

test('calcularCarriles reparte las clases que se solapan', () => {
    const a = cargarApp({ scripts: ['js/nucleo.js', 'js/festivos.js', 'js/horario.js'] });
    const r = plano(a.ev(`calcularCarriles([
        { id: 'a', inicio: '09:00', fin: '10:30' },
        { id: 'b', inicio: '10:00', fin: '11:00' },
        { id: 'c', inicio: '11:00', fin: '12:00' }
    ])`)).map(x => `${x.clase.id}:${x.carril}/${x.total}`);
    assert.deepEqual(r, ['a:0/2', 'b:1/2', 'c:0/1']);
});
