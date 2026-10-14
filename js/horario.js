/* ==========================================
   HORARIO SEMANAL DE CLASES
   ========================================== */

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const COLORES_CLASE = ['#ef5350', '#ffa726', '#fbc02d', '#66bb6a', '#26a69a', '#42a5f5', '#5c6bc0', '#ab47bc', '#ec407a', '#8d6e63'];
const ALTO_HORA_MIN = 30; // píxeles por hora: límites para que el cuadrante quepa sin hacer scroll
const ALTO_HORA_MAX = 72;
let altoHora = 56;

let mostrarFinde = localStorage.getItem('horarioFinde') === 'true';
let editingClaseId = null;
let diasSeleccionados = [];
let colorSeleccionado = COLORES_CLASE[0];
let asignaturaResaltada = null; // clave en minúsculas de la asignatura destacada en el cuadrante
let diaVistaMovil = null;       // día visible en la vista de un solo día (pantallas estrechas)
let semanaOffset = 0;           // semanas respecto a la actual que se muestran en el cuadrante
let semanaSeleccionada = null;  // semana (A/B) elegida en el formulario de clase

const claveAsignatura = nombre => String(nombre).trim().toLowerCase();

// En pantallas estrechas se muestra un día cada vez
function esVistaDia() {
    return window.matchMedia('(max-width: 600px)').matches;
}

// "HH:MM" -> minutos desde medianoche
function aMinutos(hhmm) {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return h * 60 + m;
}

// minutos -> "HH:MM"
function aHora(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Día de la semana con lunes = 0
function diaHoy() {
    return (new Date().getDay() + 6) % 7;
}

function minutosAhora() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

// "1 h 30 min", "45 min"...
function formatearDuracion(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h === 0) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
}

function colorSeguro(color) {
    return /^#[0-9a-f]{6}$/i.test(color) ? color : COLORES_CLASE[0];
}

// Cargar clases validando cada entrada (por si vienen de una copia antigua o editada a mano)
function cargarClases() {
    try {
        const datos = JSON.parse(localStorage.getItem('horarioApp'));
        if (!Array.isArray(datos)) return [];
        const formatoHora = /^\d{2}:\d{2}$/;
        return datos
            .filter(c => c && typeof c.asignatura === 'string' && Number.isInteger(c.dia) && c.dia >= 0 && c.dia <= 6
                && formatoHora.test(c.inicio) && formatoHora.test(c.fin))
            .map(c => ({
                id: String(c.id || `clase-${Math.random().toString(36).slice(2)}`),
                asignatura: c.asignatura,
                dia: c.dia,
                inicio: c.inicio,
                fin: c.fin,
                aula: c.aula || '',
                profesor: c.profesor || '',
                color: colorSeguro(c.color),
                notas: c.notas || '',
                semana: c.semana === 'A' || c.semana === 'B' ? c.semana : null
            }));
    } catch (e) {
        console.error('Error parseando horario de localStorage:', e);
        return [];
    }
}

function guardarClases(clases) {
    // «semana» solo se guarda en las clases de semanas alternas
    almacen.escribir('horarioApp', clases.map(c => {
        const salida = { ...c };
        if (!salida.semana) delete salida.semana;
        return salida;
    }));
}

// Clases que hay de verdad en una fecha: su día de la semana, su semana A/B y sin festivos
function clasesDeFecha(fecha, clases = cargarClases()) {
    const festivo = festivoDe(fechaLocalISO(fecha));
    if (festivo) return { clases: [], festivo };
    const dia = (fecha.getDay() + 6) % 7;
    const letra = semanaDe(fecha);
    return {
        clases: ordenarPorHora(clases.filter(c => c.dia === dia && (!c.semana || !letra || c.semana === letra))),
        festivo: null
    };
}

function lunesMostrado() {
    return sumarDias(lunesDe(new Date()), semanaOffset * 7);
}

