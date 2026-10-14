/* ==========================================
   CALENDARIO: exámenes, eventos y tareas con fecha
   (usa las mismas tareas: todo lo que tenga día aparece aquí)
   ========================================== */

const MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MAX_CHIPS_DIA = 3;

let calMes = (() => { const h = hoyLocal(); return new Date(h.getFullYear(), h.getMonth(), 1); })();
let calDiaSel = fechaLocalISO();
let calTipoNuevo = 'tarea';

// Lunes de la semana en la que empieza el mes (la cuadrícula siempre tiene 6 semanas)
function inicioCuadricula(mes) {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    return sumarDias(primero, -((primero.getDay() + 6) % 7));
}

// Entradas por día entre dos fechas ISO: tareas reales + próximas repeticiones (en gris)
function entradasCalendario(desdeISO, hastaISO) {
    const porDia = {};
    const anadir = (iso, entrada) => (porDia[iso] ||= []).push(entrada);

    tareas.forEach(t => {
        if (!t.fechaTarea) return;
        if (t.fechaTarea >= desdeISO && t.fechaTarea <= hastaISO) anadir(t.fechaTarea, { t, prevista: false });

        // Repeticiones futuras de tareas pendientes (aún no creadas)
        if (!t.repetir || t.completada || (t.siguienteId && buscarTarea(t.siguienteId))) return;
        let f = t.fechaTarea;
        for (let i = 0; i < 400; i++) {
            f = siguienteFecha(f, t.repetir);
            if (f > hastaISO) break;
            if (f >= desdeISO) anadir(f, { t, prevista: true });
        }
    });

    Object.values(porDia).forEach(lista => lista.sort((a, b) =>
        (a.t.completada - b.t.completada) || (a.t.hora || '99:99').localeCompare(b.t.hora || '99:99') ||
        (tipoTarea(b.t) === 'examen') - (tipoTarea(a.t) === 'examen')));
    return porDia;
}

function colorTipo(tipo) {
    return tipo === 'examen' ? 'var(--prio-high)' : tipo === 'evento' ? '#42a5f5' : 'var(--accent)';
}

function htmlChipCalendario({ t, prevista }) {
    const tipo = tipoTarea(t);
    const clases = ['cal-chip', `tipo-${tipo}`, t.completada ? 'hecha' : '', prevista ? 'prevista' : ''].filter(Boolean).join(' ');
    const titulo = `${TIPOS_TAREA[tipo].nombre}: ${t.texto}${t.hora ? ` · ${t.hora}` : ''}${prevista ? ' (repetición)' : ''}`;
    return `<button type="button" class="${clases}" style="--c:${colorTipo(tipo)}" data-tarea="${escaparHTML(t.id)}" draggable="${!prevista}" title="${escaparHTML(titulo)}">
        ${tipo !== 'tarea' ? `<span aria-hidden="true">${TIPOS_TAREA[tipo].icono}</span>` : ''}${t.hora ? `<b>${t.hora}</b>` : ''}<span class="cal-chip-texto">${escaparHTML(t.texto)}</span>
    </button>`;
}

