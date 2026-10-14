// Sincronización con Supabase: combinación de versiones y dos dispositivos contra un servidor simulado
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp } = require('./entorno');
const { crearSupabaseFalso } = require('./supabase-falso');

const plano = v => JSON.parse(JSON.stringify(v));

function dispositivo(servidor, localStorage = {}, ahora = '2026-09-17T10:00:00') {
    const refrescos = [];
    const a = cargarApp({
        scripts: ['js/nucleo.js', 'js/sync.js'],
        ahora,
        fetch: servidor?.fetch,
        localStorage: servidor ? { syncConfig: JSON.stringify({ url: servidor.url, clave: servidor.clave }), ...localStorage } : localStorage,
        globales: {
            sincronizarDesdeOtraVentana: e => refrescos.push(e.key),
            actualizarDashboard: () => {}
        }
    });
    const leer = clave => JSON.parse(a.localStorage.getItem(clave));
    // Guardar como lo hace la app (marca el cambio para subirlo)
    const guardar = (clave, valor) => {
        a.contexto.__v = valor;
        a.ev(`almacen.escribir('${clave}', __v)`);
    };
    return { ...a, leer, guardar, refrescos, sincronizar: () => a.ev('sincronizar()'), fase: () => a.ev('estadoSync.fase') };
}

const tarea = (id, texto, extra = {}) => ({ id, texto, completada: false, fecha: '2026-09-01T10:00:00.000Z', fechaTarea: null, prioridad: 'ninguna', categoria: 'personal', ...extra });

/* ---------- Combinar versiones ---------- */

test('fusionarListasPorId une por id y elige la versión más reciente', () => {
    const a = dispositivo(null);
    a.contexto.__l = [{ id: 1, t: 'local', f: '2026-09-17T10:00:00Z' }, { id: 2, t: 'solo local' }];
    a.contexto.__r = [{ id: 1, t: 'remota', f: '2026-09-17T11:00:00Z' }, { id: 3, t: 'solo remota' }];
    assert.deepEqual(plano(a.ev('fusionarListasPorId(__l, __r, x => x.f)')).map(x => x.t), ['remota', 'solo local', 'solo remota']);
    // Sin fecha, gana la local
    assert.deepEqual(plano(a.ev('fusionarListasPorId(__l, __r)')).map(x => x.t), ['local', 'solo local', 'solo remota']);
});

test('fusionarValores según el tipo de dato', () => {
    const a = dispositivo(null);
    const fusionar = (clave, local, remota) => {
        a.contexto.__l = local;
        a.contexto.__r = remota;
        return plano(a.ev(`fusionarValores('${clave}', __l, __r)`));
    };
    assert.deepEqual(fusionar('estadisticasApp', { '2026-09-16': 2, '2026-09-17': 1 }, { '2026-09-17': 3, '2026-09-15': 1 }),
        { '2026-09-15': 1, '2026-09-16': 2, '2026-09-17': 3 });

    const notas = fusionar('notasApp',
        [{ id: 'n1', titulo: 'vieja', fechaModificacion: '2026-09-17T08:00:00Z' }],
        [{ id: 'n1', titulo: 'nueva', fechaModificacion: '2026-09-17T09:00:00Z' }, { id: 'n2', titulo: 'otra' }]);
    assert.deepEqual(notas.map(n => n.titulo), ['nueva', 'otra']);

    const tareas = fusionar('tareasApp', [tarea('t1', 'pendiente aquí')], [tarea('t1', 'hecha allí', { completada: true, completadaEn: '2026-09-17T09:00:00Z' })]);
    assert.equal(tareas[0].completada, true);

    const festivos = fusionar('festivosApp',
        { comunidad: 'MD', desactivados: ['2026-05-02'], propios: [{ id: 'a' }] },
        { comunidad: 'CT', desactivados: ['2026-12-26'], propios: [{ id: 'b' }] });
    assert.equal(festivos.comunidad, 'MD');
    assert.deepEqual(festivos.desactivados.sort(), ['2026-05-02', '2026-12-26']);
    assert.deepEqual(festivos.propios.map(p => p.id), ['a', 'b']);
});

test('normaliza y valida la dirección del proyecto', () => {
    const a = dispositivo(null);
    assert.equal(a.ev("normalizarUrlSupabase(' https://AbC123.supabase.co/rest/v1/ ')"), 'https://abc123.supabase.co');
    assert.equal(a.ev("normalizarUrlSupabase('http://abc.supabase.co')"), null);
    assert.equal(a.ev("normalizarUrlSupabase('https://evil.com/abc.supabase.co')"), null);
});

test('traduce los errores de Supabase', () => {
    const a = dispositivo(null);
    assert.match(a.ev("traducirErrorSupabase({ datos: { error_description: 'Invalid login credentials' } })"), /incorrectos/);
    assert.match(a.ev("traducirErrorSupabase(Object.assign(new TypeError('Failed to fetch')))"), /No se puede conectar/);
    assert.match(a.ev("traducirErrorSupabase({ datos: { message: 'relation \"public.agenda_datos\" does not exist' } })"), /Falta crear la tabla/);
});

