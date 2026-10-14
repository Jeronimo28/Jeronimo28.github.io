/* ==========================================
   PALETA DE COMANDOS (Ctrl + K)
   ========================================== */

/* ---------- Paleta de comandos (Ctrl + K) ---------- */

let resultadosPaleta = [];
let indicePaleta = 0;

function irATareas(vista) {
    cambiarPestana('tareas');
    if (vista) cambiarFiltro('vista', vista);
}

function enfocarNuevaTarea(texto = '') {
    cambiarPestana('tareas');
    const input = document.getElementById('nuevaTarea');
    if (!input) return;
    if (texto) input.value = texto;
    actualizarFichasEntrada();
    input.focus();
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function accionesPaleta() {
    return [
        { icono: '➕', titulo: 'Nueva tarea', clave: 'crear añadir tarea', atajo: 'N', ejecutar: () => enfocarNuevaTarea() },
        { icono: '📝', titulo: 'Nueva nota', clave: 'crear nota escribir', ejecutar: () => { cambiarPestana('notas'); crearNuevaNota(); } },
        { icono: '🎓', titulo: 'Nueva clase', clave: 'crear clase asignatura horario', ejecutar: () => { cambiarPestana('horario'); abrirModalClase(); } },
        { icono: '📅', titulo: 'Añadir examen o evento al calendario', clave: 'calendario examen evento fecha crear', ejecutar: () => { cambiarPestana('calendario'); enfocarNuevoCalendario(); } },
        { icono: '☀️', titulo: 'Tareas de hoy', clave: 'hoy vista', ejecutar: () => irATareas('hoy') },
        { icono: '📆', titulo: 'Próximos 7 días', clave: 'semana proximas vista', ejecutar: () => irATareas('proximas') },
        { icono: '⏰', titulo: 'Tareas vencidas', clave: 'atrasadas vencidas vista', ejecutar: () => irATareas('vencidas') },
        { icono: '🧭', titulo: 'Matriz urgente / importante', clave: 'eisenhower matriz prioridades cuadrantes', ejecutar: () => { irATareas(); document.getElementById('criterioOrden').value = 'matriz'; cambiarCriterioOrden('matriz'); } },
        { icono: '✅', titulo: 'Ir a Tareas', clave: 'pestaña tareas', atajo: '1', ejecutar: () => cambiarPestana('tareas') },
        { icono: '📝', titulo: 'Ir a Notas', clave: 'pestaña notas', atajo: '2', ejecutar: () => cambiarPestana('notas') },
        { icono: '🗓️', titulo: 'Ir a Horario', clave: 'pestaña horario clases', atajo: '3', ejecutar: () => cambiarPestana('horario') },
        { icono: '📅', titulo: 'Ir a Calendario', clave: 'pestaña calendario mes examenes eventos', atajo: '4', ejecutar: () => cambiarPestana('calendario') },
        { icono: '🌓', titulo: temaEfectivo() === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro', clave: 'tema oscuro claro modo noche', atajo: 'D', ejecutar: () => cambiarTema(temaEfectivo() === 'dark' ? 'light' : 'dark') },
        { icono: '⚙️', titulo: 'Ajustes', clave: 'preferencias color nombre configuración', ejecutar: abrirAjustes },
        { icono: '☁️', titulo: 'Sincronizar dispositivos', clave: 'sincronizar nube supabase cuenta movil ordenador', ejecutar: abrirSync },
        { icono: '💾', titulo: 'Descargar copia de seguridad', clave: 'backup exportar guardar copia', ejecutar: exportarCopia },
        { icono: '📤', titulo: 'Exportar calendario y horario (.ics)', clave: 'google outlook calendario ics exportar horario', ejecutar: exportarCalendarioICS },
        { icono: '🎉', titulo: 'Festivos, vacaciones y semanas A/B', clave: 'festivos vacaciones puente semana a b alternas comunidad', ejecutar: () => { cambiarPestana('horario'); abrirFestivos(); } },
        { icono: '🖨️', titulo: 'Imprimir horario', clave: 'pdf imprimir horario', ejecutar: () => { cambiarPestana('horario'); setTimeout(() => window.print(), 300); } },
        { icono: '⌨️', titulo: 'Atajos de teclado', clave: 'ayuda teclado atajos', atajo: '?', ejecutar: () => abrirModal('modalAtajos') }
    ];
}

function construirResultadosPaleta(consulta) {
    const q = consulta.trim();
    const grupos = [];

    if (!q) {
        const hoyPend = tareasDeLista().filter(t => !t.completada && diasHasta(t.fechaTarea) !== null && diasHasta(t.fechaTarea) <= 0)
            .sort(compararTareas).slice(0, 5);
        if (hoyPend.length) grupos.push({ titulo: 'Para hoy', items: hoyPend.map(itemTareaPaleta) });
        grupos.push({ titulo: 'Acciones', items: accionesPaleta().slice(0, 9) });
    } else {
        const acciones = accionesPaleta().filter(a => coincideBusqueda(`${a.titulo} ${a.clave}`, q));
        const tareasCoinc = tareas.filter(t => coincideBusqueda(`${t.texto} ${t.notas} ${t.subtareas.map(s => s.texto).join(' ')}`, q))
            .sort((a, b) => (a.completada - b.completada) || compararTareas(a, b)).slice(0, 6);
        const listaNotas = notas.length ? notas : (cargarNotas() || []);
        const notasCoinc = notasOrdenadas(listaNotas.filter(n => coincideBusqueda(`${n.titulo} ${n.contenido} ${n.asignatura}`, q))).slice(0, 5);
        const clasesCoinc = ordenarPorHora(cargarClases().filter(c => coincideBusqueda(`${c.asignatura} ${c.aula} ${c.profesor} ${c.notas}`, q)))
            .sort((a, b) => a.dia - b.dia).slice(0, 5);

        if (tareasCoinc.length) grupos.push({ titulo: 'Tareas', items: tareasCoinc.map(itemTareaPaleta) });
        if (notasCoinc.length) {
            grupos.push({
                titulo: 'Notas',
                items: notasCoinc.map(n => ({
                    icono: n.fijada ? '📌' : '📝',
                    titulo: n.titulo || 'Sin título',
                    detalle: [n.asignatura, textoPlanoMarkdown(n.contenido).slice(0, 60)].filter(Boolean).join(' · '),
                    ejecutar: () => { cambiarPestana('notas'); seleccionarNota(n.id); }
                }))
            });
        }
        if (clasesCoinc.length) {
            grupos.push({
                titulo: 'Clases',
                items: clasesCoinc.map(c => ({
                    icono: '🎓',
                    color: c.color,
                    titulo: c.asignatura,
                    detalle: `${DIAS_SEMANA[c.dia]} · ${c.inicio}–${c.fin}${c.aula ? ' · ' + c.aula : ''}`,
                    ejecutar: () => { cambiarPestana('horario'); abrirModalClase({ id: c.id }); }
                }))
            });
        }
        if (acciones.length) grupos.push({ titulo: 'Acciones', items: acciones });
        grupos.push({
            titulo: 'Crear',
            items: [{ icono: '➕', titulo: `Crear tarea «${q}»`, detalle: analizarEntrada(q).fichas.map(f => `${f.icono} ${f.texto}`).join('  '), ejecutar: () => enfocarNuevaTarea(q) }]
        });
    }
    return grupos;
}

function itemTareaPaleta(t) {
    const f = etiquetaFecha(t);
    return {
        icono: t.completada ? '✅' : '⬜',
        titulo: t.texto,
        detalle: [obtenerCategoria(t.categoria)?.nombre, f?.texto].filter(Boolean).join(' · '),
        tachado: t.completada,
        ejecutar: () => abrirTareaDondeToca(t.id)
    };
}

// Exámenes y eventos se abren en el calendario; las tareas, en su pestaña
function abrirTareaDondeToca(id) {
    const t = buscarTarea(id);
    if (!t) return;
    if (esDeCalendario(t)) {
        cambiarPestana('calendario');
        if (t.fechaTarea) seleccionarDiaCalendario(t.fechaTarea);
    } else {
        cambiarPestana('tareas');
    }
    abrirPanelTarea(id);
}

function renderizarPaleta() {
    const input = document.getElementById('paletaInput');
    const cont = document.getElementById('paletaResultados');
    const grupos = construirResultadosPaleta(input.value);
    resultadosPaleta = grupos.flatMap(g => g.items);
    indicePaleta = Math.min(indicePaleta, Math.max(0, resultadosPaleta.length - 1));

    let i = 0;
    cont.innerHTML = grupos.map(g => `
        <div class="paleta-grupo" role="presentation">
            <div class="paleta-grupo-titulo">${g.titulo}</div>
            ${g.items.map(item => {
                const idx = i++;
                return `
                <button type="button" class="paleta-item ${idx === indicePaleta ? 'active' : ''}" data-indice="${idx}" role="option" aria-selected="${idx === indicePaleta}" id="paleta-op-${idx}">
                    <span class="paleta-icono" ${item.color ? `style="--c:${item.color}"` : ''}>${item.icono}</span>
                    <span class="paleta-textos">
                        <span class="paleta-titulo ${item.tachado ? 'tachado' : ''}">${resaltar(item.titulo, input.value)}</span>
                        ${item.detalle ? `<span class="paleta-detalle">${escaparHTML(item.detalle)}</span>` : ''}
                    </span>
                    ${item.atajo ? `<kbd>${item.atajo}</kbd>` : ''}
                </button>`;
            }).join('')}
        </div>`).join('') || '<p class="paleta-vacia">Sin resultados</p>';
    input.setAttribute('aria-activedescendant', `paleta-op-${indicePaleta}`);
}

function abrirPaleta() {
    if (modalSuperior() === 'modalPaleta') return;
    const input = document.getElementById('paletaInput');
    input.value = '';
    indicePaleta = 0;
    renderizarPaleta();
    abrirModal('modalPaleta');
    input.focus();
}

function ejecutarPaleta(indice) {
    const item = resultadosPaleta[indice];
    if (!item) return;
    cerrarModal('modalPaleta');
    setTimeout(item.ejecutar, 60);
}

function inicializarPaleta() {
    const input = document.getElementById('paletaInput');
    const cont = document.getElementById('paletaResultados');
    const modal = document.getElementById('modalPaleta');

    input?.addEventListener('input', () => { indicePaleta = 0; renderizarPaleta(); });
    input?.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const total = resultadosPaleta.length;
            if (!total) return;
            indicePaleta = (indicePaleta + (e.key === 'ArrowDown' ? 1 : -1) + total) % total;
            renderizarPaleta();
            document.getElementById(`paleta-op-${indicePaleta}`)?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            ejecutarPaleta(indicePaleta);
        }
    });
    cont?.addEventListener('click', e => {
        const b = e.target.closest('.paleta-item');
        if (b) ejecutarPaleta(Number(b.dataset.indice));
    });
    cont?.addEventListener('mousemove', e => {
        const b = e.target.closest('.paleta-item');
        if (!b || Number(b.dataset.indice) === indicePaleta) return;
        cont.querySelector('.paleta-item.active')?.classList.remove('active');
        b.classList.add('active');
        indicePaleta = Number(b.dataset.indice);
    });
    modal?.addEventListener('click', e => { if (e.target === modal) cerrarModal('modalPaleta'); });
    document.getElementById('btnPaleta')?.addEventListener('click', abrirPaleta);
}
