/* ==========================================
   FESTIVOS (calendario laboral español), VACACIONES Y SEMANAS A/B
   ========================================== */

const COMUNIDADES = {
    '': 'Solo festivos nacionales',
    AN: 'Andalucía',
    AR: 'Aragón',
    AS: 'Asturias',
    IB: 'Illes Balears',
    CN: 'Canarias',
    CB: 'Cantabria',
    CL: 'Castilla y León',
    CM: 'Castilla-La Mancha',
    CT: 'Cataluña',
    VC: 'Comunitat Valenciana',
    EX: 'Extremadura',
    GA: 'Galicia',
    MD: 'Comunidad de Madrid',
    MC: 'Región de Murcia',
    NC: 'Navarra',
    PV: 'País Vasco',
    RI: 'La Rioja',
    CE: 'Ceuta',
    ML: 'Melilla'
};

// Festivos autonómicos habituales. Cada año el BOE puede cambiar o trasladar alguno:
// por eso se pueden desactivar uno a uno y añadir los locales.
const FESTIVOS_AUTONOMICOS = {
    AN: [['02-28', 'Día de Andalucía']],
    AR: [['04-23', 'San Jorge · Día de Aragón']],
    AS: [['09-08', 'Día de Asturias']],
    IB: [['03-01', 'Día de les Illes Balears'], ['12-26', 'Sant Esteve']],
    CN: [['05-30', 'Día de Canarias']],
    CB: [['07-28', 'Día de las Instituciones de Cantabria'], ['09-15', 'La Bien Aparecida']],
    CL: [['04-23', 'Día de Castilla y León']],
    CM: [['05-31', 'Día de Castilla-La Mancha']],
    CT: [['06-24', 'Sant Joan'], ['09-11', 'Diada Nacional de Catalunya'], ['12-26', 'Sant Esteve']],
    VC: [['03-19', 'San José'], ['06-24', 'Sant Joan'], ['10-09', 'Día de la Comunitat Valenciana']],
    EX: [['09-08', 'Día de Extremadura']],
    GA: [['05-17', 'Día das Letras Galegas'], ['07-25', 'Día Nacional de Galicia']],
    MD: [['05-02', 'Fiesta de la Comunidad de Madrid']],
    MC: [['03-19', 'San José'], ['06-09', 'Día de la Región de Murcia']],
    NC: [['12-03', 'San Francisco Javier']],
    PV: [['07-25', 'Santiago Apóstol']],
    RI: [['06-09', 'Día de La Rioja']],
    CE: [['09-02', 'Día de Ceuta']],
    ML: [['09-17', 'Día de Melilla']]
};
const SIN_JUEVES_SANTO = ['CT', 'VC'];
const CON_LUNES_PASCUA = ['CT', 'VC', 'IB', 'NC', 'PV', 'RI'];

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano)
function domingoPascua(anio) {
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(anio, mes - 1, dia);
}

