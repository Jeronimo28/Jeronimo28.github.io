/* ==========================================
   NOTAS
   ========================================== */

let notas = [];
let activeNoteId = null;
let searchNoteQuery = '';
let modoNota = localStorage.getItem('modoNota') === 'ver' ? 'ver' : 'editar';
let filtroAsignaturaNota = ''; // nombre normalizado de la asignatura filtrada ('' = todas)

function cargarNotas() {
    const datos = almacen.leer('notasApp', null);
    if (datos === null) return null;
    return (Array.isArray(datos) ? datos : []).filter(n => n && n.id).map(n => ({
        ...n,
        titulo: String(n.titulo ?? ''),
        contenido: String(n.contenido ?? ''),
        asignatura: typeof n.asignatura === 'string' ? n.asignatura.trim() : '',
        fechaModificacion: n.fechaModificacion || new Date().toISOString()
    }));
}

function guardarNotas() {
    almacen.escribir('notasApp', notas.map(n => {
        const salida = { ...n };
        if (!salida.fijada) delete salida.fijada;
        if (!salida.asignatura) delete salida.asignatura;
        return salida;
    }));
}

/* ---------- Asignaturas de las notas ---------- */

// Asignaturas disponibles: las del horario más las que ya usan las notas
function asignaturasParaNotas(lista = notas) {
    const mapa = new Map(obtenerAsignaturas(cargarClases()).map(a => [normalizar(a.nombre), { nombre: a.nombre, color: a.color }]));
    lista.forEach(n => {
        if (n.asignatura && !mapa.has(normalizar(n.asignatura))) mapa.set(normalizar(n.asignatura), { nombre: n.asignatura, color: null });
    });
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function notasDeAsignatura(nombre, lista = notas) {
    const clave = normalizar(nombre);
    return clave ? notasOrdenadas(lista.filter(n => normalizar(n.asignatura) === clave)) : [];
}

function colorAsignatura(nombre) {
    return asignaturasParaNotas().find(a => normalizar(a.nombre) === normalizar(nombre))?.color || null;
}

function renderizarFiltroAsignaturasNotas() {
    const cont = document.getElementById('notasFiltroAsignaturas');
    if (!cont) return;
    const conNotas = asignaturasParaNotas().map(a => ({ ...a, n: notasDeAsignatura(a.nombre).length })).filter(a => a.n > 0);
    if (filtroAsignaturaNota && !conNotas.some(a => normalizar(a.nombre) === filtroAsignaturaNota)) filtroAsignaturaNota = '';
    cont.classList.toggle('hidden', conNotas.length === 0);
    if (!conNotas.length) {
        cont.innerHTML = '';
        return;
    }
    const chip = (clave, texto, n, color) => {
        const activo = filtroAsignaturaNota === clave;
        return `<button type="button" class="nota-filtro ${activo ? 'active' : ''}" data-asignatura="${escaparHTML(clave)}" aria-pressed="${activo}" ${color ? `style="--c:${color}"` : ''}>
            ${color ? '<span class="nota-filtro-punto" aria-hidden="true"></span>' : ''}${escaparHTML(texto)} <b>${n}</b>
        </button>`;
    };
    cont.innerHTML = chip('', 'Todas', notas.length, null)
        + conNotas.map(a => chip(normalizar(a.nombre), a.nombre, a.n, a.color)).join('');
}

function renderizarSelectAsignaturaNota() {
    const select = document.getElementById('noteAsignatura');
    const nota = notaActiva();
    if (!select || !nota) return;
    const opciones = asignaturasParaNotas();
    select.innerHTML = '<option value="">Sin asignatura</option>'
        + opciones.map(a => `<option value="${escaparHTML(a.nombre)}">${escaparHTML(a.nombre)}</option>`).join('');
    const actual = opciones.find(a => normalizar(a.nombre) === normalizar(nota.asignatura));
    select.value = actual ? actual.nombre : '';
    const color = actual?.color;
    select.closest('.note-asignatura')?.style.setProperty('--c', color || 'var(--border-color)');
}

function cambiarAsignaturaNota(nombre) {
    const nota = notaActiva();
    if (!nota) return;
    guardarNotaActiva();
    nota.asignatura = nombre;
    nota.fechaModificacion = new Date().toISOString();
    guardarNotas();
    renderizarSelectAsignaturaNota();
    renderizarListaNotasSidebar();
}

// Recargar las notas cambiadas desde otra ventana u otro dispositivo sin perder lo que se está escribiendo
function recargarNotasDesdeAlmacen() {
    const cargadas = cargarNotas() || [];
    const editando = ['noteContentInput', 'noteTitleInput'].includes(document.activeElement?.id);
    const activa = editando ? notaActiva() : null;
    let conservar = false;
    if (activa) {
        const titulo = document.getElementById('noteTitleInput').value;
        const contenido = document.getElementById('noteContentInput').value;
        const idx = cargadas.findIndex(n => n.id === activa.id);
        const guardada = idx === -1 ? activa : cargadas[idx];
        if (guardada.titulo !== titulo || guardada.contenido !== contenido || idx === -1) {
            const version = { ...guardada, titulo, contenido, fechaModificacion: new Date().toISOString() };
            if (idx === -1) cargadas.push(version);
            else cargadas[idx] = version;
            conservar = true;
        }
    }
    notas = cargadas;
    if (conservar) guardarNotas();
    if (activeNoteId && !notas.some(n => n.id === activeNoteId)) activeNoteId = notasOrdenadas()[0]?.id || null;
    if (typeof activeTab !== 'undefined' && activeTab === 'notas') {
        renderizarListaNotasSidebar();
        if (!editando) cargarNotaActivaEnEditor();
    }
}

function inicializarNotas() {
    const cargadas = cargarNotas();
    if (cargadas === null) {
        // Primera vez: nota de bienvenida
        notas = [{
            id: 'nota-bienvenida',
            titulo: '¡Bienvenido a tus Notas! 📝',
            contenido: [
                'Este es tu bloc de notas. Todo se **guarda solo** mientras escribes.',
                '',
                '## Lo que puedes hacer',
                '- Dar formato con la barra de arriba o con *Markdown*',
                '- Crear listas de comprobación:',
                '- [x] Probar el modo **Vista**',
                '- [ ] Fijar una nota importante con 📌',
                '- [ ] Convertir una línea en tarea con «✅ A tarea»',
                '',
                '> Consejo: pulsa **Ctrl + K** para buscar en toda la agenda.'
            ].join('\n'),
            fechaModificacion: new Date().toISOString()
        }];
        guardarNotas();
    } else {
        notas = cargadas;
    }
    if (!activeNoteId || !notas.some(n => n.id === activeNoteId)) {
        activeNoteId = notasOrdenadas()[0]?.id || null;
    }
}

function notasOrdenadas(lista = notas) {
    return [...lista].sort((a, b) => (!!b.fijada - !!a.fijada) || (new Date(b.fechaModificacion) - new Date(a.fechaModificacion)));
}

function notaActiva() {
    return notas.find(n => n.id === activeNoteId) || null;
}

function formatearFechaNota(fechaISO) {
    if (!fechaISO) return '';
    const fecha = new Date(fechaISO);
    const hoy = new Date();
    if (fecha.toDateString() === hoy.toDateString()) {
        return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }
    if (fecha.toDateString() === sumarDias(hoy, -1).toDateString()) return 'Ayer';
    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: fecha.getFullYear() !== hoy.getFullYear() ? '2-digit' : undefined });
}

