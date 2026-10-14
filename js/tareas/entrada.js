/* ==========================================
   TAREAS · entrada en lenguaje natural y cálculo de fechas
   ========================================== */

/* ---------- Entrada rápida en lenguaje natural ---------- */

const LIMITE_INICIO = '(?<![\\p{L}\\d])';
const LIMITE_FIN = '(?![\\p{L}\\d])';
const DIAS_PATRON = ['lunes', 'martes', 'mi[eé]rcoles', 'jueves', 'viernes', 's[aá]bados?', 'domingos?'];
const MESES_PATRON = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'sep?tiembre', 'octubre', 'noviembre', 'diciembre'];
const NUMEROS_TEXTO = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

const reLibre = (patron) => new RegExp(`${LIMITE_INICIO}(?:${patron})${LIMITE_FIN}`, 'iu');

function indiceDia(palabra) {
    const n = normalizar(palabra).replace(/s$/, '');
    return ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].findIndex(d => d === n || d === n + 's');
}

// Próxima fecha con ese día de la semana (lunes = 0)
function proximoDia(indice, incluirHoy = false) {
    const hoy = hoyLocal();
    let diff = (indice - ((hoy.getDay() + 6) % 7) + 7) % 7;
    if (diff === 0 && !incluirHoy) diff = 7;
    return sumarDias(hoy, diff);
}

