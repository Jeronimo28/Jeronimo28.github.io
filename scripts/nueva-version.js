// Sube el número de versión para que los usuarios reciban los cambios:
// cambia VERSION en sw.js y todos los «?v=N» de index.html.
// Uso: npm run nueva-version
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const rutaSw = path.join(raiz, 'sw.js');
const rutaIndex = path.join(raiz, 'index.html');

const sw = fs.readFileSync(rutaSw, 'utf8');
const actual = Number(sw.match(/const VERSION = (\d+);/)?.[1]);
if (!actual) throw new Error('No se encontró «const VERSION = N;» en sw.js');
const nueva = actual + 1;

fs.writeFileSync(rutaSw, sw.replace(/const VERSION = \d+;/, `const VERSION = ${nueva};`));
const index = fs.readFileSync(rutaIndex, 'utf8');
fs.writeFileSync(rutaIndex, index.replace(/\?v=\d+/g, `?v=${nueva}`));

console.log(`Versión ${actual} → ${nueva}. Sube los archivos a tu hosting y los usuarios la recibirán al abrir la app.`);