/* ---------- Dos dispositivos ---------- */

test('el segundo dispositivo recibe los datos y se combinan los cambios de ambos', async () => {
    const servidor = crearSupabaseFalso();
    const movil = dispositivo(servidor, { tareasApp: JSON.stringify([tarea('t1', 'Del móvil')]), estadisticasApp: JSON.stringify({ '2026-09-16': 2 }) });
    const pc = dispositivo(servidor, { tareasApp: JSON.stringify([tarea('t2', 'Del ordenador')]) });

    const r = plano(await movil.ev("entrarSync('yo@correo.es', 'secreto1', true)"));
    assert.deepEqual(r, { ok: true });
    assert.equal(movil.fase(), 'listo');
    assert.deepEqual(servidor.valor('yo@correo.es', 'tareasApp').map(t => t.id), ['t1']);

    // Al entrar en el ordenador, lo que ya tenía se combina con la nube
    await pc.ev("entrarSync('yo@correo.es', 'secreto1')");
    assert.deepEqual(pc.leer('tareasApp').map(t => t.id), ['t2', 't1']);
    assert.deepEqual(pc.leer('estadisticasApp'), { '2026-09-16': 2 });
    assert.ok(pc.refrescos.includes('tareasApp'));
    assert.deepEqual(servidor.valor('yo@correo.es', 'tareasApp').map(t => t.id), ['t2', 't1']);

    await movil.sincronizar();
    assert.deepEqual(movil.leer('tareasApp').map(t => t.id), ['t2', 't1']);

    // Cambios a la vez en los dos dispositivos
    movil.guardar('tareasApp', [...movil.leer('tareasApp'), tarea('t3', 'Otra del móvil')]);
    pc.guardar('tareasApp', [...pc.leer('tareasApp'), tarea('t4', 'Otra del ordenador')]);
    await movil.sincronizar();
    await pc.sincronizar();
    await movil.sincronizar();
    const ids = lista => lista.map(t => t.id).sort();
    assert.deepEqual(ids(servidor.valor('yo@correo.es', 'tareasApp')), ['t1', 't2', 't3', 't4']);
    assert.deepEqual(ids(movil.leer('tareasApp')), ['t1', 't2', 't3', 't4']);
    assert.deepEqual(ids(pc.leer('tareasApp')), ['t1', 't2', 't3', 't4']);
    assert.equal(movil.fase(), 'listo');
    assert.equal(pc.fase(), 'listo');
});

test('si otro dispositivo sube antes, no se pisa: se vuelve a leer y se combina', async () => {
    const servidor = crearSupabaseFalso();
    const a = dispositivo(servidor, { notasApp: JSON.stringify([{ id: 'n1', titulo: 'Base', contenido: '', fechaModificacion: '2026-09-17T07:00:00Z' }]) });
    const b = dispositivo(servidor);
    await a.ev("entrarSync('yo@correo.es', 'secreto1', true)");
    await b.ev("entrarSync('yo@correo.es', 'secreto1')");

    b.guardar('notasApp', [...b.leer('notasApp'), { id: 'nb', titulo: 'De B', contenido: '', fechaModificacion: '2026-09-17T09:00:00Z' }]);
    await b.sincronizar();

    // A sube sin haber leído antes: la versión que tiene está desfasada
    a.guardar('notasApp', [...a.leer('notasApp'), { id: 'na', titulo: 'De A', contenido: '', fechaModificacion: '2026-09-17T09:30:00Z' }]);
    await a.ev('subirCambiosSync()');

    const titulos = servidor.valor('yo@correo.es', 'notasApp').map(n => n.titulo).sort();
    assert.deepEqual(titulos, ['Base', 'De A', 'De B']);
    const patchFallidos = servidor.peticiones.filter(p => p.metodo === 'PATCH').length;
    assert.ok(patchFallidos >= 2, 'debe haber reintentado la subida');
});

test('restaurar una copia sustituye lo de la nube en lugar de combinarlo', async () => {
    const servidor = crearSupabaseFalso();
    const a = dispositivo(servidor, { tareasApp: JSON.stringify([tarea('t1', 'Antigua'), tarea('t2', 'Antigua 2')]) });
    const b = dispositivo(servidor);
    await a.ev("entrarSync('yo@correo.es', 'secreto1', true)");
    await b.ev("entrarSync('yo@correo.es', 'secreto1')");

    // Otro dispositivo cambia la nube mientras tanto
    b.guardar('tareasApp', [...b.leer('tareasApp'), tarea('t9', 'De B')]);
    await b.sincronizar();

    a.localStorage.setItem('tareasApp', JSON.stringify([tarea('tc', 'De la copia')]));
    a.ev('marcarRestauracionSync()');
    await a.sincronizar();
    assert.deepEqual(servidor.valor('yo@correo.es', 'tareasApp').map(t => t.id), ['tc']);
    assert.deepEqual(a.leer('tareasApp').map(t => t.id), ['tc']);

    await b.sincronizar();
    assert.deepEqual(b.leer('tareasApp').map(t => t.id), ['tc']);
});

