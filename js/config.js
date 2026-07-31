/**
 * Configuración personal.
 * La contraseña se define la primera vez que abrís la app (se guarda solo en tu navegador).
 * GitHub Pages es público por URL: el acceso con contraseña es una barrera básica, no seguridad real.
 */
window.RECETAS_CONFIG = {
  appName: "Recetas A4",
  /** Si true, pide contraseña al entrar. */
  requirePassword: true,
  /**
   * Opcional: hash SHA-256 de tu contraseña (hex).
   * Si lo dejás vacío, la app te pedirá crear una la primera vez (localStorage).
   * Generá uno en la consola: await window.hashPassword("tu-clave")
   */
  passwordHash: "",
};
