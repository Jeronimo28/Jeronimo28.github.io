/* ==========================================
   TAREAS · panel de detalle y plan de estudio
   ========================================== */

/* ---------- Panel de detalle de una tarea ---------- */

function abrirPanelTarea(id) {
    if (!buscarTarea(id)) return;
    tareaAbiertaId = id;
    renderizarSelectCategorias();
    rellenarPanelTarea();
    abrirModal('modalTarea');
    setTimeout(() => {
        const texto = document.getElementById('detTexto');
        if (texto) ajustarAltura(texto);
    }, 30);
}

function cerrarPanelTarea() {
    guardarTextoPanel();
    tareaAbiertaId = null;
    cerrarModal('modalTarea');
}

function ajustarAltura(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
}

function rellenarPanelTarea() {
    const t = buscarTarea(tareaAbiertaId);
    if (!t) return;

    const texto = document.getElementById('detTexto');
    if (document.activeElement !== texto) texto.value = t.texto;
    ajustarAltura(texto);
    const notas = document.getElementById('detNotas');
    if (document.activeElement !== notas) notas.value = t.notas;

    document.getElementById('detCompletada').checked = t.completada;
    document.getElementById('modalTarea').classList.toggle('tarea-hecha', t.completada);
    document.getElementById('detFecha').value = t.fechaTarea || '';
    document.getElementById('detHora').value = t.hora || '';
    document.getElementById('detCategoria').value = t.categoria;
    document.getElementById('detRepetir').value = t.repetir || '';

    const tipo = tipoTarea(t);
    document.querySelectorAll('#detTipo [data-tipo]').forEach(b => {
        const activo = b.dataset.tipo === tipo;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', activo);
    });

    document.querySelectorAll('#detPrioridad .prio-opcion').forEach(b => {
        const activa = b.dataset.prio === t.prioridad;
        b.classList.toggle('active', activa);
        b.setAttribute('aria-pressed', activa);
    });

    const hechas = t.subtareas.filter(s => s.hecha).length;
    document.getElementById('detSubtareasContador').textContent = t.subtareas.length ? `${hechas}/${t.subtareas.length}` : '';
    document.getElementById('detSubtareas').innerHTML = t.subtareas.map(s => `
        <li class="subtarea ${s.hecha ? 'hecha' : ''}" data-sub="${escaparHTML(s.id)}">
            <input type="checkbox" ${s.hecha ? 'checked' : ''} data-accion="sub-toggle" aria-label="Completar subtarea">
            <input type="text" class="subtarea-texto" value="${escaparHTML(s.texto)}" data-accion="sub-texto" aria-label="Texto de la subtarea">
            <button type="button" class="btn-action" data-accion="sub-eliminar" aria-label="Eliminar subtarea" title="Eliminar">✕</button>
        </li>`).join('');

    const dias = diasHasta(t.fechaTarea);
    document.getElementById('detPlan')?.classList.toggle('hidden', tipoTarea(t) !== 'examen' || dias === null || dias < 1);

    const creada = new Date(t.fecha);
    let info = `Creada ${isNaN(creada) ? '' : creada.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    if (t.completada && t.completadaEn) info += ` · Completada ${tiempoRelativo(t.completadaEn)}`;
    document.getElementById('detInfo').textContent = info;
}

function actualizarTarea(cambios, { renderizar = true } = {}) {
    const t = buscarTarea(tareaAbiertaId);
    if (!t) return;
    Object.assign(t, cambios);
    guardarTareas();
    if (renderizar) {
        mostrarTareas();
        rellenarPanelTarea();
    }
}

function guardarTextoPanel() {
    const t = buscarTarea(tareaAbiertaId);
    if (!t) return;
    const texto = document.getElementById('detTexto').value.replace(/\n+/g, ' ').trim();
    const notas = document.getElementById('detNotas').value;
    if ((texto && texto !== t.texto) || notas !== t.notas) {
        if (texto) t.texto = texto;
        t.notas = notas;
        guardarTareas();
        mostrarTareas();
    }
}

const guardarTextoPanelDiferido = debounce(guardarTextoPanel, 350);

function agregarSubtarea() {
    const input = document.getElementById('detNuevaSubtarea');
    const t = buscarTarea(tareaAbiertaId);
    const texto = input.value.trim();
    if (!t || !texto) return;
    t.subtareas.push({ id: generarId('s'), texto, hecha: false });
    input.value = '';
    guardarTareas();
    mostrarTareas();
    rellenarPanelTarea();
    input.focus();
}

// Repasos los días anteriores a un examen (tareas normales, visibles en «Tareas»)
function crearPlanEstudio(id) {
    const examen = buscarTarea(id);
    if (!examen?.fechaTarea) return;
    const fechaExamen = leerFechaLocal(examen.fechaTarea);
    const pasos = [
        { antes: 5, texto: 'Hacer resumen', prioridad: 'media' },
        { antes: 3, texto: 'Repasar', prioridad: 'media' },
        { antes: 1, texto: 'Repaso final', prioridad: 'alta' }
    ];
    const hoy = fechaLocalISO();
    const nombre = examen.texto.replace(/^examen\s+(de\s+)?/i, '') || examen.texto;
    const creadas = [];
    pasos.forEach(paso => {
        const fecha = fechaLocalISO(sumarDias(fechaExamen, -paso.antes));
        if (fecha < hoy) return;
        const texto = `${paso.texto}: ${nombre}`;
        if (tareas.some(t => t.texto === texto && t.fechaTarea === fecha)) return;
        creadas.push(crearTarea({ texto, fechaTarea: fecha, prioridad: paso.prioridad, categoria: examen.categoria, notas: `Para «${examen.texto}» (${formatoFechaCorta(examen.fechaTarea)})` }));
    });
    if (!creadas.length) {
        mostrarAviso('El plan de estudio ya existe o no queda tiempo antes del examen');
        return;
    }
    mostrarTareas();
    mostrarAviso(`📚 ${plural(creadas.length, 'repaso añadido', 'repasos añadidos')} a Tareas`, {
        accion: 'Deshacer',
        alPulsar: () => {
            const ids = new Set(creadas.map(t => t.id));
            tareas = tareas.filter(t => !ids.has(t.id));
            guardarTareas();
            mostrarTareas();
        }
    });
}

function duplicarTareaAbierta() {
    const t = buscarTarea(tareaAbiertaId);
    if (!t) return;
    const copia = crearTarea({ ...t, texto: `${t.texto} (copia)` });
    copia.subtareas = t.subtareas.map(s => ({ id: generarId('s'), texto: s.texto, hecha: false }));
    guardarTareas();
    ultimaTareaCreadaId = copia.id;
    mostrarTareas();
    abrirPanelTarea(copia.id);
    mostrarAviso('📄 Tarea duplicada');
}

function inicializarPanelTarea() {
    const modal = document.getElementById('modalTarea');
    if (!modal) return;

    modal.addEventListener('click', e => { if (e.target === modal) cerrarPanelTarea(); });
    document.getElementById('closeModalTarea')?.addEventListener('click', cerrarPanelTarea);

    const texto = document.getElementById('detTexto');
    texto.addEventListener('input', () => { ajustarAltura(texto); guardarTextoPanelDiferido(); });
    texto.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); texto.blur(); } });
    texto.addEventListener('blur', guardarTextoPanel);
    document.getElementById('detNotas').addEventListener('input', guardarTextoPanelDiferido);
    document.getElementById('detNotas').addEventListener('blur', guardarTextoPanel);

    document.getElementById('detCompletada').addEventListener('change', e => toggleTarea(tareaAbiertaId, e.target));

    document.getElementById('detTipo')?.addEventListener('click', e => {
        const b = e.target.closest('[data-tipo]');
        if (!b) return;
        const t = buscarTarea(tareaAbiertaId);
        const antes = t && esDeCalendario(t);
        actualizarTarea({ tipo: b.dataset.tipo });
        if (t && antes !== esDeCalendario(t)) {
            mostrarAviso(esDeCalendario(t) ? '📅 Ahora solo se verá en el calendario' : '✅ Ahora también aparece en Tareas');
        }
    });

    document.getElementById('detPrioridad').addEventListener('click', e => {
        const b = e.target.closest('.prio-opcion');
        if (b) actualizarTarea({ prioridad: b.dataset.prio });
    });

    document.getElementById('detFecha').addEventListener('change', e => actualizarTarea({ fechaTarea: e.target.value || null }));
    document.getElementById('detHora').addEventListener('change', e => {
        const cambios = { hora: e.target.value || null };
        const t = buscarTarea(tareaAbiertaId);
        if (cambios.hora && t && !t.fechaTarea) cambios.fechaTarea = fechaLocalISO();
        actualizarTarea(cambios);
    });
    document.getElementById('detFechasRapidas').addEventListener('click', e => {
        const b = e.target.closest('[data-dias]');
        if (!b) return;
        if (b.dataset.dias === 'quitar') actualizarTarea({ fechaTarea: null, hora: null });
        else actualizarTarea({ fechaTarea: fechaLocalISO(sumarDias(hoyLocal(), Number(b.dataset.dias))) });
    });
    document.getElementById('detCategoria').addEventListener('change', e => actualizarTarea({ categoria: e.target.value }));
    document.getElementById('detRepetir').addEventListener('change', e => {
        const cambios = { repetir: e.target.value || null };
        const t = buscarTarea(tareaAbiertaId);
        if (cambios.repetir && t && !t.fechaTarea) cambios.fechaTarea = fechaLocalISO();
        actualizarTarea(cambios);
    });

    const nuevaSub = document.getElementById('detNuevaSubtarea');
    nuevaSub.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarSubtarea(); } });
    document.getElementById('detAgregarSubtarea').addEventListener('click', agregarSubtarea);

    const listaSub = document.getElementById('detSubtareas');
    listaSub.addEventListener('change', e => {
        const t = buscarTarea(tareaAbiertaId);
        const li = e.target.closest('.subtarea');
        const sub = t?.subtareas.find(s => s.id === li?.dataset.sub);
        if (!sub) return;
        if (e.target.dataset.accion === 'sub-toggle') {
            sub.hecha = e.target.checked;
            guardarTareas();
            mostrarTareas();
            rellenarPanelTarea();
            if (t.subtareas.every(s => s.hecha) && !t.completada) {
                mostrarAviso('Todas las subtareas listas', { accion: 'Completar tarea', alPulsar: () => toggleTarea(t.id) });
            }
        } else if (e.target.dataset.accion === 'sub-texto') {
            const nuevo = e.target.value.trim();
            if (nuevo) sub.texto = nuevo;
            else t.subtareas = t.subtareas.filter(s => s !== sub);
            guardarTareas();
            mostrarTareas();
            rellenarPanelTarea();
        }
    });
    listaSub.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.dataset.accion === 'sub-texto') {
            e.preventDefault();
            e.target.blur();
        }
    });
    listaSub.addEventListener('click', e => {
        if (e.target.closest('[data-accion="sub-eliminar"]')) {
            const t = buscarTarea(tareaAbiertaId);
            const id = e.target.closest('.subtarea').dataset.sub;
            t.subtareas = t.subtareas.filter(s => s.id !== id);
            guardarTareas();
            mostrarTareas();
            rellenarPanelTarea();
        }
    });

    document.getElementById('detDuplicar').addEventListener('click', duplicarTareaAbierta);
    document.getElementById('detPlan')?.addEventListener('click', () => crearPlanEstudio(tareaAbiertaId));
    document.getElementById('detEliminar').addEventListener('click', () => eliminarTarea(tareaAbiertaId));
}