// Lista de festivos de un año: [{ fecha: 'YYYY-MM-DD', nombre, tipo: 'nacional' | 'autonomico' }]
function festivosDelAnio(anio, comunidad = '') {
    const fijo = (mmdd, nombre, tipo = 'nacional') => ({ fecha: `${anio}-${mmdd}`, nombre, tipo });
    const pascua = domingoPascua(anio);
    const relativo = (dias, nombre, tipo) => ({ fecha: fechaLocalISO(sumarDias(pascua, dias)), nombre, tipo });

    const lista = [
        fijo('01-01', 'Año Nuevo'),
        fijo('01-06', 'Epifanía del Señor'),
        relativo(-2, 'Viernes Santo', 'nacional'),
        fijo('05-01', 'Fiesta del Trabajo'),
        fijo('08-15', 'Asunción de la Virgen'),
        fijo('10-12', 'Fiesta Nacional de España'),
        fijo('11-01', 'Todos los Santos'),
        fijo('12-06', 'Día de la Constitución'),
        fijo('12-08', 'Inmaculada Concepción'),
        fijo('12-25', 'Navidad')
    ];

    if (comunidad && COMUNIDADES[comunidad]) {
        if (!SIN_JUEVES_SANTO.includes(comunidad)) lista.push(relativo(-3, 'Jueves Santo', 'autonomico'));
        if (CON_LUNES_PASCUA.includes(comunidad)) lista.push(relativo(1, 'Lunes de Pascua', 'autonomico'));
        (FESTIVOS_AUTONOMICOS[comunidad] || []).forEach(([mmdd, nombre]) => {
            if (!lista.some(f => f.fecha === `${anio}-${mmdd}`)) lista.push(fijo(mmdd, nombre, 'autonomico'));
        });
    }
    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/* ---------- Configuración del usuario ---------- */

// { comunidad, desactivados: ['YYYY-MM-DD'], propios: [{ id, desde, hasta, nombre }] }
function cargarConfigFestivos() {
    const datos = almacen.leer('festivosApp', null) || {};
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    return {
        comunidad: COMUNIDADES[datos.comunidad] !== undefined ? datos.comunidad : '',
        activos: datos.activos !== false,
        desactivados: Array.isArray(datos.desactivados) ? datos.desactivados.filter(f => iso.test(f)) : [],
        propios: Array.isArray(datos.propios)
            ? datos.propios.filter(p => p && iso.test(p.desde)).map(p => ({
                id: String(p.id || generarId('fest')),
                desde: p.desde,
                hasta: iso.test(p.hasta) && p.hasta >= p.desde ? p.hasta : p.desde,
                nombre: String(p.nombre || 'Festivo').slice(0, 60)
            }))
            : []
    };
}

let cacheFestivos = null;

function invalidarFestivos() {
    cacheFestivos = null;
}

function guardarConfigFestivos(config) {
    almacen.escribir('festivosApp', config);
    invalidarFestivos();
}

// Festivo (o día de vacaciones) de una fecha ISO, o null
function festivoDe(iso, config = null) {
    if (!iso) return null;
    if (!config) cacheFestivos ||= { config: cargarConfigFestivos(), anios: {} };
    const cfg = config || cacheFestivos.config;
    const anios = config ? {} : cacheFestivos.anios;
    const anio = Number(iso.slice(0, 4));

    const propio = cfg.propios.find(p => iso >= p.desde && iso <= p.hasta);
    if (propio) return { fecha: iso, nombre: propio.nombre, tipo: 'propio', id: propio.id };
    if (!cfg.activos) return null;

    anios[anio] ||= new Map(festivosDelAnio(anio, cfg.comunidad).map(f => [f.fecha, f]));
    const f = anios[anio].get(iso);
    return f && !cfg.desactivados.includes(iso) ? f : null;
}

// Próximos festivos calculados (incluye los desactivados, marcados), para la lista de ajustes
function proximosFestivos(desdeISO, dias = 400) {
    const cfg = cargarConfigFestivos();
    const hasta = fechaLocalISO(sumarDias(leerFechaLocal(desdeISO), dias));
    const anioIni = Number(desdeISO.slice(0, 4));
    const lista = [];
    for (let a = anioIni; a <= Number(hasta.slice(0, 4)); a++) {
        festivosDelAnio(a, cfg.comunidad).forEach(f => {
            if (f.fecha >= desdeISO && f.fecha <= hasta) lista.push({ ...f, desactivado: cfg.desactivados.includes(f.fecha) });
        });
    }
    return lista;
}

/* ---------- Semanas A/B ---------- */

// { activo: bool, referencia: 'YYYY-MM-DD' (un lunes que es semana A) }
function cargarSemanasAB() {
    const d = almacen.leer('semanasAB', null) || {};
    return { activo: !!d.activo, referencia: /^\d{4}-\d{2}-\d{2}$/.test(d.referencia) ? d.referencia : null };
}

function guardarSemanasAB(config) {
    almacen.escribir('semanasAB', config);
}

function lunesDe(fecha) {
    const f = new Date(fecha);
    f.setHours(0, 0, 0, 0);
    return sumarDias(f, -((f.getDay() + 6) % 7));
}

// 'A' o 'B' para la semana de una fecha (null si no se usan semanas alternas)
function semanaDe(fecha, config = cargarSemanasAB()) {
    if (!config.activo || !config.referencia) return null;
    const semanas = Math.round((lunesDe(fecha) - lunesDe(leerFechaLocal(config.referencia))) / (7 * 86400000));
    return ((semanas % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

// Marca la semana de «fecha» como A o B
function fijarSemanaActual(letra, fecha = new Date()) {
    const lunes = lunesDe(fecha);
    const referencia = letra === 'A' ? lunes : sumarDias(lunes, -7);
    guardarSemanasAB({ ...cargarSemanasAB(), activo: true, referencia: fechaLocalISO(referencia) });
}
