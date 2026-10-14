// Markdown de las notas: formato y seguridad frente a HTML inyectado
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarApp } = require('./entorno');

const a = cargarApp({ scripts: ['js/nucleo.js'] });
const md = texto => {
    a.contexto.__md = texto;
    return a.ev('renderizarMarkdown(__md)');
};

test('escapa el HTML escrito por el usuario', () => {
    assert.equal(md('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    assert.ok(!md('**<script>**').includes('<script>'));
    assert.ok(!md('[clic](javascript:alert(1))').includes('href'));
    assert.ok(md('[web](https://example.com)').includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">web</a>'));
    // Las comillas no pueden romper el atributo href
    assert.ok(!md('https://example.com/"onmouseover="x').includes('"onmouseover'));
});

test('formato básico', () => {
    assert.equal(md('**negrita** y *cursiva*'), '<p><strong>negrita</strong> y <em>cursiva</em></p>');
    assert.equal(md('# Título'), '<h2>Título</h2>');
    assert.equal(md('- uno\n- dos'), '<ul><li>uno</li><li>dos</li></ul>');
    assert.equal(md('1. uno\n2. dos'), '<ol><li>uno</li><li>dos</li></ol>');
    assert.equal(md('```\n<b>código</b>\n```'), '<pre><code>&lt;b&gt;código&lt;/b&gt;</code></pre>');
    assert.equal(md('==resaltado== ~~tachado~~'), '<p><mark>resaltado</mark> <del>tachado</del></p>');
});

test('casillas de verificación con su número de línea', () => {
    const html = md('Lista\n\n- [x] hecho\n- [ ] pendiente');
    assert.ok(html.includes('<li class="md-check hecho"><input type="checkbox" data-linea="2" checked'));
    assert.ok(html.includes('<input type="checkbox" data-linea="3" '));
});

test('texto plano para los fragmentos de la lista', () => {
    a.contexto.__md = '# Hola\n- [ ] **tarea** con [enlace](https://x.com)\n```\ncódigo\n```';
    assert.equal(a.ev('textoPlanoMarkdown(__md)'), 'Hola ☐ tarea con enlace');
});

test('búsqueda sin tildes ni mayúsculas', () => {
    assert.equal(a.ev("coincideBusqueda('Examen de Matemáticas', 'matematicas examen')"), true);
    assert.equal(a.ev("coincideBusqueda('Examen de Matemáticas', 'física')"), false);
    assert.equal(a.ev("resaltar('Matemáticas', 'mate')"), '<mark>Mate</mark>máticas');
    assert.equal(a.ev("escaparHTML('<a href=\"x\">\\'</a>')"), '&lt;a href=&quot;x&quot;&gt;&#39;&lt;/a&gt;');
});
