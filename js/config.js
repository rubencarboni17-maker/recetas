/**
 * Configuración del sitio (esto SÍ vive en el repositorio / GitHub Pages).
 *
 * CONTRASEÑA EN EL REPO:
 * 1. Abrí la app, creá tu contraseña (o usá la consola).
 * 2. Se va a descargar un config.js nuevo, o generá la clave así:
 *      En la consola del navegador:  encodeAccessKey("tu-clave")
 * 3. Pegá el resultado en accessKey (abajo), guardá y subí este archivo a GitHub.
 *
 * Nota: cualquiera que vea el código del sitio puede intentar descifrar accessKey.
 * Es una barrera básica, no seguridad bancaria.
 */
window.RECETAS_CONFIG = {
  appName: "Las recetas del Abuelo",
  requirePassword: true,

  /**
   * Clave de acceso guardada en el repo.
   * Formato: "v1:...." (la genera encodeAccessKey("tu-clave")).
   * Si está vacío, la primera visita pide crear una (y te descarga este archivo listo).
   */
  accessKey: "Mabila2806",

  /** @deprecated Usá accessKey. Se mantiene por compatibilidad. */
  passwordHash: "",
};
