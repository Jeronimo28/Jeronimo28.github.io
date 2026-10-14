/* ==========================================
   TAREAS · crear, completar, eliminar y ordenar
   ========================================== */

/* ---------- Entrada rápida ---------- */

function actualizarFichasEntrada() {
    const input = document.getElementById('nuevaTarea');
    const cont = document.getElementById('quickChips');
    if (!input || !cont) return;
    if (!input.value.trim()) fichasIgnoradas.clear();

    const analisis = analizarEntrada(input.value, fichasIgnoradas);
    const ignoradas = [...fichasIgnoradas].map(tipo => ({ tipo, ignorada: true }));
    if (analisis.fichas.length === 0 && ignoradas.length === 0) {
        cont.innerHTML = '';
        cont.classList.remove('visible');
        return;
    }
    cont.classList.add('visible');
    cont.innerHTML = analisis.fichas.map(f => `
        <button type="button" class="quick-chip ${f.clase || ''}" data-tipo="${f.tipo}" title="Clic para tratarlo como texto normal">
            <span aria-hidden="true">${escaparHTML(f.icono)}</span> ${escaparHTML(f.texto)} <span class="quick-chip-x" aria-hidden="true">×</span>
        </button>`).join('')
        + ignoradas.map(f => `
        <button type="button" class="quick-chip ignorada" data-tipo="${f.tipo}" title="Volver a detectar">↺ ${{ fecha: 'fecha', hora: 'hora', prioridad: 'prioridad', categoria: 'categoría', repetir: 'repetición' }[f.tipo]}</button>`).join('');
}

function crearTarea(datos) {
    const nueva = {
        id: generarId('t'),
        texto: datos.texto,
        completada: false,
        fecha: new Date().toISOString(),
        fechaTarea: datos.fechaTarea || null,
        prioridad: datos.prioridad || 'ninguna',
        categoria: datos.categoria || categoriaPorDefecto(),
        subtareas: [],
        notas: datos.notas || '',
        repetir: datos.repetir || null,
        hora: datos.hora || null,
        tipo: TIPOS_TAREA[datos.tipo] ? datos.tipo : null
    };
    tareas.push(nueva);
    guardarTareas();
    return nueva;
}

function agregarTarea() {
    const input = document.getElementById('nuevaTarea');
    if (!input) return;

    const analisis = analizarEntrada(input.value, fichasIgnoradas);
    if (!analisis.texto) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        input.focus();
        return;
    }

    const inputFecha = document.getElementById('fechaTarea');

    let fechaTarea = analisis.fechaTarea || inputFecha?.value || null;
    // En la vista «Hoy», las tareas sin fecha se crean para hoy
    if (!fechaTarea && filtroTareas.tipo === 'vista' && filtroTareas.valor === 'hoy') fechaTarea = fechaLocalISO();

    const nueva = crearTarea({
        texto: analisis.texto,
        fechaTarea,
        hora: analisis.hora,
        prioridad: analisis.prioridad || 'ninguna',
        categoria: analisis.categoria || (filtroTareas.tipo === 'categoria' ? filtroTareas.valor : undefined),
        repetir: analisis.repetir
    });

    input.value = '';
    if (inputFecha) inputFecha.value = '';
    fichasIgnoradas.clear();
    actualizarFichasEntrada();

    ultimaTareaCreadaId = nueva.id;
    gruposPlegados.delete('hechas');
    mostrarTareas();

    const visible = filtrarTareas().some(t => t.id === nueva.id);
    if (!visible) {
        mostrarAviso(`Tarea añadida (no se ve en esta vista)`, {
            accion: 'Ver',
            alPulsar: () => { searchQuery = ''; document.getElementById('buscarTarea').value = ''; cambiarFiltro('vista', 'todas'); }
        });
    }
}

/* ---------- Acciones sobre tareas ---------- */