function renderizarListaNotasSidebar() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;

    renderizarFiltroAsignaturasNotas();
    const filtradas = notasOrdenadas(notas.filter(n =>
        (!filtroAsignaturaNota || normalizar(n.asignatura) === filtroAsignaturaNota)
        && coincideBusqueda(`${n.titulo} ${n.contenido} ${n.asignatura}`, searchNoteQuery)));
    const contador = document.getElementById('notasContador');
    if (contador) contador.textContent = notas.length;

    if (filtradas.length === 0) {
        container.innerHTML = `
            <div class="sidebar-vacio">
                <span aria-hidden="true">${searchNoteQuery ? '🔍' : '🗒️'}</span>
                <p>${searchNoteQuery ? 'No se encontraron notas' : 'Aún no tienes notas'}</p>
            </div>`;
        return;
    }
    const colores = new Map(asignaturasParaNotas().map(a => [normalizar(a.nombre), a.color]));

    container.innerHTML = filtradas.map(nota => {
        const plano = textoPlanoMarkdown(nota.contenido);
        let fragmento = plano.slice(0, 70) || 'Sin contenido';
        // Mostrar el fragmento donde aparece lo buscado
        if (searchNoteQuery.trim()) {
            const pos = normalizar(plano).indexOf(normalizar(searchNoteQuery).split(/\s+/)[0]);
            if (pos > 30) fragmento = '…' + plano.slice(pos - 20, pos + 50);
        }
        return `
            <button type="button" class="note-sidebar-item ${nota.id === activeNoteId ? 'active' : ''}" data-id="${escaparHTML(nota.id)}">
                <span class="note-sidebar-title">${nota.fijada ? '<span class="pin" aria-label="Fijada">📌</span>' : ''}${resaltar(nota.titulo || 'Sin título', searchNoteQuery)}</span>
                <span class="note-sidebar-snippet">${resaltar(fragmento, searchNoteQuery)}</span>
                <span class="note-sidebar-date">${nota.asignatura && !filtroAsignaturaNota ? `<span class="note-asig-tag" style="--c:${colores.get(normalizar(nota.asignatura)) || 'var(--text-muted)'}">${escaparHTML(nota.asignatura)}</span>` : ''}${formatearFechaNota(nota.fechaModificacion)}</span>
            </button>`;
    }).join('');
}

