/* ==========================================
   VENTANA «FESTIVOS Y VACACIONES» Y SEMANAS A/B
   ========================================== */

function refrescarTrasFestivos() {
    invalidarFestivos();
    refrescarHorario();
    if (typeof activeTab !== 'undefined' && activeTab === 'calendario') renderizarCalendario();
}

function abrirFestivos() {
    renderizarFestivos();
    abrirModal('modalFestivos');
}

function renderizarFestivos() {
    const cfg = cargarConfigFestivos();
    const ab = cargarSemanasAB();

    const select = document.getElementById('festComunidad');
    if (select) select.value = cfg.comunidad;
    const activos = document.getElementById('festActivos');
    if (activos) activos.checked = cfg.activos;

    // Días sin clase propios (vacaciones, fiestas locales…)
    const hoyISO = fechaLocalISO();
    const propios = [...cfg.propios].sort((a, b) => a.desde.localeCompare(b.desde));
    document.getElementById('festPropios').innerHTML = propios.length
        ? propios.map(p => {
            const rango = p.desde === p.hasta ? formatoFechaCorta(p.desde) : `${formatoFechaCorta(p.desde)} – ${formatoFechaCorta(p.hasta)}`;
            return `
            <li class="fest-item ${p.hasta < hoyISO ? 'pasado' : ''}">
                <span class="fest-icono" aria-hidden="true">🏖️</span>
                <span class="fest-textos"><strong>${escaparHTML(p.nombre)}</strong><small>${escaparHTML(rango)}</small></span>
                <button type="button" class="btn-action" data-quitar="${escaparHTML(p.id)}" aria-label="Quitar ${escaparHTML(p.nombre)}" title="Quitar">✕</button>
            </li>`;
        }).join('')
        : '<li class="fest-vacio">Aún no has añadido vacaciones ni fiestas locales.</li>';

    // Próximos festivos oficiales, con casilla para desactivarlos
    const lista = document.getElementById('festOficiales');
    lista.classList.toggle('deshabilitada', !cfg.activos);
    lista.innerHTML = proximosFestivos(hoyISO, 365).map(f => `
        <li class="fest-item ${f.desactivado ? 'desactivado' : ''}">
            <label class="fest-check">
                <input type="checkbox" data-festivo="${f.fecha}" ${f.desactivado ? '' : 'checked'} ${cfg.activos ? '' : 'disabled'}>
                <span class="fest-textos"><strong>${escaparHTML(f.nombre)}</strong><small>${escaparHTML(formatoFechaCorta(f.fecha))}${f.tipo === 'autonomico' ? ' · autonómico' : ''}</small></span>
            </label>
        </li>`).join('');

    // Semanas A/B
    const abActivo = document.getElementById('festSemanasAB');
    if (abActivo) abActivo.checked = ab.activo;
    const letra = semanaDe(new Date(), ab);
    document.getElementById('festSemanaActual')?.classList.toggle('hidden', !ab.activo);
    document.querySelectorAll('#festSemanaActual [data-letra]').forEach(b => {
        const activo = b.dataset.letra === letra;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', activo);
    });
}

function anadirFestivoPropio(e) {
    e.preventDefault();
    const nombre = document.getElementById('festNombre');
    const desde = document.getElementById('festDesde');
    const hasta = document.getElementById('festHasta');
    const error = document.getElementById('festError');
    error.textContent = '';
    if (!desde.value) {
        error.textContent = 'Elige al menos la fecha de inicio.';
        desde.focus();
        return;
    }
    if (hasta.value && hasta.value < desde.value) {
        error.textContent = 'La fecha final no puede ser anterior a la inicial.';
        hasta.focus();
        return;
    }
    const cfg = cargarConfigFestivos();
    cfg.propios.push({ id: generarId('fest'), nombre: nombre.value.trim() || 'Sin clase', desde: desde.value, hasta: hasta.value || desde.value });
    guardarConfigFestivos(cfg);
    nombre.value = '';
    desde.value = '';
    hasta.value = '';
    renderizarFestivos();
    refrescarTrasFestivos();
    mostrarAviso('🏖️ Días sin clase añadidos');
    nombre.focus();
}

function inicializarFestivos() {
    const modal = document.getElementById('modalFestivos');
    if (!modal) return;

    const select = document.getElementById('festComunidad');
    select.innerHTML = Object.entries(COMUNIDADES).map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
    select.addEventListener('change', () => {
        guardarConfigFestivos({ ...cargarConfigFestivos(), comunidad: select.value, desactivados: [] });
        renderizarFestivos();
        refrescarTrasFestivos();
    });
    document.getElementById('festActivos').addEventListener('change', e => {
        guardarConfigFestivos({ ...cargarConfigFestivos(), activos: e.target.checked });
        renderizarFestivos();
        refrescarTrasFestivos();
    });
    document.getElementById('festOficiales').addEventListener('change', e => {
        const fecha = e.target.dataset.festivo;
        if (!fecha) return;
        const cfg = cargarConfigFestivos();
        cfg.desactivados = e.target.checked ? cfg.desactivados.filter(f => f !== fecha) : [...new Set([...cfg.desactivados, fecha])];
        guardarConfigFestivos(cfg);
        e.target.closest('.fest-item')?.classList.toggle('desactivado', !e.target.checked);
        refrescarTrasFestivos();
    });
    document.getElementById('formFestivo').addEventListener('submit', anadirFestivoPropio);
    document.getElementById('festPropios').addEventListener('click', e => {
        const b = e.target.closest('[data-quitar]');
        if (!b) return;
        const cfg = cargarConfigFestivos();
        const quitado = cfg.propios.find(p => p.id === b.dataset.quitar);
        cfg.propios = cfg.propios.filter(p => p.id !== b.dataset.quitar);
        guardarConfigFestivos(cfg);
        renderizarFestivos();
        refrescarTrasFestivos();
        if (quitado) {
            mostrarAviso(`«${quitado.nombre}» quitado`, {
                accion: 'Deshacer',
                alPulsar: () => {
                    const actual = cargarConfigFestivos();
                    actual.propios.push(quitado);
                    guardarConfigFestivos(actual);
                    renderizarFestivos();
                    refrescarTrasFestivos();
                }
            });
        }
    });

    document.getElementById('festSemanasAB').addEventListener('change', e => {
        const ab = cargarSemanasAB();
        if (e.target.checked && !ab.referencia) fijarSemanaActual('A');
        else guardarSemanasAB({ ...ab, activo: e.target.checked });
        renderizarFestivos();
        refrescarTrasFestivos();
    });
    document.getElementById('festSemanaActual').addEventListener('click', e => {
        const b = e.target.closest('[data-letra]');
        if (!b) return;
        fijarSemanaActual(b.dataset.letra);
        renderizarFestivos();
        refrescarTrasFestivos();
    });

    document.getElementById('closeModalFestivos')?.addEventListener('click', () => cerrarModal('modalFestivos'));
    modal.addEventListener('click', e => { if (e.target === modal) cerrarModal('modalFestivos'); });
}
