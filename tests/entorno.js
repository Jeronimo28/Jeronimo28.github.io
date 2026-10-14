// Carga los scripts de la app en un contexto aislado (sin navegador) para poder probar su lógica.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

function crearAlmacenamiento(inicial = {}) {
    const datos = new Map(Object.entries(inicial));
    return {
        getItem: k => (datos.has(k) ? datos.get(k) : null),
        setItem: (k, v) => { datos.set(k, String(v)); },
        removeItem: k => { datos.delete(k); },
        clear: () => datos.clear(),
        key: i => [...datos.keys()][i] ?? null,
        get length() { return datos.size; },
        _datos: datos
    };
}

// Date con «ahora» fijo (hora local) para que las pruebas no dependan del día en que se ejecutan
function crearFechaFija(ahoraISO) {
    const Real = Date;
    const fijo = new Real(ahoraISO).getTime();
    class FechaFija extends Real {
        constructor(...args) {
            if (args.length === 0) super(fijo);
            else super(...args);
        }
        static now() { return fijo; }
    }
    FechaFija.parse = Real.parse;
    FechaFija.UTC = Real.UTC;
    return FechaFija;
}

const elementoVacio = () => null;

/**
 * @param {object} opciones
 * @param {string[]} opciones.scripts rutas relativas a la raíz de la app
 * @param {string} [opciones.ahora] fecha y hora local, p. ej. '2026-09-17T10:00:00'
 * @param {object} [opciones.localStorage] valores iniciales
 * @param {Function} [opciones.fetch]
 * @param {object} [opciones.globales] funciones o valores extra (stubs)
 */
function cargarApp({ scripts, ahora = '2026-09-17T10:00:00', localStorage: inicial = {}, fetch, globales = {} }) {
    const localStorage = crearAlmacenamiento(inicial);
    const contexto = {
        console,
        localStorage,
        Date: crearFechaFija(ahora),
        Intl,
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        requestAnimationFrame: () => 0,
        navigator: { onLine: true },
        fetch: fetch || (async () => { throw new TypeError('Failed to fetch'); }),
        document: {
            getElementById: elementoVacio,
            querySelector: elementoVacio,
            querySelectorAll: () => [],
            addEventListener: () => {},
            documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: { setProperty() {} }, dataset: {} },
            activeElement: null,
            hidden: false
        },
        window: {},
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        ...globales
    };
    contexto.window = Object.assign(contexto.window, { matchMedia: contexto.matchMedia, addEventListener() {} });
    contexto.addEventListener = () => {};
    vm.createContext(contexto);
    for (const script of scripts) {
        const codigo = fs.readFileSync(path.join(RAIZ, script), 'utf8');
        vm.runInContext(codigo, contexto, { filename: script });
    }
    return {
        contexto,
        localStorage,
        // Evalúa una expresión dentro de la app (acceso a funciones y variables globales)
        ev: codigo => vm.runInContext(codigo, contexto)
    };
}

module.exports = { cargarApp, crearAlmacenamiento };
