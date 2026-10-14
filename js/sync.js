/* ==========================================
   SINCRONIZACIÓN ENTRE DISPOSITIVOS (Supabase)
   Cada clave de datos se guarda como una fila. Se sube solo lo que ha cambiado,
   con control de versión: si otro dispositivo la cambió antes, se combinan.
   ========================================== */

const SYNC_CLAVES = ['tareasApp', 'categoriasApp', 'notasApp', 'horarioApp', 'estadisticasApp', 'festivosApp', 'semanasAB'];
const SYNC_TABLA = 'agenda_datos';
const SYNC_INTERVALO = 60000;

// Proyecto de Supabase de la agenda (la clave «publishable» es pública: la seguridad la dan las reglas RLS)
const SUPABASE_POR_DEFECTO = {
    url: 'https://rqkqdbdigllojdomroca.supabase.co',
    clave: 'sb_publishable_kol9rABLF5jRaVAL5KmJ4Q_lSuXbfXq'
};

const SQL_SUPABASE = `-- Mi Agenda: tabla para sincronizar (pégalo en Supabase → SQL Editor → Run)
create table if not exists public.agenda_datos (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  clave text not null,
  valor text not null,
  actualizado timestamptz not null default clock_timestamp(),
  primary key (user_id, clave)
);

-- La hora de cada cambio la pone el servidor
create or replace function public.agenda_tocar() returns trigger
language plpgsql as $$
begin
  new.actualizado := clock_timestamp();
  return new;
end $$;

drop trigger if exists agenda_tocar on public.agenda_datos;
create trigger agenda_tocar before insert or update on public.agenda_datos
  for each row execute function public.agenda_tocar();

-- Cada persona solo puede ver y cambiar sus propios datos
alter table public.agenda_datos enable row level security;
drop policy if exists "agenda: ver lo propio" on public.agenda_datos;
drop policy if exists "agenda: crear lo propio" on public.agenda_datos;
drop policy if exists "agenda: cambiar lo propio" on public.agenda_datos;
drop policy if exists "agenda: borrar lo propio" on public.agenda_datos;
create policy "agenda: ver lo propio" on public.agenda_datos for select using (auth.uid() = user_id);
create policy "agenda: crear lo propio" on public.agenda_datos for insert with check (auth.uid() = user_id);
create policy "agenda: cambiar lo propio" on public.agenda_datos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agenda: borrar lo propio" on public.agenda_datos for delete using (auth.uid() = user_id);

-- Permite que cada persona borre su cuenta desde la app (lo exige Google Play).
-- Al borrar el usuario, sus filas de agenda_datos se borran solas (on delete cascade).
create or replace function public.borrar_mi_cuenta() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;`;

const estadoSync = { fase: 'apagado', mensaje: '', enCurso: null, repetir: false, temporizador: null };

/* ---------- Combinar dos versiones de la misma clave (pura, sin DOM) ---------- */

// Une dos listas de objetos con id. Si un elemento está en ambas, gana la versión más reciente
// según «fechaDe» (o la local si no hay fecha). Conserva el orden de la local y añade al final lo nuevo.
function fusionarListasPorId(local, remota, fechaDe = null) {
    if (!Array.isArray(local)) return Array.isArray(remota) ? remota : local;
    if (!Array.isArray(remota)) return local;
    const porIdRemota = new Map(remota.filter(x => x && x.id != null).map(x => [String(x.id), x]));
    const vistos = new Set();
    const resultado = local.map(x => {
        if (!x || x.id == null) return x;
        const id = String(x.id);
        vistos.add(id);
        const otra = porIdRemota.get(id);
        if (!otra || !fechaDe) return x;
        const fl = Date.parse(fechaDe(x)) || 0;
        const fr = Date.parse(fechaDe(otra)) || 0;
        return fr > fl ? otra : x;
    });
    remota.forEach(x => {
        if (x && x.id != null && !vistos.has(String(x.id))) resultado.push(x);
    });
    return resultado;
}

