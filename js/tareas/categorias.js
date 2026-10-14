/* ==========================================
   TAREAS · gestión de categorías
   ========================================== */

/* ---------- Gestión de categorías ---------- */

let editingCatId = null;

function primerEmoji(texto) {
    const limpio = String(texto || '').trim();
    if (!limpio) return '📁';
    if (window.Intl?.Segmenter) {
        const [primero] = new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(limpio);
        return primero ? primero.segment : '📁';
    }
    return [...limpio].slice(0, 2).join('');
}

function renderizarListaCategoriasManage() {
    const list = document.getElementById('listaCategoriasManage');
    if (!list) return;

    list.innerHTML = categorias.map(cat => {
        const count = tareas.filter(t => t.categoria === cat.id).length;
        if (editingCatId === cat.id) {
            return `
                <li class="cat-manage-item" data-cat-id="${escaparHTML(cat.id)}">
                    <div class="cat-edit-row">
                        <input type="text" class="cat-edit-emoji" value="${escaparHTML(cat.icono)}" maxlength="8" aria-label="Editar emoji">
                        <input type="text" class="cat-edit-name" value="${escaparHTML(cat.nombre)}" aria-label="Editar nombre">
                        <button type="button" class="btn-save-cat-edit" data-accion="guardar">Guardar</button>
                        <button type="button" class="btn-cancel-cat-edit" data-accion="cancelar" aria-label="Cancelar">✖</button>
                    </div>
                </li>`;
        }
        return `
            <li class="cat-manage-item" data-cat-id="${escaparHTML(cat.id)}">
                <span class="cat-preview">
                    <span class="cat-emoji">${escaparHTML(cat.icono)}</span>
                    <span class="cat-name">${escaparHTML(cat.nombre)}</span>
                    <span class="cat-count">${plural(count, 'tarea')}</span>
                </span>
                <div class="cat-actions">
                    <button type="button" class="btn-action btn-edit" data-accion="editar" title="Editar categoría" aria-label="Editar">✏️</button>
                    <button type="button" class="btn-action btn-delete" data-accion="eliminar" title="Eliminar categoría" aria-label="Eliminar">🗑️</button>
                </div>
            </li>`;
    }).join('');
}

function iniciarEdicionCat(catId) {
    editingCatId = catId;
    renderizarListaCategoriasManage();
    const input = document.querySelector(`#listaCategoriasManage [data-cat-id="${CSS.escape(catId)}"] .cat-edit-name`);
    input?.focus();
    input?.select();
}

function guardarEdicionCat(catId) {
    const item = document.querySelector(`#listaCategoriasManage [data-cat-id="${CSS.escape(catId)}"]`);
    const inputEmoji = item?.querySelector('.cat-edit-emoji');
    const inputNombre = item?.querySelector('.cat-edit-name');
    if (!inputEmoji || !inputNombre) return;

    const nombre = inputNombre.value.trim();
    if (!nombre) {
        inputNombre.classList.add('shake');
        inputNombre.focus();
        return;
    }
    const cat = obtenerCategoria(catId);
    if (!cat) return;
    if (categorias.some(c => c.id !== catId && normalizar(c.nombre) === normalizar(nombre))) {
        mostrarAviso('Ya existe una categoría con ese nombre');
        inputNombre.focus();
        return;
    }
    cat.icono = primerEmoji(inputEmoji.value);
    cat.nombre = nombre;
    guardarCategorias();
    editingCatId = null;
    renderizarListaCategoriasManage();
    renderizarSelectCategorias();
    mostrarTareas();
}

async function eliminarCat(catId) {
    if (categorias.length <= 1) {
        mostrarAviso('Debes mantener al menos una categoría');
        return;
    }
    const cat = obtenerCategoria(catId);
    if (!cat) return;
    const asociadas = tareas.filter(t => t.categoria === catId);
    const destino = categorias.find(c => c.id !== catId);

    const ok = await confirmar({
        icono: cat.icono,
        titulo: `Eliminar «${cat.nombre}»`,
        mensaje: asociadas.length
            ? `Tiene ${plural(asociadas.length, 'tarea')}. Pasarán a la categoría «${destino.nombre}».`
            : 'La categoría no tiene tareas.',
        aceptar: 'Eliminar',
        peligro: true
    });
    if (!ok) return;

    asociadas.forEach(t => { t.categoria = destino.id; });
    if (asociadas.length) guardarTareas();
    categorias = categorias.filter(c => c.id !== catId);
    guardarCategorias();
    if (filtroTareas.tipo === 'categoria' && filtroTareas.valor === catId) cambiarFiltro('vista', 'todas');

    renderizarListaCategoriasManage();
    renderizarSelectCategorias();
    mostrarTareas();
}

function agregarCat(e) {
    e?.preventDefault();
    const inputEmoji = document.getElementById('nuevaCatIcono');
    const inputNombre = document.getElementById('nuevaCatNombre');
    const nombre = inputNombre.value.trim();
    if (!nombre) return;
    if (categorias.some(c => normalizar(c.nombre) === normalizar(nombre))) {
        mostrarAviso('Ya existe una categoría con ese nombre');
        inputNombre.focus();
        return;
    }
    categorias.push({ id: 'cat-' + Date.now(), nombre, icono: primerEmoji(inputEmoji.value) });
    guardarCategorias();
    inputNombre.value = '';
    inputEmoji.value = '📁';
    renderizarListaCategoriasManage();
    renderizarSelectCategorias();
    mostrarTareas();
    mostrarAviso(`Categoría «${nombre}» creada`);
}

function abrirModalCategorias() {
    editingCatId = null;
    renderizarListaCategoriasManage();
    abrirModal('modalCategorias');
}
