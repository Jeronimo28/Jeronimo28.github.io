/* ==========================================
   MI AGENDA · arranque, pestañas, ajustes, paleta de comandos y atajos
   (la lógica de cada sección está en js/)
   ========================================== */

let activeTab = localStorage.getItem('activeTab') || 'tareas';

/* ---------- Tema y color de acento ---------- */

const ACENTOS = [
    { id: '', nombre: 'Automático', color: null },
    { id: '#b87d4b', nombre: 'Canela' },
    { id: '#6366f1', nombre: 'Índigo' },
    { id: '#0ea5e9', nombre: 'Cielo' },
    { id: '#0d9488', nombre: 'Turquesa' },
    { id: '#16a34a', nombre: 'Bosque' },
    { id: '#e11d48', nombre: 'Frambuesa' },
    { id: '#db2777', nombre: 'Rosa' },
    { id: '#ea580c', nombre: 'Mandarina' },
    { id: '#7c3aed', nombre: 'Violeta' }
];

const consultaOscuro = window.matchMedia('(prefers-color-scheme: dark)');

// Preferencia guardada: 'light', 'dark' o sin guardar (= seguir al sistema, como antes)
function preferenciaTema() {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
}

function temaEfectivo() {
    const p = preferenciaTema();
    return p === 'system' ? (consultaOscuro.matches ? 'dark' : 'light') : p;
}

function aplicarTema() {
    const tema = temaEfectivo();
    document.documentElement.setAttribute('data-theme', tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'dark' ? '#0f1421' : '#f3e7dc');
    ajustarContrasteAcento();
    document.querySelectorAll('#ajusteTema [data-tema]').forEach(b => {
        const activo = b.dataset.tema === preferenciaTema();
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', activo);
    });
}

