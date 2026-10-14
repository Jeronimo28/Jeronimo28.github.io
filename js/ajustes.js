/* ==========================================
   AJUSTES Y COPIA DE SEGURIDAD
   ========================================== */

/* ---------- Copia de seguridad ---------- */

const CLAVES_BACKUP = [...CLAVES_DATOS, ...CLAVES_NUEVAS, 'gruposPlegados', 'modoNota'];

async function exportarCopia() {
    if (activeTab === 'notas') guardarNotaActiva();

    const copia = { app: 'mi-agenda', version: 2, fecha: new Date().toISOString(), datos: {} };
    CLAVES_BACKUP.forEach(clave => {
        const valor = localStorage.getItem(clave);
        if (valor !== null) copia.datos[clave] = valor;
    });
    const nombre = `mi-agenda-copia-${fechaLocalISO()}.json`;
    const contenido = JSON.stringify(copia, null, 2);

    // En el móvil, abrir «Compartir» para guardarla en Google Drive, el correo, WhatsApp…
    const archivo = typeof File === 'function' ? new File([contenido], nombre, { type: 'application/json' }) : null;
    const esTactil = window.matchMedia?.('(pointer: coarse)').matches;
    let aviso = '💾 Copia de seguridad descargada';
    if (archivo && esTactil && navigator.canShare?.({ files: [archivo] })) {
        try {
            await navigator.share({ files: [archivo], title: 'Copia de Mi Agenda' });
            aviso = '💾 Copia de seguridad guardada';
        } catch (e) {
            if (e?.name === 'AbortError') return;
            descargarArchivo(nombre, contenido, 'application/json');
        }
    } else {
        descargarArchivo(nombre, contenido, 'application/json');
    }
    localStorage.setItem('ultimaCopia', new Date().toISOString());
    actualizarEstadoCopia();
    mostrarAviso(aviso);
}

function importarCopia(archivo) {
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = async () => {
        let copia;
        try {
            copia = JSON.parse(lector.result);
        } catch {
            mostrarAviso('⚠️ No se pudo leer el archivo de copia');
            return;
        }
        if (!copia || copia.app !== 'mi-agenda' || typeof copia.datos !== 'object') {
            mostrarAviso('⚠️ Este archivo no es una copia de Mi Agenda');
            return;
        }
        const fecha = copia.fecha ? new Date(copia.fecha).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : 'fecha desconocida';
        const ok = await confirmar({
            icono: '📂',
            titulo: 'Restaurar copia',
            mensaje: `Copia del ${fecha}. Tus tareas, notas y horario actuales se reemplazarán por los de la copia.`,
            aceptar: 'Restaurar',
            peligro: true
        });
        if (!ok) return;
        restaurarDatos(copia.datos);
    };
    lector.readAsText(archivo);
}

function restaurarDatos(datos) {
    CLAVES_BACKUP.forEach(clave => {
        if (typeof datos[clave] === 'string') localStorage.setItem(clave, datos[clave]);
    });
    marcarRestauracionSync();
    location.reload();
}

async function restaurarRespaldoAutomatico() {
    const respaldo = almacen.leer(CLAVE_RESPALDO_AUTO, null);
    if (!respaldo?.datos) return;
    const ok = await confirmar({
        icono: '🛟',
        titulo: 'Volver a los datos anteriores a la actualización',
        mensaje: `Se recuperarán tus datos tal y como estaban el ${new Date(respaldo.fecha).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}. Lo que hayas cambiado después se perderá (descarga antes una copia si lo necesitas).`,
        aceptar: 'Recuperar',
        peligro: true
    });
    if (ok) restaurarDatos(respaldo.datos);
}

function actualizarEstadoCopia() {
    const ultima = localStorage.getItem('ultimaCopia');
    const estado = document.getElementById('estadoCopia');
    const dias = ultima ? Math.floor((Date.now() - new Date(ultima)) / 86400000) : null;
    const hayDatos = tareas.length + notas.length + cargarClases().length > 3;
    const recomendar = hayDatos && (dias === null || dias >= 14);

    const btnAjustes = document.getElementById('btnAjustes');
    btnAjustes?.classList.toggle('recordatorio', recomendar);
    if (btnAjustes) btnAjustes.title = recomendar ? 'Ajustes · conviene descargar una copia' : 'Ajustes';
    if (estado) {
        estado.textContent = ultima
            ? `Última copia: ${tiempoRelativo(ultima)}${recomendar ? ' · conviene hacer otra' : ''}`
            : 'Aún no has guardado ninguna copia.';
        estado.classList.toggle('alerta', recomendar);
    }
    const auto = almacen.leer(CLAVE_RESPALDO_AUTO, null);
    const btnAuto = document.getElementById('btnRespaldoAuto');
    if (btnAuto) {
        btnAuto.classList.toggle('hidden', !auto?.datos || Object.keys(auto.datos).length === 0);
        const info = document.getElementById('respaldoAutoInfo');
        if (info && auto?.fecha) info.textContent = `Guardado automáticamente el ${new Date(auto.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}, antes de actualizar la app.`;
    }
}