function seleccionarNota(id) {
    guardarNotaActiva();
    activeNoteId = id;
    renderizarListaNotasSidebar();
    cargarNotaActivaEnEditor();
    if (window.matchMedia('(max-width: 800px)').matches) {
        document.getElementById('notesMainContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function cargarNotaActivaEnEditor() {
    const nota = notaActiva();
    const editor = document.querySelector('.notes-editor-container');
    const vacio = document.getElementById('notesEmpty');
    editor?.classList.toggle('hidden', !nota);
    vacio?.classList.toggle('hidden', !!nota);
    if (!nota) return;

    document.getElementById('noteTitleInput').value = nota.titulo;
    document.getElementById('noteContentInput').value = nota.contenido;
    actualizarBadgeNota(`Editado ${tiempoRelativo(nota.fechaModificacion)}`);
    actualizarBotonFijar();
    renderizarSelectAsignaturaNota();
    aplicarModoNota();
    actualizarContadoresNota();
}

function actualizarBadgeNota(texto, guardando = false) {
    const badge = document.getElementById('noteDateBadge');
    if (!badge) return;
    badge.textContent = texto;
    badge.classList.toggle('guardado', guardando);
}

function actualizarBotonFijar() {
    const btn = document.getElementById('btnPinNote');
    const nota = notaActiva();
    if (!btn || !nota) return;
    btn.classList.toggle('active', !!nota.fijada);
    btn.setAttribute('aria-pressed', !!nota.fijada);
    btn.title = nota.fijada ? 'Desfijar nota' : 'Fijar arriba';
}

// Autoguardado al editar
function guardarNotaActiva() {
    const nota = notaActiva();
    const titleInput = document.getElementById('noteTitleInput');
    const contentInput = document.getElementById('noteContentInput');
    if (!nota || !titleInput || !contentInput) return;

    if (nota.titulo !== titleInput.value || nota.contenido !== contentInput.value) {
        nota.titulo = titleInput.value;
        nota.contenido = contentInput.value;
        nota.fechaModificacion = new Date().toISOString();
        guardarNotas();
        renderizarListaNotasSidebarDiferido();
        actualizarBadgeNota(`✓ Guardado ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`, true);
    }
}

const renderizarListaNotasSidebarDiferido = debounce(renderizarListaNotasSidebar, 300);

function actualizarContadoresNota() {
    const texto = document.getElementById('noteContentInput')?.value || '';
    const palabras = texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length;
    const minutos = Math.max(1, Math.round(palabras / 220));
    document.getElementById('noteWordCount').textContent = plural(palabras, 'palabra');
    document.getElementById('noteCharCount').textContent = `${texto.length} caracter${texto.length !== 1 ? 'es' : ''}`;
    document.getElementById('noteReadTime').textContent = palabras ? `~${minutos} min de lectura` : '';

    const tareasNota = (texto.match(/^\s*[-*+]\s+\[[ xX]\]/gm) || []).length;
    const hechasNota = (texto.match(/^\s*[-*+]\s+\[[xX]\]/gm) || []).length;
    document.getElementById('noteChecks').textContent = tareasNota ? `☑️ ${hechasNota}/${tareasNota}` : '';
}

// Sin asignatura indicada, la nota nueva hereda la del filtro activo
function crearNuevaNota({ asignatura } = {}) {
    guardarNotaActiva();
    const delFiltro = filtroAsignaturaNota ? asignaturasParaNotas().find(a => normalizar(a.nombre) === filtroAsignaturaNota)?.nombre : '';
    const nueva = {
        id: 'nota-' + Date.now(),
        titulo: '',
        contenido: '',
        asignatura: typeof asignatura === 'string' ? asignatura : (delFiltro || ''),
        fechaModificacion: new Date().toISOString()
    };
    if (nueva.asignatura && normalizar(nueva.asignatura) !== filtroAsignaturaNota) filtroAsignaturaNota = '';
    notas.push(nueva);
    guardarNotas();
    activeNoteId = nueva.id;
    searchNoteQuery = '';
    const buscar = document.getElementById('buscarNota');
    if (buscar) buscar.value = '';
    modoNota = 'editar';
    renderizarListaNotasSidebar();
    cargarNotaActivaEnEditor();
    document.getElementById('noteTitleInput')?.focus();
}

function eliminarNotaActiva() {
    const nota = notaActiva();
    if (!nota) return;
    const indice = notas.indexOf(nota);
    notas.splice(indice, 1);
    guardarNotas();
    activeNoteId = notasOrdenadas()[0]?.id || null;
    renderizarListaNotasSidebar();
    cargarNotaActivaEnEditor();
    mostrarAviso(`🗑️ Nota «${nota.titulo || 'Sin título'}» eliminada`, {
        accion: 'Deshacer',
        alPulsar: () => {
            notas.splice(Math.min(indice, notas.length), 0, nota);
            guardarNotas();
            activeNoteId = nota.id;
            renderizarListaNotasSidebar();
            cargarNotaActivaEnEditor();
        }
    });
}

function alternarFijarNota() {
    const nota = notaActiva();
    if (!nota) return;
    nota.fijada = !nota.fijada;
    guardarNotas();
    actualizarBotonFijar();
    renderizarListaNotasSidebar();
    mostrarAviso(nota.fijada ? '📌 Nota fijada arriba' : 'Nota desfijada');
}

function exportarNotaActiva() {
    guardarNotaActiva();
    const nota = notaActiva();
    if (!nota) return;
    const titulo = nota.titulo || 'Nota sin titulo';
    const contenido = `=== ${titulo} ===\nUltima modificacion: ${new Date(nota.fechaModificacion).toLocaleString('es-ES')}\n\n${nota.contenido}`;
    descargarArchivo(`${nombreArchivoSeguro(titulo)}.txt`, contenido, 'text/plain;charset=utf-8');
}

async function copiarNotaActiva() {
    const nota = notaActiva();
    if (!nota) return;
    try {
        await navigator.clipboard.writeText(nota.titulo ? `${nota.titulo}\n\n${nota.contenido}` : nota.contenido);
        mostrarAviso('📋 Nota copiada al portapapeles');
    } catch {
        mostrarAviso('No se pudo copiar la nota');
    }
}

/* ---------- Modo edición / vista ---------- */

function aplicarModoNota() {
    const textarea = document.getElementById('noteContentInput');
    const preview = document.getElementById('notePreview');
    const btn = document.getElementById('btnModoNota');
    const toolbar = document.getElementById('noteToolbar');
    if (!textarea || !preview) return;

    const ver = modoNota === 'ver';
    textarea.classList.toggle('hidden', ver);
    preview.classList.toggle('hidden', !ver);
    toolbar?.classList.toggle('deshabilitada', ver);
    if (btn) {
        btn.innerHTML = ver ? '✏️ <span>Editar</span>' : '👁️ <span>Vista</span>';
        btn.title = ver ? 'Volver a editar (Ctrl+E)' : 'Ver con formato (Ctrl+E)';
        btn.setAttribute('aria-pressed', ver);
    }
    if (ver) {
        const html = renderizarMarkdown(textarea.value);
        preview.innerHTML = html || '<p class="preview-vacia">Esta nota está vacía. Pulsa «Editar» para escribir.</p>';
    }
}

function alternarModoNota() {
    guardarNotaActiva();
    modoNota = modoNota === 'ver' ? 'editar' : 'ver';
    localStorage.setItem('modoNota', modoNota);
    aplicarModoNota();
    if (modoNota === 'editar') document.getElementById('noteContentInput')?.focus();
}

// Marcar/desmarcar una casilla desde la vista previa
function alternarCasillaNota(numLinea) {
    const textarea = document.getElementById('noteContentInput');
    const lineas = textarea.value.split('\n');
    const linea = lineas[numLinea];
    if (linea === undefined) return;
    lineas[numLinea] = linea.replace(/\[( |x|X)\]/, m => (m === '[ ]' ? '[x]' : '[ ]'));
    textarea.value = lineas.join('\n');
    guardarNotaActiva();
    actualizarContadoresNota();
    aplicarModoNota();
}

/* ---------- Barra de formato ---------- */

function insertarEnEditor(textarea, inicio, fin, texto, seleccionInicio, seleccionFin) {
    textarea.focus();
    textarea.setSelectionRange(inicio, fin);
    // execCommand conserva el historial de Ctrl+Z; si no existe, se usa setRangeText
    const ok = document.execCommand && document.execCommand('insertText', false, texto);
    if (!ok) textarea.setRangeText(texto, inicio, fin, 'end');
    if (seleccionInicio !== undefined) textarea.setSelectionRange(seleccionInicio, seleccionFin ?? seleccionInicio);
    guardarNotaActiva();
    actualizarContadoresNota();
}

function aplicarFormato(tipo) {
    if (modoNota === 'ver') return;
    const ta = document.getElementById('noteContentInput');
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const seleccion = value.slice(s, e);

    const envolver = (marca, porDefecto) => {
        const texto = seleccion || porDefecto;
        // Quitar la marca si ya estaba aplicada
        if (value.slice(s - marca.length, s) === marca && value.slice(e, e + marca.length) === marca) {
            insertarEnEditor(ta, s - marca.length, e + marca.length, seleccion, s - marca.length, e - marca.length);
            return;
        }
        insertarEnEditor(ta, s, e, `${marca}${texto}${marca}`, s + marca.length, s + marca.length + texto.length);
    };

    const prefijoLineas = (prefijo, patron) => {
        const inicioLinea = value.lastIndexOf('\n', s - 1) + 1;
        let finLinea = value.indexOf('\n', e);
        if (finLinea === -1) finLinea = value.length;
        const bloque = value.slice(inicioLinea, finLinea);
        const lineas = bloque.split('\n');
        const todas = lineas.every(l => patron.test(l));
        const nuevo = lineas.map((l, i) => {
            if (todas) return l.replace(patron, '');
            const limpia = l.replace(/^\s*(?:#{1,3}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/, '');
            return (typeof prefijo === 'function' ? prefijo(i) : prefijo) + limpia;
        }).join('\n');
        insertarEnEditor(ta, inicioLinea, finLinea, nuevo, inicioLinea + nuevo.length);
    };

    switch (tipo) {
        case 'negrita': envolver('**', 'texto en negrita'); break;
        case 'cursiva': envolver('*', 'texto en cursiva'); break;
        case 'tachado': envolver('~~', 'texto tachado'); break;
        case 'resaltado': envolver('==', 'texto resaltado'); break;
        case 'codigo': envolver('`', 'código'); break;
        case 'titulo': prefijoLineas('## ', /^##\s+/); break;
        case 'lista': prefijoLineas('- ', /^\s*[-*+]\s+(?!\[)/); break;
        case 'numerada': prefijoLineas(i => `${i + 1}. `, /^\s*\d+[.)]\s+/); break;
        case 'check': prefijoLineas('- [ ] ', /^\s*[-*+]\s+\[[ xX]\]\s+/); break;
        case 'cita': prefijoLineas('> ', /^\s*>\s?/); break;
        case 'enlace': {
            const texto = seleccion || 'texto del enlace';
            const insertado = `[${texto}](https://)`;
            const posUrl = s + texto.length + 3;
            insertarEnEditor(ta, s, e, insertado, posUrl + 8, posUrl + 8);
            break;
        }
        case 'fecha': {
            const sello = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            insertarEnEditor(ta, s, e, sello, s + sello.length);
            break;
        }
    }
}

// Continuar listas al pulsar Enter
function continuarLista(e) {
    const ta = e.target;
    const { selectionStart: s, selectionEnd: fin, value } = ta;
    if (s !== fin) return false;
    const inicioLinea = value.lastIndexOf('\n', s - 1) + 1;
    const linea = value.slice(inicioLinea, s);
    const m = linea.match(/^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|(\d+)([.)])\s+|>\s?)(.*)$/);
    if (!m) return false;

    e.preventDefault();
    const [, sangria, marcador, numero, separador, contenido] = m;
    if (!contenido.trim()) {
        // Elemento vacío: terminar la lista
        insertarEnEditor(ta, inicioLinea, s, '', inicioLinea);
        return true;
    }
    let siguiente = marcador;
    if (numero) siguiente = `${Number(numero) + 1}${separador} `;
    else if (/\[[ xX]\]/.test(marcador)) siguiente = marcador.replace(/\[[xX]\]/, '[ ]');
    const insertado = `\n${sangria}${siguiente}`;
    insertarEnEditor(ta, s, s, insertado, s + insertado.length);
    return true;
}

// Crear una tarea con el texto seleccionado (o la línea actual)
function notaATarea() {
    const ta = document.getElementById('noteContentInput');
    let texto = '';
    if (modoNota === 'editar') {
        const { selectionStart: s, selectionEnd: e, value } = ta;
        texto = value.slice(s, e);
        if (!texto.trim()) {
            const inicio = value.lastIndexOf('\n', s - 1) + 1;
            let fin = value.indexOf('\n', s);
            if (fin === -1) fin = value.length;
            texto = value.slice(inicio, fin);
        }
    } else {
        texto = window.getSelection()?.toString() || '';
    }
    const lineas = texto.split('\n').map(l => l.replace(/^\s*(?:[-*+]\s+\[[ xX]\]\s*|[-*+]\s+|\d+[.)]\s+|>\s?|#{1,3}\s+)/, '').trim()).filter(Boolean);
    if (lineas.length === 0) {
        mostrarAviso('Selecciona texto o coloca el cursor en una línea');
        return;
    }
    const creadas = lineas.slice(0, 20).map(linea => {
        const a = analizarEntrada(linea);
        return crearTarea({ texto: a.texto || linea, fechaTarea: a.fechaTarea, hora: a.hora, prioridad: a.prioridad, categoria: a.categoria, repetir: a.repetir });
    });
    actualizarDashboard();
    mostrarAviso(`✅ ${plural(creadas.length, 'tarea creada', 'tareas creadas')}`, {
        accion: 'Ver',
        alPulsar: () => {
            cambiarPestana('tareas');
            if (creadas.length === 1) abrirPanelTarea(creadas[0].id);
        }
    });
}

/* ---------- Eventos ---------- */

function inicializarEventosNotas() {
    document.getElementById('btnNewNote')?.addEventListener('click', () => crearNuevaNota());
    document.getElementById('btnNewNoteEmpty')?.addEventListener('click', () => crearNuevaNota());
    document.getElementById('noteAsignatura')?.addEventListener('change', e => cambiarAsignaturaNota(e.target.value));
    document.getElementById('notasFiltroAsignaturas')?.addEventListener('click', e => {
        const b = e.target.closest('[data-asignatura]');
        if (!b) return;
        filtroAsignaturaNota = b.dataset.asignatura;
        renderizarListaNotasSidebar();
    });
    document.getElementById('btnDeleteNote')?.addEventListener('click', eliminarNotaActiva);
    document.getElementById('btnDownloadNote')?.addEventListener('click', exportarNotaActiva);
    document.getElementById('btnCopyNote')?.addEventListener('click', copiarNotaActiva);
    document.getElementById('btnPinNote')?.addEventListener('click', alternarFijarNota);
    document.getElementById('btnModoNota')?.addEventListener('click', alternarModoNota);
    document.getElementById('btnNoteToTask')?.addEventListener('click', notaATarea);

    const buscar = document.getElementById('buscarNota');
    buscar?.addEventListener('input', e => {
        searchNoteQuery = e.target.value;
        renderizarListaNotasSidebar();
    });
    buscar?.addEventListener('keydown', e => {
        if (e.key === 'Escape' && buscar.value) {
            e.stopPropagation();
            buscar.value = '';
            searchNoteQuery = '';
            renderizarListaNotasSidebar();
        }
    });

    document.getElementById('notesListContainer')?.addEventListener('click', e => {
        const item = e.target.closest('.note-sidebar-item');
        if (item) seleccionarNota(item.dataset.id);
    });

    const titulo = document.getElementById('noteTitleInput');
    titulo?.addEventListener('input', guardarNotaActiva);
    titulo?.addEventListener('keydown', e => {
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && titulo.selectionStart === titulo.value.length)) {
            e.preventDefault();
            if (modoNota === 'ver') alternarModoNota();
            const ta = document.getElementById('noteContentInput');
            ta.focus();
            ta.setSelectionRange(0, 0);
        }
    });

    const contenido = document.getElementById('noteContentInput');
    contenido?.addEventListener('input', () => {
        guardarNotaActiva();
        actualizarContadoresNota();
    });
    contenido?.addEventListener('keydown', e => {
        const mod = e.ctrlKey || e.metaKey;
        if (e.key === 'Enter' && !e.shiftKey && !mod && !e.isComposing) {
            continuarLista(e);
        } else if (mod && !e.shiftKey && ['b', 'i', 'k'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            aplicarFormato({ b: 'negrita', i: 'cursiva', k: 'enlace' }[e.key.toLowerCase()]);
        } else if (e.key === 'Tab' && !mod) {
            // Sangría con Tab en lugar de salir del editor
            e.preventDefault();
            const { selectionStart: s, selectionEnd: f } = contenido;
            insertarEnEditor(contenido, s, f, '  ', s + 2);
        }
    });

    document.getElementById('noteToolbar')?.addEventListener('click', e => {
        const b = e.target.closest('[data-md]');
        if (b) aplicarFormato(b.dataset.md);
    });
    // No quitar el foco del editor al pulsar la barra
    document.getElementById('noteToolbar')?.addEventListener('mousedown', e => {
        if (e.target.closest('[data-md]')) e.preventDefault();
    });

    document.getElementById('notePreview')?.addEventListener('change', e => {
        if (e.target.matches('input[type="checkbox"][data-linea]')) alternarCasillaNota(Number(e.target.dataset.linea));
    });
    document.getElementById('notePreview')?.addEventListener('dblclick', e => {
        if (!e.target.closest('a, input')) alternarModoNota();
    });

    // No perder nada al cerrar la ventana
    window.addEventListener('beforeunload', guardarNotaActiva);
    document.addEventListener('visibilitychange', () => { if (document.hidden) guardarNotaActiva(); });
}