// "15–21 sep" o "29 sep–5 oct"
function textoSemana(lunes) {
    const domingo = sumarDias(lunes, 6);
    const mismoMes = lunes.getMonth() === domingo.getMonth();
    const ini = lunes.toLocaleDateString('es-ES', mismoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    return `${ini}–${domingo.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
}

function ordenarPorHora(clases) {
    return [...clases].sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio));
}

// Agrupar clases por asignatura con sus horas semanales
function obtenerAsignaturas(clases) {
    const mapa = new Map();
    clases.forEach(c => {
        const clave = c.asignatura.trim().toLowerCase();
        const actual = mapa.get(clave) || { nombre: c.asignatura, color: c.color, profesor: '', minutos: 0, sesiones: 0 };
        actual.minutos += aMinutos(c.fin) - aMinutos(c.inicio);
        actual.sesiones++;
        if (!actual.profesor && c.profesor) actual.profesor = c.profesor;
        mapa.set(clave, actual);
    });
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function siguienteColorLibre(clases) {
    const usados = new Set(clases.map(c => c.color));
    return COLORES_CLASE.find(c => !usados.has(c)) || COLORES_CLASE[clases.length % COLORES_CLASE.length];
}

// Reparte las clases que se solapan en carriles para mostrarlas lado a lado
function calcularCarriles(clasesDia) {
    const resultado = [];
    let grupo = [];
    let finGrupo = -1;

    const cerrarGrupo = () => {
        const total = Math.max(...grupo.map(g => g.carril)) + 1;
        grupo.forEach(g => resultado.push({ ...g, total }));
        grupo = [];
        finGrupo = -1;
    };

    ordenarPorHora(clasesDia).forEach(clase => {
        const ini = aMinutos(clase.inicio);
        if (grupo.length && ini >= finGrupo) cerrarGrupo();
        const ocupados = grupo.filter(g => aMinutos(g.clase.fin) > ini).map(g => g.carril);
        let carril = 0;
        while (ocupados.includes(carril)) carril++;
        grupo.push({ clase, carril });
        finGrupo = Math.max(finGrupo, aMinutos(clase.fin));
    });
    if (grupo.length) cerrarGrupo();
    return resultado;
}

// Dibujar la cuadrícula semanal
function renderizarHorario(ajustado = false) {
    const grid = document.getElementById('horarioGrid');
    if (!grid) return;

    const clases = cargarClases();
    const numDias = mostrarFinde ? 7 : 5;
    const visibles = clases.filter(c => c.dia < numDias);
    const hoy = diaHoy();
    const ahora = minutosAhora();

    // Rango horario ajustado a las clases (mínimo 6 horas visibles)
    let inicioMin = 8 * 60;
    let finMin = 14 * 60;
    if (visibles.length > 0) {
        inicioMin = Math.floor(Math.min(...visibles.map(c => aMinutos(c.inicio))) / 60) * 60;
        finMin = Math.ceil(Math.max(...visibles.map(c => aMinutos(c.fin))) / 60) * 60;
        if (finMin - inicioMin < 6 * 60) {
            finMin = Math.min(24 * 60, inicioMin + 6 * 60);
            inicioMin = Math.max(0, finMin - 6 * 60);
        }
    }

    const horas = (finMin - inicioMin) / 60;
    const ALTO_HORA = altoHora;
    const pxPorMin = ALTO_HORA / 60;

    // Vista de un día (móvil) o semana completa
    const vistaDia = esVistaDia();
    if (diaVistaMovil === null || diaVistaMovil >= numDias) diaVistaMovil = hoy < numDias ? hoy : 0;
    const diasMostrados = vistaDia ? [diaVistaMovil] : [...Array(numDias).keys()];

    // Semana mostrada: fechas, festivos y clases de cada día (según la semana A/B)
    const lunes = lunesMostrado();
    const esEstaSemana = semanaOffset === 0;
    const letraSemana = semanaDe(lunes);
    const dias = [...Array(numDias).keys()].map(d => {
        const fecha = sumarDias(lunes, d);
        return { fecha, ...clasesDeFecha(fecha, visibles), hoy: esEstaSemana && d === hoy };
    });

    let html = '';
    if (vistaDia) {
        html += '<div class="hg-diatabs" role="tablist" aria-label="Elegir día">';
        for (let d = 0; d < numDias; d++) {
            const { clases: delDia, festivo, fecha } = dias[d];
            const detalle = festivo ? festivo.nombre : plural(delDia.length, 'clase');
            html += `
                <button type="button" role="tab" class="hg-diatab ${d === diaVistaMovil ? 'active' : ''} ${dias[d].hoy ? 'today' : ''} ${festivo ? 'festivo' : ''}"
                    data-vista="${d}" aria-selected="${d === diaVistaMovil}" title="${DIAS_SEMANA[d]} · ${escaparHTML(detalle)}" aria-label="${DIAS_SEMANA[d]} ${fecha.getDate()}, ${escaparHTML(detalle)}">
                    <span>${DIAS_CORTOS[d]}</span>
                    <span class="hg-daynum">${fecha.getDate()}</span>
                    <span class="hg-diatab-dots" aria-hidden="true">${festivo ? '🎉' : '•'.repeat(Math.min(delDia.length, 4))}</span>
                </button>`;
        }
        html += '</div>';
    } else {
        html += '<div class="hg-corner"></div>';
        diasMostrados.forEach(d => {
            const { festivo, fecha } = dias[d];
            html += `
                <div class="hg-dayhead ${dias[d].hoy ? 'today' : ''} ${festivo ? 'festivo' : ''}" ${festivo ? `title="${escaparHTML(festivo.nombre)}"` : ''}>
                    <span>${DIAS_CORTOS[d]}</span>
                    <span class="hg-daynum">${fecha.getDate()}</span>
                </div>`;
        });
    }

    html += '<div class="hg-times">';
    for (let h = 0; h < horas; h++) {
        html += `<span style="top:${h * ALTO_HORA}px">${aHora(inicioMin + h * 60)}</span>`;
    }
    if (esEstaSemana && hoy < numDias && ahora > inicioMin && ahora < finMin) {
        html += `<span class="hg-times-now" style="top:${(ahora - inicioMin) * pxPorMin}px">${aHora(ahora)}</span>`;
    }
    html += '</div>';

    diasMostrados.forEach(d => {
        const { festivo, clases: delDia } = dias[d];
        const esHoy = dias[d].hoy;
        html += `<div class="hg-col ${esHoy ? 'today' : ''} ${festivo ? 'festivo' : ''}" data-dia="${d}">`;
        if (festivo) {
            html += `<div class="hg-festivo"><span aria-hidden="true">${festivo.tipo === 'propio' ? '🏖️' : '🎉'}</span><span>${escaparHTML(festivo.nombre)}</span></div>`;
        }

        calcularCarriles(delDia).forEach(({ clase, carril, total }) => {
            const ini = aMinutos(clase.inicio);
            const fin = aMinutos(clase.fin);
            const duracion = fin - ini;
            const alto = duracion * pxPorMin;
            const enCurso = esHoy && ini <= ahora && ahora < fin;
            const pasada = esHoy && ahora >= fin;
            const resaltada = asignaturaResaltada === claveAsignatura(clase.asignatura);
            // Cuánta información cabe según el alto del bloque
            const nivel = alto < 44 ? 'compacta' : (alto >= 88 ? 'amplia' : '');
            const clasesCss = ['hg-clase', nivel, enCurso ? 'ahora' : '', pasada ? 'pasada' : '', resaltada ? 'resaltada' : '']
                .filter(Boolean).join(' ');
            const titulo = `${clase.asignatura} · ${clase.inicio}–${clase.fin} (${formatearDuracion(duracion)})${clase.aula ? ' · ' + clase.aula : ''}${clase.profesor ? ' · ' + clase.profesor : ''}${clase.notas ? '\n' + clase.notas : ''}`;

            html += `
                <button type="button" class="${clasesCss}" data-id="${escaparHTML(clase.id)}" title="${escaparHTML(titulo)}"
                    style="--c:${clase.color}; --carril:${carril}; --total:${total}; top:${(ini - inicioMin) * pxPorMin}px; height:${alto}px;">
                    <span class="hg-clase-nombre">${escaparHTML(clase.asignatura)}</span>
                    <span class="hg-clase-meta">${clase.inicio} – ${clase.fin}</span>
                    ${clase.aula ? `<span class="hg-clase-meta">📍 ${escaparHTML(clase.aula)}</span>` : ''}
                    ${clase.profesor ? `<span class="hg-clase-meta hg-clase-extra">👤 ${escaparHTML(clase.profesor)}</span>` : ''}
                    ${clase.semana ? `<span class="hg-clase-semana" title="Solo las semanas ${clase.semana}">${clase.semana}</span>` : ''}
                    ${clase.notas ? '<span class="hg-clase-nota" aria-hidden="true">📝</span>' : ''}
                </button>`;
        });

        // Línea de la hora actual: marcada en hoy y tenue en el resto de días
        if (esEstaSemana && hoy < numDias && ahora >= inicioMin && ahora <= finMin) {
            html += `<div class="hg-now ${esHoy ? '' : 'otro'}" style="top:${(ahora - inicioMin) * pxPorMin}px" aria-hidden="true"></div>`;
        }
        html += '</div>';
    });

    grid.classList.toggle('vista-dia', vistaDia);
    grid.classList.toggle('resaltando', !!asignaturaResaltada && visibles.some(c => claveAsignatura(c.asignatura) === asignaturaResaltada));
    grid.style.setProperty('--dias', diasMostrados.length);
    grid.style.setProperty('--hora', `${ALTO_HORA}px`);
    grid.style.setProperty('--alto', `${horas * ALTO_HORA}px`);
    grid.dataset.inicio = inicioMin;
    grid.dataset.hora = ALTO_HORA;
    grid.innerHTML = html;

    // Ajustar el alto de cada hora al espacio disponible para ver la semana completa sin bajar
    if (!ajustado) {
        const nuevoAlto = calcularAltoHora(grid, horas);
        if (nuevoAlto && nuevoAlto !== altoHora) {
            altoHora = nuevoAlto;
            renderizarHorario(true);
            return;
        }
    }

    document.getElementById('horarioVacio')?.classList.toggle('hidden', clases.length > 0);

    // Semana mostrada
    const etiquetaSemana = document.getElementById('horarioSemanaTexto');
    if (etiquetaSemana) {
        const sinClase = dias.filter(x => x.festivo).length;
        const cuando = esEstaSemana ? 'Esta semana'
            : semanaOffset === 1 ? 'Próxima semana'
            : semanaOffset === -1 ? 'Semana pasada'
            : semanaOffset > 0 ? `Dentro de ${semanaOffset} semanas` : `Hace ${-semanaOffset} semanas`;
        etiquetaSemana.textContent = `${cuando} · ${textoSemana(lunes)}${letraSemana ? ` · Semana ${letraSemana}` : ''}${sinClase ? ` · ${plural(sinClase, 'día sin clase', 'días sin clase')}` : ''}`;
    }
    document.getElementById('horarioSemanaHoy')?.toggleAttribute('disabled', esEstaSemana);

    // Resumen bajo el título
    const resumen = document.getElementById('horarioResumen');
    if (resumen) {
        if (clases.length === 0) {
            resumen.textContent = 'Sin clases todavía';
        } else {
            const totalMin = clases.reduce((suma, c) => suma + aMinutos(c.fin) - aMinutos(c.inicio), 0);
            const numAsig = obtenerAsignaturas(clases).length;
            let texto = `${numAsig} asignatura${numAsig !== 1 ? 's' : ''} · ${clases.length} clase${clases.length !== 1 ? 's' : ''} · ${formatearDuracion(totalMin)} a la semana`;
            const ocultas = clases.length - visibles.length;
            if (ocultas > 0) texto += ` · ${ocultas} en fin de semana (ocultas)`;
            resumen.textContent = texto;
        }
    }
}

// Píxeles por hora para que el cuadrante entero quepa en el panel visible
function calcularAltoHora(grid, horas) {
    const seccion = document.getElementById('horarioMainContainer');
    const panel = grid.closest('.main-panel');
    if (!seccion || !panel || seccion.offsetHeight === 0) return null;

    const estilo = getComputedStyle(panel);
    const relleno = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom);
    const maxPanel = parseFloat(estilo.maxHeight);
    // En modo app el panel tiene altura fija; en web está limitado por max-height; en móvil, la ventana
    const altoPanel = document.documentElement.classList.contains('app-mode') && panel.clientHeight > 0
        ? panel.clientHeight
        : (Number.isFinite(maxPanel) ? maxPanel : window.innerHeight);

    const altoActual = horas * Number(grid.dataset.hora || altoHora);
    const resto = seccion.scrollHeight - altoActual; // cabecera, días, consejo y márgenes
    const disponible = altoPanel - relleno - resto - 4;
    return Math.round(Math.min(ALTO_HORA_MAX, Math.max(ALTO_HORA_MIN, disponible / horas)));
}

// Tarjeta de una clase en el panel lateral
function tarjetaClaseLateral(c, estado = '') {
    const detalles = [c.aula && `📍 ${escaparHTML(c.aula)}`, c.profesor && escaparHTML(c.profesor)].filter(Boolean).join(' · ');
    return `
        <button type="button" class="clase-hoy ${estado}" data-id="${escaparHTML(c.id)}" style="--c:${c.color}">
            <span class="clase-hoy-hora">${c.inicio}<small>${c.fin}</small></span>
            <span class="clase-hoy-info">
                <strong>${escaparHTML(c.asignatura)}</strong>
                ${estado === 'ahora' ? '<span class="badge-ahora">En curso</span>' : ''}
                ${detalles ? `<small>${detalles}</small>` : ''}
            </span>
        </button>`;
}

// Panel lateral: clases de hoy y lista de asignaturas
function renderizarHorarioSidebar() {
    const listaHoy = document.getElementById('clasesHoyList');
    const listaAsig = document.getElementById('asignaturasList');
    if (!listaHoy || !listaAsig) return;

    const clases = cargarClases();
    const hoy = diaHoy();
    const ahora = minutosAhora();
    const { clases: deHoy, festivo } = clasesDeFecha(new Date(), clases);

    const titulo = document.getElementById('clasesHoyTitulo');
    if (titulo) titulo.textContent = `Hoy · ${DIAS_SEMANA[hoy]}`;

    if (deHoy.length === 0) {
        let html = festivo
            ? `<p class="sidebar-empty">${festivo.tipo === 'propio' ? '🏖️' : '🎉'} Hoy no hay clase: ${escaparHTML(festivo.nombre)}</p>`
            : '<p class="sidebar-empty">Hoy no tienes clases 🎉</p>';
        // Mostrar el próximo día con clases (hasta dos semanas vista, saltando festivos)
        for (let i = 1; i <= 14 && clases.length; i++) {
            const fecha = sumarDias(hoyLocal(), i);
            const { clases: delDia } = clasesDeFecha(fecha, clases);
            if (delDia.length) {
                const nombre = i === 1 ? 'Mañana' : i < 7 ? DIAS_SEMANA[(fecha.getDay() + 6) % 7] : formatoFechaCorta(fechaLocalISO(fecha));
                html += `<p class="clases-hoy-resumen">Próximas · ${nombre}</p>` + delDia.map(c => tarjetaClaseLateral(c)).join('');
                break;
            }
        }
        listaHoy.innerHTML = html;
    } else {
        const totalMin = deHoy.reduce((suma, c) => suma + aMinutos(c.fin) - aMinutos(c.inicio), 0);
        const ultimaFin = Math.max(...deHoy.map(c => aMinutos(c.fin)));
        const restantes = deHoy.filter(c => aMinutos(c.fin) > ahora).length;
        const estadoDia = restantes === 0
            ? 'Clases de hoy terminadas ✅'
            : `${restantes === deHoy.length ? '' : `Quedan ${restantes} de `}${deHoy.length} clase${deHoy.length !== 1 ? 's' : ''} · ${formatearDuracion(totalMin)} · hasta las ${aHora(ultimaFin)}`;

        let html = `<p class="clases-hoy-resumen">${estadoDia}</p>`;
        let finAnterior = null;
        deHoy.forEach(c => {
            const ini = aMinutos(c.inicio);
            const fin = aMinutos(c.fin);
            // Hueco libre entre clases
            if (finAnterior !== null && ini - finAnterior >= 15) {
                const libreAhora = ahora >= finAnterior && ahora < ini;
                html += `
                    <div class="hueco-libre ${libreAhora ? 'ahora' : ''} ${ahora >= ini ? 'pasada' : ''}">
                        <span>${libreAhora ? '☕ Libre ahora' : 'Hueco libre'}</span><span>${formatearDuracion(ini - finAnterior)}</span>
                    </div>`;
            }
            const estado = ahora >= fin ? 'pasada' : (ahora >= ini ? 'ahora' : '');
            html += tarjetaClaseLateral(c, estado);
            finAnterior = Math.max(finAnterior ?? 0, fin);
        });
        listaHoy.innerHTML = html;
    }

    const asignaturas = obtenerAsignaturas(clases);
    if (asignaturaResaltada && !asignaturas.some(a => claveAsignatura(a.nombre) === asignaturaResaltada)) asignaturaResaltada = null;

    if (asignaturas.length === 0) {
        listaAsig.innerHTML = `<p class="sidebar-empty">Las asignaturas aparecerán aquí al añadir clases.</p>`;
    } else {
        listaAsig.innerHTML = asignaturas.map(a => {
            const clave = claveAsignatura(a.nombre);
            const activa = clave === asignaturaResaltada;
            const pendientes = tareasDeAsignatura(a.nombre).length;
            const ayuda = `${a.sesiones} clase${a.sesiones !== 1 ? 's' : ''} a la semana${a.profesor ? ' · ' + a.profesor : ''}. Pulsa para resaltarla en el horario`;
            return `
            <button type="button" class="asignatura-item ${activa ? 'active' : ''}" style="--c:${a.color}" data-asig="${escaparHTML(clave)}"
                aria-pressed="${activa}" title="${escaparHTML(ayuda)}">
                <span class="asignatura-dot"></span>
                <span class="asignatura-nombre">${escaparHTML(a.nombre)}</span>
                ${pendientes ? `<span class="asignatura-pendientes" title="${plural(pendientes, 'tarea pendiente', 'tareas pendientes')}">${pendientes}</span>` : ''}
                <span class="asignatura-horas">${a.sesiones}× · ${formatearDuracion(a.minutos)}</span>
            </button>`;
        }).join('');
    }
}

function alternarResaltado(clave) {
    asignaturaResaltada = asignaturaResaltada === clave ? null : clave;
    renderizarHorario();
    renderizarHorarioSidebar();
}

// Aviso de la clase actual o la siguiente (visible en todas las pestañas)
function actualizarProximaClase() {
    const chip = document.getElementById('nextClassChip');
    if (!chip) return;
    // En la pestaña Horario ya se ve en el panel lateral
    if (typeof activeTab !== 'undefined' && activeTab === 'horario') {
        chip.classList.add('hidden');
        return;
    }

    const ahora = minutosAhora();
    const deHoy = clasesDeFecha(new Date()).clases;
    const actual = deHoy.find(c => aMinutos(c.inicio) <= ahora && ahora < aMinutos(c.fin));
    const siguiente = deHoy.find(c => aMinutos(c.inicio) > ahora);

    if (actual) {
        chip.style.setProperty('--c', actual.color);
        chip.innerHTML = `🎓 <span>Ahora: <strong>${escaparHTML(actual.asignatura)}</strong> · hasta las ${actual.fin}${actual.aula ? ` · ${escaparHTML(actual.aula)}` : ''}</span>`;
        chip.classList.remove('hidden');
    } else if (siguiente) {
        const falta = aMinutos(siguiente.inicio) - ahora;
        chip.style.setProperty('--c', siguiente.color);
        chip.innerHTML = `⏭️ <span><strong>${escaparHTML(siguiente.asignatura)}</strong> a las ${siguiente.inicio} (en ${formatearDuracion(falta)})${siguiente.aula ? ` · ${escaparHTML(siguiente.aula)}` : ''}</span>`;
        chip.classList.remove('hidden');
    } else {
        chip.classList.add('hidden');
    }
}

// delta = 0 vuelve a la semana actual
function cambiarSemanaHorario(delta) {
    semanaOffset = delta === 0 ? 0 : semanaOffset + delta;
    renderizarHorario();
}

function refrescarHorario() {
    renderizarHorario();
    renderizarHorarioSidebar();
    actualizarProximaClase();
}

// --- Modal de clase ---

function renderizarChipsDias() {
    const cont = document.getElementById('claseDias');
    if (!cont) return;
    cont.innerHTML = DIAS_CORTOS.map((d, i) => {
        const activo = diasSeleccionados.includes(i);
        return `<button type="button" class="day-chip ${activo ? 'active' : ''}" data-dia="${i}" aria-pressed="${activo}" title="${DIAS_SEMANA[i]}">${d}</button>`;
    }).join('');
}

// Todas las semanas / solo A / solo B (visible si se usan semanas alternas)
function renderizarSemanaClase() {
    const campo = document.getElementById('claseSemanaCampo');
    if (!campo) return;
    campo.classList.toggle('hidden', !cargarSemanasAB().activo && !semanaSeleccionada);
    campo.querySelectorAll('[data-semana]').forEach(b => {
        const activo = (b.dataset.semana || null) === semanaSeleccionada;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', activo);
    });
}

function renderizarColores() {
    const cont = document.getElementById('claseColores');
    if (!cont) return;
    cont.innerHTML = COLORES_CLASE.map(c =>
        `<button type="button" class="swatch ${c === colorSeleccionado ? 'active' : ''}" data-color="${c}" style="--c:${c}" aria-label="Color ${c}" aria-pressed="${c === colorSeleccionado}"></button>`
    ).join('');
}

function abrirModalClase(opciones = {}) {
    const clases = cargarClases();
    const clase = opciones.id ? clases.find(c => c.id === opciones.id) : null;
    // Al duplicar se rellenan los datos de otra clase pero se guarda como nueva
    const base = clase || (opciones.copiaDe ? clases.find(c => c.id === opciones.copiaDe) : null);
    editingClaseId = clase ? clase.id : null;

    document.getElementById('modalClaseTitle').textContent = clase ? 'Editar clase' : (base ? 'Duplicar clase' : 'Nueva clase');
    document.getElementById('claseAsignatura').value = base ? base.asignatura : '';
    document.getElementById('claseInicio').value = base ? base.inicio : (opciones.inicio || '09:00');
    document.getElementById('claseFin').value = base ? base.fin : (opciones.fin || '10:00');
    document.getElementById('claseAula').value = base ? base.aula : '';
    document.getElementById('claseProfesor').value = base ? base.profesor : '';
    document.getElementById('claseNotas').value = base ? base.notas : '';
    document.getElementById('claseError').textContent = '';
    document.getElementById('btnEliminarClase').classList.toggle('hidden', !clase);
    document.getElementById('btnDuplicarClase').classList.toggle('hidden', !clase);

    const numDias = mostrarFinde ? 7 : 5;
    const diaPorDefecto = opciones.dia ?? (diaHoy() < numDias ? diaHoy() : 0);
    diasSeleccionados = clase ? [clase.dia] : (base ? [] : [diaPorDefecto]);
    colorSeleccionado = base ? base.color : siguienteColorLibre(clases);
    semanaSeleccionada = base ? base.semana : null;

    // Sugerencias con las asignaturas ya creadas
    document.getElementById('asignaturasDatalist').innerHTML = obtenerAsignaturas(clases)
        .map(a => `<option value="${escaparHTML(a.nombre)}"></option>`).join('');

    renderizarChipsDias();
    renderizarColores();
    renderizarSemanaClase();
    actualizarAvisoClase();
    renderizarTareasDeClase();
    renderizarApuntesDeClase();
    abrirModal('modalClase');
    if (base && !clase) {
        document.getElementById('claseError').textContent = 'Elige el día (o días) para la copia.';
    }
    setTimeout(() => document.getElementById('claseAsignatura')?.focus(), 60);
}

// Duración y posibles solapes de la clase que se está editando
function actualizarAvisoClase() {
    const aviso = document.getElementById('claseAviso');
    if (!aviso) return;
    const inicio = document.getElementById('claseInicio').value;
    const fin = document.getElementById('claseFin').value;
    aviso.classList.remove('alerta');

    if (!inicio || !fin || aMinutos(fin) <= aMinutos(inicio)) {
        aviso.textContent = '';
        return;
    }

    const ini = aMinutos(inicio);
    const f = aMinutos(fin);
    // Dos clases de semanas alternas distintas (A y B) no coinciden nunca
    const solapes = cargarClases().filter(c => c.id !== editingClaseId && diasSeleccionados.includes(c.dia)
        && !(c.semana && semanaSeleccionada && c.semana !== semanaSeleccionada)
        && aMinutos(c.inicio) < f && ini < aMinutos(c.fin));

    let texto = `⏱️ Duración: ${formatearDuracion(f - ini)}`;
    if (solapes.length) {
        const lista = ordenarPorHora(solapes).slice(0, 3)
            .map(c => `${c.asignatura} (${DIAS_CORTOS[c.dia]} ${c.inicio}–${c.fin})`).join(', ');
        texto += ` · ⚠️ Coincide con ${lista}${solapes.length > 3 ? '…' : ''}`;
        aviso.classList.add('alerta');
    }
    aviso.textContent = texto;
}

function cerrarModalClase() {
    cerrarModal('modalClase');
    editingClaseId = null;
}

// Al escribir una asignatura existente, reutilizar su color y profesor
function autocompletarAsignatura() {
    const nombre = document.getElementById('claseAsignatura').value.trim().toLowerCase();
    if (!nombre) return;
    const existente = obtenerAsignaturas(cargarClases()).find(a => a.nombre.trim().toLowerCase() === nombre);
    if (!existente) return;
    colorSeleccionado = existente.color;
    renderizarColores();
    const inputProfesor = document.getElementById('claseProfesor');
    if (!inputProfesor.value && existente.profesor) inputProfesor.value = existente.profesor;
}

function guardarClase(e) {
    e.preventDefault();

    const asignatura = document.getElementById('claseAsignatura').value.trim();
    const inicio = document.getElementById('claseInicio').value;
    const fin = document.getElementById('claseFin').value;
    const errorEl = document.getElementById('claseError');

    let error = '';
    if (!asignatura) error = 'Escribe el nombre de la asignatura.';
    else if (diasSeleccionados.length === 0) error = 'Elige al menos un día.';
    else if (!inicio || !fin) error = 'Indica la hora de inicio y de fin.';
    else if (aMinutos(fin) <= aMinutos(inicio)) error = 'La hora de fin debe ser posterior a la de inicio.';

    if (error) {
        errorEl.textContent = error;
        return;
    }

    const datos = {
        asignatura,
        inicio,
        fin,
        aula: document.getElementById('claseAula').value.trim(),
        profesor: document.getElementById('claseProfesor').value.trim(),
        color: colorSeleccionado,
        notas: document.getElementById('claseNotas').value.trim(),
        semana: semanaSeleccionada
    };

    const clases = cargarClases();
    const dias = [...diasSeleccionados].sort((a, b) => a - b);
    let nuevos = dias;

    if (editingClaseId) {
        const idx = clases.findIndex(c => c.id === editingClaseId);
        if (idx !== -1) {
            // La clase editada se queda con el primer día; el resto de días crean copias
            clases[idx] = { ...clases[idx], ...datos, dia: dias[0] };
            nuevos = dias.slice(1);
        }
    }
    nuevos.forEach(dia => {
        clases.push({ id: `clase-${Date.now()}-${dia}-${Math.random().toString(36).slice(2, 6)}`, ...datos, dia });
    });

    // Mantener el mismo color en todas las clases de la asignatura
    clases.forEach(c => {
        if (c.asignatura.trim().toLowerCase() === asignatura.toLowerCase()) c.color = colorSeleccionado;
    });

    // Si hay clases en fin de semana, mostrarlo automáticamente
    if (dias.some(d => d >= 5) && !mostrarFinde) {
        mostrarFinde = true;
        localStorage.setItem('horarioFinde', 'true');
        const toggle = document.getElementById('toggleFinde');
        if (toggle) toggle.checked = true;
    }

    guardarClases(clases);
    const eraEdicion = !!editingClaseId;
    cerrarModalClase();
    refrescarHorario();
    mostrarAviso(eraEdicion ? 'Clase actualizada ✅' : (dias.length > 1 ? `${dias.length} clases añadidas ✅` : 'Clase añadida ✅'));
}

function eliminarClase() {
    if (!editingClaseId) return;
    const clases = cargarClases();
    const indice = clases.findIndex(c => c.id === editingClaseId);
    if (indice === -1) return;
    const clase = clases[indice];

    guardarClases(clases.filter(c => c.id !== editingClaseId));
    cerrarModalClase();
    refrescarHorario();
    mostrarAviso(`🗑️ Clase de ${clase.asignatura} (${DIAS_CORTOS[clase.dia]} ${clase.inicio}) eliminada`, {
        accion: 'Deshacer',
        alPulsar: () => {
            const actuales = cargarClases();
            if (!actuales.some(c => c.id === clase.id)) {
                actuales.splice(Math.min(indice, actuales.length), 0, clase);
                guardarClases(actuales);
            }
            refrescarHorario();
        }
    });
}

function duplicarClase() {
    const id = editingClaseId;
    if (!id) return;
    cerrarModalClase();
    setTimeout(() => abrirModalClase({ copiaDe: id }), 260);
}

/* ---------- Tareas vinculadas a una asignatura ---------- */

function tareasDeAsignatura(nombre) {
    const clave = normalizar(nombre);
    if (!clave) return [];
    return tareas.filter(t => !t.completada && normalizar(`${t.texto} ${t.notas}`).includes(clave))
        .sort((a, b) => claveOrdenFecha(a).localeCompare(claveOrdenFecha(b)));
}

function renderizarTareasDeClase() {
    const cont = document.getElementById('claseTareas');
    if (!cont) return;
    const asignatura = document.getElementById('claseAsignatura').value.trim();
    if (!asignatura || !editingClaseId) {
        cont.classList.add('hidden');
        return;
    }
    const lista = tareasDeAsignatura(asignatura);
    cont.classList.remove('hidden');
    document.getElementById('claseTareasTitulo').textContent = lista.length ? `Tareas pendientes · ${lista.length}` : 'Tareas pendientes';
    document.getElementById('claseTareasLista').innerHTML = lista.length
        ? lista.slice(0, 6).map(t => {
            const f = etiquetaFecha(t);
            return `
            <li>
                <button type="button" class="clase-tarea prio-${t.prioridad}" data-tarea="${escaparHTML(t.id)}">
                    <span class="clase-tarea-texto">${escaparHTML(t.texto)}</span>
                    ${f ? `<span class="todo-date ${f.clase}">${escaparHTML(f.texto)}</span>` : ''}
                </button>
            </li>`;
        }).join('') + (lista.length > 6 ? `<li class="clase-tareas-mas">y ${lista.length - 6} más…</li>` : '')
        : '<li class="clase-tareas-vacio">Nada pendiente. Añade exámenes, entregas o deberes 👇</li>';
}

/* ---------- Apuntes (notas) de una asignatura ---------- */

function renderizarApuntesDeClase() {
    const cont = document.getElementById('claseApuntes');
    if (!cont) return;
    const asignatura = document.getElementById('claseAsignatura').value.trim();
    if (!asignatura || !editingClaseId) {
        cont.classList.add('hidden');
        return;
    }
    const lista = notasDeAsignatura(asignatura, notas.length ? notas : (cargarNotas() || []));
    cont.classList.remove('hidden');
    document.getElementById('claseApuntesTitulo').textContent = lista.length ? `Apuntes · ${lista.length}` : 'Apuntes';
    document.getElementById('claseApuntesLista').innerHTML = lista.length
        ? lista.slice(0, 5).map(n => `
            <li>
                <button type="button" class="clase-tarea" data-nota="${escaparHTML(n.id)}">
                    <span class="clase-tarea-texto">${n.fijada ? '📌 ' : ''}${escaparHTML(n.titulo || 'Sin título')}</span>
                    <span class="todo-date">${escaparHTML(formatearFechaNota(n.fechaModificacion))}</span>
                </button>
            </li>`).join('') + (lista.length > 5 ? `<li class="clase-tareas-mas">y ${lista.length - 5} más…</li>` : '')
        : '<li class="clase-tareas-vacio">Aún no hay notas de esta asignatura.</li>';
}

function abrirApunte(id) {
    cerrarModalClase();
    cambiarPestana('notas');
    seleccionarNota(id);
}

function nuevaNotaDeClase() {
    const asignatura = obtenerAsignaturas(cargarClases()).find(a => normalizar(a.nombre) === normalizar(document.getElementById('claseAsignatura').value))?.nombre
        || document.getElementById('claseAsignatura').value.trim();
    cerrarModalClase();
    cambiarPestana('notas');
    crearNuevaNota({ asignatura });
}

function agregarTareaDeClase() {
    const input = document.getElementById('claseNuevaTarea');
    const asignatura = document.getElementById('claseAsignatura').value.trim();
    if (!input.value.trim() || !asignatura) return;
    const a = analizarEntrada(input.value);
    if (!a.texto) return;
    const texto = normalizar(a.texto).includes(normalizar(asignatura)) ? a.texto : `${asignatura}: ${a.texto}`;
    crearTarea({ texto, fechaTarea: a.fechaTarea, hora: a.hora, prioridad: a.prioridad, categoria: a.categoria, repetir: a.repetir });
    input.value = '';
    renderizarTareasDeClase();
    actualizarDashboard();
    renderizarHorarioSidebar();
    mostrarAviso('✅ Tarea añadida');
}

/* ---------- Eventos ---------- */

function inicializarEventosHorario() {
    const grid = document.getElementById('horarioGrid');
    grid?.addEventListener('click', (e) => {
        const pestanaDia = e.target.closest('.hg-diatab');
        if (pestanaDia) {
            diaVistaMovil = Number(pestanaDia.dataset.vista);
            renderizarHorario();
            return;
        }
        const bloque = e.target.closest('.hg-clase');
        if (bloque) {
            abrirModalClase({ id: bloque.dataset.id });
            return;
        }
        const col = e.target.closest('.hg-col');
        if (!col) return;
        // Crear una clase en el hueco pulsado (redondeado a la media hora)
        const y = e.clientY - col.getBoundingClientRect().top;
        const minuto = Number(grid.dataset.inicio) + Math.floor((y / Number(grid.dataset.hora || altoHora)) * 2) * 30;
        abrirModalClase({
            dia: Number(col.dataset.dia),
            inicio: aHora(minuto),
            fin: aHora(Math.min(minuto + 60, 23 * 60 + 55))
        });
    });

    document.getElementById('clasesHoyList')?.addEventListener('click', (e) => {
        const item = e.target.closest('.clase-hoy');
        if (item) abrirModalClase({ id: item.dataset.id });
    });

    document.getElementById('btnNuevaClase')?.addEventListener('click', () => abrirModalClase());
    document.getElementById('horarioSemanaAnterior')?.addEventListener('click', () => cambiarSemanaHorario(-1));
    document.getElementById('horarioSemanaSiguiente')?.addEventListener('click', () => cambiarSemanaHorario(1));
    document.getElementById('horarioSemanaHoy')?.addEventListener('click', () => cambiarSemanaHorario(0));
    document.getElementById('btnFestivos')?.addEventListener('click', abrirFestivos);
    document.getElementById('claseSemanaCampo')?.addEventListener('click', e => {
        const b = e.target.closest('[data-semana]');
        if (!b) return;
        semanaSeleccionada = b.dataset.semana || null;
        renderizarSemanaClase();
        actualizarAvisoClase();
    });
    document.getElementById('btnPrintHorario')?.addEventListener('click', () => window.print());
    document.getElementById('nextClassChip')?.addEventListener('click', () => cambiarPestana('horario'));

    const toggleFinde = document.getElementById('toggleFinde');
    if (toggleFinde) {
        toggleFinde.checked = mostrarFinde;
        toggleFinde.addEventListener('change', () => {
            mostrarFinde = toggleFinde.checked;
            localStorage.setItem('horarioFinde', String(mostrarFinde));
            renderizarHorario();
        });
    }

    document.getElementById('claseDias')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.day-chip');
        if (!chip) return;
        const dia = Number(chip.dataset.dia);
        diasSeleccionados = diasSeleccionados.includes(dia)
            ? diasSeleccionados.filter(d => d !== dia)
            : [...diasSeleccionados, dia];
        document.getElementById('claseError').textContent = '';
        renderizarChipsDias();
        actualizarAvisoClase();
    });

    document.getElementById('claseColores')?.addEventListener('click', (e) => {
        const swatch = e.target.closest('.swatch');
        if (!swatch) return;
        colorSeleccionado = swatch.dataset.color;
        renderizarColores();
    });

    document.getElementById('claseAsignatura')?.addEventListener('change', () => {
        autocompletarAsignatura();
        renderizarTareasDeClase();
        renderizarApuntesDeClase();
    });
    document.getElementById('claseApuntesLista')?.addEventListener('click', e => {
        const b = e.target.closest('[data-nota]');
        if (b) abrirApunte(b.dataset.nota);
    });
    document.getElementById('claseNuevaNota')?.addEventListener('click', nuevaNotaDeClase);
    ['claseInicio', 'claseFin'].forEach(id => document.getElementById(id)?.addEventListener('input', actualizarAvisoClase));

    document.getElementById('asignaturasList')?.addEventListener('click', (e) => {
        const item = e.target.closest('.asignatura-item');
        if (item) alternarResaltado(item.dataset.asig);
    });
    document.getElementById('formClase')?.addEventListener('submit', guardarClase);
    document.getElementById('btnEliminarClase')?.addEventListener('click', eliminarClase);
    document.getElementById('btnDuplicarClase')?.addEventListener('click', duplicarClase);
    document.getElementById('btnCancelarClase')?.addEventListener('click', cerrarModalClase);
    document.getElementById('closeModalClase')?.addEventListener('click', cerrarModalClase);

    document.getElementById('claseTareasLista')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tarea]');
        if (!b) return;
        cerrarModalClase();
        abrirTareaDondeToca(b.dataset.tarea);
    });
    document.getElementById('claseNuevaTarea')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            agregarTareaDeClase();
        }
    });
    document.getElementById('claseAgregarTarea')?.addEventListener('click', agregarTareaDeClase);

    const modalClase = document.getElementById('modalClase');
    modalClase?.addEventListener('click', (e) => {
        if (e.target === modalClase) cerrarModalClase();
    });
}