function analizarEntrada(textoOriginal, ignorar = new Set()) {
    let texto = String(textoOriginal || '');
    const r = { texto: '', fechaTarea: null, hora: null, prioridad: null, categoria: null, repetir: null, fichas: [] };

    const extraer = (re, fn) => {
        const m = texto.match(re);
        if (!m) return false;
        if (fn(m) === false) return false;
        texto = (texto.slice(0, m.index) + ' ' + texto.slice(m.index + m[0].length));
        return true;
    };

    // Repetición
    if (!ignorar.has('repetir')) {
        extraer(reLibre('cada\\s+d[ií]a|todos\\s+los\\s+d[ií]as|diariamente|a\\s+diario'), () => { r.repetir = 'diaria'; })
            || extraer(reLibre('entre\\s+semana|d[ií]as\\s+laborables|de\\s+lunes\\s+a\\s+viernes'), () => { r.repetir = 'laborables'; })
            || extraer(reLibre(`(?:cada|todos\\s+los)\\s+(${DIAS_PATRON.join('|')})`), m => {
                r.repetir = 'semanal';
                if (!ignorar.has('fecha')) r.fechaTarea = fechaLocalISO(proximoDia(indiceDia(m[1]), true));
            })
            || extraer(reLibre('cada\\s+semana|semanalmente|todas\\s+las\\s+semanas'), () => { r.repetir = 'semanal'; })
            || extraer(reLibre('cada\\s+mes|mensualmente|todos\\s+los\\s+meses'), () => { r.repetir = 'mensual'; });
    }

    // Hora
    if (!ignorar.has('hora')) {
        const ponerHora = (h, min, sufijo) => {
            h = Number(h);
            min = Number(min || 0);
            const s = normalizar(sufijo || '');
            if ((s === 'pm' || s === 'tarde' || s === 'noche') && h < 12) h += 12;
            if (s === 'am' && h === 12) h = 0;
            if (h > 23 || min > 59) return false;
            r.hora = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        };
        extraer(reLibre('a\\s+las?\\s+(\\d{1,2})(?:[:h](\\d{2}))?\\s*(?:h|hs|horas)?(?:\\s+de\\s+la\\s+(ma[ñn]ana|tarde|noche)|\\s*(am|pm))?'),
            m => ponerHora(m[1], m[2], m[3] || m[4]))
            || extraer(reLibre('(\\d{1,2}):(\\d{2})\\s*(am|pm)?'), m => ponerHora(m[1], m[2], m[3]))
            || extraer(reLibre('(\\d{1,2})\\s*(am|pm)'), m => ponerHora(m[1], 0, m[2]));
    }

    // Fecha
    if (!ignorar.has('fecha') && !r.fechaTarea) {
        const hoy = hoyLocal();
        const poner = f => {
            if (!f || isNaN(f)) return false;
            r.fechaTarea = fechaLocalISO(f);
        };
        extraer(reLibre('pasado\\s+ma[ñn]ana'), () => poner(sumarDias(hoy, 2)))
            || extraer(reLibre('hoy|esta\\s+tarde|esta\\s+noche'), () => poner(hoy))
            || extraer(new RegExp(`(?<!la\\s)${LIMITE_INICIO}ma[ñn]ana${LIMITE_FIN}`, 'iu'), () => poner(sumarDias(hoy, 1)))
            || extraer(reLibre('(?:la\\s+)?(?:pr[oó]xima\\s+semana|semana\\s+que\\s+viene)'), () => poner(proximoDia(0)))
            || extraer(reLibre('(?:este\\s+)?fin\\s+de\\s+semana'), () => poner(proximoDia(5, true)))
            || extraer(reLibre(`(?:el\\s+)?(?:pr[oó]ximo\\s+)?(${DIAS_PATRON.join('|')})(?:\\s+que\\s+viene)?`), m => poner(proximoDia(indiceDia(m[1]))))
            || extraer(reLibre('(?:en|dentro\\s+de)\\s+(\\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\\s+(d[ií]as?|semanas?|mes(?:es)?)'), m => {
                const n = Number(m[1]) || NUMEROS_TEXTO[normalizar(m[1])];
                const unidad = normalizar(m[2]);
                if (unidad.startsWith('dia')) return poner(sumarDias(hoy, n));
                if (unidad.startsWith('semana')) return poner(sumarDias(hoy, n * 7));
                return poner(new Date(hoy.getFullYear(), hoy.getMonth() + n, hoy.getDate()));
            })
            || extraer(reLibre('(?:el\\s+)?(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{2,4}))?'), m => {
                const d = Number(m[1]);
                const mes = Number(m[2]) - 1;
                if (d < 1 || d > 31 || mes < 0 || mes > 11) return false;
                let anio = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : hoy.getFullYear();
                let f = new Date(anio, mes, d);
                if (f.getMonth() !== mes) return false;
                if (!m[3] && f < hoy) f = new Date(anio + 1, mes, d);
                return poner(f);
            })
            || extraer(reLibre(`(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${MESES_PATRON.join('|')})(?:\\s+(?:de\\s+)?(\\d{4}))?`), m => {
                const d = Number(m[1]);
                const mesNorm = normalizar(m[2]).replace('setiembre', 'septiembre');
                const mes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'].indexOf(mesNorm);
                const anio = m[3] ? Number(m[3]) : hoy.getFullYear();
                let f = new Date(anio, mes, d);
                if (f.getMonth() !== mes) return false;
                if (!m[3] && f < hoy) f = new Date(anio + 1, mes, d);
                return poner(f);
            })
            || extraer(reLibre('el\\s+(?:d[ií]a\\s+)?(\\d{1,2})'), m => {
                const d = Number(m[1]);
                if (d < 1 || d > 31) return false;
                let f = new Date(hoy.getFullYear(), hoy.getMonth(), d);
                if (f < hoy || f.getDate() !== d) f = new Date(hoy.getFullYear(), hoy.getMonth() + 1, d);
                if (f.getDate() !== d) return false;
                return poner(f);
            });
    }

    // Hora sin fecha: hoy si aún no ha pasado, si no mañana
    if (r.hora && !r.fechaTarea && !ignorar.has('fecha')) {
        const [h, m] = r.hora.split(':').map(Number);
        const ahora = new Date();
        r.fechaTarea = fechaLocalISO(h * 60 + m > ahora.getHours() * 60 + ahora.getMinutes() ? ahora : sumarDias(ahora, 1));
    }

    // Repetición sin fecha: empieza hoy (o el próximo día laborable)
    if (r.repetir && !r.fechaTarea && !ignorar.has('fecha')) {
        let inicio = hoyLocal();
        if (r.repetir === 'laborables') while (inicio.getDay() === 0 || inicio.getDay() === 6) inicio = sumarDias(inicio, 1);
        r.fechaTarea = fechaLocalISO(inicio);
    }

    // Prioridad: !alta, !media, !baja o !!!, !!, !
    if (!ignorar.has('prioridad')) {
        extraer(/(?<!\S)!(alta|media|baja)(?![\p{L}\d])/iu, m => { r.prioridad = normalizar(m[1]); })
            || extraer(/(?<!\S)(!{1,3})(?!\S)/u, m => { r.prioridad = ['baja', 'media', 'alta'][m[1].length - 1]; });
    }

    // Categoría: #nombre (basta con el principio)
    if (!ignorar.has('categoria')) {
        extraer(/(?<!\S)#([\p{L}\d_-]+)/u, m => {
            const buscado = normalizar(m[1]);
            const cat = categorias.find(c => normalizar(c.nombre) === buscado || c.id === m[1])
                || categorias.find(c => normalizar(c.nombre).startsWith(buscado));
            if (!cat) return false;
            r.categoria = cat.id;
        });
    }

    r.texto = texto.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();

    // Fichas de vista previa
    if (r.fechaTarea) {
        const d = diasHasta(r.fechaTarea);
        const rel = d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : formatoFechaCorta(r.fechaTarea);
        r.fichas.push({ tipo: 'fecha', icono: '📅', texto: d <= 1 ? `${rel} · ${formatoFechaCorta(r.fechaTarea)}` : rel });
    }
    if (r.hora) r.fichas.push({ tipo: 'hora', icono: '⏰', texto: r.hora });
    if (r.repetir) r.fichas.push({ tipo: 'repetir', icono: '🔁', texto: REPETICIONES[r.repetir] });
    if (r.prioridad) r.fichas.push({ tipo: 'prioridad', icono: '⚑', texto: `Prioridad ${NOMBRE_PRIORIDAD[r.prioridad].toLowerCase()}`, clase: `prio-${r.prioridad}` });
    if (r.categoria) {
        const cat = obtenerCategoria(r.categoria);
        r.fichas.push({ tipo: 'categoria', icono: cat.icono, texto: cat.nombre });
    }
    return r;
}