function cambiarTema(preferencia) {
    if (preferencia === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', preferencia);
    document.documentElement.classList.add('cambiando-tema');
    aplicarTema();
    setTimeout(() => document.documentElement.classList.remove('cambiando-tema'), 400);
}

function aplicarAcento() {
    const color = localStorage.getItem('acentoApp');
    const raiz = document.documentElement.style;
    if (color && /^#[0-9a-f]{6}$/i.test(color)) {
        raiz.setProperty('--accent', color);
        raiz.setProperty('--accent-hover', `color-mix(in srgb, ${color} 82%, black)`);
        raiz.setProperty('--accent-light', `color-mix(in srgb, ${color} 14%, transparent)`);
    } else {
        ['--accent', '--accent-hover', '--accent-light'].forEach(p => raiz.removeProperty(p));
    }
    ajustarContrasteAcento();
    document.querySelectorAll('#ajusteAcento .acento').forEach(b => {
        const activo = (b.dataset.acento || '') === (color || '');
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', activo);
    });
}

// Variantes del acento legibles: para texto sobre la superficie y como fondo de texto blanco
function ajustarContrasteAcento() {
    const raiz = document.documentElement;
    ['--accent-texto', '--accent-fondo'].forEach(p => raiz.style.removeProperty(p));
    const estilo = getComputedStyle(raiz);
    const acento = hexARgb(estilo.getPropertyValue('--accent'));
    const texto = hexARgb(estilo.getPropertyValue('--text-main'));
    const superficie = hexARgb(estilo.getPropertyValue('--surface'));
    if (!acento || !texto || !superficie) return; // se quedan los valores aproximados del CSS
    // 5.6 en lugar de 4.5: el texto de acento suele ir sobre fondos ya teñidos con el acento
    raiz.style.setProperty('--accent-texto', varianteConContraste(acento, texto, superficie, 5.6));
    raiz.style.setProperty('--accent-fondo', varianteConContraste(acento, [0, 0, 0], [255, 255, 255], 4.6));
}

/* ---------- Saludo y resumen del día ---------- */

function actualizarSaludo() {
    const greetingEl = document.getElementById('txtGreeting');
    const dateEl = document.getElementById('txtDate');
    const horas = new Date().getHours();
    const nombre = (localStorage.getItem('nombreUsuario') || '').trim();

    if (greetingEl) {
        let saludo = 'Buenas noches';
        let icono = '🌙';
        if (horas >= 6 && horas < 12) { saludo = 'Buenos días'; icono = '☀️'; }
        else if (horas >= 12 && horas < 20) { saludo = 'Buenas tardes'; icono = '☕'; }
        greetingEl.textContent = `¡${saludo}${nombre ? `, ${nombre}` : ''}! ${icono}`;
    }
    if (dateEl) {
        const texto = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        dateEl.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    }
}

function actualizarResumenDia() {
    const el = document.getElementById('txtResumenDia');
    if (!el) return;
    const partes = [];

    // En «Tareas» estos números ya están en la tarjeta de Hoy
    if (activeTab !== 'tareas') {
        const lista = tareasDeLista();
        const paraHoy = lista.filter(t => !t.completada && diasHasta(t.fechaTarea) === 0).length;
        const vencidas = lista.filter(t => !t.completada && diasHasta(t.fechaTarea) !== null && diasHasta(t.fechaTarea) < 0).length;
        if (paraHoy) partes.push(`<button type="button" class="resumen-item" data-ir="hoy">📋 ${plural(paraHoy, 'tarea')} hoy</button>`);
        if (vencidas) partes.push(`<button type="button" class="resumen-item alerta" data-ir="vencidas">⏰ ${plural(vencidas, 'vencida')}</button>`);
    }

    // Lo próximo del calendario (esta semana)
    const proximo = tareas
        .filter(t => esDeCalendario(t) && !t.completada && diasHasta(t.fechaTarea) >= 0 && diasHasta(t.fechaTarea) <= 7)
        .sort((a, b) => claveOrdenFecha(a).localeCompare(claveOrdenFecha(b)))[0];
    if (proximo) {
        const d = diasHasta(proximo.fechaTarea);
        const cuando = d === 0 ? (proximo.hora ? `hoy ${proximo.hora}` : 'hoy') : d === 1 ? 'mañana' : `en ${d} días`;
        const texto = proximo.texto.length > 26 ? proximo.texto.slice(0, 26) + '…' : proximo.texto;
        partes.push(`<button type="button" class="resumen-item ${tipoTarea(proximo) === 'examen' && d <= 2 ? 'alerta' : ''}" data-ir="cal:${escaparHTML(proximo.id)}">${TIPOS_TAREA[tipoTarea(proximo)].icono} ${escaparHTML(texto)} · ${cuando}</button>`);
    }

    if (!partes.length && activeTab !== 'tareas') partes.push('<span class="resumen-item tranquilo">✨ Día despejado</span>');
    el.innerHTML = partes.join('');
    el.classList.toggle('hidden', partes.length === 0);
}

/* ---------- Pestañas ---------- */

const PESTANAS = {
    tareas: { tab: 'tabTareas', sidebar: ['tareasProgressWidget', 'tareasCategoriesFilter'], main: 'tareasMainContainer' },
    notas: { tab: 'tabNotas', sidebar: ['notesSidebarContainer'], main: 'notesMainContainer' },
    horario: { tab: 'tabHorario', sidebar: ['horarioSidebarContainer'], main: 'horarioMainContainer' },
    calendario: { tab: 'tabCalendario', sidebar: ['calendarioSidebarContainer'], main: 'calendarioMainContainer' }
};

function cambiarPestana(tabName) {
    if (!PESTANAS[tabName]) tabName = 'tareas';

    // Guardar la nota activa si salimos de la pestaña de notas
    if (activeTab === 'notas') guardarNotaActiva();

    const cambia = activeTab !== tabName;
    activeTab = tabName;
    localStorage.setItem('activeTab', tabName);
    document.documentElement.dataset.tab = tabName;

    Object.entries(PESTANAS).forEach(([nombre, cfg]) => {
        const activa = nombre === tabName;
        const tab = document.getElementById(cfg.tab);
        tab?.classList.toggle('active', activa);
        tab?.setAttribute('aria-selected', String(activa));
        tab?.setAttribute('tabindex', activa ? '0' : '-1');
        cfg.sidebar.forEach(id => document.getElementById(id)?.classList.toggle('hidden', !activa));
        const main = document.getElementById(cfg.main);
        main?.classList.toggle('hidden', !activa);
        if (activa && cambia) {
            main?.classList.remove('entrando');
            void main?.offsetWidth;
            main?.classList.add('entrando');
        }
    });

    if (tabName === 'tareas') {
        mostrarTareas();
    } else if (tabName === 'notas') {
        inicializarNotas();
        renderizarListaNotasSidebar();
        cargarNotaActivaEnEditor();
    } else if (tabName === 'calendario') {
        renderizarCalendario();
    } else {
        refrescarHorario();
    }
    actualizarResumenDia();
    actualizarProximaClase();
    if (cambia) document.querySelector('.main-panel')?.scrollTo({ top: 0 });
}

/* ---------- Atajos de teclado ---------- */

function escribiendoEn(el) {
    return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function cerrarModalSuperior() {
    const id = modalSuperior();
    if (!id) return false;
    if (id === 'modalConfirmar') responderConfirmacion(false);
    else if (id === 'modalTarea') cerrarPanelTarea();
    else if (id === 'modalClase') cerrarModalClase();
    else cerrarModal(id);
    return true;
}

function manejarTeclado(e) {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 'k' && !e.defaultPrevented) {
        e.preventDefault();
        if (modalSuperior() === 'modalPaleta') cerrarModal('modalPaleta');
        else abrirPaleta();
        return;
    }
    if (e.key === 'Escape') {
        if (cerrarModalSuperior()) {
            e.preventDefault();
            return;
        }
        if (activeTab === 'horario' && asignaturaResaltada) {
            alternarResaltado(asignaturaResaltada);
            return;
        }
        if (escribiendoEn(document.activeElement)) document.activeElement.blur();
        return;
    }
    if (mod && e.key.toLowerCase() === 'e' && activeTab === 'notas' && !modalSuperior()) {
        e.preventDefault();
        alternarModoNota();
        return;
    }
    if (mod && e.key.toLowerCase() === 's') {
        // Todo se guarda solo: evitar el «Guardar página» del navegador
        e.preventDefault();
        if (activeTab === 'notas') guardarNotaActiva();
        mostrarAviso('✓ Todo está guardado automáticamente');
        return;
    }

    if (mod || e.altKey || e.defaultPrevented || escribiendoEn(document.activeElement) || modalSuperior()) return;

    if (activeTab === 'calendario' && moverCalendarioConTeclado(e.key)) {
        e.preventDefault();
        return;
    }

    switch (e.key) {
        case '1': cambiarPestana('tareas'); break;
        case '2': cambiarPestana('notas'); break;
        case '3': cambiarPestana('horario'); break;
        case '4': cambiarPestana('calendario'); break;
        case 'n':
        case 'N':
            e.preventDefault();
            if (activeTab === 'notas') crearNuevaNota();
            else if (activeTab === 'horario') abrirModalClase();
            else if (activeTab === 'calendario') enfocarNuevoCalendario();
            else enfocarNuevaTarea();
            break;
        case '/':
            e.preventDefault();
            if (activeTab === 'notas') document.getElementById('buscarNota')?.focus();
            else if (activeTab === 'calendario') enfocarNuevoCalendario();
            else if (activeTab === 'tareas') document.getElementById('buscarTarea')?.focus();
            else abrirPaleta();
            break;
        case 'd':
        case 'D':
            cambiarTema(temaEfectivo() === 'dark' ? 'light' : 'dark');
            break;
        case '?':
            abrirModal('modalAtajos');
            break;
        default: return;
    }
}

/* ---------- Sincronización entre ventanas abiertas ---------- */

function sincronizarDesdeOtraVentana(e) {
    if (!e.key) return;
    if (e.key === 'tareasApp' || e.key === 'categoriasApp') {
        cargarCategorias();
        cargarTareas();
        renderizarSelectCategorias();
        mostrarTareas();
        if (tareaAbiertaId) rellenarPanelTarea();
    } else if (e.key === 'notasApp') {
        recargarNotasDesdeAlmacen();
    } else if (e.key === 'estadisticasApp') {
        actualizarDashboard();
    } else if (e.key === 'syncSesion' || e.key === 'syncConfig' || e.key === 'syncMeta') {
        actualizarIndicadorSync();
    } else if (e.key === 'horarioApp' || e.key === 'festivosApp' || e.key === 'semanasAB') {
        invalidarFestivos();
        refrescarHorario();
        if (activeTab === 'calendario') renderizarCalendario();
    } else if (e.key === 'theme') {
        aplicarTema();
    } else if (e.key === 'acentoApp') {
        aplicarAcento();
    }
}

/* ---------- Inicio ---------- */

document.addEventListener('DOMContentLoaded', () => {
    aplicarTema();
    aplicarAcento();
    actualizarSaludo();

    inicializarTareas();
    inicializarEventosNotas();
    inicializarEventosHorario();
    inicializarFestivos();
    inicializarCalendario();
    inicializarAjustes();
    inicializarPaleta();
    inicializarSync();

    consultaOscuro.addEventListener?.('change', () => { if (preferenciaTema() === 'system') aplicarTema(); });

    Object.entries(PESTANAS).forEach(([nombre, cfg]) => {
        document.getElementById(cfg.tab)?.addEventListener('click', () => cambiarPestana(nombre));
    });
    // Pestañas con teclado: flechas, Inicio y Fin (patrón ARIA de pestañas)
    document.querySelector('.app-nav')?.addEventListener('keydown', e => {
        const nombres = Object.keys(PESTANAS);
        const actual = nombres.indexOf(activeTab);
        const destino = { ArrowRight: actual + 1, ArrowDown: actual + 1, ArrowLeft: actual - 1, ArrowUp: actual - 1, Home: 0, End: nombres.length - 1 }[e.key];
        if (destino === undefined) return;
        e.preventDefault();
        const nombre = nombres[(destino + nombres.length) % nombres.length];
        cambiarPestana(nombre);
        document.getElementById(PESTANAS[nombre].tab)?.focus();
    });

    document.getElementById('txtResumenDia')?.addEventListener('click', e => {
        const b = e.target.closest('[data-ir]');
        if (!b) return;
        if (b.dataset.ir.startsWith('cal:')) abrirTareaDondeToca(b.dataset.ir.slice(4));
        else irATareas(b.dataset.ir);
    });

    // Confirmación
    document.getElementById('confirmAceptar')?.addEventListener('click', () => responderConfirmacion(true));
    document.getElementById('confirmCancelar')?.addEventListener('click', () => responderConfirmacion(false));
    document.getElementById('modalConfirmar')?.addEventListener('click', e => { if (e.target.id === 'modalConfirmar') responderConfirmacion(false); });

    // Atajos
    document.getElementById('closeModalAtajos')?.addEventListener('click', () => cerrarModal('modalAtajos'));
    document.getElementById('modalAtajos')?.addEventListener('click', e => { if (e.target.id === 'modalAtajos') cerrarModal('modalAtajos'); });
    document.getElementById('modalAjustes')?.addEventListener('click', e => { if (e.target.id === 'modalAjustes') cerrarModal('modalAjustes'); });

    // Copia de seguridad
    const inputImport = document.getElementById('inputImportBackup');
    inputImport?.addEventListener('change', () => {
        importarCopia(inputImport.files[0]);
        inputImport.value = '';
    });

    document.addEventListener('keydown', manejarTeclado);
    window.addEventListener('storage', sincronizarDesdeOtraVentana);

    // Pestaña guardada
    notas = cargarNotas() || [];
    cambiarPestana(activeTab);
    actualizarProximaClase();
    actualizarResumenDia();
    actualizarEstadoCopia();
    revisarRecordatorios();
    requestAnimationFrame(() => document.documentElement.classList.add('listo'));

    // Cada minuto: saludo, próxima clase, línea de «ahora» y cambio de día
    let diaActual = fechaLocalISO();
    setInterval(() => {
        actualizarSaludo();
        actualizarProximaClase();
        revisarRecordatorios();
        if (activeTab === 'horario') {
            renderizarHorario();
            renderizarHorarioSidebar();
        }
        if (fechaLocalISO() !== diaActual) {
            if (calDiaSel === diaActual) calDiaSel = fechaLocalISO();
            diaActual = fechaLocalISO();
            mostrarTareas();
        } else {
            actualizarResumenDia();
        }
    }, 60000);

    let esperaResize;
    window.addEventListener('resize', () => {
        clearTimeout(esperaResize);
        if (activeTab === 'horario') esperaResize = setTimeout(renderizarHorario, 150);
    });

    // El Service Worker solo funciona si la app se sirve por http(s)
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('No se pudo registrar el Service Worker:', err));
    }

    // Pedir que el sistema no borre los datos guardados aunque falte espacio
    navigator.storage?.persist?.().catch(() => {});
});
