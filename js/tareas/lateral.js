/* ==========================================
   TAREAS · tarjeta del día, listas inteligentes y arrastrar y soltar
   ========================================== */

/* ---------- Tarjeta del día ---------- */

function actualizarDashboard() {
    const lista = tareasDeLista();
    const total = lista.length;
    const pendientesTotal = lista.filter(t => !t.completada).length;
    const pendientesHoy = lista.filter(t => !t.completada && diasHasta(t.fechaTarea) !== null && diasHasta(t.fechaTarea) <= 0).length;
    const vencidas = lista.filter(t => !t.completada && diasHasta(t.fechaTarea) !== null && diasHasta(t.fechaTarea) < 0).length;
    const hechasHoy = lista.filter(t => t.completada && esHoyISO(t.completadaEn)).length;
    const totalHoy = pendientesHoy + hechasHoy;
    const porcentaje = totalHoy ? Math.round(hechasHoy / totalHoy * 100) : 0;
    const completo = totalHoy > 0 && pendientesHoy === 0;

    const card = document.getElementById('tareasProgressWidget');
    card?.classList.toggle('completo', completo);
    card?.classList.toggle('sin-hoy', totalHoy === 0);

    const tit = document.getElementById('progressTitle');
    if (tit) tit.innerHTML = `Hoy${totalHoy ? ` <span class="hoy-pct">${porcentaje}%</span>` : ''}`;

    const res = document.getElementById('progressSummary');
    if (res) {
        if (totalHoy === 0) {
            res.innerHTML = total === 0
                ? 'Añade tu primera tarea para empezar'
                : `Nada programado · ${pendientesTotal ? plural(pendientesTotal, 'pendiente') + ' en total' : 'todo al día ✨'}`;
        } else if (completo) {
            res.innerHTML = `<strong>¡Todo hecho!</strong> ${hechasHoy}/${totalHoy} 🎉`;
        } else {
            res.innerHTML = `<strong>${hechasHoy}</strong> de ${totalHoy} hechas${vencidas ? ` · <span class="txt-alerta">${plural(vencidas, 'vencida')}</span>` : ''}`;
        }
    }

    const barra = document.getElementById('progressBar');
    if (barra) barra.style.width = `${porcentaje}%`;
    document.getElementById('progressBarra')?.setAttribute('aria-valuenow', porcentaje);

    // Racha y semana actual (lunes a domingo)
    const stats = almacen.leer('estadisticasApp', {});
    const racha = calcularRacha(stats);
    const rachaEl = document.getElementById('rachaInfo');
    if (rachaEl) {
        rachaEl.textContent = `🔥 ${racha}`;
        rachaEl.classList.toggle('apagada', racha === 0);
        rachaEl.title = racha ? `${plural(racha, 'día')} seguidos completando tareas` : 'Completa una tarea hoy para empezar una racha';
    }

    const semana = document.getElementById('actividadSemana');
    if (semana) {
        const hoy = hoyLocal();
        const lunes = sumarDias(hoy, -((hoy.getDay() + 6) % 7));
        semana.innerHTML = [...Array(7).keys()].map(i => {
            const dia = sumarDias(lunes, i);
            const n = stats[fechaLocalISO(dia)] || 0;
            const nivel = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3;
            const esHoy = dia.getTime() === hoy.getTime();
            const futuro = dia > hoy;
            const nombre = dia.toLocaleDateString('es-ES', { weekday: 'long' });
            return `
                <span class="dia-punto nivel-${nivel} ${esHoy ? 'hoy' : ''} ${futuro ? 'futuro' : ''}" title="${nombre}: ${futuro ? 'aún no ha llegado' : plural(n, 'tarea completada', 'tareas completadas')}">
                    <span class="dia-letra">${'LMXJVSD'[i]}</span>
                    <span class="dia-circulo">${n && !futuro ? n : ''}</span>
                </span>`;
        }).join('');
    }

    renderizarFiltrosSidebar();
    actualizarResumenDia();
}

/* ---------- Listas inteligentes y categorías ---------- */

