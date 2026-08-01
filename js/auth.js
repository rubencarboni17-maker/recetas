(function () {
  const STORAGE_KEY = "recetas_access_key";
  const STORAGE_SESSION = "recetas_auth_ok";
  const LEGACY_HASH = "recetas_pw_hash";

  function encodeKey(password) {
    try {
      return "v1:" + btoa(unescape(encodeURIComponent(password)));
    } catch {
      return "v1:" + btoa(password);
    }
  }

  window.encodeAccessKey = encodeKey;

  function getRepoKey() {
    const cfg = window.RECETAS_CONFIG || {};
    return (cfg.accessKey || cfg.passwordHash || "").trim();
  }

  function getLocalKey() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function getStoredKey() {
    return getRepoKey() || getLocalKey();
  }

  function saveLocalKey(password) {
    localStorage.setItem(STORAGE_KEY, encodeKey(password));
    try {
      localStorage.removeItem(LEGACY_HASH);
    } catch {
      /* ignore */
    }
  }

  function rememberSession() {
    try {
      localStorage.setItem(STORAGE_SESSION, "1");
    } catch {
      /* ignore */
    }
  }

  function hasRememberedSession() {
    try {
      return localStorage.getItem(STORAGE_SESSION) === "1";
    } catch {
      return false;
    }
  }

  function buildConfigFile(accessKey) {
    return `/**
 * Configuración del sitio (vive en el repositorio).
 * Subí este archivo a: js/config.js
 */
window.RECETAS_CONFIG = {
  appName: "Recetas A4",
  requirePassword: true,
  accessKey: ${JSON.stringify(accessKey)},
  passwordHash: "",
};
`;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function offerRepoPasswordSave(accessKey) {
    downloadText("config.js", buildConfigFile(accessKey));
    showError(
      "Contraseña lista. Se descargó config.js: reemplazá js/config.js en tu proyecto y subilo a GitHub Pages."
    );
    const error = document.getElementById("gateError");
    if (error) {
      error.style.color = "";
      error.classList.add("gate-ok");
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_SESSION);
      sessionStorage.removeItem(STORAGE_SESSION);
    } catch {
      /* ignore */
    }
  }

  function logout() {
    clearSession();
    document.body.classList.remove("app-open");
    window.__RECETAS_READY = false;
    window.location.reload();
  }

  window.recetasLogout = logout;

  function unlockApp() {
    rememberSession();
    const gate = document.getElementById("gate");
    const app = document.getElementById("app");
    if (gate) {
      gate.hidden = true;
      gate.style.display = "none";
    }
    if (app) {
      app.hidden = false;
      app.style.display = "";
    }
    document.body.classList.add("app-open");
    window.__RECETAS_READY = true;
    document.dispatchEvent(new CustomEvent("recetas:ready"));
  }

  function showError(message) {
    const error = document.getElementById("gateError");
    if (!error) {
      alert(message);
      return;
    }
    error.textContent = message;
    error.hidden = false;
    error.style.display = "block";
    error.classList.remove("gate-ok");
  }

  function hideError() {
    const error = document.getElementById("gateError");
    if (!error) return;
    error.hidden = true;
    error.style.display = "none";
    error.classList.remove("gate-ok");
  }

  function tryLogin(password) {
    hideError();

    if (!password || password.length < 4) {
      showError("Usá al menos 4 caracteres.");
      return false;
    }

    const repoKey = getRepoKey();
    const localKey = getLocalKey();
    const encoded = encodeKey(password);

    if (!repoKey && !localKey) {
      try {
        saveLocalKey(password);
      } catch (err) {
        console.error(err);
        showError("No se pudo guardar la contraseña en este navegador.");
        return false;
      }
      offerRepoPasswordSave(encoded);
      setTimeout(unlockApp, 900);
      return true;
    }

    const expected = repoKey || localKey;
    if (encoded === expected || password === expected) {
      if (!repoKey) {
        offerRepoPasswordSave(encoded);
        setTimeout(unlockApp, 900);
        return true;
      }
      unlockApp();
      return true;
    }

    showError("Contraseña incorrecta.");
    return false;
  }

  function initAuth() {
    const cfg = window.RECETAS_CONFIG || {};
    const brand = cfg.appName || "Recetas A4";
    const gateBrand = document.getElementById("gateBrand");
    const appTitle = document.getElementById("appTitle");
    if (gateBrand) gateBrand.textContent = brand;
    if (appTitle) appTitle.textContent = brand;
    document.title = brand;

    const logoutBtn = document.getElementById("btnLogout");
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = "1";
      logoutBtn.addEventListener("click", logout);
    }

    if (!cfg.requirePassword) {
      unlockApp();
      return;
    }

    try {
      localStorage.removeItem(LEGACY_HASH);
    } catch {
      /* ignore */
    }

    const stored = getStoredKey();
    if (stored && hasRememberedSession()) {
      unlockApp();
      return;
    }

    const gate = document.getElementById("gate");
    const form = document.getElementById("gateForm");
    const title = document.getElementById("gateTitle");
    const hint = document.getElementById("gateHint");
    const submit = document.getElementById("gateSubmit");
    const passwordInput = document.getElementById("gatePassword");

    if (!gate || !form || !passwordInput || !submit) {
      unlockApp();
      return;
    }

    const oldReset = document.getElementById("gateReset");
    if (oldReset) oldReset.remove();

    gate.hidden = false;
    gate.style.display = "";
    const app = document.getElementById("app");
    if (app) app.hidden = true;

    const isSetup = !stored;

    if (isSetup) {
      title.textContent = "Bienvenido";
      hint.textContent =
        "Elegí una contraseña. Se descargará config.js para que lo subas al repositorio (así queda en GitHub Pages).";
      submit.textContent = "Guardar y entrar a la cocina";
    } else if (!getRepoKey() && getLocalKey()) {
      title.textContent = "Acceso";
      hint.textContent =
        "Tu clave está solo en este navegador. Al entrar se descargará config.js para subirla al repo.";
      submit.textContent = "Entrar a la cocina";
    } else {
      title.textContent = "Acceso";
      hint.textContent = "Ingresá tu contraseña para continuar.";
      submit.textContent = "Entrar a la cocina";
    }

    function onSubmit(e) {
      if (e) e.preventDefault();
      tryLogin(passwordInput.value);
    }

    form.addEventListener("submit", onSubmit);
    submit.addEventListener("click", function (e) {
      e.preventDefault();
      onSubmit(e);
    });
    passwordInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit(e);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuth);
  } else {
    initAuth();
  }
})();
