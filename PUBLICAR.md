# Publicar Mi Agenda en Google Play

La app de Google Play será una «Trusted Web Activity» (TWA): un envoltorio Android que abre
tu web a pantalla completa, sin barra del navegador. La web vive en un hosting gratuito y el
envoltorio se sube a Google Play **una sola vez**.

**Ventaja:** para actualizar la app solo hay que subir los archivos al hosting. No hace falta
publicar una versión nueva en Google Play, no hay revisión y los usuarios no notan ningún corte.

---

## 1. Subir la web a un hosting gratuito (GitHub Pages)

1. Crea una cuenta en <https://github.com> (gratis).
2. Crea un repositorio público llamado **exactamente** `TU_USUARIO.github.io`
   (tiene que ser este nombre para que funcione `/.well-known/assetlinks.json`).
3. Sube todos los archivos de esta carpeta (incluidos `.nojekyll` y la carpeta `.well-known`).
   Lo más fácil: instala GitHub Desktop, clona el repositorio, copia los archivos dentro y pulsa
   *Commit* y *Push*.
4. En el repositorio: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
5. En 1-2 minutos la app estará en `https://TU_USUARIO.github.io`.

> Alternativa también gratuita: Cloudflare Pages (`tu-proyecto.pages.dev`).
>
> ⚠️ Elige la dirección **una vez**: la app de Google Play queda atada a ella.

## 2. Completar la política de privacidad

En `privacidad.html` cambia `TU_CORREO_DE_CONTACTO` (aparece 2 veces) por tu correo de contacto
y súbelo. Su dirección (`https://TU_USUARIO.github.io/privacidad.html`) se pide en Google Play.

## 3. Actualizar Supabase (solo si mantienes la sincronización)

En Supabase → **SQL Editor**, ejecuta de nuevo el SQL (Ajustes → Sincronizar → «Copiar el código
SQL», o la constante `SQL_SUPABASE` de `js/sync.js`). Añade la función `borrar_mi_cuenta`, que
permite borrar la cuenta desde la app: **Google Play lo exige** a cualquier app donde se pueda
crear una cuenta.

## 4. Generar el paquete Android con PWABuilder (gratis)

1. Entra en <https://www.pwabuilder.com>, pega `https://TU_USUARIO.github.io` y pulsa *Start*.
2. *Package for stores → Android → Generate Package*.
   - **Package ID**: por ejemplo `io.github.tuusuario.miagenda` (no se puede cambiar después).
   - **App name**: Mi Agenda · **Version**: 1.0.0 (code 1).
   - **Signing key**: «Create new». Guarda el zip con la clave (`signing.keystore` y las
     contraseñas) en un lugar seguro.
3. Descargarás un zip con `app-release-bundle.aab` (para Google Play) y `assetlinks.json`.

## 5. Publicar en Google Play Console

1. Crea la cuenta de desarrollador en <https://play.google.com/console>
   (pago único de 25 US$, lo único que no es gratis de todo el proceso).
2. *Crear aplicación* → sube el `.aab`.
3. Ficha de la tienda: icono 512×512 (`icon-512.png`), gráfico de funciones 1024×500 y al menos
   2 capturas del móvil.
4. Contenido de la app:
   - **Política de privacidad**: la URL del paso 2.
   - **Seguridad de los datos**: sin sincronización → «No se recogen datos». Con sincronización →
     «Correo electrónico» y «Otro contenido generado por el usuario», cifrados en tránsito, el
     usuario puede pedir que se borren, sin compartir con terceros.
   - **Eliminación de la cuenta**: `https://TU_USUARIO.github.io/privacidad.html#borrar-cuenta`.
   - Anuncios: No. Clasificación de contenido: rellena el cuestionario (Productividad).
5. Las cuentas personales nuevas deben hacer primero una **prueba cerrada con 12 personas
   durante 14 días** antes de poder publicar en producción.

## 6. Verificar el dominio (para que no salga la barra del navegador)

1. En Play Console: **Configuración → Integridad de la app → Firma de apps** copia la
   **huella SHA-256 del certificado de firma de apps**.
2. Edita `.well-known/assetlinks.json`: pon tu Package ID y esa huella (si PWABuilder te dio un
   `assetlinks.json`, añade también la huella que trae).
3. Sube el archivo y comprueba que abre en
   `https://TU_USUARIO.github.io/.well-known/assetlinks.json`.

---

## Cómo actualizar la app sin cortes

1. Cambia lo que quieras y prueba en local.
2. Ejecuta:
   ```bash
   npm test
   ```
   ```bash
   npm run nueva-version
   ```
   (sube el número de versión para que los móviles descarguen los archivos nuevos).
3. Sube los cambios a GitHub (*Commit* + *Push*).

Los usuarios reciben la versión nueva la próxima vez que abran la app con internet. Sin
internet siguen usando la anterior, que está guardada en el móvil. Sus datos no se tocan: están
en el móvil, no en los archivos de la web.

Solo hace falta subir un `.aab` nuevo a Google Play (con un *version code* mayor y **la misma
clave de firma**) si cambias el nombre, el icono del lanzador, el color de la barra o la
dirección web. Mientras Google lo revisa, la versión publicada sigue funcionando.

**Precauciones al cambiar el código:**
- No cambies los nombres de las claves de `localStorage` (`tareasApp`, `notasApp`…) ni el formato
  de los datos sin convertir los antiguos: ahí están los datos de los usuarios.
- No cambies la dirección del hosting ni borres el repositorio.