function fusionarValores(clave, local, remota) {
    if (local === null || local === undefined) return remota;
    if (remota === null || remota === undefined) return local;
    switch (clave) {
        case 'notasApp':
            return fusionarListasPorId(local, remota, n => n.fechaModificacion);
        case 'tareasApp':
            // Una tarea completada en cualquier dispositivo se queda completada
            return fusionarListasPorId(local, remota, t => t.completadaEn || null).map(t => {
                const otra = Array.isArray(remota) && remota.find(r => r && r.id === t?.id);
                if (t && otra?.completada && !t.completada) return otra;
                return t;
            });
        case 'categoriasApp':
        case 'horarioApp':
            return fusionarListasPorId(local, remota);
        case 'estadisticasApp': {
            const salida = { ...remota };
            Object.entries(local || {}).forEach(([dia, n]) => { salida[dia] = Math.max(Number(n) || 0, Number(salida[dia]) || 0); });
            return salida;
        }
        case 'festivosApp':
            return {
                ...remota,
                ...local,
                desactivados: [...new Set([...(remota.desactivados || []), ...(local.desactivados || [])])],
                propios: fusionarListasPorId(local.propios || [], remota.propios || [])
            };
        default:
            return local;
    }
}

/* ---------- Configuración, sesión y estado ---------- */

