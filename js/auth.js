(function () {
  const STORAGE_KEY = "recetas_access_key";
  const STORAGE_SESSION = "recetas_auth_ok";
  const LEGACY_HASH = "recetas_pw_hash";

  function encodeKey(password) {
    // Compatible con file://, http y https (sin Web Crypto)
    try {
      return "v1:" + btoa(unescape(encodeURIComponent(password)));
    } catch {
      return "v1:" + btoa(password);
    }
  }

  function getStoredKey() {
    const fromConfig = (window.RECETAS_CONFIG?.passwordHash || "").trim();
    if (fromConfig) return fromConfig;
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveKey(password) {
    localStorage.setItem(STORAGE_KEY, encodeKey(password));
    try {
      localStorage.removeItem(LEGACY_HASH);
    } catch {
      /* ignore */
    }
  }

  function clearAccess() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_HASH);
      sessionStorage.removeItem(STORAGE_SESSION);
    } catch {
      /* ignore */
    }
  }

  function unlockApp() {
    try {
      sessionStorage.setItem(STORAGE_SESSION, "1");
    } catch {
      /* ignore */
    }
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
  }

  function hideError() {
    const error = document.getElementById("gateError");
    if (!error) return;
    error.hidden = true;
    error.style.display = "none";
  }

  function tryLogin(password) {
    hideError();

    if (!password || password.length < 4) {
      showError("Usá al menos 4 caracteres.");
      return false;
    }

    const stored = getStoredKey();
    const isSetup = !stored;

    if (isSetup) {
      try {
        if (!(window.RECETAS_CONFIG?.passwordHash || "").trim()) {
          saveKey(password);
        }
      } catch (err) {
        console.error(err);
        showError(
          "No se pudo guardar la contraseña. Desactivá el modo privado o probá otro navegador."
        );
        return false;
      }
      unlockApp();
      return true;
    }

    // Solo aceptamos el formato nuevo. Si hay clave legacy, forzar reset.
    if (!stored.startsWith("v1:") && !(window.RECETAS_CONFIG?.passwordHash || "").trim()) {
      showError("La contraseña guardada es antigua. Tocá “Restablecer acceso” y creá una nueva.");
      return false;
    }

    if (encodeKey(password) === stored || password === stored) {
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

    if (!cfg.requirePassword) {
      unlockApp();
      return;
    }

    try {
      if (sessionStorage.getItem(STORAGE_SESSION) === "1") {
        unlockApp();
        return;
      }
    } catch {
      /* ignore */
    }

    // Migrar: si solo hay hash legacy, limpiar para no dejar al usuario trabado
    try {
      const hasNew = localStorage.getItem(STORAGE_KEY);
      const hasLegacy = localStorage.getItem(LEGACY_HASH);
      if (!hasNew && hasLegacy) {
        localStorage.removeItem(LEGACY_HASH);
      }
    } catch {
      /* ignore */
    }

    const gate = document.getElementById("gate");
    const form = document.getElementById("gateForm");
    const title = document.getElementById("gateTitle");
    const hint = document.getElementById("gateHint");
    const submit = document.getElementById("gateSubmit");
    const passwordInput = document.getElementById("gatePassword");

    if (!gate || !form || !passwordInput || !submit) {
      console.error("Formulario de acceso incompleto");
      unlockApp();
      return;
    }

    gate.hidden = false;
    gate.style.display = "";
    const app = document.getElementById("app");
    if (app) {
      app.hidden = true;
    }

    const stored = getStoredKey();
    const isSetup = !stored;

    if (isSetup) {
      title.textContent = "Crear acceso";
      hint.textContent =
        "Elegí una contraseña (mín. 4 caracteres). Se guarda solo en este navegador.";
      submit.textContent = "Guardar y entrar";
    } else {
      title.textContent = "Acceso";
      hint.textContent = "Ingresá tu contraseña para continuar.";
      submit.textContent = "Entrar";
    }

    let resetBtn = document.getElementById("gateReset");
    if (!resetBtn) {
      resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.id = "gateReset";
      resetBtn.className = "gate-reset";
      form.appendChild(resetBtn);
    }
    resetBtn.textContent = "Restablecer acceso";
    resetBtn.hidden = false;
    resetBtn.style.display = "block";
    resetBtn.onclick = function () {
      clearAccess();
      window.location.reload();
    };

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

