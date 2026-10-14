/* ==========================================
   TAREAS · estado, carga y guardado, estadísticas
   ========================================== */

let tareas = [];
let categorias = [];
let criterioOrden = ['fecha', 'prioridad', 'matriz'].includes(localStorage.getItem('criterioOrden')) ? localStorage.getItem('criterioOrden') : 'fecha';
let ascendente = localStorage.getItem('ascendente') !== 'false';
let searchQuery = '';
let filtroTareas = almacen.leer('vistaTareas', { tipo: 'vista', valor: 'todas' });
let gruposPlegados = new Set(almacen.leer('gruposPlegados', []));
let fichasIgnoradas = new Set();
let tareaAbiertaId = null;
let ultimaTareaCreadaId = null;

const PRIORIDADES = ['ninguna', 'baja', 'media', 'alta'];
const NOMBRE_PRIORIDAD = { alta: 'Alta', media: 'Media', baja: 'Baja', ninguna: 'Sin prioridad' };
const REPETICIONES = {
    diaria: 'Cada día',
    laborables: 'Entre semana (L-V)',
    semanal: 'Cada semana',
    mensual: 'Cada mes'
};

// Tipo de entrada: exámenes y eventos se muestran solo en el calendario
const TIPOS_TAREA = {
    tarea: { icono: '✅', nombre: 'Tarea' },
    examen: { icono: '📝', nombre: 'Examen' },
    evento: { icono: '📌', nombre: 'Evento' }
};

function tipoTarea(t) {
    return TIPOS_TAREA[t.tipo] ? t.tipo : 'tarea';
}

// Exámenes y eventos viven solo en el calendario; el resto son tareas normales
function esDeCalendario(t) {
    return t.tipo === 'examen' || t.tipo === 'evento';
}

function tareasDeLista() {
    return tareas.filter(t => !esDeCalendario(t));
}

const VISTAS = {
    todas: { icono: '📋', nombre: 'Todas', titulo: 'Todas las tareas' },
    hoy: { icono: '☀️', nombre: 'Hoy', titulo: 'Hoy' },
    proximas: { icono: '📆', nombre: 'Próximos 7 días', titulo: 'Próximos 7 días' },
    vencidas: { icono: '⏰', nombre: 'Vencidas', titulo: 'Vencidas' },
    sinfecha: { icono: '🗂️', nombre: 'Sin fecha', titulo: 'Sin fecha' },
    completadas: { icono: '✅', nombre: 'Completadas', titulo: 'Completadas' }
};

/* ---------- Carga y guardado (compatible con los datos existentes) ---------- */

function cargarCategorias() {
    const guardadas = almacen.leer('categoriasApp', null);
    if (Array.isArray(guardadas) && guardadas.length) {
        categorias = guardadas.filter(c => c && c.id).map(c => ({ ...c, nombre: String(c.nombre ?? ''), icono: String(c.icono || '📁') }));
        return categorias;
    }
    categorias = [
        { id: 'personal', nombre: 'Personal', icono: '👤' },
        { id: 'trabajo', nombre: 'Trabajo', icono: '💼' },
        { id: 'hogar', nombre: 'Hogar', icono: '🏠' },
        { id: 'compras', nombre: 'Compras', icono: '🛒' }
    ];
    if (guardadas === null) guardarCategorias();
    return categorias;
}

function guardarCategorias() {
    almacen.escribir('categoriasApp', categorias);
}

function categoriaPorDefecto() {
    return categorias.length > 0 ? categorias[0].id : 'personal';
}

function cargarTareas() {
    const datos = almacen.leer('tareasApp', []);
    let asignoIds = false;

    tareas = (Array.isArray(datos) ? datos : []).filter(t => t && typeof t === 'object').map(t => {
        // Conservar cualquier campo existente y completar los que falten
        const tarea = { ...t };
        if (!tarea.id) {
            tarea.id = generarId('t');
            asignoIds = true;
        }
        tarea.texto = String(t.texto ?? '');
        tarea.completada = !!t.completada;
        tarea.fecha = t.fecha || new Date().toISOString();
        tarea.fechaTarea = t.fechaTarea || null;
        tarea.prioridad = PRIORIDADES.includes(t.prioridad) ? t.prioridad : 'ninguna';
        tarea.categoria = categorias.some(c => c.id === t.categoria) ? t.categoria : categoriaPorDefecto();
        tarea.subtareas = Array.isArray(t.subtareas)
            ? t.subtareas.filter(s => s && typeof s.texto === 'string').map(s => ({ id: s.id || generarId('s'), texto: s.texto, hecha: !!s.hecha }))
            : [];
        tarea.notas = typeof t.notas === 'string' ? t.notas : '';
        tarea.repetir = REPETICIONES[t.repetir] ? t.repetir : null;
        tarea.hora = /^\d{2}:\d{2}$/.test(t.hora) ? t.hora : null;
        tarea.tipo = TIPOS_TAREA[t.tipo] ? t.tipo : null;
        return tarea;
    });

    // Los identificadores estables se añaden una sola vez; el resto de campos no cambia
    if (asignoIds) guardarTareas();
    return tareas;
}

// Solo se escriben los campos nuevos cuando tienen contenido, para mantener el formato original
function serializarTarea(t) {
    const salida = { ...t };
    if (!salida.subtareas?.length) delete salida.subtareas;
    if (!salida.notas) delete salida.notas;
    if (!salida.repetir) delete salida.repetir;
    if (!salida.hora) delete salida.hora;
    if (!salida.tipo) delete salida.tipo;
    if (!salida.completadaEn) delete salida.completadaEn;
    if (!salida.siguienteId) delete salida.siguienteId;
    delete salida.enfoque;
    return salida;
}

function guardarTareas() {
    almacen.escribir('tareasApp', tareas.map(serializarTarea));
}

function buscarTarea(id) {
    return tareas.find(t => t.id === id);
}

function obtenerCategoria(catId) {
    return categorias.find(c => c.id === catId);
}

function nombreCategoriaHTML(catId) {
    const cat = obtenerCategoria(catId);
    return cat ? `${escaparHTML(cat.icono)} ${escaparHTML(cat.nombre)}` : '📁 General';
}

/* ---------- Estadísticas: actividad diaria y racha ---------- */

function registrarActividad(delta) {
    const stats = almacen.leer('estadisticasApp', {});
    const clave = fechaLocalISO();
    stats[clave] = Math.max(0, (stats[clave] || 0) + delta);
    // Conservar solo los últimos 400 días
    const limite = fechaLocalISO(sumarDias(new Date(), -400));
    Object.keys(stats).forEach(k => { if (k < limite) delete stats[k]; });
    almacen.escribir('estadisticasApp', stats);
}

function calcularRacha(stats) {
    let dia = hoyLocal();
    if (!stats[fechaLocalISO(dia)]) dia = sumarDias(dia, -1);
    let racha = 0;
    while (stats[fechaLocalISO(dia)] > 0) {
        racha++;
        dia = sumarDias(dia, -1);
    }
    return racha;
}

function esHoyISO(iso) {
    return !!iso && new Date(iso).toDateString() === new Date().toDateString();
}
