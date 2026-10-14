// Servidor Supabase simulado en memoria: autenticación con contraseña y la tabla agenda_datos
// con el mismo comportamiento que la real (RLS por usuario, hora del servidor, 409 en duplicados).

function crearSupabaseFalso({ url = 'https://prueba.supabase.co', clave = 'clave-anon-de-prueba-123456', conBorrarCuenta = true } = {}) {
    const usuarios = new Map();   // email -> { id, password }
    const tokens = new Map();     // access_token -> { usuario, caduca }
    const refrescos = new Map();  // refresh_token -> usuario
    const filas = new Map();      // `${usuario}|${clave}` -> { clave, valor, micro }
    let reloj = Date.UTC(2026, 8, 17, 8, 0, 0) * 1000; // microsegundos
    let contador = 0;
    const peticiones = [];

    const marcaTiempo = micro => {
        const ms = Math.floor(micro / 1000);
        const resto = String(micro % 1000000).padStart(6, '0');
        return new Date(ms).toISOString().replace(/\.\d{3}Z$/, `.${resto}+00:00`);
    };
    const leerMarca = texto => {
        const m = String(texto).match(/^(.*)\.(\d{1,6})\+00:00$/);
        if (!m) return NaN;
        return Date.parse(`${m[1]}Z`) * 1000 + Number(m[2].padEnd(6, '0'));
    };

    const respuesta = (status, cuerpo) => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => (cuerpo === undefined ? '' : JSON.stringify(cuerpo))
    });

    const sesionPara = usuario => {
        const access = `acc-${++contador}`;
        const refresh = `ref-${contador}`;
        tokens.set(access, { usuario });
        refrescos.set(refresh, usuario);
        const email = [...usuarios.entries()].find(([, u]) => u.id === usuario)?.[0];
        return { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user: { id: usuario, email } };
    };

    const fila = f => ({ clave: f.clave, valor: f.valor, actualizado: marcaTiempo(f.micro) });

    async function fetch(direccion, { method = 'GET', headers = {}, body } = {}) {
        const u = new URL(direccion);
        peticiones.push({ metodo: method, ruta: u.pathname + u.search });
        if (`${u.protocol}//${u.host}` !== url) return respuesta(404, { message: 'proyecto desconocido' });
        if (headers.apikey !== clave) return respuesta(401, { message: 'Invalid API key' });
        const datos = body ? JSON.parse(body) : {};

        // --- Autenticación ---
        if (u.pathname === '/auth/v1/signup' && method === 'POST') {
            if (usuarios.has(datos.email)) return respuesta(422, { msg: 'User already registered' });
            const id = `usuario-${usuarios.size + 1}`;
            usuarios.set(datos.email, { id, password: datos.password });
            return respuesta(200, sesionPara(id));
        }
        if (u.pathname === '/auth/v1/token' && method === 'POST') {
            const tipo = u.searchParams.get('grant_type');
            if (tipo === 'password') {
                const cuenta = usuarios.get(datos.email);
                if (!cuenta || cuenta.password !== datos.password) return respuesta(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
                return respuesta(200, sesionPara(cuenta.id));
            }
            if (tipo === 'refresh_token') {
                const usuario = refrescos.get(datos.refresh_token);
                if (!usuario) return respuesta(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
                refrescos.delete(datos.refresh_token);
                return respuesta(200, sesionPara(usuario));
            }
        }

        const token = String(headers.Authorization || '').replace('Bearer ', '');
        const sesion = tokens.get(token);
        if (u.pathname === '/auth/v1/logout') {
            tokens.delete(token);
            return respuesta(204);
        }
        const borrarFilas = usuario => [...filas.keys()].filter(k => k.startsWith(`${usuario}|`)).forEach(k => filas.delete(k));
        if (u.pathname === '/rest/v1/rpc/borrar_mi_cuenta' && method === 'POST') {
            if (!conBorrarCuenta) return respuesta(404, { code: 'PGRST202', message: 'Could not find the function public.borrar_mi_cuenta' });
            if (!sesion) return respuesta(401, { message: 'JWT expired' });
            // Igual que la función SQL: borra el usuario y, en cascada, sus filas
            const email = [...usuarios.entries()].find(([, c]) => c.id === sesion.usuario)?.[0];
            usuarios.delete(email);
            borrarFilas(sesion.usuario);
            return respuesta(204);
        }
        if (!u.pathname.startsWith('/rest/v1/agenda_datos')) return respuesta(404, { message: 'no existe' });
        if (!sesion) return respuesta(401, { message: 'JWT expired' });
        const usuario = sesion.usuario;
        if (method === 'DELETE') {
            borrarFilas(usuario);
            return respuesta(204);
        }

        // --- Tabla agenda_datos ---
        const filtro = campo => {
            const v = u.searchParams.get(campo);
            if (!v) return null;
            const [op, ...resto] = v.split('.');
            return { op, valor: resto.join('.') };
        };
        if (method === 'GET') {
            const gt = filtro('actualizado');
            const lista = [...filas.entries()]
                .filter(([k]) => k.startsWith(`${usuario}|`))
                .map(([, f]) => f)
                .filter(f => !gt || (gt.op === 'gt' && f.micro > leerMarca(gt.valor)))
                .sort((a, b) => a.micro - b.micro)
                .map(fila);
            return respuesta(200, lista);
        }
        if (method === 'POST') {
            const k = `${usuario}|${datos.clave}`;
            if (filas.has(k)) return respuesta(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
            reloj += 1000 + (++contador);
            const nueva = { clave: datos.clave, valor: datos.valor, micro: reloj };
            filas.set(k, nueva);
            return respuesta(201, [fila(nueva)]);
        }
        if (method === 'PATCH') {
            const c = filtro('clave');
            const a = filtro('actualizado');
            const k = `${usuario}|${c.valor}`;
            const actual = filas.get(k);
            if (!actual || (a && leerMarca(a.valor) !== actual.micro)) return respuesta(200, []);
            reloj += 1000 + (++contador);
            actual.valor = datos.valor;
            actual.micro = reloj;
            return respuesta(200, [fila(actual)]);
        }
        return respuesta(405, { message: 'método no permitido' });
    }

    return {
        url,
        clave,
        fetch,
        peticiones,
        valor: (email, claveDatos) => {
            const id = usuarios.get(email)?.id;
            const f = filas.get(`${id}|${claveDatos}`);
            return f ? JSON.parse(f.valor) : undefined;
        },
        // Simula que otra app cambia una fila directamente en la nube
        escribirDirecto: (email, claveDatos, valor) => {
            const id = usuarios.get(email)?.id;
            reloj += 1000;
            filas.set(`${id}|${claveDatos}`, { clave: claveDatos, valor: JSON.stringify(valor), micro: reloj });
        },
        existeUsuario: email => usuarios.has(email),
        invalidarRefrescos: () => refrescos.clear(),
        crearUsuario: (email, password) => {
            const id = `usuario-${usuarios.size + 1}`;
            usuarios.set(email, { id, password });
        }
    };
}

module.exports = { crearSupabaseFalso };