test('los cambios hechos en la nube por otra vía se reciben', async () => {
    const servidor = crearSupabaseFalso();
    const a = dispositivo(servidor, { horarioApp: '[]' });
    await a.ev("entrarSync('yo@correo.es', 'secreto1', true)");
    servidor.escribirDirecto('yo@correo.es', 'horarioApp', [{ id: 'c1', asignatura: 'Mates', dia: 0, inicio: '09:00', fin: '10:00' }]);
    await a.sincronizar();
    assert.equal(a.leer('horarioApp')[0].asignatura, 'Mates');
    // A partir de ahí solo pide lo nuevo desde la última lectura
    await a.sincronizar();
    const ultimaLectura = servidor.peticiones.filter(p => p.metodo === 'GET').pop();
    assert.match(ultimaLectura.ruta, /actualizado=gt\./);
});

test('renueva el token caducado y cierra la sesión si ya no es válido', async () => {
    const servidor = crearSupabaseFalso();
    const a = dispositivo(servidor, { tareasApp: '[]' });
    await a.ev("entrarSync('yo@correo.es', 'secreto1', true)");
    const tokenInicial = JSON.parse(a.localStorage.getItem('syncSesion')).access_token;

    // Token caducado: se renueva solo
    const sesion = JSON.parse(a.localStorage.getItem('syncSesion'));
    a.localStorage.setItem('syncSesion', JSON.stringify({ ...sesion, expira: 1 }));
    await a.sincronizar();
    assert.equal(a.fase(), 'listo');
    assert.notEqual(JSON.parse(a.localStorage.getItem('syncSesion')).access_token, tokenInicial);

    // Renovación rechazada: hay que volver a entrar
    const actual = JSON.parse(a.localStorage.getItem('syncSesion'));
    a.localStorage.setItem('syncSesion', JSON.stringify({ ...actual, expira: 1 }));
    servidor.invalidarRefrescos();
    await a.sincronizar();
    assert.equal(a.localStorage.getItem('syncSesion'), null);
    assert.equal(a.fase(), 'sin-sesion');
    assert.match(a.ev('estadoSync.mensaje'), /vuelve a entrar/);
});

test('credenciales incorrectas y modo sin conexión', async () => {
    const servidor = crearSupabaseFalso();
    servidor.crearUsuario('yo@correo.es', 'buena123');
    const a = dispositivo(servidor);
    await assert.rejects(a.ev("entrarSync('yo@correo.es', 'mala123')"), e => /incorrectos/.test(a.ev(`traducirErrorSupabase(${JSON.stringify({ datos: e.datos })})`)));
    assert.equal(a.localStorage.getItem('syncSesion'), null);

    await a.ev("entrarSync('yo@correo.es', 'buena123')");
    a.contexto.navigator.onLine = false;
    const antes = servidor.peticiones.length;
    a.guardar('tareasApp', [tarea('t1', 'Sin red')]);
    await a.sincronizar();
    assert.equal(a.fase(), 'sin-conexion');
    assert.equal(servidor.peticiones.length, antes);

    a.contexto.navigator.onLine = true;
    await a.sincronizar();
    assert.equal(servidor.valor('yo@correo.es', 'tareasApp')[0].texto, 'Sin red');
});

test('sin sesión no se marca nada ni se hacen peticiones', async () => {
    const servidor = crearSupabaseFalso();
    const a = dispositivo(servidor);
    a.guardar('tareasApp', [tarea('t1', 'Local')]);
    assert.equal(a.localStorage.getItem('syncMeta'), null);
    await a.sincronizar();
    assert.equal(servidor.peticiones.length, 0);
});

test('eliminar la cuenta borra la cuenta y la nube, pero no los datos del dispositivo', async () => {
    const servidor = crearSupabaseFalso();
    const a = dispositivo(servidor, { tareasApp: JSON.stringify([tarea('t1', 'Mía')]) });
    await a.ev("entrarSync('yo@correo.es', 'secreto1', true)");
    assert.equal(servidor.valor('yo@correo.es', 'tareasApp')[0].texto, 'Mía');

    assert.deepEqual(plano(await a.ev('borrarCuentaSync()')), { ok: true });
    assert.equal(servidor.existeUsuario('yo@correo.es'), false);
    assert.equal(a.localStorage.getItem('syncSesion'), null);
    assert.equal(a.fase(), 'apagado');
    assert.equal(a.leer('tareasApp')[0].texto, 'Mía');
});

test('si el proyecto no tiene la función de borrar cuenta, al menos se borran los datos de la nube', async () => {
    const servidor = crearSupabaseFalso({ conBorrarCuenta: false });
    const a = dispositivo(servidor, { tareasApp: JSON.stringify([tarea('t1', 'Mía')]) });
    await a.ev("entrarSync('yo@correo.es', 'secreto1', true)");

    assert.deepEqual(plano(await a.ev('borrarCuentaSync()')), { soloDatos: true });
    assert.equal(servidor.existeUsuario('yo@correo.es'), true);
    assert.equal(servidor.valor('yo@correo.es', 'tareasApp'), undefined);
    assert.equal(a.localStorage.getItem('syncSesion'), null);
});
