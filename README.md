# Las recetas del Abuelo

Herramienta personal (estática) para armar hojas A4 con fondo decorativo, extraer texto de un PDF, formatear tipografía y exportar a **PDF A4** + **imagen Instagram (1080×1440)**. Pensada para **GitHub Pages**.

## Checklist de producción

Antes de publicar, verificá:

1. `js/config.js` tiene `accessKey` en formato `v1:...` (no texto plano).
2. `backgrounds/manifest.json` lista todos los fondos y los archivos existen en `backgrounds/`.
3. Los assets en `index.html` usan la misma versión de caché (`?v=N`) en CSS y JS.
4. Existe `.nojekyll` en la raíz (GitHub Pages no debe procesar Jekyll).
5. `robots.txt` con `Disallow: /` y meta `noindex` en el HTML.
6. Probá en local: login → fondo → PDF → formato → Imprimir → **A4 + IG**.

## Cómo publicar en GitHub Pages

1. Creá un repo (idealmente poco obvio o **privado** si tu plan lo permite).
2. Subí **todo** el contenido de esta carpeta a la rama `main` (incluye `backgrounds/` con las imágenes).
3. En el repo: **Settings → Pages → Build and deployment → Deploy from a branch** → `main` / `/ (root)`.
4. Abrí la URL de Pages y entrà con tu contraseña.
5. Si no ves cambios: Ctrl+F5 (caché del navegador).

Estructura:

```
/
  index.html
  robots.txt
  .nojekyll
  css/styles.css
  js/config.js
  js/auth.js
  js/app.js
  backgrounds/
    manifest.json
    fondo_1.jpeg … fondo_15.png
```

## Contraseña

1. En la consola: `encodeAccessKey("tu-clave")`.
2. Pegá el resultado en `js/config.js` → `accessKey`.
3. Subí el archivo al repo.

> Barrera básica: el JS es público. No uses una clave importante en otro lado.

Para pruebas locales sin login: `requirePassword: false` en `config.js` (no dejes eso en producción).

## Fondos en el repo

Los fondos del menú vienen de `backgrounds/manifest.json`. También podés importar imágenes en el navegador (IndexedDB, solo en ese equipo) y usar **Exportar fondos para el repo** para generar archivos a subir.

## Uso local

```bash
npx --yes serve .
```

Abrí la URL que muestre la terminal (los módulos ES + PDF.js no siempre funcionan con `file://`).

## Funciones principales

- **Fondos**: galería del repo + import local, ajuste de encaje y veladura.
- **PDF**: lectura con PDF.js → páginas/bloques → pegar en la hoja.
- **Formato**: fuente, tamaño, interlineado, B/I/U, color, viñetas, sangría, alineación.
- **Recuadro**: fondo semitransparente con opacidad y redimensionado.
- **Exportar**: Imprimir (A4 del navegador) y **A4 + IG** (PDF + PNG 1080×1440 cover).
- **Móvil**: navegación Materiales / Hoja A4.

## Privacidad

- `robots.txt` + `noindex` (no ocultan la URL).
- Contraseña en el cliente (barrera básica).
- Mejor opción: repo privado + Pages, o uso solo local.

## Notas

- PDF escaneados (solo imagen) no aportan texto seleccionable.
- Los PNG grandes en `backgrounds/` pesan varios MB; la primera carga en Pages puede tardar.
- Export **A4 + IG** descarga librerías desde jsDelivr la primera vez (hace falta red).
- CDN usados: PDF.js, html2canvas, jsPDF (jsDelivr).
