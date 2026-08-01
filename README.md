# Recetas A4

Herramienta personal (estática) para armar hojas A4 con fondo decorativo, extraer secciones de un PDF y formatear tipografía. Pensada para publicarse en **GitHub Pages**.

## Persistencia en el repositorio (GitHub Pages)

GitHub Pages es estático: **no puede guardar solo** desde el navegador. Por eso la app te prepara archivos para subirlos al repo.

### Contraseña en el repo
1. Entrá a la app y creá / ingresá tu contraseña.
2. Se descarga `config.js` con tu `accessKey`.
3. Reemplazá `js/config.js` en el proyecto y hacé **push** a GitHub.
4. A partir de ahí la clave vive en el repositorio (cualquier dispositivo con esa web usa la misma).

### Fondos en el repo
1. Importá un JPG (o usá **Exportar fondos para el repo**).
2. Se descargan las imágenes + `manifest.json`.
3. Subilos a la carpeta `backgrounds/` del repo (dejá las imágenes junto a `manifest.json`).
4. Hacé **push**. Al recargar la web, los fondos aparecen marcados como **repo**.

Ejemplo de `backgrounds/manifest.json`:

```json
{
  "backgrounds": [
    { "id": "marmol", "name": "Mármol", "file": "marmol.jpg" }
  ]
}
```

> La contraseña en el frontend es solo una barrera básica: quien vea el código puede intentar obtenerla.
3. Subís un **PDF**; la app lee el texto con PDF.js y lista **páginas completas** y **bloques**.
4. Marcás las secciones y las **pegás** en la hoja editable.
5. Ajustás **fuente, tamaño, interlineado, negrita/cursiva, alineación y color**.
6. **Imprimís / guardás PDF** con el diálogo del navegador (hoja A4 sin márgenes de la app).

## Privacidad (importante)

GitHub Pages desde un repo **público** es accesible por URL. Esta app incluye:

- `robots.txt` + `noindex` (evita indexación, no oculta la URL).
- **Puerta con contraseña** en el navegador (barrera básica; el HTML/JS sigue siendo descargable).

Opciones más serias:

- Repo **privado** + GitHub Pages (requiere plan de pago de GitHub), o
- No publicar y usarla solo en local / con un hosting privado.

La primera vez que abras la página te pedirá **crear una contraseña** (queda en `localStorage` de ese navegador). También podés fijar un hash en `js/config.js` (`passwordHash`).

## Cómo publicarla en GitHub Pages

1. Creá un repo (idealmente con nombre poco obvio si querés discreción).
2. Subí el contenido de esta carpeta a la rama `main`.
3. En el repo: **Settings → Pages → Build and deployment → Deploy from a branch** → `main` / `/ (root)`.
4. Abrí la URL que te da GitHub y creá tu contraseña.

Estructura mínima:

```
/
  index.html
  robots.txt
  css/styles.css
  js/config.js
  js/auth.js
  js/app.js
```

## Uso local

Abrí `index.html` con un servidor estático (los módulos ES + PDF.js no siempre funcionan con `file://`):

```bash
npx --yes serve .
```

Luego visitá la URL que muestre la terminal.

## Notas

- Los PDF escaneados (solo imagen, sin capa de texto) no aportan secciones; necesitás un PDF con texto seleccionable.
- El formato se aplica sobre el área editable de cada hoja; podés agregar más páginas con **+ Página**.
- Para desactivar la contraseña en pruebas: en `js/config.js` poné `requirePassword: false`.
