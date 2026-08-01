/**
 * Configuración del sitio (esto SÍ vive en el repositorio / GitHub Pages).
 *
 * CONTRASEÑA EN EL REPO:
 * 1. En la consola del navegador (con la app abierta): encodeAccessKey("tu-clave")
 * 2. Pegá el resultado en accessKey (formato "v1:....").
 * 3. Guardá y subí este archivo a GitHub Pages.
 *
 * Nota: cualquiera que vea el código del sitio puede intentar descifrar accessKey.
 * Es una barrera básica, no seguridad bancaria. Preferí un repo privado si podés.
 */
window.RECETAS_CONFIG = {
  appName: "Las recetas del Abuelo",
  requirePassword: true,

  /**
   * Clave de acceso (formato "v1:..." generado con encodeAccessKey).
   * No guardes la contraseña en texto plano.
   */
  accessKey: "v1:TWFiaWxhMjgwNg==",

  /** @deprecated Usá accessKey. Se mantiene por compatibilidad. */
  passwordHash: "",
};