function toggleTarea(id, origen) {
    const tarea = buscarTarea(id);
    if (!tarea) return;

    tarea.completada = !tarea.completada;
    if (tarea.completada) {
        tarea.completadaEn = new Date().toISOString();
        registrarActividad(1);

        // Crear la siguiente repetición
        if (tarea.repetir && !(tarea.siguienteId && buscarTarea(tarea.siguienteId))) {
            const siguiente = crearTarea({
                texto: tarea.texto,
                fechaTarea: siguienteFecha(tarea.fechaTarea, tarea.repetir),
                hora: tarea.hora,
                prioridad: tarea.prioridad,
                categoria: tarea.categoria,
                repetir: tarea.repetir,
                notas: tarea.notas,
                tipo: tarea.tipo
            });
            siguiente.subtareas = tarea.subtareas.map(s => ({ id: generarId('s'), texto: s.texto, hecha: false }));
            tarea.siguienteId = siguiente.id;
            mostrarAviso(`🔁 Próxima repetición: ${formatoFechaCorta(siguiente.fechaTarea)}`);
        }

        // Confeti: pequeño desde la casilla, grande si se termina el día
        const rect = origen?.getBoundingClientRect?.();
        const quedanHoy = tareasDeLista().some(t => !t.completada && diasHasta(t.fechaTarea) !== null && diasHasta(t.fechaTarea) <= 0);
        const eraDeHoy = diasHasta(tarea.fechaTarea) !== null && diasHasta(tarea.fechaTarea) <= 0;
        if (eraDeHoy && !quedanHoy) {
            lanzarConfeti({ cantidad: 140 });
            mostrarAviso('🎉 ¡Has terminado todo lo de hoy!');
        } else if (rect) {
            lanzarConfeti({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, cantidad: 28 });
        } else {
            lanzarConfeti({ cantidad: 60 });
        }
    } else {
        if (esHoyISO(tarea.completadaEn)) registrarActividad(-1);
        delete tarea.completadaEn;
        // Deshacer la repetición creada si nadie la ha tocado
        const sig = tarea.siguienteId && buscarTarea(tarea.siguienteId);
        if (sig && !sig.completada && sig.texto === tarea.texto) {
            tareas = tareas.filter(t => t.id !== sig.id);
        }
        delete tarea.siguienteId;
    }
    guardarTareas();

    const li = origen?.closest?.('.todo-item');
    if (li && tarea.completada && !reducirMovimiento()) {
        li.classList.add('completando');
        setTimeout(mostrarTareas, 380);
    } else {
        mostrarTareas();
    }
    if (tareaAbiertaId === id) rellenarPanelTarea();
}

function cambiarPrioridad(id) {
    const tarea = buscarTarea(id);
    if (!tarea) return;
    tarea.prioridad = PRIORIDADES[(PRIORIDADES.indexOf(tarea.prioridad) + 1) % PRIORIDADES.length];
    guardarTareas();
    mostrarTareas();
}

function eliminarTarea(id) {
    const indice = tareas.findIndex(t => t.id === id);
    if (indice === -1) return;
    const [quitada] = tareas.splice(indice, 1);
    guardarTareas();
    if (tareaAbiertaId === id) cerrarPanelTarea();
    mostrarTareas();
    mostrarAviso(`🗑️ «${quitada.texto.length > 32 ? quitada.texto.slice(0, 32) + '…' : quitada.texto}» eliminada`, {
        accion: 'Deshacer',
        alPulsar: () => {
            tareas.splice(Math.min(indice, tareas.length), 0, quitada);
            guardarTareas();
            mostrarTareas();
        }
    });
}

function restaurarTareas(eliminadas, mensaje) {
    mostrarAviso(mensaje, {
        accion: 'Deshacer',
        alPulsar: () => {
            eliminadas.forEach(({ tarea, indice }) => {
                if (!buscarTarea(tarea.id)) tareas.splice(Math.min(indice, tareas.length), 0, tarea);
            });
            guardarTareas();
            mostrarTareas();
        }
    });
}

function eliminarTareasHechas() {
    const eliminadas = tareas.map((tarea, indice) => ({ tarea, indice })).filter(e => e.tarea.completada && !esDeCalendario(e.tarea));
    if (eliminadas.length === 0) {
        mostrarAviso('No hay tareas completadas que limpiar');
        return;
    }
    tareas = tareas.filter(t => !t.completada || esDeCalendario(t));
    guardarTareas();
    mostrarTareas();
    restaurarTareas(eliminadas, `🧹 ${plural(eliminadas.length, 'tarea completada eliminada', 'tareas completadas eliminadas')}`);
}

function pasarVencidasAHoy() {
    const hoy = fechaLocalISO();
    const afectadas = tareasDeLista().filter(t => !t.completada && diasHasta(t.fechaTarea) < 0);
    const previas = afectadas.map(t => ({ id: t.id, fecha: t.fechaTarea }));
    afectadas.forEach(t => { t.fechaTarea = hoy; });
    guardarTareas();
    mostrarTareas();
    mostrarAviso(`📅 ${plural(afectadas.length, 'tarea movida', 'tareas movidas')} a hoy`, {
        accion: 'Deshacer',
        alPulsar: () => {
            previas.forEach(p => { const t = buscarTarea(p.id); if (t) t.fechaTarea = p.fecha; });
            guardarTareas();
            mostrarTareas();
        }
    });
}

function alternarDireccionOrden() {
    ascendente = !ascendente;
    localStorage.setItem('ascendente', ascendente);
    actualizarBotonDireccion();
    mostrarTareas();
}

function actualizarBotonDireccion() {
    const btn = document.getElementById('direccionOrden');
    if (!btn) return;
    btn.textContent = ascendente ? '↑' : '↓';
    btn.disabled = criterioOrden === 'matriz';
    const textos = {
        fecha: ascendente ? 'Más próximas primero' : 'Más lejanas primero',
        prioridad: ascendente ? 'Prioridad alta primero' : 'Prioridad baja primero'
    };
    btn.title = textos[criterioOrden] || 'Cambiar dirección';
    btn.setAttribute('aria-label', btn.title);
}

function cambiarCriterioOrden(criterio) {
    criterioOrden = criterio;
    localStorage.setItem('criterioOrden', criterio);
    actualizarBotonDireccion();
    mostrarTareas();
}