/* ---------- Fechas de las tareas ---------- */

function etiquetaFecha(tarea) {
    const d = diasHasta(tarea.fechaTarea);
    if (d === null) return null;
    let texto;
    if (d === 0) texto = 'Hoy';
    else if (d === 1) texto = 'Mañana';
    else if (d === -1) texto = 'Ayer';
    else if (d < -1) texto = `Hace ${-d} días`;
    else if (d < 7) texto = leerFechaLocal(tarea.fechaTarea).toLocaleDateString('es-ES', { weekday: 'long' });
    else {
        const f = leerFechaLocal(tarea.fechaTarea);
        texto = f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: f.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
    }
    if (tarea.hora) texto += ` · ${tarea.hora}`;
    let clase = '';
    if (!tarea.completada) {
        if (d < 0) clase = 'overdue';
        else if (d === 0) clase = 'today';
        else if (d === 1) clase = 'tomorrow';
    }
    return { texto, clase, icono: d < 0 && !tarea.completada ? '⚠️' : '📅' };
}

function claveOrdenFecha(t) {
    return `${t.fechaTarea || '9999-99-99'}T${t.hora || '99:99'}`;
}

// Siguiente fecha de una tarea que se repite (nunca en el pasado)
function siguienteFecha(iso, repetir) {
    const base = leerFechaLocal(iso) || hoyLocal();
    const avanzar = f => {
        switch (repetir) {
            case 'diaria': return sumarDias(f, 1);
            case 'laborables': {
                let s = sumarDias(f, 1);
                while (s.getDay() === 0 || s.getDay() === 6) s = sumarDias(s, 1);
                return s;
            }
            case 'semanal': return sumarDias(f, 7);
            case 'mensual': {
                const dia = base.getDate();
                const s = new Date(f.getFullYear(), f.getMonth() + 1, 1);
                const ultimo = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
                s.setDate(Math.min(dia, ultimo));
                return s;
            }
            default: return sumarDias(f, 1);
        }
    };
    let f = avanzar(base);
    const hoy = hoyLocal();
    let vueltas = 0;
    while (f < hoy && vueltas++ < 500) f = avanzar(f);
    return fechaLocalISO(f);
}
