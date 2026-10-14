/* ==========================================
   TAREAS · eventos de la interfaz
   ========================================== */

/* ---------- Eventos ---------- */

function inicializarTareas() {
    cargarCategorias();
    cargarTareas();
    renderizarSelectCategorias();

    if (filtroTareas.tipo === 'categoria' && !obtenerCategoria(filtroTareas.valor)) filtroTareas = { tipo: 'vista', valor: 'todas' };
    if (filtroTareas.tipo === 'vista' && !VISTAS[filtroTareas.valor]) filtroTareas = { tipo: 'vista', valor: 'todas' };

    const selectOrden = document.getElementById('criterioOrden');
    if (selectOrden) {
        if (![...selectOrden.options].some(o => o.value === criterioOrden)) criterioOrden = 'fecha';
        selectOrden.value = criterioOrden;
        selectOrden.addEventListener('change', e => cambiarCriterioOrden(e.target.value));
    }
    actualizarBotonDireccion();
    document.getElementById('direccionOrden')?.addEventListener('click', alternarDireccionOrden);

    const buscar = document.getElementById('buscarTarea');
    buscar?.addEventListener('input', e => {
        searchQuery = e.target.value;
        mostrarTareas();
    });
    buscar?.addEventListener('keydown', e => {
        if (e.key === 'Escape' && buscar.value) {
            e.stopPropagation();
            buscar.value = '';
            searchQuery = '';
            mostrarTareas();
        }
    });

    const input = document.getElementById('nuevaTarea');
    input?.addEventListener('input', actualizarFichasEntrada);
    input?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            agregarTarea();
        }
    });
    document.getElementById('agregarTarea')?.addEventListener('click', agregarTarea);
    document.getElementById('fechaTarea')?.addEventListener('keydown', e => { if (e.key === 'Enter') agregarTarea(); });

    document.getElementById('quickChips')?.addEventListener('click', e => {
        const chip = e.target.closest('.quick-chip');
        if (!chip) return;
        const tipo = chip.dataset.tipo;
        if (fichasIgnoradas.has(tipo)) fichasIgnoradas.delete(tipo);
        else fichasIgnoradas.add(tipo);
        actualizarFichasEntrada();
        input?.focus();
    });

    document.getElementById('btnAyudaRapida')?.addEventListener('click', () => {
        const ayuda = document.getElementById('ayudaRapida');
        const btn = document.getElementById('btnAyudaRapida');
        const visible = ayuda.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', visible);
    });
    document.getElementById('ayudaRapida')?.addEventListener('click', e => {
        const ejemplo = e.target.closest('[data-ejemplo]');
        if (!ejemplo || !input) return;
        input.value = ejemplo.dataset.ejemplo;
        actualizarFichasEntrada();
        input.focus();
    });

    // Delegación de eventos en la lista
    const lista = document.getElementById('listaTareas');
    lista?.addEventListener('change', e => {
        if (e.target.dataset.accion === 'completar') {
            toggleTarea(e.target.closest('.todo-item').dataset.id, e.target);
        }
    });
    lista?.addEventListener('click', e => {
        const el = e.target.closest('[data-accion]');
        if (!el || el.dataset.accion === 'completar') return;
        const id = el.closest('.todo-item')?.dataset.id;
        switch (el.dataset.accion) {
            case 'abrir': abrirPanelTarea(id); break;
            case 'prioridad': cambiarPrioridad(id); break;
            case 'eliminar': eliminarTarea(id); break;
            case 'pasar-hoy': pasarVencidasAHoy(); break;
            case 'limpiar-hechas': eliminarTareasHechas(); break;
            case 'plegar': {
                const grupo = el.closest('.todo-section').dataset.grupo;
                if (gruposPlegados.has(grupo)) gruposPlegados.delete(grupo);
                else gruposPlegados.add(grupo);
                almacen.escribir('gruposPlegados', [...gruposPlegados]);
                mostrarTareas();
                break;
            }
        }
    });

    ['vistasTareas', 'vistasExtra'].forEach(id => document.getElementById(id)?.addEventListener('click', e => {
        const b = e.target.closest('[data-vista]');
        if (b) cambiarFiltro('vista', b.dataset.vista);
    }));

    document.getElementById('sugerenciasHoy')?.addEventListener('click', e => {
        if (e.target.closest('[data-accion="plegar-sugerencias"]')) {
            sugerenciasPlegadas = !sugerenciasPlegadas;
            localStorage.setItem('sugerenciasPlegadas', sugerenciasPlegadas);
            renderizarSugerencias();
            return;
        }
        const sugerir = e.target.closest('[data-sugerir]');
        if (sugerir) planificarParaHoy(sugerir.dataset.sugerir);
        const abrir = e.target.closest('[data-abrir]');
        if (abrir) abrirPanelTarea(abrir.dataset.abrir);
    });

    inicializarArrastre();
    document.getElementById('categoriasListContainer')?.addEventListener('click', e => {
        const b = e.target.closest('[data-category]');
        if (b) cambiarFiltro('categoria', b.dataset.category);
    });

    // Categorías
    document.getElementById('btnManageCategories')?.addEventListener('click', abrirModalCategorias);
    document.getElementById('closeModalCategorias')?.addEventListener('click', () => cerrarModal('modalCategorias'));
    const modalCat = document.getElementById('modalCategorias');
    modalCat?.addEventListener('click', e => { if (e.target === modalCat) cerrarModal('modalCategorias'); });
    document.getElementById('formNuevaCategoria')?.addEventListener('submit', agregarCat);
    const listaCat = document.getElementById('listaCategoriasManage');
    listaCat?.addEventListener('click', e => {
        const b = e.target.closest('[data-accion]');
        const id = e.target.closest('.cat-manage-item')?.dataset.catId;
        if (!b || !id) return;
        if (b.dataset.accion === 'editar') iniciarEdicionCat(id);
        else if (b.dataset.accion === 'eliminar') eliminarCat(id);
        else if (b.dataset.accion === 'guardar') guardarEdicionCat(id);
        else if (b.dataset.accion === 'cancelar') { editingCatId = null; renderizarListaCategoriasManage(); }
    });
    listaCat?.addEventListener('keydown', e => {
        const id = e.target.closest('.cat-manage-item')?.dataset.catId;
        if (!id || !e.target.matches('.cat-edit-name, .cat-edit-emoji')) return;
        if (e.key === 'Enter') guardarEdicionCat(id);
        if (e.key === 'Escape') { e.stopPropagation(); editingCatId = null; renderizarListaCategoriasManage(); }
    });

    inicializarPanelTarea();
}
