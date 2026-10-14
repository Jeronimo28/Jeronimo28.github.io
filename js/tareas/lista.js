/* ==========================================
   TAREAS · filtros, orden, matriz, lista y sugerencias
   ========================================== */

/* ---------- Filtros, vistas y orden ---------- */

function tareaEnVista(t, vista) {
    const d = diasHasta(t.fechaTarea);
    switch (vista) {
        case 'hoy': return (!t.completada && d !== null && d <= 0) || (t.completada && esHoyISO(t.completadaEn));
        case 'proximas': return !t.completada && d !== null && d >= 0 && d <= 7;
        case 'vencidas': return !t.completada && d !== null && d < 0;
        case 'sinfecha': return !t.completada && d === null;
        case 'completadas': return t.completada;
        default: return true;
    }
}

function tareaCoincideBusqueda(t) {
    if (!searchQuery.trim()) return true;
    const cat = obtenerCategoria(t.categoria);
    const texto = [t.texto, t.notas, cat?.nombre, ...(t.subtareas || []).map(s => s.texto)].join(' ');
    return coincideBusqueda(texto, searchQuery);
}

function filtrarTareas() {
    return tareasDeLista().filter(t => {
        const enFiltro = filtroTareas.tipo === 'categoria'
            ? t.categoria === filtroTareas.valor
            : tareaEnVista(t, filtroTareas.valor);
        return enFiltro && tareaCoincideBusqueda(t);
    });
}

function compararTareas(a, b) {
    const dir = ascendente ? 1 : -1;
    switch (criterioOrden) {
        case 'prioridad': {
            const p = PRIORIDADES.indexOf(b.prioridad) - PRIORIDADES.indexOf(a.prioridad);
            if (p) return p * dir;
            return claveOrdenFecha(a).localeCompare(claveOrdenFecha(b));
        }
        case 'fecha':
        default: {
            const f = claveOrdenFecha(a).localeCompare(claveOrdenFecha(b));
            if (f) return f * dir;
            const p = PRIORIDADES.indexOf(b.prioridad) - PRIORIDADES.indexOf(a.prioridad);
            if (p) return p;
            return String(a.fecha).localeCompare(String(b.fecha));
        }
    }
}

/* ---------- Matriz de Eisenhower ---------- */

function esUrgente(t) {
    const d = diasHasta(t.fechaTarea);
    return d !== null && d <= 2;
}

function esImportante(t) {
    return t.prioridad === 'alta' || t.prioridad === 'media';
}

const CUADRANTES = [
    { clave: 'q1', titulo: 'Hacer ya', icono: '🔥', ayuda: 'Urgente e importante', filtro: t => esUrgente(t) && esImportante(t) },
    { clave: 'q2', titulo: 'Planificar', icono: '🎯', ayuda: 'Importante, sin prisa', filtro: t => !esUrgente(t) && esImportante(t) },
    { clave: 'q3', titulo: 'Despachar', icono: '⚡', ayuda: 'Urgente, poco importante', filtro: t => esUrgente(t) && !esImportante(t) },
    { clave: 'q4', titulo: 'Más tarde', icono: '🧺', ayuda: 'Ni urgente ni importante', filtro: t => !esUrgente(t) && !esImportante(t) }
];

function fechaISOTarea(t) {
    const f = leerFechaLocal(t.fechaTarea);
    return f ? fechaLocalISO(f) : null;
}

