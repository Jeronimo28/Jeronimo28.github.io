// Para publicar una versión nueva ejecuta «npm run nueva-version»: cambia este número y los ?v= de index.html
const VERSION = 17;
const CACHE_NAME = `mi-agenda-v${VERSION}`;
const urlsToCache = [
  './',
  './index.html',
  './privacidad.html',
  `./css/base.css?v=${VERSION}`,
  `./css/tareas.css?v=${VERSION}`,
  `./css/notas.css?v=${VERSION}`,
  `./css/horario.css?v=${VERSION}`,
  `./css/calendario.css?v=${VERSION}`,
  `./css/ventanas.css?v=${VERSION}`,
  `./js/nucleo.js?v=${VERSION}`,
  `./js/tareas/datos.js?v=${VERSION}`,
  `./js/tareas/entrada.js?v=${VERSION}`,
  `./js/tareas/lista.js?v=${VERSION}`,
  `./js/tareas/lateral.js?v=${VERSION}`,
  `./js/tareas/acciones.js?v=${VERSION}`,
  `./js/tareas/panel.js?v=${VERSION}`,
  `./js/tareas/categorias.js?v=${VERSION}`,
  `./js/tareas/eventos.js?v=${VERSION}`,
  `./js/notas.js?v=${VERSION}`,
  `./js/festivos.js?v=${VERSION}`,
  `./js/horario.js?v=${VERSION}`,
  `./js/horario-festivos.js?v=${VERSION}`,
  `./js/calendario.js?v=${VERSION}`,
  `./js/ajustes.js?v=${VERSION}`,
  `./js/paleta.js?v=${VERSION}`,
  `./js/sync.js?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Si la red tarda más que esto al abrir la app, se usa la copia guardada
const ESPERA_RED_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(error => console.log('⚠️ Error cacheando:', error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(nombres.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function guardarEnCache(peticion, respuesta) {
  if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
    const copia = respuesta.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(peticion, copia));
  }
  return respuesta;
}

// Lo guardado para esta petición; si no está, la misma ruta sin «?…»; y para abrir la app, index.html
async function desdeCache(peticion) {
  return (await caches.match(peticion))
    || (await caches.match(peticion, { ignoreSearch: true }))
    || (peticion.mode === 'navigate' ? caches.match('./index.html') : undefined);
}

const ORIGENES_FUENTES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('fetch', event => {
  const peticion = event.request;
  if (peticion.method !== 'GET') return;
  const origen = new URL(peticion.url).origin;

  // Fuentes: primero lo guardado (no cambian) y, si no está, de la red y se guardan
  if (ORIGENES_FUENTES.includes(origen)) {
    event.respondWith(caches.match(peticion).then(guardada => guardada || fetch(peticion).then(respuesta => {
      if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(peticion, copia));
      }
      return respuesta;
    })));
    return;
  }
  // La sincronización (Supabase) y lo de otros sitios va directo a la red
  if (origen !== self.location.origin) return;

  // Primero la red (así siempre llega la última versión) y, sin conexión, lo guardado.
  // «no-cache» pregunta al servidor si el archivo cambió en vez de fiarse de la caché del navegador.
  const red = fetch(peticion, { cache: 'no-cache' }).then(respuesta => guardarEnCache(peticion, respuesta));
  if (peticion.mode !== 'navigate') {
    event.respondWith(red.catch(() => desdeCache(peticion)));
    return;
  }
  event.respondWith(new Promise(resolver => {
    let resuelto = false;
    const usarCache = async () => {
      const guardada = await desdeCache(peticion);
      if (guardada && !resuelto) { resuelto = true; resolver(guardada); }
      return !!guardada;
    };
    const temporizador = setTimeout(usarCache, ESPERA_RED_MS);
    red.then(respuesta => {
      clearTimeout(temporizador);
      if (!resuelto) { resuelto = true; resolver(respuesta); }
    }).catch(async () => {
      clearTimeout(temporizador);
      if (!(await usarCache()) && !resuelto) { resuelto = true; resolver(Response.error()); }
    });
  }));
});

// Al tocar un recordatorio: volver a la app (o abrirla)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
      const abierta = ventanas.find(v => 'focus' in v);
      return abierta ? abierta.focus() : self.clients.openWindow('./index.html?app=1');
    })
  );
});
