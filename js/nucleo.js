/* ==========================================
   NÚCLEO: almacenamiento, utilidades, avisos, diálogos y efectos
   ========================================== */

// Claves de datos del usuario (las mismas de siempre + las nuevas opcionales)
const CLAVES_DATOS = ['tareasApp', 'categoriasApp', 'notasApp', 'horarioApp', 'horarioFinde', 'theme', 'criterioOrden', 'ascendente'];
const CLAVES_NUEVAS = ['estadisticasApp', 'acentoApp', 'confetiApp', 'nombreUsuario', 'vistaTareas', 'recordatoriosApp', 'festivosApp', 'semanasAB'];
const CLAVE_RESPALDO_AUTO = 'agendaRespaldoPrevioV2';

// Antes de que la nueva versión toque nada, guardar una foto exacta de los datos originales
(function respaldoPrevioActualizacion() {
    try {
        if (localStorage.getItem(CLAVE_RESPALDO_AUTO)) return;
        const datos = {};
        CLAVES_DATOS.forEach(clave => {
            const valor = localStorage.getItem(clave);
            if (valor !== null) datos[clave] = valor;
        });
        if (!datos.tareasApp && !datos.notasApp && !datos.horarioApp) return;
        localStorage.setItem(CLAVE_RESPALDO_AUTO, JSON.stringify({ fecha: new Date().toISOString(), datos }));
    } catch (e) {
        console.warn('No se pudo crear el respaldo automático:', e);
    }
})();

const almacen = {
    leer(clave, porDefecto) {
        try {
            const valor = localStorage.getItem(clave);
            return valor === null ? porDefecto : JSON.parse(valor);
        } catch (e) {
            console.error(`Error leyendo ${clave}:`, e);
            return porDefecto;
        }
    },
    escribir(clave, valor) {
        try {
            localStorage.setItem(clave, JSON.stringify(valor));
            if (typeof marcarCambioSync === 'function') marcarCambioSync(clave);
            return true;
        } catch (e) {
            console.error(`Error guardando ${clave}:`, e);
            mostrarAviso('⚠️ No se pudo guardar: el almacenamiento está lleno');
            return false;
        }
    }
};