const LISTAS_INTELIGENTES = [
    { clave: 'hoy', nombre: 'Hoy', icono: '☀️', color: '#f59e0b', drop: () => `fecha:${fechaLocalISO()}` },
    { clave: 'proximas', nombre: 'Próximas', icono: '📆', color: '#3b82f6', drop: () => `fecha:${fechaLocalISO(sumarDias(hoyLocal(), 1))}` },
    { clave: 'todas', nombre: 'Todas', icono: '📋', color: '#64748b' },
    { clave: 'completadas', nombre: 'Hechas', icono: '✅', color: '#16a34a', drop: () => 'hecha' }
];

function contarVista(clave) {
    if (clave === 'todas') return tareasDeLista().filter(t => !t.completada).length;
    if (clave === 'completadas') return tareasDeLista().filter(t => t.completada).length;
    return tareasDeLista().filter(t => !t.completada && tareaEnVista(t, clave)).length;
}

function renderizarFiltrosSidebar() {
    const vistasEl = document.getElementById('vistasTareas');
    const extraEl = document.getElementById('vistasExtra');
    const catsEl = document.getElementById('categoriasListContainer');
    const esVista = clave => filtroTareas.tipo === 'vista' && filtroTareas.valor === clave;

    if (vistasEl) {
        vistasEl.innerHTML = LISTAS_INTELIGENTES.map(l => {
            const activa = esVista(l.clave);
            return `
                <button type="button" class="lista-tile ${activa ? 'active' : ''}" data-vista="${l.clave}" ${l.drop ? `data-drop="${l.drop()}"` : ''} style="--c:${l.color}" aria-pressed="${activa}">
                    <span class="tile-icono" aria-hidden="true">${l.icono}</span>
                    <span class="tile-num">${contarVista(l.clave)}</span>
                    <span class="tile-nombre">${l.nombre}</span>
                </button>`;
        }).join('');
    }

    if (extraEl) {
        const extras = [
            { clave: 'vencidas', texto: '⏰ Vencidas', alerta: true },
            { clave: 'sinfecha', texto: '🗂️ Sin fecha' }
        ].map(x => ({ ...x, n: contarVista(x.clave) })).filter(x => x.n > 0 || esVista(x.clave));
        extraEl.innerHTML = extras.map(x => `
            <button type="button" class="vista-mini ${esVista(x.clave) ? 'active' : ''} ${x.alerta && x.n ? 'alerta' : ''}" data-vista="${x.clave}" ${x.clave === 'sinfecha' ? 'data-drop="fecha:"' : ''}>
                ${x.texto} <b>${x.n}</b>
            </button>`).join('');
        extraEl.classList.toggle('hidden', extras.length === 0);
    }

    if (catsEl) {
        catsEl.innerHTML = categorias.map(cat => {
            const n = tareasDeLista().filter(t => t.categoria === cat.id && !t.completada).length;
            const activa = filtroTareas.tipo === 'categoria' && filtroTareas.valor === cat.id;
            return `
                <button type="button" class="filter-btn ${activa ? 'active' : ''}" data-category="${escaparHTML(cat.id)}" data-drop="cat:${escaparHTML(cat.id)}" aria-pressed="${activa}">
                    <span>${escaparHTML(cat.icono)} ${escaparHTML(cat.nombre)}</span>
                    <span class="count">${n}</span>
                </button>`;
        }).join('');
    }
}