/* ---------- Ajustes ---------- */

function abrirAjustes() {
    document.getElementById('ajusteNombre').value = localStorage.getItem('nombreUsuario') || '';
    document.getElementById('ajusteConfeti').checked = localStorage.getItem('confetiApp') !== 'false';
    document.getElementById('ajusteRecordatorios').checked = recordatoriosActivos();
    aplicarTema();
    aplicarAcento();
    actualizarEstadoCopia();
    actualizarIndicadorSync();

    const stats = almacen.leer('estadisticasApp', {});
    const totalHechas = Object.values(stats).reduce((a, b) => a + b, 0);
    const mejorDia = Object.entries(stats).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('ajusteEstadisticas').innerHTML = `
        <div class="stat"><strong>${tareas.length}</strong><span>tareas</span></div>
        <div class="stat"><strong>${notas.length || cargarNotas()?.length || 0}</strong><span>notas</span></div>
        <div class="stat"><strong>${cargarClases().length}</strong><span>clases</span></div>
        <div class="stat"><strong>${calcularRacha(stats)}🔥</strong><span>racha</span></div>
        <p class="stat-nota">${totalHechas ? `Has completado ${plural(totalHechas, 'tarea')} desde que se registra tu actividad${mejorDia ? ` · mejor día: ${leerFechaLocal(mejorDia[0]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} (${mejorDia[1]})` : ''}.` : 'Tu actividad empezará a registrarse al completar tareas.'}</p>`;

    abrirModal('modalAjustes');
}

function inicializarAjustes() {
    const contAcento = document.getElementById('ajusteAcento');
    if (contAcento) {
        contAcento.innerHTML = ACENTOS.map(a => `
            <button type="button" class="acento ${a.id ? '' : 'auto'}" data-acento="${a.id}" style="${a.id ? `--c:${a.id}` : ''}" title="${a.nombre}" aria-label="Color ${a.nombre}"></button>`).join('');
        contAcento.addEventListener('click', e => {
            const b = e.target.closest('.acento');
            if (!b) return;
            if (b.dataset.acento) localStorage.setItem('acentoApp', b.dataset.acento);
            else localStorage.removeItem('acentoApp');
            aplicarAcento();
        });
    }
    document.getElementById('ajusteTema')?.addEventListener('click', e => {
        const b = e.target.closest('[data-tema]');
        if (b) cambiarTema(b.dataset.tema);
    });
    document.getElementById('ajusteNombre')?.addEventListener('input', e => {
        const valor = e.target.value.trim().slice(0, 30);
        if (valor) localStorage.setItem('nombreUsuario', valor);
        else localStorage.removeItem('nombreUsuario');
        actualizarSaludo();
    });
    document.getElementById('ajusteConfeti')?.addEventListener('change', e => {
        localStorage.setItem('confetiApp', String(e.target.checked));
        if (e.target.checked) lanzarConfeti({ cantidad: 50 });
    });
    document.getElementById('ajusteRecordatorios')?.addEventListener('change', e => alternarRecordatorios(e.target));
    document.getElementById('btnAjustes')?.addEventListener('click', abrirAjustes);
    document.getElementById('closeModalAjustes')?.addEventListener('click', () => cerrarModal('modalAjustes'));
    document.getElementById('ajustesExportar')?.addEventListener('click', exportarCopia);
    document.getElementById('ajustesImportar')?.addEventListener('click', () => document.getElementById('inputImportBackup')?.click());
    document.getElementById('btnRespaldoAuto')?.addEventListener('click', restaurarRespaldoAutomatico);
    document.getElementById('ajustesFestivos')?.addEventListener('click', () => { cerrarModal('modalAjustes'); abrirFestivos(); });
    document.getElementById('ajustesAtajos')?.addEventListener('click', () => { cerrarModal('modalAjustes'); abrirModal('modalAtajos'); });
}