function nombreDiaGrupo(iso) {
    const texto = leerFechaLocal(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Agrupa la lista según el criterio elegido
function agruparTareas(lista) {
    const grupos = [];
    const crear = (clave, titulo, icono, filtro, extra = {}) => {
        const items = lista.filter(filtro).sort(compararTareas);
        if (items.length) grupos.push({ clave, titulo, icono, items, ...extra });
    };
    const pendiente = t => !t.completada;

    if (criterioOrden === 'prioridad') {
        crear('p-alta', 'Prioridad alta', '🔴', t => pendiente(t) && t.prioridad === 'alta', { drop: 'prio:alta' });
        crear('p-media', 'Prioridad media', '🟡', t => pendiente(t) && t.prioridad === 'media', { drop: 'prio:media' });
        crear('p-baja', 'Prioridad baja', '🟢', t => pendiente(t) && t.prioridad === 'baja', { drop: 'prio:baja' });
        crear('p-ninguna', 'Sin prioridad', '⚪', t => pendiente(t) && t.prioridad === 'ninguna', { drop: 'prio:ninguna' });
    } else {
        const d = t => diasHasta(t.fechaTarea);
        const hoy = hoyLocal();
        crear('vencidas', 'Vencidas', '⚠️', t => pendiente(t) && d(t) !== null && d(t) < 0, { accion: 'pasar-hoy', accionTexto: 'Pasar a hoy' });
        crear('hoy', 'Hoy', '☀️', t => pendiente(t) && d(t) === 0, { drop: `fecha:${fechaLocalISO(hoy)}` });
        crear('manana', 'Mañana', '🌅', t => pendiente(t) && d(t) === 1, { drop: `fecha:${fechaLocalISO(sumarDias(hoy, 1))}` });
        // Próximos días, uno por uno (como la vista «Próximo» de Todoist)
        [...new Set(lista.filter(t => pendiente(t) && d(t) > 1 && d(t) <= 7).map(fechaISOTarea))].sort().forEach(iso => {
            crear(`dia-${iso}`, nombreDiaGrupo(iso), '📅', t => pendiente(t) && fechaISOTarea(t) === iso, { drop: `fecha:${iso}` });
        });
        crear('despues', 'Más adelante', '🗓️', t => pendiente(t) && d(t) > 7);
        crear('sinfecha', 'Sin fecha', '🗂️', t => pendiente(t) && d(t) === null, { drop: 'fecha:' });
    }
    crear('hechas', 'Completadas', '✅', t => t.completada, { accion: 'limpiar-hechas', accionTexto: 'Limpiar', drop: 'hecha' });

    // Con orden descendente los grupos también se invierten (menos Completadas, que va siempre al final)
    if (!ascendente) {
        const hechas = grupos.filter(g => g.clave === 'hechas');
        return [...grupos.filter(g => g.clave !== 'hechas').reverse(), ...hechas];
    }
    return grupos;
}

/* ---------- Renderizado ---------- */

function htmlTarea(t) {
    const fecha = etiquetaFecha(t);
    const subHechas = t.subtareas.filter(s => s.hecha).length;
    const subTotal = t.subtareas.length;
    const clases = ['todo-item', `prio-${t.prioridad}`, t.completada ? 'done' : '', t.id === ultimaTareaCreadaId ? 'recien' : ''].filter(Boolean).join(' ');

    return `
        <li class="${clases}" data-id="${escaparHTML(t.id)}" draggable="${!t.completada}">
            <label class="checkbox-container" title="${t.completada ? 'Marcar como pendiente' : 'Marcar como completada'}">
                <input type="checkbox" data-accion="completar" ${t.completada ? 'checked' : ''} aria-label="${t.completada ? 'Marcar como pendiente' : 'Marcar como completada'}: ${escaparHTML(t.texto)}">
                <span class="checkmark"></span>
            </label>

            <button type="button" class="todo-content" data-accion="abrir" aria-label="Abrir detalles de ${escaparHTML(t.texto)}">
                <span class="todo-text">${resaltar(t.texto, searchQuery)}</span>
                <span class="todo-meta">
                    ${filtroTareas.tipo !== 'categoria' ? `<span class="todo-tag">${nombreCategoriaHTML(t.categoria)}</span>` : ''}
                    ${fecha ? `<span class="todo-date ${fecha.clase}">${fecha.icono} ${escaparHTML(fecha.texto)}</span>` : ''}
                    ${t.repetir ? `<span class="todo-chip" title="${REPETICIONES[t.repetir]}">🔁</span>` : ''}
                    ${subTotal ? `<span class="todo-chip ${subHechas === subTotal ? 'completo' : ''}" title="Subtareas">☑️ ${subHechas}/${subTotal}</span>` : ''}
                    ${t.notas ? '<span class="todo-chip" title="Tiene notas">📝</span>' : ''}
                </span>
                ${subTotal ? `<span class="todo-subprogress" aria-hidden="true"><span style="width:${Math.round(subHechas / subTotal * 100)}%"></span></span>` : ''}
            </button>

            <button type="button" class="todo-prio-badge" data-accion="prioridad" title="Prioridad: ${NOMBRE_PRIORIDAD[t.prioridad]} (clic para cambiar)" aria-label="Cambiar prioridad, ahora ${NOMBRE_PRIORIDAD[t.prioridad]}">
                <span class="prio-flag"></span>
            </button>

            <div class="todo-actions">
                <button type="button" class="btn-action btn-delete" data-accion="eliminar" aria-label="Eliminar tarea" title="Eliminar">🗑️</button>
            </div>
        </li>`;
}

function htmlMatriz(lista) {
    const pendientes = lista.filter(t => !t.completada);
    const hechas = lista.length - pendientes.length;
    return `
        <li class="matriz">
            ${CUADRANTES.map(q => {
                const items = pendientes.filter(q.filtro).sort(compararTareas);
                return `
                <section class="cuadrante ${q.clave}" data-drop="cuadrante:${q.clave}">
                    <header class="cuadrante-head">
                        <span class="cuadrante-titulo">${q.icono} ${q.titulo}</span>
                        <span class="todo-section-count">${items.length}</span>
                        <span class="cuadrante-ayuda">${q.ayuda}</span>
                    </header>
                    <ul class="todo-sublist">${items.map(htmlTarea).join('') || '<li class="cuadrante-vacio">Arrastra tareas aquí</li>'}</ul>
                </section>`;
            }).join('')}
            <p class="matriz-nota">Urgente = vence en 2 días o menos · Importante = prioridad alta o media${hechas ? ` · ${plural(hechas, 'completada oculta', 'completadas ocultas')}` : ''}</p>
        </li>`;
}

function mostrarTareas() {
    const listaTareas = document.getElementById('listaTareas');
    if (!listaTareas) return;

    const filtradas = filtrarTareas();

    // Cabecera de la vista
    const titulo = document.getElementById('tareasTitulo');
    const subtitulo = document.getElementById('tareasSubtitulo');
    if (titulo) {
        if (filtroTareas.tipo === 'categoria') {
            const cat = obtenerCategoria(filtroTareas.valor);
            titulo.textContent = cat ? `${cat.icono} ${cat.nombre}` : 'Categoría';
        } else {
            const v = VISTAS[filtroTareas.valor] || VISTAS.todas;
            titulo.textContent = `${v.icono} ${v.titulo}`;
        }
    }
    if (subtitulo) {
        const pendientes = filtradas.filter(t => !t.completada).length;
        const hechas = filtradas.length - pendientes;
        if (filtroTareas.tipo === 'vista' && filtroTareas.valor === 'hoy') {
            subtitulo.textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + ` · ${plural(pendientes, 'pendiente')}`;
        } else {
            subtitulo.textContent = filtradas.length === 0 ? 'Nada por aquí' : `${plural(pendientes, 'pendiente')}${hechas ? ` · ${plural(hechas, 'completada')}` : ''}`;
        }
    }

    const grupos = criterioOrden === 'matriz' ? null : agruparTareas(filtradas);

    if (filtradas.length === 0) {
        let icono = '🌱';
        let mensaje = 'No hay tareas todavía. ¡Escribe la primera arriba!';
        if (searchQuery.trim()) {
            icono = '🔍';
            mensaje = `Nada coincide con «${escaparHTML(searchQuery)}»`;
        } else if (filtroTareas.tipo === 'categoria') {
            icono = '📂';
            mensaje = `No tienes tareas en ${nombreCategoriaHTML(filtroTareas.valor)}`;
        } else if (tareasDeLista().length) {
            const mensajes = {
                hoy: ['🎉', '¡Nada pendiente para hoy! Disfruta del día.'],
                proximas: ['🏖️', 'Nada programado para los próximos 7 días.'],
                vencidas: ['🙌', 'Estás al día: no hay tareas vencidas.'],
                sinfecha: ['🗂️', 'Todas tus tareas tienen fecha.'],
                completadas: ['💪', 'Aún no has completado tareas. ¡A por la primera!']
            };
            [icono, mensaje] = mensajes[filtroTareas.valor] || [icono, mensaje];
        }
        listaTareas.innerHTML = `<li class="empty-state"><span class="empty-state-icon" aria-hidden="true">${icono}</span><p>${mensaje}</p></li>`;
    } else if (criterioOrden === 'matriz') {
        listaTareas.innerHTML = htmlMatriz(filtradas);
    } else {
        listaTareas.innerHTML = grupos.map(g => {
            const plegado = gruposPlegados.has(g.clave) && !searchQuery.trim();
            return `
            <li class="todo-section ${plegado ? 'plegado' : ''}" data-grupo="${g.clave}" ${g.drop !== undefined ? `data-drop="${g.drop}"` : ''}>
                <div class="todo-section-head">
                    <button type="button" class="todo-section-toggle" data-accion="plegar" aria-expanded="${!plegado}">
                        <span class="chevron" aria-hidden="true">▾</span>
                        <span class="todo-section-title">${g.icono} ${g.titulo}</span>
                        <span class="todo-section-count">${g.items.length}</span>
                    </button>
                    ${g.accion ? `<button type="button" class="todo-section-action" data-accion="${g.accion}">${g.accionTexto}</button>` : ''}
                </div>
                <ul class="todo-sublist">${plegado ? '' : g.items.map(htmlTarea).join('')}</ul>
            </li>`;
        }).join('');
    }

    listaTareas.classList.toggle('modo-matriz', criterioOrden === 'matriz' && filtradas.length > 0);
    ultimaTareaCreadaId = null;
    renderizarSugerencias();
    actualizarDashboard();
    if (typeof activeTab !== 'undefined' && activeTab === 'calendario') renderizarCalendario();
}

/* ---------- Sugerencias para planificar el día (como «Mi día» de Microsoft To Do) ---------- */

let sugerenciasPlegadas = localStorage.getItem('sugerenciasPlegadas') === 'true';

function renderizarSugerencias() {
    const cont = document.getElementById('sugerenciasHoy');
    if (!cont) return;
    const enHoy = filtroTareas.tipo === 'vista' && filtroTareas.valor === 'hoy' && !searchQuery.trim();

    const candidatas = [];
    if (enHoy) {
        tareasDeLista().filter(t => !t.completada).forEach(t => {
            const d = diasHasta(t.fechaTarea);
            let motivo = null;
            let orden = 9;
            if (d === 1) { motivo = 'Vence mañana'; orden = 1; }
            else if (d !== null && d >= 2 && d <= 3) { motivo = `Vence el ${leerFechaLocal(t.fechaTarea).toLocaleDateString('es-ES', { weekday: 'long' })}`; orden = 2; }
            else if (d === null && t.prioridad === 'alta') { motivo = 'Prioridad alta, sin fecha'; orden = 3; }
            else if (d === null) { motivo = `Sin fecha · creada ${tiempoRelativo(t.fecha)}`; orden = 4; }
            if (motivo) candidatas.push({ t, motivo, orden });
        });
    }
    candidatas.sort((a, b) => (a.orden - b.orden) || (PRIORIDADES.indexOf(b.t.prioridad) - PRIORIDADES.indexOf(a.t.prioridad)) || String(a.t.fecha).localeCompare(String(b.t.fecha)));
    const lista = candidatas.slice(0, 5);

    cont.classList.toggle('hidden', lista.length === 0);
    cont.classList.toggle('plegado', sugerenciasPlegadas);
    if (!lista.length) {
        cont.innerHTML = '';
        return;
    }
    cont.innerHTML = `
        <button type="button" class="sugerencias-head" data-accion="plegar-sugerencias" aria-expanded="${!sugerenciasPlegadas}">
            <span class="sugerencias-titulo">💡 Planifica tu día</span>
            <span class="sugerencias-ayuda">${plural(candidatas.length, 'sugerencia')}</span>
            <span class="chevron" aria-hidden="true">▾</span>
        </button>
        ${sugerenciasPlegadas ? '' : `<ul class="sugerencias-lista">
            ${lista.map(({ t, motivo }) => `
            <li class="sugerencia prio-${t.prioridad}">
                <span class="prio-punto" aria-hidden="true"></span>
                <button type="button" class="sugerencia-textos" data-abrir="${escaparHTML(t.id)}">
                    <span class="sugerencia-texto">${escaparHTML(t.texto)}</span>
                    <span class="sugerencia-motivo">${escaparHTML(motivo)}</span>
                </button>
                <button type="button" class="btn-sugerir" data-sugerir="${escaparHTML(t.id)}">☀️ Para hoy</button>
            </li>`).join('')}
        </ul>`}`;
}

function planificarParaHoy(id) {
    const t = buscarTarea(id);
    if (!t) return;
    const previa = t.fechaTarea;
    t.fechaTarea = fechaLocalISO();
    guardarTareas();
    ultimaTareaCreadaId = id;
    mostrarTareas();
    mostrarAviso('☀️ Añadida a hoy', {
        accion: 'Deshacer',
        alPulsar: () => { t.fechaTarea = previa; guardarTareas(); mostrarTareas(); }
    });
}