function cambiarFiltro(tipo, valor) {
    filtroTareas = { tipo, valor };
    almacen.escribir('vistaTareas', filtroTareas);
    mostrarTareas();
    if (window.matchMedia('(max-width: 800px)').matches) {
        document.getElementById('tareasMainContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/* ---------- Arrastrar y soltar ---------- */

let arrastrandoId = null;

function aplicarDrop(id, destino) {
    const t = buscarTarea(id);
    if (!t) return;
    const previo = { fechaTarea: t.fechaTarea, hora: t.hora, prioridad: t.prioridad, categoria: t.categoria };
    const sep = destino.indexOf(':');
    const tipo = sep === -1 ? destino : destino.slice(0, sep);
    const valor = sep === -1 ? '' : destino.slice(sep + 1);
    let mensaje = '';

    switch (tipo) {
        case 'hecha':
            if (!t.completada) toggleTarea(id);
            return;
        case 'fecha': {
            const nueva = valor || null;
            if (fechaISOTarea(t) === nueva) return;
            t.fechaTarea = nueva;
            if (!nueva) t.hora = null;
            const d = diasHasta(nueva);
            mensaje = !nueva ? '🗂️ Fecha quitada' : `📅 Movida a ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : formatoFechaCorta(nueva)}`;
            break;
        }
        case 'prio':
            if (t.prioridad === valor) return;
            t.prioridad = valor;
            mensaje = `⚑ ${NOMBRE_PRIORIDAD[valor]}`;
            break;
        case 'cat': {
            const cat = obtenerCategoria(valor);
            if (!cat || t.categoria === valor) return;
            t.categoria = valor;
            mensaje = `${cat.icono} Movida a ${cat.nombre}`;
            break;
        }
        case 'cuadrante': {
            const q = CUADRANTES.find(c => c.clave === valor);
            if (!q || q.filtro(t)) return;
            const importante = valor === 'q1' || valor === 'q2';
            const urgente = valor === 'q1' || valor === 'q3';
            if (importante && !esImportante(t)) t.prioridad = valor === 'q1' ? 'alta' : 'media';
            if (!importante && esImportante(t)) t.prioridad = 'baja';
            if (urgente && !esUrgente(t)) t.fechaTarea = fechaLocalISO();
            if (!urgente && esUrgente(t)) t.fechaTarea = fechaLocalISO(sumarDias(hoyLocal(), 7));
            mensaje = `${q.icono} ${q.titulo}${!urgente && previo.fechaTarea !== t.fechaTarea ? ' · fecha en una semana' : ''}`;
            break;
        }
        default:
            return;
    }

    guardarTareas();
    mostrarTareas();
    mostrarAviso(mensaje, {
        accion: 'Deshacer',
        alPulsar: () => { Object.assign(t, previo); guardarTareas(); mostrarTareas(); }
    });
}

function inicializarArrastre() {
    const limpiar = () => {
        arrastrandoId = null;
        document.documentElement.classList.remove('arrastrando-tarea');
        document.querySelectorAll('.arrastrando, .drop-activo').forEach(el => el.classList.remove('arrastrando', 'drop-activo'));
    };
    document.addEventListener('dragstart', e => {
        const li = e.target.closest?.('.todo-item[draggable="true"]');
        if (!li) return;
        arrastrandoId = li.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', li.querySelector('.todo-text')?.textContent || '');
        requestAnimationFrame(() => {
            if (arrastrandoId !== li.dataset.id) return;
            li.classList.add('arrastrando');
            document.documentElement.classList.add('arrastrando-tarea');
        });
    });
    document.addEventListener('dragend', limpiar);
    document.addEventListener('dragover', e => {
        if (!arrastrandoId) return;
        const zona = e.target.closest?.('[data-drop]');
        document.querySelectorAll('.drop-activo').forEach(z => { if (z !== zona) z.classList.remove('drop-activo'); });
        if (!zona) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zona.classList.add('drop-activo');
    });
    document.addEventListener('drop', e => {
        if (!arrastrandoId) return;
        const zona = e.target.closest?.('[data-drop]');
        const id = arrastrandoId;
        limpiar();
        if (!zona) return;
        e.preventDefault();
        aplicarDrop(id, zona.dataset.drop);
    });
}

function renderizarSelectCategorias() {
    const opciones = categorias.map(c => `<option value="${escaparHTML(c.id)}">${escaparHTML(c.icono)} ${escaparHTML(c.nombre)}</option>`).join('');
    const select = document.getElementById('detCategoria');
    if (!select) return;
    const previo = select.value;
    select.innerHTML = opciones;
    select.value = categorias.some(c => c.id === previo) ? previo : categoriaPorDefecto();
}