function renderizarCalendario() {
    const grid = document.getElementById('calGrid');
    if (!grid) return;

    const inicio = inicioCuadricula(calMes);
    const fin = sumarDias(inicio, 41);
    const porDia = entradasCalendario(fechaLocalISO(inicio), fechaLocalISO(fin));
    const hoyISO = fechaLocalISO();

    document.getElementById('calTitulo').textContent = `${MESES_NOMBRE[calMes.getMonth()]} ${calMes.getFullYear()}`;
    const delMes = Object.entries(porDia).filter(([iso]) => leerFechaLocal(iso).getMonth() === calMes.getMonth())
        .flatMap(([, l]) => l).filter(e => !e.t.completada && !e.prevista);
    const examenes = delMes.filter(e => tipoTarea(e.t) === 'examen').length;
    document.getElementById('calResumen').textContent = delMes.length
        ? `${plural(delMes.length, 'pendiente')} este mes${examenes ? ` · ${plural(examenes, 'examen', 'exámenes')}` : ''}`
        : 'Nada pendiente este mes';

    let html = DIAS_CORTOS.map(d => `<div class="cal-cabecera" aria-hidden="true">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
        const dia = sumarDias(inicio, i);
        const iso = fechaLocalISO(dia);
        const lista = porDia[iso] || [];
        const otroMes = dia.getMonth() !== calMes.getMonth();
        const hayExamen = lista.some(e => !e.t.completada && tipoTarea(e.t) === 'examen');
        const festivo = festivoDe(iso);
        const clases = ['cal-dia', otroMes ? 'otro-mes' : '', iso === hoyISO ? 'hoy' : '', iso === calDiaSel ? 'seleccionado' : '',
            iso < hoyISO ? 'pasado' : '', hayExamen ? 'con-examen' : '', festivo ? 'festivo' : ''].filter(Boolean).join(' ');
        const etiqueta = `${dia.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}${festivo ? `, ${festivo.nombre}` : ''}${lista.length ? `, ${plural(lista.length, 'elemento')}` : ''}`;
        html += `
            <div class="${clases}" data-dia="${iso}">
                <div class="cal-dia-top">
                    <button type="button" class="cal-num" data-seleccionar="${iso}" aria-label="${escaparHTML(etiqueta)}" aria-pressed="${iso === calDiaSel}">${dia.getDate()}</button>
                    ${festivo ? `<span class="cal-festivo" title="${escaparHTML(festivo.nombre)}" aria-hidden="true">${escaparHTML(festivo.nombre)}</span>` : ''}
                </div>
                <div class="cal-chips">${lista.slice(0, MAX_CHIPS_DIA).map(htmlChipCalendario).join('')}
                    ${lista.length > MAX_CHIPS_DIA ? `<button type="button" class="cal-mas" data-seleccionar="${iso}">+${lista.length - MAX_CHIPS_DIA} más</button>` : ''}
                </div>
                <div class="cal-puntos" aria-hidden="true">${lista.slice(0, 4).map(e => `<span style="--c:${colorTipo(tipoTarea(e.t))}" class="${e.t.completada || e.prevista ? 'tenue' : ''}"></span>`).join('')}</div>
            </div>`;
    }
    grid.innerHTML = html;

    renderizarDiaCalendario(porDia);
    renderizarCalendarioSidebar();
}

function renderizarDiaCalendario(porDia) {
    const fecha = leerFechaLocal(calDiaSel);
    const lista = (porDia || entradasCalendario(calDiaSel, calDiaSel))[calDiaSel] || [];
    const d = diasHasta(calDiaSel);
    const relativo = d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : d === -1 ? 'Ayer' : d > 1 ? `En ${d} días` : `Hace ${-d} días`;
    const texto = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    document.getElementById('calDiaTitulo').textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    document.getElementById('calDiaRelativo').textContent = relativo;

    const { clases, festivo } = clasesDeFecha(fecha);
    const htmlLista = lista.map(({ t, prevista }) => {
        const tipo = tipoTarea(t);
        return `
            <li class="cal-item tipo-${tipo} ${t.completada ? 'hecha' : ''} ${prevista ? 'prevista' : ''}" style="--c:${colorTipo(tipo)}">
                ${prevista
                    ? '<span class="cal-item-check" title="Se creará al completar la anterior">🔁</span>'
                    : `<label class="checkbox-container" title="${t.completada ? 'Marcar como pendiente' : 'Completar'}">
                        <input type="checkbox" data-completar="${escaparHTML(t.id)}" ${t.completada ? 'checked' : ''} aria-label="Completar ${escaparHTML(t.texto)}">
                        <span class="checkmark"></span>
                    </label>`}
                <button type="button" class="cal-item-cuerpo" data-tarea="${escaparHTML(t.id)}">
                    <span class="cal-item-hora">${t.hora || 'Todo el día'}</span>
                    <span class="cal-item-texto">${escaparHTML(t.texto)}</span>
                    <span class="cal-item-meta">${TIPOS_TAREA[tipo].icono} ${TIPOS_TAREA[tipo].nombre} · ${nombreCategoriaHTML(t.categoria)}${prevista ? ' · repetición' : ''}</span>
                </button>
            </li>`;
    }).join('');

    document.getElementById('calDiaLista').innerHTML =
        (festivo ? `<li class="cal-festivo-dia"><span aria-hidden="true">${festivo.tipo === 'propio' ? '🏖️' : '🎉'}</span> ${escaparHTML(festivo.nombre)} · sin clases</li>` : '')
        + (htmlLista || '<li class="cal-vacio">Nada para este día. Añade un examen, evento o tarea 👇</li>')
        + (clases.length ? `
            <li class="cal-clases">
                <span class="cal-clases-titulo">🎓 ${plural(clases.length, 'clase')}</span>
                ${clases.map(c => `<span class="cal-clase" style="--c:${colorSeguro(c.color)}">${c.inicio} ${escaparHTML(c.asignatura)}</span>`).join('')}
            </li>` : '');
}

function tarjetaProxima(t) {
    const tipo = tipoTarea(t);
    const d = diasHasta(t.fechaTarea);
    const cifra = d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `${d} días`;
    return `
        <button type="button" class="cal-proximo ${d <= 2 ? 'cerca' : ''}" data-tarea="${escaparHTML(t.id)}" style="--c:${colorTipo(tipo)}">
            <span class="cal-proximo-cifra">${cifra}</span>
            <span class="cal-proximo-info">
                <strong>${TIPOS_TAREA[tipo].icono} ${escaparHTML(t.texto)}</strong>
                <small>${escaparHTML(formatoFechaCorta(t.fechaTarea))}${t.hora ? ` · ${t.hora}` : ''}</small>
            </span>
        </button>`;
}

function renderizarCalendarioSidebar() {
    const proximos = tareas
        .filter(t => !t.completada && t.fechaTarea && diasHasta(t.fechaTarea) >= 0)
        .sort((a, b) => claveOrdenFecha(a).localeCompare(claveOrdenFecha(b)));
    const examenes = proximos.filter(t => tipoTarea(t) === 'examen').slice(0, 5);
    const eventos = proximos.filter(t => tipoTarea(t) === 'evento' && diasHasta(t.fechaTarea) <= 30).slice(0, 5);
    const sinFecha = tareas.filter(t => !t.completada && !t.fechaTarea).sort(compararTareas).slice(0, 8);

    document.getElementById('calExamenes').innerHTML = examenes.map(tarjetaProxima).join('') ||
        '<p class="cal-lateral-vacio">Sin exámenes a la vista 🎉</p>';
    document.getElementById('calEventos').innerHTML = eventos.map(tarjetaProxima).join('') ||
        '<p class="cal-lateral-vacio">Sin eventos en los próximos 30 días</p>';

    const seccionSinFecha = document.getElementById('calSinFechaSeccion');
    seccionSinFecha.classList.toggle('hidden', sinFecha.length === 0);
    document.getElementById('calSinFecha').innerHTML = sinFecha.map(t => `
        <button type="button" class="cal-sinfecha prio-${t.prioridad}" data-tarea="${escaparHTML(t.id)}" draggable="true" title="Arrástrala a un día o pulsa para ponerla el día seleccionado">
            <span aria-hidden="true">⠿</span><span class="cal-chip-texto">${escaparHTML(t.texto)}</span>
        </button>`).join('');
}

/* ---------- Acciones ---------- */

function cambiarMesCalendario(delta) {
    calMes = new Date(calMes.getFullYear(), calMes.getMonth() + delta, 1);
    renderizarCalendario();
}

function irAHoyCalendario() {
    const h = hoyLocal();
    calMes = new Date(h.getFullYear(), h.getMonth(), 1);
    calDiaSel = fechaLocalISO(h);
    renderizarCalendario();
}

function seleccionarDiaCalendario(iso) {
    calDiaSel = iso;
    const f = leerFechaLocal(iso);
    if (f.getMonth() !== calMes.getMonth() || f.getFullYear() !== calMes.getFullYear()) {
        calMes = new Date(f.getFullYear(), f.getMonth(), 1);
    }
    renderizarCalendario();
}

function moverTareaADia(id, iso) {
    const t = buscarTarea(id);
    if (!t || t.fechaTarea === iso) return;
    const anterior = t.fechaTarea;
    t.fechaTarea = iso;
    guardarTareas();
    mostrarTareas();
    renderizarCalendario();
    mostrarAviso(`📅 Movida al ${formatoFechaCorta(iso)}`, {
        accion: 'Deshacer',
        alPulsar: () => { t.fechaTarea = anterior; guardarTareas(); mostrarTareas(); renderizarCalendario(); }
    });
}

function actualizarTipoNuevo() {
    document.querySelectorAll('#calTipoNuevo [data-tipo]').forEach(b => {
        const activo = b.dataset.tipo === calTipoNuevo;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', activo);
    });
    const input = document.getElementById('calNuevoTexto');
    if (input) input.placeholder = { tarea: 'Ej. Hacer los ejercicios del tema 3', examen: 'Ej. Examen de Matemáticas !alta', evento: 'Ej. Cumpleaños de Laura' }[calTipoNuevo];
}

function agregarDesdeCalendario() {
    const input = document.getElementById('calNuevoTexto');
    const inputHora = document.getElementById('calNuevaHora');
    const a = analizarEntrada(input.value);
    if (!a.texto) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        input.focus();
        return;
    }
    const fechaTarea = a.fechaTarea || calDiaSel;
    const nueva = crearTarea({
        texto: a.texto,
        fechaTarea,
        hora: inputHora.value || a.hora,
        prioridad: a.prioridad || (calTipoNuevo === 'examen' ? 'alta' : 'ninguna'),
        categoria: a.categoria,
        repetir: a.repetir,
        tipo: calTipoNuevo
    });
    input.value = '';
    inputHora.value = '';
    if (fechaTarea !== calDiaSel) seleccionarDiaCalendario(fechaTarea);
    ultimaTareaCreadaId = nueva.id;
    mostrarTareas();
    renderizarCalendario();
    mostrarAviso(`${TIPOS_TAREA[calTipoNuevo].icono} ${TIPOS_TAREA[calTipoNuevo].nombre} añadido para el ${formatoFechaCorta(fechaTarea)}`);
    input.focus();
}

function enfocarNuevoCalendario() {
    const input = document.getElementById('calNuevoTexto');
    input?.focus();
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// Flechas: día a día / semana a semana; T = hoy; RePág/AvPág = mes
function moverCalendarioConTeclado(tecla) {
    const saltos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (saltos[tecla]) {
        seleccionarDiaCalendario(fechaLocalISO(sumarDias(leerFechaLocal(calDiaSel), saltos[tecla])));
        return true;
    }
    if (tecla === 'PageUp' || tecla === 'PageDown') {
        const f = leerFechaLocal(calDiaSel);
        const destino = new Date(f.getFullYear(), f.getMonth() + (tecla === 'PageUp' ? -1 : 1), 1);
        const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
        destino.setDate(Math.min(f.getDate(), ultimo));
        seleccionarDiaCalendario(fechaLocalISO(destino));
        return true;
    }
    if (tecla === 't' || tecla === 'T') {
        irAHoyCalendario();
        return true;
    }
    return false;
}

/* ---------- Exportar clases, exámenes, eventos y tareas (.ics) ---------- */

function exportarCalendarioICS() {
    const clases = cargarClases();
    const conFecha = tareas.filter(t => !t.completada && t.fechaTarea);
    if (!clases.length && !conFecha.length) {
        mostrarAviso('No hay nada que exportar todavía');
        return;
    }
    const pad = n => String(n).padStart(2, '0');
    const compacta = iso => iso.replace(/-/g, '');
    const escaparICS = t => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
    const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lunes = sumarDias(hoyLocal(), -diaHoy());
    const codigosDia = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

    const eventos = clases.map(c => {
        // Clases de semanas alternas: empezar en una semana de su letra y repetir cada dos
        let inicioSemana = lunes;
        if (c.semana && semanaDe(lunes) && semanaDe(lunes) !== c.semana) inicioSemana = sumarDias(lunes, 7);
        const dia = fechaLocalISO(sumarDias(inicioSemana, c.dia));
        const alterna = c.semana && semanaDe(lunes);
        // Festivos del próximo año que caen en el día de esta clase
        const excepciones = [];
        for (let semana = 0; semana < 53; semana++) {
            const fecha = sumarDias(leerFechaLocal(dia), semana * (alterna ? 14 : 7));
            if (fecha > sumarDias(hoyLocal(), 365)) break;
            if (festivoDe(fechaLocalISO(fecha))) excepciones.push(`${compacta(fechaLocalISO(fecha))}T${c.inicio.replace(':', '')}00`);
        }
        return [
            'BEGIN:VEVENT', `UID:${c.id}@mi-agenda`, `DTSTAMP:${sello}`,
            `DTSTART:${compacta(dia)}T${c.inicio.replace(':', '')}00`,
            `DTEND:${compacta(dia)}T${c.fin.replace(':', '')}00`,
            `RRULE:FREQ=WEEKLY;${alterna ? 'INTERVAL=2;' : ''}BYDAY=${codigosDia[c.dia]}`,
            excepciones.length ? `EXDATE:${excepciones.join(',')}` : '',
            `SUMMARY:${escaparICS(c.asignatura)}`,
            c.aula ? `LOCATION:${escaparICS(c.aula)}` : '',
            'END:VEVENT'
        ].filter(Boolean).join('\r\n');
    });

    conFecha.forEach(t => {
        const tipo = tipoTarea(t);
        let inicio, fin;
        if (t.hora) {
            const m = aMinutos(t.hora) + 60;
            inicio = `DTSTART:${compacta(t.fechaTarea)}T${t.hora.replace(':', '')}00`;
            fin = `DTEND:${compacta(t.fechaTarea)}T${m >= 1440 ? '2359' : pad(Math.floor(m / 60)) + pad(m % 60)}00`;
        } else {
            inicio = `DTSTART;VALUE=DATE:${compacta(t.fechaTarea)}`;
            fin = `DTEND;VALUE=DATE:${compacta(fechaLocalISO(sumarDias(leerFechaLocal(t.fechaTarea), 1)))}`;
        }
        eventos.push([
            'BEGIN:VEVENT', `UID:${t.id}@mi-agenda`, `DTSTAMP:${sello}`, inicio, fin,
            `SUMMARY:${escaparICS(tipo === 'tarea' ? t.texto : `${TIPOS_TAREA[tipo].nombre}: ${t.texto}`)}`,
            t.notas ? `DESCRIPTION:${escaparICS(t.notas)}` : '',
            tipo === 'examen' ? 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Examen mañana\r\nTRIGGER:-P1D\r\nEND:VALARM' : '',
            'END:VEVENT'
        ].filter(Boolean).join('\r\n'));
    });

    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Agenda//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Mi Agenda', ...eventos, 'END:VCALENDAR'].join('\r\n');
    descargarArchivo('mi-agenda.ics', ics, 'text/calendar;charset=utf-8');
    mostrarAviso('📤 Calendario exportado: ábrelo con Google Calendar, Outlook…');
}

/* ---------- Recordatorios (mientras la app está abierta) ---------- */

function recordatoriosActivos() {
    return localStorage.getItem('recordatoriosApp') === 'true';
}

async function alternarRecordatorios(interruptor) {
    const activar = interruptor.checked;
    localStorage.setItem('recordatoriosApp', String(activar));
    if (activar && window.Notification && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch { /* sin notificaciones del sistema */ }
    }
    if (activar) {
        mostrarAviso(window.Notification?.permission === 'granted'
            ? '🔔 Recordatorios activados'
            : '🔔 Recordatorios activados (se verán dentro de la app)');
        revisarRecordatorios();
    }
}

async function avisarRecordatorio(titulo, cuerpo) {
    if (window.Notification?.permission !== 'granted') return;
    const opciones = { body: cuerpo, icon: 'icon-192.png', badge: 'icon-192.png', tag: `${titulo}${cuerpo}` };
    try {
        // En Android (y dentro de la app de Google Play) solo funcionan las del Service Worker
        const registro = await navigator.serviceWorker?.getRegistration?.();
        if (registro) return await registro.showNotification(titulo, opciones);
        new Notification(titulo, opciones);
    } catch { /* sin notificaciones del sistema */ }
}

function revisarRecordatorios() {
    if (!recordatoriosActivos()) return;
    const enviados = almacen.leer('recordatoriosEnviados', {});
    const hoy = fechaLocalISO();
    const limite = fechaLocalISO(sumarDias(hoyLocal(), -3));
    Object.keys(enviados).forEach(k => { if (enviados[k] < limite) delete enviados[k]; });
    const ahora = new Date();
    const minutosActuales = ahora.getHours() * 60 + ahora.getMinutes();
    const nuevos = [];
    const enviar = (clave, titulo, cuerpo) => {
        if (enviados[clave]) return;
        enviados[clave] = hoy;
        nuevos.push(`${titulo} · ${cuerpo}`);
        avisarRecordatorio(titulo, cuerpo);
    };

    tareas.filter(t => !t.completada && t.fechaTarea).forEach(t => {
        const d = diasHasta(t.fechaTarea);
        const tipo = tipoTarea(t);
        if (d === 0 && t.hora) {
            const faltan = aMinutos(t.hora) - minutosActuales;
            if (faltan >= 0 && faltan <= 15) {
                enviar(`${t.id}|${t.fechaTarea}|hora`, `⏰ ${faltan ? `En ${faltan} min` : 'Ahora'}`, `${TIPOS_TAREA[tipo].icono} ${t.texto}`);
            }
        }
        if (d === 1 && tipo === 'examen') {
            enviar(`${t.id}|${t.fechaTarea}|vispera`, '📝 Examen mañana', `${t.texto}${t.hora ? ` a las ${t.hora}` : ''}`);
        }
    });
    if (!nuevos.length) return;
    almacen.escribir('recordatoriosEnviados', enviados);
    // Un solo aviso en pantalla aunque coincidan varios
    mostrarAviso(nuevos.length === 1 ? nuevos[0] : `🔔 ${nuevos.length} recordatorios: ${nuevos.join('  ·  ')}`, { duracion: 9000 });
}

/* ---------- Eventos ---------- */

function inicializarCalendario() {
    const grid = document.getElementById('calGrid');
    if (!grid) return;

    document.getElementById('calAnterior')?.addEventListener('click', () => cambiarMesCalendario(-1));
    document.getElementById('calSiguiente')?.addEventListener('click', () => cambiarMesCalendario(1));
    document.getElementById('calHoy')?.addEventListener('click', irAHoyCalendario);
    document.getElementById('calExportar')?.addEventListener('click', exportarCalendarioICS);

    grid.addEventListener('click', e => {
        const chip = e.target.closest('.cal-chip');
        if (chip && window.matchMedia('(min-width: 601px)').matches) {
            abrirPanelTarea(chip.dataset.tarea);
            return;
        }
        const celda = e.target.closest('.cal-dia');
        if (celda) seleccionarDiaCalendario(celda.dataset.dia);
    });
    grid.addEventListener('dblclick', e => {
        if (e.target.closest('.cal-chip')) return;
        if (e.target.closest('.cal-dia')) enfocarNuevoCalendario();
    });

    // Arrastrar tareas (del calendario o «sin fecha») a otro día
    const alEmpezar = e => {
        const el = e.target.closest('[data-tarea][draggable="true"]');
        if (!el) return;
        e.dataTransfer.setData('text/plain', el.dataset.tarea);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('arrastrando');
    };
    const alTerminar = () => {
        document.querySelectorAll('.arrastrando').forEach(el => el.classList.remove('arrastrando'));
        grid.querySelectorAll('.cal-dia.soltar').forEach(el => el.classList.remove('soltar'));
    };
    [grid, document.getElementById('calSinFecha')].forEach(el => {
        el?.addEventListener('dragstart', alEmpezar);
        el?.addEventListener('dragend', alTerminar);
    });
    grid.addEventListener('dragover', e => {
        const celda = e.target.closest('.cal-dia');
        if (!celda) return;
        e.preventDefault();
        if (!celda.classList.contains('soltar')) {
            grid.querySelectorAll('.cal-dia.soltar').forEach(el => el.classList.remove('soltar'));
            celda.classList.add('soltar');
        }
    });
    grid.addEventListener('drop', e => {
        const celda = e.target.closest('.cal-dia');
        const id = e.dataTransfer.getData('text/plain');
        alTerminar();
        if (!celda || !id) return;
        e.preventDefault();
        calDiaSel = celda.dataset.dia;
        moverTareaADia(id, celda.dataset.dia);
    });

    document.getElementById('calDiaLista')?.addEventListener('change', e => {
        const id = e.target.dataset.completar;
        if (id) toggleTarea(id, e.target);
    });
    document.getElementById('calDiaLista')?.addEventListener('click', e => {
        const b = e.target.closest('.cal-item-cuerpo');
        if (b) abrirPanelTarea(b.dataset.tarea);
    });

    ['calExamenes', 'calEventos'].forEach(id => document.getElementById(id)?.addEventListener('click', e => {
        const b = e.target.closest('[data-tarea]');
        if (!b) return;
        const t = buscarTarea(b.dataset.tarea);
        if (t?.fechaTarea) seleccionarDiaCalendario(t.fechaTarea);
        abrirPanelTarea(b.dataset.tarea);
    }));
    document.getElementById('calSinFecha')?.addEventListener('click', e => {
        const b = e.target.closest('[data-tarea]');
        if (b) moverTareaADia(b.dataset.tarea, calDiaSel);
    });

    document.getElementById('calTipoNuevo')?.addEventListener('click', e => {
        const b = e.target.closest('[data-tipo]');
        if (!b) return;
        calTipoNuevo = b.dataset.tipo;
        actualizarTipoNuevo();
    });
    document.getElementById('calNuevoTexto')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); agregarDesdeCalendario(); }
    });
    document.getElementById('calAgregar')?.addEventListener('click', agregarDesdeCalendario);
    actualizarTipoNuevo();
}