function normalizarUrlSupabase(url) {
    const limpia = String(url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(limpia) ? limpia.toLowerCase() : null;
}

function configSync() {
    const c = almacen.leer('syncConfig', null) || SUPABASE_POR_DEFECTO;
    return c && normalizarUrlSupabase(c.url) && c.clave ? { url: normalizarUrlSupabase(c.url), clave: String(c.clave) } : null;
}

function sesionSync() {
    const s = almacen.leer('syncSesion', null);
    return s?.access_token && s?.refresh_token ? s : null;
}

function metaSync() {
    const m = almacen.leer('syncMeta', null) || {};
    return { cursor: m.cursor || null, usuario: m.usuario || null, ultima: m.ultima || null, claves: m.claves && typeof m.claves === 'object' ? m.claves : {} };
}

function guardarMetaSync(meta) {
    try {
        localStorage.setItem('syncMeta', JSON.stringify(meta));
    } catch (e) {
        console.error('No se pudo guardar el estado de sincronización:', e);
    }
}

function syncActiva() {
    return !!(configSync() && sesionSync());
}

function ponerEstadoSync(fase, mensaje = '') {
    estadoSync.fase = fase;
    estadoSync.mensaje = mensaje;
    actualizarIndicadorSync();
}

// Llamada desde almacen.escribir cada vez que se guarda una clave
function marcarCambioSync(clave) {
    if (!SYNC_CLAVES.includes(clave) || !syncActiva()) return;
    const meta = metaSync();
    meta.claves[clave] = { ...(meta.claves[clave] || {}), sucio: true };
    guardarMetaSync(meta);
    programarSync();
}

// Tras restaurar una copia: en la próxima sincronización, lo local reemplaza a la nube
function marcarRestauracionSync() {
    if (!syncActiva()) return;
    const meta = metaSync();
    SYNC_CLAVES.forEach(clave => {
        if (localStorage.getItem(clave) !== null) meta.claves[clave] = { ...(meta.claves[clave] || {}), sucio: true, forzar: true };
    });
    guardarMetaSync(meta);
}

function programarSync(espera = 2000) {
    if (!syncActiva()) return;
    clearTimeout(estadoSync.temporizador);
    estadoSync.temporizador = setTimeout(sincronizar, espera);
    if (estadoSync.fase === 'listo') ponerEstadoSync('pendiente');
}

/* ---------- Peticiones a Supabase ---------- */

function errorSync(mensaje, status = 0, datos = null) {
    const e = new Error(mensaje);
    e.status = status;
    e.datos = datos;
    return e;
}

function traducirErrorSupabase(e) {
    const texto = `${e?.datos?.msg || ''} ${e?.datos?.message || ''} ${e?.datos?.error_description || ''} ${e?.datos?.error || ''} ${e?.message || ''}`.toLowerCase();
    if (e?.name === 'TypeError' || /failed to fetch|networkerror|load failed/.test(texto)) return 'No se puede conectar con Supabase. Revisa la conexión y la dirección del proyecto.';
    if (/invalid login credentials/.test(texto)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/.test(texto)) return 'Confirma tu correo (revisa la bandeja de entrada) y vuelve a entrar.';
    if (/user already registered|already been registered/.test(texto)) return 'Ya existe una cuenta con ese correo: pulsa «Entrar».';
    if (/password should be at least|weak password/.test(texto)) return 'La contraseña es demasiado corta (mínimo 6 caracteres).';
    if (/invalid api key|no api key/.test(texto)) return 'La clave «anon» no es correcta.';
    if (/agenda_datos/.test(texto) && /does not exist|not find|schema cache/.test(texto)) return 'Falta crear la tabla: copia el SQL y ejecútalo en Supabase.';
    if (/rate limit|too many/.test(texto)) return 'Demasiados intentos seguidos. Espera un poco y vuelve a probar.';
    if (e?.status === 401 || /jwt|refresh token/.test(texto)) return 'La sesión ha caducado: vuelve a entrar.';
    return e?.message || 'Error desconocido al sincronizar.';
}

async function peticionSupabase(ruta, { metodo = 'GET', cuerpo, cabeceras = {}, autenticada = true } = {}) {
    const cfg = configSync();
    if (!cfg) throw errorSync('Falta configurar Supabase');
    const headers = { apikey: cfg.clave, 'Content-Type': 'application/json', ...cabeceras };
    headers.Authorization = `Bearer ${autenticada ? await tokenSync() : cfg.clave}`;
    const respuesta = await fetch(cfg.url + ruta, {
        method: metodo,
        headers,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
    const texto = await respuesta.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = { message: texto }; }
    if (!respuesta.ok) throw errorSync(datos?.msg || datos?.message || datos?.error_description || `Error ${respuesta.status}`, respuesta.status, datos);
    return datos;
}

function guardarSesionSync(datos) {
    const expira = datos.expires_at || Math.floor(Date.now() / 1000) + (Number(datos.expires_in) || 3600);
    almacen.escribir('syncSesion', {
        access_token: datos.access_token,
        refresh_token: datos.refresh_token,
        expira,
        email: datos.user?.email || sesionSync()?.email || '',
        usuario: datos.user?.id || sesionSync()?.usuario || ''
    });
}

let renovandoToken = null;
async function tokenSync() {
    const sesion = sesionSync();
    if (!sesion) throw errorSync('Sin sesión', 401);
    if (sesion.expira - 90 > Date.now() / 1000) return sesion.access_token;
    renovandoToken ||= (async () => {
        try {
            const datos = await peticionSupabase('/auth/v1/token?grant_type=refresh_token', {
                metodo: 'POST', cuerpo: { refresh_token: sesion.refresh_token }, autenticada: false
            });
            guardarSesionSync(datos);
            return datos.access_token;
        } catch (e) {
            if (e.status === 400 || e.status === 401) {
                localStorage.removeItem('syncSesion');
                throw errorSync('La sesión ha caducado: vuelve a entrar.', 401);
            }
            throw e;
        } finally {
            renovandoToken = null;
        }
    })();
    return renovandoToken;
}

/* ---------- Cuenta ---------- */

// Primera sincronización con esta cuenta: todo lo local cuenta como cambio para combinarlo con la nube
function prepararMetaParaUsuario(usuario) {
    const meta = metaSync();
    if (meta.usuario === usuario && Object.keys(meta.claves).length) return;
    const claves = {};
    SYNC_CLAVES.forEach(clave => {
        if (localStorage.getItem(clave) !== null) claves[clave] = { sucio: true };
    });
    guardarMetaSync({ cursor: null, usuario, ultima: null, claves });
}

async function entrarSync(email, password, crearCuenta = false) {
    const ruta = crearCuenta ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
    const datos = await peticionSupabase(ruta, { metodo: 'POST', cuerpo: { email, password }, autenticada: false });
    const sesion = datos?.access_token ? datos : datos?.session;
    if (!sesion?.access_token) return { confirmar: true };
    guardarSesionSync(sesion);
    prepararMetaParaUsuario(sesion.user?.id || '');
    await sincronizar();
    return { ok: true };
}

// Borra la cuenta y todos sus datos de la nube. Lo de este dispositivo se queda.
async function borrarCuentaSync() {
    if (!sesionSync()) throw errorSync('Sin sesión', 401);
    try {
        await peticionSupabase('/rest/v1/rpc/borrar_mi_cuenta', { metodo: 'POST', cuerpo: {} });
    } catch (e) {
        if (e.status !== 404) throw e;
        // El proyecto aún no tiene la función: al menos borrar los datos guardados en la nube
        await peticionSupabase(`/rest/v1/${SYNC_TABLA}?clave=not.is.null`, { metodo: 'DELETE' });
        localStorage.removeItem('syncSesion');
        localStorage.removeItem('syncMeta');
        ponerEstadoSync('apagado');
        return { soloDatos: true };
    }
    localStorage.removeItem('syncSesion');
    localStorage.removeItem('syncMeta');
    ponerEstadoSync('apagado');
    return { ok: true };
}

async function salirSync() {
    try {
        if (sesionSync()) await peticionSupabase('/auth/v1/logout', { metodo: 'POST' });
    } catch { /* se cierra igualmente en este dispositivo */ }
    localStorage.removeItem('syncSesion');
    localStorage.removeItem('syncMeta');
    ponerEstadoSync('apagado');
}

/* ---------- Bajar y subir cambios ---------- */

function posterior(a, b) {
    if (!b) return true;
    return (Date.parse(a) || 0) > (Date.parse(b) || 0) || (Date.parse(a) === Date.parse(b) && a > b);
}

async function traerCambiosSync() {
    const inicial = metaSync();
    let ruta = `/rest/v1/${SYNC_TABLA}?select=clave,valor,actualizado&order=actualizado.asc`;
    if (inicial.cursor) ruta += `&actualizado=gt.${encodeURIComponent(inicial.cursor)}`;
    const filas = await peticionSupabase(ruta);

    const aplicadas = [];
    const meta = metaSync();
    (filas || []).forEach(fila => {
        if (posterior(fila.actualizado, meta.cursor)) meta.cursor = fila.actualizado;
        if (!SYNC_CLAVES.includes(fila.clave)) return;
        const info = meta.claves[fila.clave] || {};
        if (info.base === fila.actualizado) return; // es nuestra propia subida

        const local = localStorage.getItem(fila.clave);
        let nuevo = fila.valor;
        if (info.forzar && local !== null) {
            // Copia restaurada: lo local sustituye a lo de la nube
            nuevo = local;
            info.sucio = true;
        } else if (info.sucio && local !== null && local !== fila.valor) {
            try {
                nuevo = JSON.stringify(fusionarValores(fila.clave, JSON.parse(local), JSON.parse(fila.valor)));
            } catch {
                nuevo = local;
            }
            info.sucio = nuevo !== fila.valor;
        } else {
            info.sucio = false;
        }
        info.base = fila.actualizado;
        meta.claves[fila.clave] = info;

        if (local !== nuevo) {
            try {
                localStorage.setItem(fila.clave, nuevo);
                aplicadas.push(fila.clave);
            } catch (e) {
                console.error('No se pudo guardar un cambio recibido:', e);
            }
        }
    });
    guardarMetaSync(meta);
    if (aplicadas.length) aplicarCambiosRemotos(aplicadas);
    return aplicadas;
}

async function subirCambiosSync(intentos = 3) {
    let conflicto = false;
    for (const clave of SYNC_CLAVES) {
        const info = metaSync().claves[clave];
        if (!info?.sucio) continue;
        const valor = localStorage.getItem(clave);
        if (valor === null) {
            const meta = metaSync();
            meta.claves[clave] = { ...meta.claves[clave], sucio: false };
            guardarMetaSync(meta);
            continue;
        }

        let filas;
        if (info.base) {
            // Solo se actualiza si nadie la ha cambiado desde la versión que tenemos
            filas = await peticionSupabase(`/rest/v1/${SYNC_TABLA}?clave=eq.${encodeURIComponent(clave)}&actualizado=eq.${encodeURIComponent(info.base)}`, {
                metodo: 'PATCH', cuerpo: { valor }, cabeceras: { Prefer: 'return=representation' }
            });
            if (!filas?.length) {
                conflicto = true;
                if (intentos <= 1) {
                    // La fila ya no existe en la nube: volver a crearla
                    const meta = metaSync();
                    delete meta.claves[clave].base;
                    guardarMetaSync(meta);
                }
                continue;
            }
        } else {
            try {
                filas = await peticionSupabase(`/rest/v1/${SYNC_TABLA}`, {
                    metodo: 'POST', cuerpo: { clave, valor }, cabeceras: { Prefer: 'return=representation' }
                });
            } catch (e) {
                if (e.status === 409) {
                    conflicto = true;
                    continue;
                }
                throw e;
            }
        }
        const meta = metaSync();
        const cambiadaMientras = localStorage.getItem(clave) !== valor;
        meta.claves[clave] = { base: filas[0].actualizado, sucio: cambiadaMientras, forzar: cambiadaMientras && !!meta.claves[clave]?.forzar };
        guardarMetaSync(meta);
    }
    if (conflicto && intentos > 0) {
        if (intentos <= 1) {
            // Tras varios choques seguidos, empezar la lectura desde el principio
            const meta = metaSync();
            meta.cursor = null;
            guardarMetaSync(meta);
        }
        await traerCambiosSync();
        await subirCambiosSync(intentos - 1);
    }
}

async function sincronizar() {
    if (!syncActiva()) {
        ponerEstadoSync(configSync() ? 'sin-sesion' : 'apagado');
        return;
    }
    if (estadoSync.enCurso) {
        estadoSync.repetir = true;
        return estadoSync.enCurso;
    }
    if (navigator.onLine === false) {
        ponerEstadoSync('sin-conexion', 'Sin conexión: se sincronizará al volver');
        return;
    }
    clearTimeout(estadoSync.temporizador);
    estadoSync.enCurso = (async () => {
        ponerEstadoSync('sincronizando');
        try {
            await traerCambiosSync();
            await subirCambiosSync();
            const meta = metaSync();
            meta.ultima = new Date().toISOString();
            guardarMetaSync(meta);
            const quedan = Object.values(meta.claves).some(i => i.sucio);
            ponerEstadoSync(quedan ? 'pendiente' : 'listo');
            if (quedan) estadoSync.repetir = true;
        } catch (e) {
            console.warn('Sincronización:', e);
            ponerEstadoSync(sesionSync() ? 'error' : 'sin-sesion', traducirErrorSupabase(e));
        } finally {
            estadoSync.enCurso = null;
            if (estadoSync.repetir) {
                estadoSync.repetir = false;
                programarSync(1500);
            }
        }
    })();
    return estadoSync.enCurso;
}

// Refrescar la interfaz con lo recibido de otro dispositivo
function aplicarCambiosRemotos(claves) {
    claves.forEach(clave => {
        try {
            sincronizarDesdeOtraVentana({ key: clave });
        } catch (e) {
            console.error('Error al refrescar tras sincronizar:', e);
        }
    });
    if (claves.includes('estadisticasApp')) actualizarDashboard();
}

/* ---------- Interfaz ---------- */

const TEXTOS_ESTADO_SYNC = {
    apagado: ['☁️', 'Sincronización desactivada'],
    'sin-sesion': ['☁️', 'Inicia sesión para sincronizar'],
    pendiente: ['☁️', 'Cambios pendientes de subir'],
    sincronizando: ['🔄', 'Sincronizando…'],
    listo: ['✅', 'Sincronizado'],
    'sin-conexion': ['📴', 'Sin conexión'],
    error: ['⚠️', 'Error al sincronizar']
};

function actualizarIndicadorSync() {
    const [icono, texto] = TEXTOS_ESTADO_SYNC[estadoSync.fase] || TEXTOS_ESTADO_SYNC.apagado;
    const meta = metaSync();
    const detalle = estadoSync.mensaje || (meta.ultima && estadoSync.fase === 'listo' ? `Última vez: ${tiempoRelativo(meta.ultima)}` : '');

    // Sin sesión solo es un aviso si la hubo y caducó; quien nunca entró usa la app sin cuenta
    const caducada = estadoSync.fase === 'sin-sesion' && !!meta.usuario;
    const alerta = estadoSync.fase === 'error' || caducada;

    const btn = document.getElementById('btnSync');
    if (btn) {
        btn.classList.toggle('hidden', !configSync());
        btn.dataset.estado = estadoSync.fase === 'sin-sesion' && !caducada ? 'apagado' : estadoSync.fase;
        btn.textContent = estadoSync.fase === 'listo' ? '☁️' : icono;
        const etiqueta = `${texto}${detalle ? ` · ${detalle}` : ''}`;
        btn.title = etiqueta;
        btn.setAttribute('aria-label', etiqueta);
    }
    const estado = document.getElementById('syncEstado');
    if (estado) {
        estado.textContent = `${icono} ${texto}${detalle ? ` · ${detalle}` : ''}`;
        estado.classList.toggle('alerta', alerta);
    }
    const resumen = document.getElementById('ajusteSyncResumen');
    if (resumen) {
        const sesion = sesionSync();
        resumen.textContent = !configSync() ? 'Opcional: usa tu agenda en el móvil y en el ordenador con una cuenta gratuita de Supabase.'
            : sesion ? `Conectado como ${sesion.email || 'tu cuenta'} · ${texto.toLowerCase()}` : 'Opcional. Sin cuenta, todo sigue guardado en este dispositivo.';
    }
}

function renderizarModalSync() {
    const cfg = configSync();
    const sesion = sesionSync();
    document.getElementById('syncPasoConfig').classList.toggle('hidden', !!cfg);
    document.getElementById('syncPasoCuenta').classList.toggle('hidden', !cfg || !!sesion);
    document.getElementById('syncPasoConectado').classList.toggle('hidden', !cfg || !sesion);
    if (cfg) {
        document.getElementById('syncProyecto').textContent = cfg.url.replace('https://', '');
    }
    if (sesion) document.getElementById('syncCuenta').textContent = sesion.email || 'tu cuenta';
    document.getElementById('syncError').textContent = '';
    actualizarIndicadorSync();
}

function abrirSync() {
    const cfg = almacen.leer('syncConfig', null);
    document.getElementById('syncUrl').value = cfg?.url || '';
    document.getElementById('syncClave').value = cfg?.clave || '';
    renderizarModalSync();
    abrirModal('modalSync');
}

function mostrarErrorSync(texto) {
    const el = document.getElementById('syncError');
    el.textContent = texto;
}

async function conBotonOcupado(boton, tarea) {
    const textoPrevio = boton.textContent;
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    boton.textContent = '…';
    try {
        return await tarea();
    } finally {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        boton.textContent = textoPrevio;
    }
}

function inicializarSync() {
    document.getElementById('btnSync')?.addEventListener('click', abrirSync);
    document.getElementById('ajustesSync')?.addEventListener('click', () => { cerrarModal('modalAjustes'); abrirSync(); });
    document.getElementById('closeModalSync')?.addEventListener('click', () => cerrarModal('modalSync'));
    const modal = document.getElementById('modalSync');
    modal?.addEventListener('click', e => { if (e.target === modal) cerrarModal('modalSync'); });

    document.getElementById('syncCopiarSql')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(SQL_SUPABASE);
            mostrarAviso('📋 SQL copiado: pégalo en Supabase → SQL Editor');
        } catch {
            descargarArchivo('mi-agenda-supabase.sql', SQL_SUPABASE, 'text/plain;charset=utf-8');
        }
    });

    document.getElementById('formSyncConfig')?.addEventListener('submit', async e => {
        e.preventDefault();
        const url = normalizarUrlSupabase(document.getElementById('syncUrl').value);
        const clave = document.getElementById('syncClave').value.trim();
        if (!url) return mostrarErrorSync('La dirección debe ser como https://tu-proyecto.supabase.co');
        if (clave.length < 20) return mostrarErrorSync('Pega la clave pública «anon» del proyecto.');
        almacen.escribir('syncConfig', { url, clave });
        renderizarModalSync();
        document.getElementById('syncEmail').focus();
    });

    const entrar = async crear => {
        const email = document.getElementById('syncEmail').value.trim();
        const password = document.getElementById('syncPassword').value;
        if (!/^\S+@\S+\.\S+$/.test(email)) return mostrarErrorSync('Escribe un correo válido.');
        if (password.length < 6) return mostrarErrorSync('La contraseña debe tener al menos 6 caracteres.');
        mostrarErrorSync('');
        const boton = document.getElementById(crear ? 'syncCrear' : 'syncEntrar');
        try {
            const r = await conBotonOcupado(boton, () => entrarSync(email, password, crear));
            document.getElementById('syncPassword').value = '';
            if (r.confirmar) {
                mostrarErrorSync('Cuenta creada. Confirma el correo que te ha llegado y luego pulsa «Entrar».');
                return;
            }
            renderizarModalSync();
            mostrarAviso(estadoSync.fase === 'error' ? `⚠️ ${estadoSync.mensaje}` : '☁️ Sincronización activada');
        } catch (err) {
            mostrarErrorSync(traducirErrorSupabase(err));
        }
    };
    document.getElementById('formSyncCuenta')?.addEventListener('submit', e => { e.preventDefault(); entrar(false); });
    document.getElementById('syncCrear')?.addEventListener('click', () => entrar(true));

    document.getElementById('syncAhora')?.addEventListener('click', async e => {
        await conBotonOcupado(e.currentTarget, sincronizar);
        renderizarModalSync();
    });
    document.getElementById('syncSalir')?.addEventListener('click', async () => {
        const ok = await confirmar({
            icono: '☁️',
            titulo: 'Cerrar sesión',
            mensaje: 'Tus datos se quedan en este dispositivo y en la nube, pero dejarán de sincronizarse aquí.',
            aceptar: 'Cerrar sesión'
        });
        if (!ok) return;
        await salirSync();
        renderizarModalSync();
    });
    document.getElementById('syncBorrarCuenta')?.addEventListener('click', async e => {
        const ok = await confirmar({
            icono: '🗑️',
            titulo: 'Eliminar cuenta',
            mensaje: 'Se borrarán tu cuenta y todos los datos guardados en la nube. Lo que hay en este dispositivo no se toca. No se puede deshacer.',
            aceptar: 'Eliminar cuenta',
            peligro: true
        });
        if (!ok) return;
        try {
            const r = await conBotonOcupado(e.currentTarget, borrarCuentaSync);
            renderizarModalSync();
            mostrarAviso(r.soloDatos ? '🗑️ Datos de la nube borrados' : '🗑️ Cuenta eliminada');
        } catch (err) {
            mostrarErrorSync(traducirErrorSupabase(err));
        }
    });
    document.querySelectorAll('[data-accion="cambiar-proyecto"]').forEach(b => b.addEventListener('click', async () => {
        await salirSync();
        localStorage.removeItem('syncConfig');
        renderizarModalSync();
        document.getElementById('syncUrl').focus();
    }));

    // Cuándo sincronizar: al abrir, al volver a la app, al recuperar la conexión y cada minuto
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
    window.addEventListener('online', () => sincronizar());
    window.addEventListener('offline', () => { if (syncActiva()) ponerEstadoSync('sin-conexion'); });
    setInterval(() => { if (!document.hidden && syncActiva()) sincronizar(); }, SYNC_INTERVALO);

    actualizarIndicadorSync();
    if (syncActiva()) sincronizar();
    else if (configSync()) ponerEstadoSync('sin-sesion');
}