// Escapar texto del usuario antes de insertarlo como HTML
function escaparHTML(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Minúsculas y sin tildes, para buscar sin preocuparse de acentos
function normalizar(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function coincideBusqueda(texto, consulta) {
    const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return true;
    const base = normalizar(texto);
    return palabras.every(p => base.includes(p));
}

// Resaltar la búsqueda dentro de un texto ya escapado de forma segura
function resaltar(texto, consulta) {
    const seguro = escaparHTML(texto);
    const q = String(consulta || '').trim();
    if (!q) return seguro;
    const base = normalizar(texto);
    const palabra = normalizar(q).split(/\s+/)[0];
    const pos = base.indexOf(palabra);
    // normalizar() conserva la longitud en caracteres latinos habituales
    if (pos === -1 || base.length !== String(texto).length) return seguro;
    const t = String(texto);
    return escaparHTML(t.slice(0, pos)) + '<mark>' + escaparHTML(t.slice(pos, pos + palabra.length)) + '</mark>' + escaparHTML(t.slice(pos + palabra.length));
}

function generarId(prefijo) {
    return `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Fechas locales en formato "YYYY-MM-DD" (sin desfases de zona horaria)
function fechaLocalISO(fecha = new Date()) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function leerFechaLocal(iso) {
    if (!iso) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const [a, m, d] = iso.split('-').map(Number);
        return new Date(a, m - 1, d);
    }
    const f = new Date(iso);
    if (isNaN(f)) return null;
    f.setHours(0, 0, 0, 0);
    return f;
}

function sumarDias(fecha, dias) {
    const f = new Date(fecha);
    f.setDate(f.getDate() + dias);
    return f;
}

function hoyLocal() {
    const f = new Date();
    f.setHours(0, 0, 0, 0);
    return f;
}

// Días desde hoy hasta la fecha (negativo = pasado)
function diasHasta(iso) {
    const f = leerFechaLocal(iso);
    if (!f) return null;
    return Math.round((f - hoyLocal()) / 86400000);
}

function formatoFechaCorta(iso) {
    const f = leerFechaLocal(iso);
    if (!f) return '';
    return f.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function tiempoRelativo(isoCompleto) {
    const fecha = new Date(isoCompleto);
    if (isNaN(fecha)) return '';
    const seg = Math.round((Date.now() - fecha) / 1000);
    if (seg < 45) return 'hace un momento';
    if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
    if (seg < 86400 && fecha.toDateString() === new Date().toDateString()) return `hoy, ${fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    const dias = Math.round((hoyLocal() - leerFechaLocal(isoCompleto)) / 86400000);
    if (dias === 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: fecha.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function plural(n, singular, pluralTexto) {
    return `${n} ${n === 1 ? singular : (pluralTexto || singular + 's')}`;
}

// Descargar un archivo generado en el navegador
function descargarArchivo(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nombreArchivoSeguro(texto) {
    return String(texto || 'archivo').replace(/[/\\?%*:|"<>]/g, '-').trim().slice(0, 80) || 'archivo';
}

function debounce(fn, espera) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), espera);
    };
}

/* ---------- Contraste de colores (WCAG) ---------- */

function hexARgb(hex) {
    const m = String(hex || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

function rgbAHex(rgb) {
    return '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

function luminancia([r, g, b]) {
    const canal = v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contrasteColores(a, b) {
    const la = luminancia(a);
    const lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Mezcla «base» con «hacia» lo mínimo necesario para llegar al contraste pedido frente a «fondo»
function varianteConContraste(base, hacia, fondo, objetivo) {
    for (let t = 0; t <= 1.0001; t += 0.02) {
        const c = base.map((v, i) => v * (1 - t) + hacia[i] * t);
        if (contrasteColores(c, fondo) >= objetivo) return rgbAHex(c);
    }
    return rgbAHex(hacia);
}

const reducirMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Aviso flotante con acción opcional (p. ej. Deshacer) ---------- */

let avisoTimer = null;
function mostrarAviso(texto, opciones = {}) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const { accion, alPulsar, duracion } = opciones;

    toast.innerHTML = `<span class="toast-texto"></span>`;
    toast.querySelector('.toast-texto').textContent = texto;
    if (accion && alPulsar) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-accion';
        btn.textContent = accion;
        btn.addEventListener('click', () => {
            toast.classList.remove('visible');
            alPulsar();
        });
        toast.appendChild(btn);
    }
    toast.classList.add('visible');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => toast.classList.remove('visible'), duracion || (accion ? 6000 : 2600));

    // El aviso no desaparece mientras el ratón o el foco están encima (da tiempo a pulsar «Deshacer»)
    if (!toast.dataset.pausable) {
        toast.dataset.pausable = '1';
        const pausar = () => clearTimeout(avisoTimer);
        const reanudar = () => {
            clearTimeout(avisoTimer);
            avisoTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
        };
        toast.addEventListener('mouseenter', pausar);
        toast.addEventListener('focusin', pausar);
        toast.addEventListener('mouseleave', reanudar);
        toast.addEventListener('focusout', reanudar);
    }
}

/* ---------- Modales con pila, foco y Escape ---------- */

const pilaModales = [];

function elementosEnfocables(contenedor) {
    return [...contenedor.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(el => el.getClientRects().length > 0 && !el.closest('.hidden'));
}

// Solo la ventana de arriba es accesible: el resto de la página queda inerte (ni foco ni lector de pantalla)
function actualizarFondoInerte() {
    const superior = modalSuperior();
    [...document.body.children].forEach(el => {
        if (['SCRIPT', 'CANVAS'].includes(el.tagName) || el.id === 'toast') return;
        el.inert = !!superior && el.id !== superior;
    });
}

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (!pilaModales.some(m => m.id === id)) pilaModales.push({ id, foco: document.activeElement });
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('modal-abierto');
    actualizarFondoInerte();
    requestAnimationFrame(() => modal.classList.add('active'));
    // Si quien abre la ventana no ha colocado el foco dentro, ponerlo en el primer control útil
    setTimeout(() => {
        if (modalSuperior() !== id || modal.contains(document.activeElement)) return;
        const enfocables = elementosEnfocables(modal);
        (enfocables.find(el => !el.classList.contains('btn-close-modal')) || enfocables[0])?.focus({ preventScroll: true });
    }, 90);
}

function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    const idx = pilaModales.findIndex(m => m.id === id);
    const entrada = idx !== -1 ? pilaModales.splice(idx, 1)[0] : null;
    if (pilaModales.length === 0) document.documentElement.classList.remove('modal-abierto');
    actualizarFondoInerte();
    setTimeout(() => {
        // Evitar ocultarlo si se ha vuelto a abrir mientras tanto
        if (!modal.classList.contains('active')) modal.style.display = 'none';
    }, 250);
    if (entrada?.foco && document.contains(entrada.foco)) entrada.foco.focus({ preventScroll: true });
}

function modalSuperior() {
    return pilaModales.length ? pilaModales[pilaModales.length - 1].id : null;
}

/* ---------- Diálogo de confirmación propio (sustituye a confirm) ---------- */

let resolverConfirmacion = null;
function confirmar({ titulo = '¿Seguro?', mensaje = '', aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false, icono = '❓' } = {}) {
    return new Promise(resolve => {
        if (resolverConfirmacion) resolverConfirmacion(false);
        resolverConfirmacion = resolve;
        document.getElementById('confirmIcono').textContent = icono;
        document.getElementById('confirmTitulo').textContent = titulo;
        document.getElementById('confirmMensaje').textContent = mensaje;
        const btnOk = document.getElementById('confirmAceptar');
        btnOk.textContent = aceptar;
        btnOk.classList.toggle('btn-peligro', peligro);
        document.getElementById('confirmCancelar').textContent = cancelar;
        abrirModal('modalConfirmar');
        setTimeout(() => btnOk.focus(), 60);
    });
}

function responderConfirmacion(valor) {
    cerrarModal('modalConfirmar');
    const r = resolverConfirmacion;
    resolverConfirmacion = null;
    if (r) r(valor);
}

/* ---------- Confeti ---------- */

function confetiActivado() {
    return localStorage.getItem('confetiApp') !== 'false' && !reducirMovimiento();
}

let particulasConfeti = [];
let confetiAnimando = false;

function lanzarConfeti({ x, y, cantidad = 80, fuerza = 1 } = {}) {
    if (!confetiActivado()) return;
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const acento = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b87d4b';
    const colores = [acento, '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
    const origenX = x ?? canvas.width / 2;
    const origenY = y ?? canvas.height + 20;
    const desdeAbajo = y === undefined;

    for (let i = 0; i < cantidad; i++) {
        const angulo = desdeAbajo ? -Math.PI / 2 + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
        const velocidad = (desdeAbajo ? 18 + Math.random() * 9 : 3 + Math.random() * 6) * fuerza;
        particulasConfeti.push({
            x: origenX + (desdeAbajo ? (Math.random() - 0.5) * 60 : 0),
            y: origenY,
            vx: Math.cos(angulo) * velocidad,
            vy: Math.sin(angulo) * velocidad - (desdeAbajo ? 0 : 3),
            r: Math.random() * (desdeAbajo ? 5 : 3) + 3,
            color: colores[Math.floor(Math.random() * colores.length)],
            angulo: Math.random() * 360,
            giro: (Math.random() - 0.5) * 10,
            alpha: 1,
            decae: Math.random() * 0.012 + (desdeAbajo ? 0.008 : 0.02),
            redondo: Math.random() < 0.35
        });
    }

    if (confetiAnimando) return;
    confetiAnimando = true;

    const animar = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particulasConfeti = particulasConfeti.filter(p => p.alpha > 0 && p.y < canvas.height + 60);
        particulasConfeti.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.45;
            p.vx *= 0.98;
            p.angulo += p.giro;
            p.alpha -= p.decae;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angulo * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.alpha);
            if (p.redondo) {
                ctx.beginPath();
                ctx.arc(0, 0, p.r * 0.7, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
            }
            ctx.restore();
        });
        if (particulasConfeti.length) {
            requestAnimationFrame(animar);
        } else {
            confetiAnimando = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };
    animar();
}

/* ---------- Markdown ligero y seguro para las notas ---------- */

function markdownEnLinea(texto) {
    return escaparHTML(texto).split(/(`[^`]+`)/g).map(parte => {
        if (/^`[^`]+`$/.test(parte)) return `<code>${parte.slice(1, -1)}</code>`;
        return parte
            .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
            .replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
            .replace(/(^|[^_\w])_(?=\S)([^_]+?)_(?!\w)/g, '$1<em>$2</em>')
            .replace(/~~(?=\S)(.+?)~~/g, '<del>$1</del>')
            .replace(/==(?=\S)(.+?)==/g, '<mark>$1</mark>');
    }).join('');
}

function renderizarMarkdown(md) {
    const lineas = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let lista = null;       // 'ul' | 'ol'
    let parrafo = [];
    let codigo = null;      // líneas dentro de ```

    const cerrarParrafo = () => {
        if (parrafo.length) html += `<p>${parrafo.map(markdownEnLinea).join('<br>')}</p>`;
        parrafo = [];
    };
    const cerrarLista = () => {
        if (lista) html += `</${lista}>`;
        lista = null;
    };

    lineas.forEach((linea, i) => {
        if (codigo !== null) {
            if (/^\s*```/.test(linea)) {
                html += `<pre><code>${escaparHTML(codigo.join('\n'))}</code></pre>`;
                codigo = null;
            } else {
                codigo.push(linea);
            }
            return;
        }
        if (/^\s*```/.test(linea)) {
            cerrarParrafo(); cerrarLista();
            codigo = [];
            return;
        }

        let m;
        if (linea.trim() === '') {
            cerrarParrafo(); cerrarLista();
        } else if ((m = linea.match(/^(#{1,3})\s+(.*)$/))) {
            cerrarParrafo(); cerrarLista();
            const n = m[1].length + 1;
            html += `<h${n}>${markdownEnLinea(m[2])}</h${n}>`;
        } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(linea)) {
            cerrarParrafo(); cerrarLista();
            html += '<hr>';
        } else if ((m = linea.match(/^\s*>\s?(.*)$/))) {
            cerrarParrafo(); cerrarLista();
            html += `<blockquote>${markdownEnLinea(m[1])}</blockquote>`;
        } else if ((m = linea.match(/^\s*[-*+]\s+\[( |x|X)\]\s*(.*)$/))) {
            cerrarParrafo();
            if (lista !== 'ul') { cerrarLista(); html += '<ul>'; lista = 'ul'; }
            const hecho = m[1].toLowerCase() === 'x';
            html += `<li class="md-check ${hecho ? 'hecho' : ''}"><input type="checkbox" data-linea="${i}" ${hecho ? 'checked' : ''} aria-label="Marcar elemento"><span>${markdownEnLinea(m[2])}</span></li>`;
        } else if ((m = linea.match(/^\s*[-*+]\s+(.*)$/))) {
            cerrarParrafo();
            if (lista !== 'ul') { cerrarLista(); html += '<ul>'; lista = 'ul'; }
            html += `<li>${markdownEnLinea(m[1])}</li>`;
        } else if ((m = linea.match(/^\s*\d+[.)]\s+(.*)$/))) {
            cerrarParrafo();
            if (lista !== 'ol') { cerrarLista(); html += '<ol>'; lista = 'ol'; }
            html += `<li>${markdownEnLinea(m[1])}</li>`;
        } else {
            cerrarLista();
            parrafo.push(linea);
        }
    });

    if (codigo !== null) html += `<pre><code>${escaparHTML(codigo.join('\n'))}</code></pre>`;
    cerrarParrafo();
    cerrarLista();
    return html;
}

// Texto plano de una nota (para fragmentos en listas)
function textoPlanoMarkdown(md) {
    return String(md || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/^\s*#{1,3}\s+/gm, '')
        .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '☐ ')
        .replace(/^\s*[-*+>]\s+/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_~=`]{1,2}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
