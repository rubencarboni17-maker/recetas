import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const PLAIN_BACKGROUND = { id: "plain", name: "Hoja blanca", custom: false, plain: true };

const DB_NAME = "recetas-a4";
const DB_STORE = "backgrounds";
const DB_SETTINGS = "settings";
const PREFS_KEY = "recetas_bg_prefs";
const BG_BACKUP_KEY = "recetas_bgs_backup";
const HIDDEN_REPO_BG_KEY = "recetas_hidden_repo_bgs";
const DIR_HANDLE_KEY = "backgroundsDirHandle";

const state = {
  backgroundId: "plain",
  customBackgrounds: [],
  repoBackgrounds: [],
  bgFit: "cover",
  bgOverlay: 28,
  panelOpacity: 62,
  sections: [],
  activePageIndex: 0,
  pageCount: 1,
  backgroundsDirHandle: null,
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function allBackgrounds() {
  return [...state.repoBackgrounds, ...state.customBackgrounds];
}

function getBackground(id) {
  if (id === "plain" || !id) return PLAIN_BACKGROUND;
  return allBackgrounds().find((b) => b.id === id) || PLAIN_BACKGROUND;
}

function isCustomBackground(bg) {
  return Boolean(bg?.custom && (bg?.dataUrl || bg?.src));
}

function backgroundImageValue(bg) {
  return bg.dataUrl || bg.src || "";
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (prefs.backgroundId) state.backgroundId = prefs.backgroundId;
    if (prefs.bgFit) state.bgFit = prefs.bgFit;
    if (typeof prefs.bgOverlay === "number") state.bgOverlay = prefs.bgOverlay;
    if (typeof prefs.panelOpacity === "number") state.panelOpacity = prefs.panelOpacity;
  } catch {
    /* ignore */
  }
}

function savePrefs() {
  localStorage.setItem(
    PREFS_KEY,
    JSON.stringify({
      backgroundId: state.backgroundId,
      bgFit: state.bgFit,
      bgOverlay: state.bgOverlay,
      panelOpacity: state.panelOpacity,
    })
  );
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DB_SETTINGS)) {
        db.createObjectStore(DB_SETTINGS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Libera la cuota vieja: ya no guardamos imágenes en localStorage. */
function clearLegacyLocalStorageBackup() {
  try {
    localStorage.removeItem(BG_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}

async function idbGetSetting(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_SETTINGS, "readonly");
      const req = tx.objectStore(DB_SETTINGS).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSetSetting(key, value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_SETTINGS, "readwrite");
      tx.objectStore(DB_SETTINGS).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("No se pudo guardar setting", key, err);
  }
}

async function ensureDirPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  const opts = { mode };
  try {
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
  } catch {
    /* ignore */
  }
  return false;
}

async function loadSavedBackgroundsDirectory() {
  const handle = await idbGetSetting(DIR_HANDLE_KEY);
  if (!handle) return null;
  if (await ensureDirPermission(handle)) {
    state.backgroundsDirHandle = handle;
    return handle;
  }
  return null;
}

async function rememberBackgroundsDirectory(handle) {
  state.backgroundsDirHandle = handle;
  await idbSetSetting(DIR_HANDLE_KEY, handle);
}

async function loadCustomBackgrounds() {
  let items = [];
  try {
    const db = await openDb();
    items = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("IndexedDB no disponible", err);
  }

  // Migración única: backup viejo con dataURLs → IndexedDB, luego borrar localStorage.
  if (!items.length) {
    try {
      const raw = localStorage.getItem(BG_BACKUP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          const withImages = parsed.filter((b) => b && b.id && b.dataUrl);
          if (withImages.length) {
            items = withImages;
            for (const bg of items) {
              try {
                await saveCustomBackground(bg, false);
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  clearLegacyLocalStorageBackup();

  return items
    .filter((b) => b && b.id && b.dataUrl)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Ya no respaldamos imágenes en localStorage (provocaba QuotaExceededError). */
async function backupBackgroundsToLocalStorage() {
  clearLegacyLocalStorageBackup();
}

async function saveCustomBackground(bg, syncBackup = true) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(bg);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("No se pudo guardar en IndexedDB", err);
  }
  if (syncBackup) {
    await backupBackgroundsToLocalStorage(state.customBackgrounds);
  }
}

async function deleteCustomBackground(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(err);
  }
  await backupBackgroundsToLocalStorage(state.customBackgrounds);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Comprime/redimensiona para no saturar IndexedDB ni el repo. */
async function optimizeImage(file) {
  const rawUrl = await readFileAsDataUrl(file);
  const img = await loadImage(rawUrl);
  const maxEdge = 1800;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Fondo blanco: evita negro al pasar PNG con transparencia a JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  // Preferir JPEG: los fondos A4 fotográficos pesan mucho menos
  return canvas.toDataURL("image/jpeg", 0.82);
}

function getActiveContent() {
  const pages = document.querySelectorAll(".page-content");
  return pages[state.activePageIndex] || pages[0];
}

function updateBgControlsVisibility() {
  const bg = getBackground(state.backgroundId);
  const controls = $("bgControls");
  const show = isCustomBackground(bg);
  controls.hidden = !show;
  if (show) {
    $("bgFit").value = state.bgFit;
    $("bgOverlay").value = String(state.bgOverlay);
    $("overlayValue").textContent = `${state.bgOverlay}%`;
  }
}

function applyBackgroundToPages() {
  const bg = getBackground(state.backgroundId);
  const custom = isCustomBackground(bg);

  document.querySelectorAll(".page").forEach((page) => {
    page.className = custom ? "page bg-custom" : "page bg-plain";
    const pageBg = page.querySelector(".page-bg");
    const overlay = page.querySelector(".page-overlay");
    if (!pageBg || !overlay) return;

    if (custom) {
      const img = backgroundImageValue(bg);
      pageBg.style.backgroundImage = img ? `url("${img}")` : "";
      pageBg.style.backgroundSize =
        state.bgFit === "fill" ? "100% 100%" : state.bgFit;
      overlay.style.opacity = String(state.bgOverlay / 100);
    } else {
      pageBg.style.backgroundImage = "";
      pageBg.style.backgroundSize = "";
      overlay.style.opacity = "0";
    }
  });

  updateBgControlsVisibility();
  savePrefs();
}

function getHiddenRepoBackgroundIds() {
  try {
    const raw = localStorage.getItem(HIDDEN_REPO_BG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHiddenRepoBackgroundIds(ids) {
  try {
    localStorage.setItem(HIDDEN_REPO_BG_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function hideRepoBackgroundLocally(id) {
  const ids = getHiddenRepoBackgroundIds();
  if (!ids.includes(id)) {
    ids.push(id);
    saveHiddenRepoBackgroundIds(ids);
  }
}

async function saveCurrentRepoManifestToFolder() {
  const manifest = {
    backgrounds: state.repoBackgrounds.map((b) => ({
      id: String(b.id).replace(/^repo-/, ""),
      name: b.name.replace(/\s·\srepo$/, ""),
      file: b.file || String(b.src || "").replace(/^.*backgrounds\//, ""),
    })),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  const dir = await getWritableBackgroundsDirectory({ forcePick: false });
  if (!dir) return false;
  try {
    await writeFileToDirectory(dir, "manifest.json", blob);
    return true;
  } catch (err) {
    console.warn(err);
    return false;
  }
}

async function removeRepoBackground(bg) {
  const fileName = bg.file || "la imagen";
  const ok = confirm(
    `¿Quitar “${bg.name}” del listado?\n\nSe oculta en este navegador. Si la carpeta backgrounds/ está vinculada, se actualiza el manifest ahí (sin descargar). Después borrá “${fileName}” en el repo y hacé push.`
  );
  if (!ok) return;

  state.repoBackgrounds = state.repoBackgrounds.filter((b) => b.id !== bg.id);
  hideRepoBackgroundLocally(bg.id);

  if (state.backgroundId === bg.id) {
    state.backgroundId = state.repoBackgrounds[0]?.id || "plain";
  }

  const saved = await saveCurrentRepoManifestToFolder();
  renderBackgroundGrid();
  applyBackgroundToPages();
  $("bgStatus").textContent = saved
    ? `“${bg.name}” quitado. manifest.json actualizado en backgrounds/. Borrá “${fileName}” y hacé push.`
    : `“${bg.name}” quitado en este navegador. No se descargó nada. Actualizá backgrounds/manifest.json a mano si querés publicarlo.`;
}

function renderBackgroundGrid() {
  const grid = $("bgGrid");
  grid.innerHTML = "";

  const list = allBackgrounds();
  if (!list.length) {
    grid.classList.add("is-empty");
    return;
  }

  grid.classList.remove("is-empty");

  list.forEach((bg) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bg-option";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", String(bg.id === state.backgroundId));
    btn.title = bg.name;

    const thumb = document.createElement("div");
    thumb.className = "bg-preview custom-thumb";
    thumb.style.backgroundImage = `url("${backgroundImageValue(bg)}")`;
    const name = document.createElement("span");
    name.className = "bg-name";
    name.textContent = bg.repo ? `${bg.name} · repo` : bg.name;
    btn.append(thumb, name);

    btn.addEventListener("click", () => {
      state.backgroundId = bg.id;
      renderBackgroundGrid();
      applyBackgroundToPages();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "bg-delete";
    del.title = bg.repo ? "Quitar del repositorio" : "Quitar fondo local";
    del.setAttribute("aria-label", `Eliminar ${bg.name}`);
    del.textContent = "×";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (bg.repo) {
        await removeRepoBackground(bg);
        return;
      }
      state.customBackgrounds = state.customBackgrounds.filter((c) => c.id !== bg.id);
      await deleteCustomBackground(bg.id);
      if (state.backgroundId === bg.id) {
        state.backgroundId = "plain";
      }
      renderBackgroundGrid();
      applyBackgroundToPages();
      $("bgStatus").textContent = `Se eliminó “${bg.name}” (solo local).`;
    });
    btn.appendChild(del);

    grid.appendChild(btn);
  });
}

function createPage(index) {
  const wrap = document.createElement("div");
  wrap.className = "page-wrap";
  wrap.dataset.index = String(index);
  wrap.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;

  const label = document.createElement("div");
  label.className = "page-label";

  const title = document.createElement("span");
  title.className = "page-label-title";
  title.textContent = `Hoja ${index + 1}`;

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "page-delete btn tiny ghost";
  delBtn.textContent = "Eliminar";
  delBtn.title = "Eliminar esta página";
  delBtn.addEventListener("click", () => removePage(wrap));

  label.append(title, delBtn);

  const page = document.createElement("div");
  page.className = "page";

  const pageBg = document.createElement("div");
  pageBg.className = "page-bg";
  pageBg.setAttribute("aria-hidden", "true");

  const overlay = document.createElement("div");
  overlay.className = "page-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "page-content";
  content.contentEditable = "true";
  content.setAttribute("spellcheck", "true");
  content.addEventListener("focus", () => {
    const pages = [...document.querySelectorAll(".page-wrap")];
    state.activePageIndex = Math.max(0, pages.indexOf(wrap));
  });

  page.append(pageBg, overlay, content);
  wrap.append(label, page);
  return wrap;
}

function renumberPages() {
  const wraps = [...document.querySelectorAll(".page-wrap")];
  state.pageCount = wraps.length;
  wraps.forEach((wrap, index) => {
    wrap.dataset.index = String(index);
    const title = wrap.querySelector(".page-label-title");
    if (title) title.textContent = `Hoja ${index + 1}`;
    const delBtn = wrap.querySelector(".page-delete");
    if (delBtn) delBtn.hidden = wraps.length <= 1;
  });
  if (state.activePageIndex >= state.pageCount) {
    state.activePageIndex = Math.max(0, state.pageCount - 1);
  }
}

function removePage(wrap) {
  const container = $("pages");
  if (!container || container.children.length <= 1) {
    flashFormatHint("Tiene que quedar al menos una hoja.");
    return;
  }
  const wraps = [...container.querySelectorAll(".page-wrap")];
  const index = wraps.indexOf(wrap);
  wrap.remove();
  renumberPages();
  if (index >= 0 && index <= state.activePageIndex) {
    state.activePageIndex = Math.max(0, state.activePageIndex - 1);
  }
  applyBackgroundToPages();
  updatePageScale();
}

function ensurePages(count) {
  const container = $("pages");
  while (container.children.length < count) {
    const index = container.children.length;
    container.appendChild(createPage(index));
  }
  renumberPages();
  applyBackgroundToPages();
}

function addPage() {
  ensurePages(state.pageCount + 1);
  state.activePageIndex = state.pageCount - 1;
  const pages = document.querySelectorAll(".page-content");
  pages[state.activePageIndex]?.focus();
  pages[state.activePageIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  updatePageScale();
}

function extractBlocksFromTextContent(items, pageNumber) {
  if (!items.length) return [];

  const lines = [];
  let current = { y: null, parts: [] };

  const sorted = [...items].sort((a, b) => {
    const yDiff = (b.transform?.[5] ?? 0) - (a.transform?.[5] ?? 0);
    if (Math.abs(yDiff) > 2) return yDiff;
    return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
  });

  for (const item of sorted) {
    const str = (item.str || "").trimEnd();
    if (!str && !item.hasEOL) continue;
    const y = item.transform?.[5] ?? 0;
    if (current.y === null || Math.abs(current.y - y) < 4) {
      current.y = current.y === null ? y : current.y;
      current.parts.push(str);
      if (item.hasEOL) {
        lines.push({ y: current.y, text: current.parts.join(" ").replace(/\s+/g, " ").trim() });
        current = { y: null, parts: [] };
      }
    } else {
      if (current.parts.length) {
        lines.push({ y: current.y, text: current.parts.join(" ").replace(/\s+/g, " ").trim() });
      }
      current = { y, parts: [str] };
      if (item.hasEOL) {
        lines.push({ y: current.y, text: current.parts.join(" ").replace(/\s+/g, " ").trim() });
        current = { y: null, parts: [] };
      }
    }
  }
  if (current.parts.length) {
    lines.push({ y: current.y, text: current.parts.join(" ").replace(/\s+/g, " ").trim() });
  }

  const cleanLines = lines.map((l) => l.text).filter(Boolean);
  if (!cleanLines.length) return [];

  const blocks = [];
  let buf = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) {
      const firstLine = buf[0] || "";
      const isTitleLike =
        firstLine.length > 0 &&
        firstLine.length < 80 &&
        (buf.length === 1 || /^[A-ZÁÉÍÓÚÑ0-9]/.test(firstLine));
      blocks.push({
        id: `p${pageNumber}-b${blocks.length + 1}`,
        page: pageNumber,
        title: isTitleLike ? firstLine : `Página ${pageNumber} · bloque ${blocks.length + 1}`,
        text,
      });
    }
    buf = [];
  };

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    const next = cleanLines[i + 1];
    buf.push(line);

    const shortLine = line.length < 55;
    const nextLong = next && next.length > 70;
    const endsSentence = /[.!?…:]$/.test(line);
    const looksLikeHeading =
      shortLine && !endsSentence && nextLong && buf.length <= 2;

    if (looksLikeHeading && buf.length > 1) {
      const heading = buf.pop();
      flush();
      buf = [heading];
    } else if (buf.length >= 8) {
      flush();
    }
  }
  flush();
  return blocks;
}

function rebuildPageText(items) {
  let out = "";
  for (const item of items) {
    out += item.str || "";
    if (item.hasEOL) out += "\n";
    else if (item.str && !item.str.endsWith(" ")) out += " ";
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadPdf(file) {
  const status = $("pdfStatus");
  const nameEl = $("pdfName");
  nameEl.textContent = file.name;
  status.textContent = "Leyendo PDF…";
  $("btnInsert").disabled = true;
  $("btnSelectAll").disabled = true;

  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const sections = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      status.textContent = `Extrayendo página ${pageNum} de ${pdf.numPages}…`;
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items.filter((it) => typeof it.str === "string");

      const pageText = items
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText) {
        sections.push({
          id: `page-${pageNum}`,
          page: pageNum,
          title: `Página ${pageNum} (completa)`,
          text: rebuildPageText(items),
          kind: "page",
        });
      }

      const blocks = extractBlocksFromTextContent(items, pageNum);
      for (const block of blocks) {
        if (blocks.length === 1 && block.text.replace(/\s+/g, " ") === pageText) {
          continue;
        }
        sections.push({ ...block, kind: "block" });
      }
    }

    state.sections = sections;
    renderSections();
    status.textContent = `${sections.length} sección${sections.length === 1 ? "" : "es"} encontrada${sections.length === 1 ? "" : "s"} en ${pdf.numPages} página${pdf.numPages === 1 ? "" : "s"}.`;
    $("btnInsert").disabled = sections.length === 0;
    $("btnSelectAll").disabled = sections.length === 0;
  } catch (err) {
    console.error(err);
    status.textContent = "No se pudo leer el PDF. Probá con otro archivo.";
    state.sections = [];
    renderSections();
  }
}

function renderSections() {
  const list = $("sectionsList");
  if (!state.sections.length) {
    list.innerHTML =
      '<p class="empty-hint">Cargá un PDF para ver sus páginas y bloques de texto.</p>';
    return;
  }

  list.innerHTML = "";
  state.sections.forEach((section) => {
    const label = document.createElement("label");
    label.className = "section-item";
    label.innerHTML = `
      <input type="checkbox" data-id="${escapeHtml(section.id)}" />
      <div>
        <div class="section-meta">${escapeHtml(section.title)}</div>
        <div class="section-preview">${escapeHtml(section.text)}</div>
      </div>
    `;
    list.appendChild(label);
  });
}

function getSelectedSections() {
  const checked = [...document.querySelectorAll('#sectionsList input[type="checkbox"]:checked')];
  const ids = new Set(checked.map((el) => el.dataset.id));
  return state.sections.filter((s) => ids.has(s.id));
}

function insertSelected() {
  const selected = getSelectedSections();
  if (!selected.length) {
    $("pdfStatus").textContent = "Seleccioná al menos una sección.";
    return;
  }

  ensurePages(Math.max(1, state.pageCount));
  const content = getActiveContent();
  if (!content) return;

  // Solo el texto real del PDF (sin títulos sintéticos "Página…" / "Bloque…")
  const html = selected
    .map((s) => {
      const lines = escapeHtml(s.text).split("\n");
      const body = lines.map((line) => (line ? line : "<br>")).join("<br>");
      return `<div class="block">${body}</div>`;
    })
    .join("");

  content.focus();
  content.innerHTML = content.innerHTML.trim() ? content.innerHTML + html : html;
  $("pdfStatus").textContent = `${selected.length} sección${selected.length === 1 ? "" : "es"} pegada${selected.length === 1 ? "" : "s"} en la hoja ${state.activePageIndex + 1}.`;
  if (window.innerWidth <= 980) setMobileView("editor");
}

/** Última selección dentro de una hoja (los controles del toolbar la pierden al hacer clic). */
let savedRange = null;
let hintTimer = null;
let toolbarSyncTimer = null;
/** Recuadro activo para recalibrar opacidad (se mantiene al usar el slider). */
let activeTextPanel = null;
let opacitySliderDragging = false;

function flashFormatHint(message) {
  const el = $("formatHint");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, 2600);
}

function nodeToElement(node) {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

function getSelectionEditable() {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const el = nodeToElement(sel.anchorNode);
  return el?.closest?.(".page-content") || null;
}

/** Elemento cuya tipografía se lee para el panel (caret o foco de la selección). */
function getSelectionStyleElement() {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;

  const range = sel.getRangeAt(0);

  // 1) Punto visual de la selección/caret (más fiable con clics)
  try {
    const rects = range.getClientRects();
    const rect =
      (sel.isCollapsed ? rects[0] : rects[rects.length - 1]) ||
      range.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) {
      const x = Math.min(rect.left + Math.max(rect.width / 2, 1), rect.right - 1);
      const y = rect.top + Math.min(Math.max(rect.height / 2, 1), Math.max(rect.height - 1, 1));
      const hit = document.elementFromPoint(x, y);
      const inPage = hit?.closest?.(".page-content");
      if (inPage && hit) {
        // Evitar leer el contenedor raíz si hay un hijo de texto debajo
        if (hit.classList?.contains("page-content")) {
          /* caer al método por nodo */
        } else {
          return hit;
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 2) Nodo DOM del caret / extremo activo
  let node = sel.isCollapsed
    ? range.startContainer
    : sel.focusNode || range.startContainer;
  let offset = sel.isCollapsed
    ? range.startOffset
    : sel.focusOffset ?? range.startOffset;

  if (node?.nodeType === Node.ELEMENT_NODE) {
    const children = node.childNodes;
    if (children.length) {
      const idx =
        offset >= children.length
          ? children.length - 1
          : offset > 0
            ? offset - (sel.isCollapsed ? 1 : 0)
            : 0;
      node = children[Math.max(0, Math.min(idx, children.length - 1))] || node;
    }
  }

  if (node?.nodeType === Node.ELEMENT_NODE) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    if (text) node = text;
  }

  const el = nodeToElement(node);
  if (!el?.closest?.(".page-content")) return null;
  return el;
}

function rgbToHex(color) {
  if (!color) return null;
  if (color.startsWith("#")) return color.length >= 7 ? color.slice(0, 7) : color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  const hex = (n) => Number(n).toString(16).padStart(2, "0");
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

function closestSelectOption(select, target, parse = Number) {
  if (!select) return;
  let best = null;
  let bestDiff = Infinity;
  const goal = parse(target);
  if (!Number.isFinite(goal)) return;
  for (const opt of select.options) {
    const v = parse(opt.value);
    if (!Number.isFinite(v)) continue;
    const diff = Math.abs(v - goal);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt.value;
    }
  }
  if (best != null) select.value = best;
}

function syncFontFamilyControl(computedFamily) {
  const select = $("fontFamily");
  if (!select || document.activeElement === select) return;
  const fam = String(computedFamily || "").toLowerCase();
  for (const opt of select.options) {
    const first = opt.value
      .split(",")[0]
      .replace(/['"]/g, "")
      .trim()
      .toLowerCase();
    if (first && fam.includes(first)) {
      select.value = opt.value;
      return;
    }
  }
}

/**
 * Lee la tipografía en el caret/selección y actualiza el panel superior.
 */
function syncToolbarFromSelection() {
  const el = getSelectionStyleElement();
  if (!el) return;

  const cs = window.getComputedStyle(el);
  const sizePx = Math.round(parseFloat(cs.fontSize));
  const sizeInput = $("fontSizeInput");

  // Actualizar tamaño salvo que el usuario lo esté editando ahora
  if (
    Number.isFinite(sizePx) &&
    sizePx > 0 &&
    sizeInput &&
    document.activeElement !== sizeInput
  ) {
    syncFontSizeControls(`${sizePx}px`);
  }

  syncFontFamilyControl(cs.fontFamily);

  const lhSelect = $("lineHeight");
  if (lhSelect && document.activeElement !== lhSelect) {
    const fontSize = parseFloat(cs.fontSize);
    const lineHeight = parseFloat(cs.lineHeight);
    if (Number.isFinite(fontSize) && Number.isFinite(lineHeight) && fontSize > 0) {
      closestSelectOption(lhSelect, lineHeight / fontSize);
    }
  }

  const colorInput = $("textColor");
  if (colorInput && document.activeElement !== colorInput) {
    const hex = rgbToHex(cs.color);
    if (hex) colorInput.value = hex;
  }

  document.querySelectorAll(".toolbar [data-cmd]").forEach((btn) => {
    const cmd = btn.dataset.cmd;
    let on = false;
    try {
      on = document.queryCommandState(cmd);
    } catch {
      on = false;
    }
    btn.classList.toggle("active", on);
  });

  const alignMap = [
    ["justifyLeft", "left"],
    ["justifyCenter", "center"],
    ["justifyRight", "right"],
    ["justifyFull", "justify"],
  ];
  let activeAlign = "left";
  for (const [cmd, align] of alignMap) {
    try {
      if (document.queryCommandState(cmd)) {
        activeAlign = align;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  document.querySelectorAll("[data-align]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.align === activeAlign);
  });

  const panelBtn = $("btnTextPanel");
  const panel = el.closest?.(".text-panel");
  if (panelBtn) panelBtn.classList.toggle("active", Boolean(panel));

  // Solo actualizar el recuadro activo cuando encontramos uno (no borrarlo al ir al menú)
  if (panel) setActiveTextPanel(panel);

  const opacityInput = $("panelOpacity");
  const opacityValue = $("panelOpacityValue");
  if (opacityInput && document.activeElement !== opacityInput && !opacitySliderDragging) {
    let pct = state.panelOpacity;
    const panelForOpacity = panel || (activeTextPanel && document.body.contains(activeTextPanel) ? activeTextPanel : null);
    if (panelForOpacity) {
      const fromPanel = readPanelOpacity(panelForOpacity);
      if (fromPanel != null) pct = fromPanel;
    }
    opacityInput.value = String(pct);
    if (opacityValue) opacityValue.textContent = `${pct}%`;
  }
}

function scheduleToolbarSync() {
  clearTimeout(toolbarSyncTimer);
  toolbarSyncTimer = setTimeout(syncToolbarFromSelection, 10);
}

function cacheSelectionIfEditable() {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const editable = getSelectionEditable();
  if (!editable) return;
  try {
    // Solo guardar selección no vacía: el toolbar la necesita al hacer clic
    if (!sel.isCollapsed) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
    const pages = [...document.querySelectorAll(".page-content")];
    const idx = pages.indexOf(editable);
    if (idx >= 0) state.activePageIndex = idx;
  } catch {
    /* ignore */
  }
  scheduleToolbarSync();
}

function restoreSavedSelection() {
  if (!savedRange) return false;
  const editable =
    nodeToElement(savedRange.startContainer)?.closest?.(".page-content") ||
    nodeToElement(savedRange.endContainer)?.closest?.(".page-content");
  if (!editable || !document.body.contains(savedRange.startContainer)) {
    savedRange = null;
    return false;
  }
  editable.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
  return !sel.isCollapsed;
}

function requireTextSelection() {
  const live = window.getSelection();
  if (live && !live.isCollapsed && getSelectionEditable()) {
    cacheSelectionIfEditable();
    return true;
  }
  if (restoreSavedSelection()) return true;
  flashFormatHint("Seleccioná texto en la hoja para aplicar el formato.");
  return false;
}

function applyInlineStylesToSelection(styles) {
  if (!requireTextSelection()) return false;

  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  if (range.collapsed) {
    flashFormatHint("Seleccioná texto en la hoja para aplicar el formato.");
    return false;
  }

  let span = null;
  const startEl = nodeToElement(range.startContainer);
  const endEl = nodeToElement(range.endContainer);

  // Si la selección cae exactamente dentro de un span de formato, reutilizarlo
  if (
    startEl &&
    startEl === endEl &&
    startEl.tagName === "SPAN" &&
    startEl.classList.contains("fmt") &&
    range.toString() === startEl.textContent
  ) {
    span = startEl;
  } else {
    span = document.createElement("span");
    span.className = "fmt";
    try {
      range.surroundContents(span);
    } catch {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
  }

  if (styles.fontFamily) span.style.fontFamily = styles.fontFamily;
  if (styles.fontSize) span.style.fontSize = styles.fontSize;
  if (styles.lineHeight) span.style.lineHeight = styles.lineHeight;
  if (styles.color) span.style.color = styles.color;

  const next = document.createRange();
  next.selectNodeContents(span);
  sel.removeAllRanges();
  sel.addRange(next);
  savedRange = next.cloneRange();
  scheduleToolbarSync();
  return true;
}

function applyFontFamily(value) {
  applyInlineStylesToSelection({ fontFamily: value });
}

function normalizeFontSize(value) {
  const n = parseFloat(String(value).replace(/px/gi, "").trim());
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(200, Math.max(6, Math.round(n)));
  return `${clamped}px`;
}

function syncFontSizeControls(sizePx) {
  const n = parseInt(sizePx, 10);
  const input = $("fontSizeInput");
  if (input) input.value = String(n);
}

function applyFontSize(value) {
  const size = normalizeFontSize(value);
  if (!size) {
    flashFormatHint("Ingresá un tamaño válido (6–200 px).");
    return;
  }
  syncFontSizeControls(size);
  applyInlineStylesToSelection({ fontSize: size });
}

function applyLineHeight(value) {
  applyInlineStylesToSelection({ lineHeight: value });
}

function applyTextColor(value) {
  applyInlineStylesToSelection({ color: value });
}

function setActiveTextPanel(panel) {
  if (activeTextPanel && activeTextPanel !== panel) {
    activeTextPanel.classList.remove("is-active-panel");
  }
  activeTextPanel = panel && document.body.contains(panel) ? panel : null;
  if (activeTextPanel) {
    activeTextPanel.classList.add("is-active-panel");
    ensurePanelResizeHandle(activeTextPanel);
  }
}

function clearActiveTextPanel() {
  if (activeTextPanel) activeTextPanel.classList.remove("is-active-panel");
  activeTextPanel = null;
}

function ensurePanelResizeHandle(panel) {
  if (!panel) return;
  // Migrar recuadros viejos: meter el texto en .text-panel-body
  ensurePanelBody(panel);
  let handle = panel.querySelector(":scope > .text-panel-handle");
  if (!handle) {
    handle = document.createElement("span");
    handle.className = "text-panel-handle";
    handle.contentEditable = "false";
    handle.title = "Arrastrá para agrandar o achicar el recuadro";
    handle.setAttribute("aria-hidden", "true");
    panel.appendChild(handle);
  }
}

/** Garantiza que el texto viva dentro de .text-panel-body (acoplado al recuadro). */
function ensurePanelBody(panel) {
  if (!panel) return null;
  let body = panel.querySelector(":scope > .text-panel-body");
  if (body) return body;

  body = document.createElement("div");
  body.className = "text-panel-body";
  const toMove = [];
  [...panel.childNodes].forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains("text-panel-handle")) {
      return;
    }
    toMove.push(node);
  });
  toMove.forEach((node) => body.appendChild(node));
  const handle = panel.querySelector(":scope > .text-panel-handle");
  if (handle) panel.insertBefore(body, handle);
  else panel.appendChild(body);
  return body;
}

function startPanelResize(handle, e) {
  e.preventDefault();
  e.stopPropagation();

  const panel = handle.closest(".text-panel");
  if (!panel) return;

  setActiveTextPanel(panel);
  ensurePanelBody(panel);

  const startX = e.clientX;
  const startY = e.clientY;
  const startW = panel.offsetWidth;
  const startH = panel.offsetHeight;
  const page = panel.closest(".page-content");
  const maxW = page ? Math.floor(page.clientWidth * 0.98) : 800;

  // Quitar height fijo viejo que dejaba el texto “afuera” visualmente
  panel.style.height = "auto";

  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  panel.classList.add("is-resizing");

  const onMove = (ev) => {
    const nextW = Math.min(maxW, Math.max(80, Math.round(startW + (ev.clientX - startX))));
    const nextMinH = Math.max(36, Math.round(startH + (ev.clientY - startY)));
    // Ancho fijo + min-height: el texto sigue dentro y puede envolver
    panel.style.width = `${nextW}px`;
    panel.style.minHeight = `${nextMinH}px`;
    panel.style.height = "auto";
  };

  const onUp = (ev) => {
    try {
      handle.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    panel.classList.remove("is-resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function clampPanelOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return state.panelOpacity;
  return Math.min(95, Math.max(10, Math.round(n)));
}

function panelBackground(opacityPct) {
  const a = clampPanelOpacity(opacityPct) / 100;
  return `rgba(255, 252, 247, ${a})`;
}

function setPanelOpacityStyle(panel, opacityPct) {
  if (!panel) return;
  const pct = clampPanelOpacity(opacityPct);
  panel.style.setProperty("--panel-alpha", String(pct / 100));
  // Important: forzar sobre la regla CSS del stylesheet
  panel.style.setProperty("background", panelBackground(pct), "important");
  panel.dataset.opacity = String(pct);
}

function readPanelOpacity(panel) {
  if (!panel) return null;
  if (panel.dataset.opacity) {
    const n = Number(panel.dataset.opacity);
    if (Number.isFinite(n)) return clampPanelOpacity(n);
  }
  const cssVar = panel.style.getPropertyValue("--panel-alpha");
  if (cssVar) {
    const n = Math.round(parseFloat(cssVar) * 100);
    if (Number.isFinite(n)) return clampPanelOpacity(n);
  }
  const bg = window.getComputedStyle(panel).backgroundColor;
  const m = bg.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
  if (m) return clampPanelOpacity(Math.round(parseFloat(m[1]) * 100));
  return null;
}

function syncPanelOpacityControls(pct) {
  const value = clampPanelOpacity(pct);
  const input = $("panelOpacity");
  const label = $("panelOpacityValue");
  if (input && document.activeElement !== input) input.value = String(value);
  if (label) label.textContent = `${value}%`;
}

function findTextPanelNearSelection() {
  const sel = window.getSelection();
  if (sel?.rangeCount) {
    const nodes = [sel.focusNode, sel.anchorNode, sel.getRangeAt(0).commonAncestorContainer];
    for (const node of nodes) {
      const el = nodeToElement(node);
      const panel = el?.closest?.(".text-panel");
      if (panel) return panel;
    }
  }
  if (savedRange) {
    const el = nodeToElement(savedRange.startContainer);
    const panel = el?.closest?.(".text-panel");
    if (panel) return panel;
  }
  return null;
}

function getPanelForOpacityEdit() {
  if (activeTextPanel && document.body.contains(activeTextPanel)) {
    return activeTextPanel;
  }
  const near = findTextPanelNearSelection();
  if (near) {
    setActiveTextPanel(near);
    return near;
  }
  return null;
}

/** Ajusta la opacidad del recuadro activo (o el valor por defecto para nuevos). */
function applyPanelOpacity(value) {
  const pct = clampPanelOpacity(value);
  state.panelOpacity = pct;
  const label = $("panelOpacityValue");
  if (label) label.textContent = `${pct}%`;
  savePrefs();

  const panel = getPanelForOpacityEdit();
  if (panel) {
    setPanelOpacityStyle(panel, pct);
    setActiveTextPanel(panel);
  }
}

/** Recuadro semitransparente detrás del texto para atenuar el fondo. */
function applyTextPanel() {
  if (!requireTextSelection()) return;

  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  if (range.collapsed) {
    flashFormatHint("Seleccioná el texto al que querés ponerle el recuadro.");
    return;
  }

  const startEl = nodeToElement(range.startContainer);
  const endEl = nodeToElement(range.endContainer);
  const existing = startEl?.closest?.(".text-panel");

  // Toggle: si ya está en un recuadro, quitarlo
  if (existing && (!endEl || existing.contains(endEl))) {
    const parent = existing.parentNode;
    if (!parent) return;
    if (activeTextPanel === existing) clearActiveTextPanel();
    existing.querySelectorAll(".text-panel-handle").forEach((h) => h.remove());
    const body = existing.querySelector(":scope > .text-panel-body");
    const frag = document.createDocumentFragment();
    if (body) {
      while (body.firstChild) frag.appendChild(body.firstChild);
    } else {
      while (existing.firstChild) frag.appendChild(existing.firstChild);
    }
    parent.insertBefore(frag, existing);
    parent.removeChild(existing);
    parent.normalize();
    scheduleToolbarSync();
    return;
  }

  const panel = document.createElement("div");
  panel.className = "text-panel";
  const body = document.createElement("div");
  body.className = "text-panel-body";
  setPanelOpacityStyle(panel, state.panelOpacity);

  const contents = range.extractContents();
  body.appendChild(contents);
  panel.appendChild(body);
  range.insertNode(panel);

  ensurePanelResizeHandle(panel);
  setActiveTextPanel(panel);

  const next = document.createRange();
  next.selectNodeContents(body);
  sel.removeAllRanges();
  sel.addRange(next);
  savedRange = next.cloneRange();
  scheduleToolbarSync();
}

function applyAlign(align) {
  const map = {
    left: "justifyLeft",
    center: "justifyCenter",
    right: "justifyRight",
    justify: "justifyFull",
  };

  if (!restoreSavedSelection()) {
    getActiveContent()?.focus();
  }

  // Importante: execCommand(justify*) rompe el recuadro y saca el texto.
  // Si estamos dentro de un text-panel, alineamos el propio recuadro.
  const panel =
    findTextPanelNearSelection() ||
    (activeTextPanel && document.body.contains(activeTextPanel) ? activeTextPanel : null);

  if (panel) {
    ensurePanelBody(panel);
    const body = panel.querySelector(":scope > .text-panel-body") || panel;
    const cssAlign = align === "justify" ? "justify" : align;
    body.style.textAlign = cssAlign;
    panel.style.textAlign = cssAlign;
    panel.style.display = "block";
    panel.style.height = "auto";

    if (align === "center") {
      panel.style.marginLeft = "auto";
      panel.style.marginRight = "auto";
    } else if (align === "right") {
      panel.style.marginLeft = "auto";
      panel.style.marginRight = "0";
    } else {
      panel.style.marginLeft = "0";
      panel.style.marginRight = "auto";
    }

    setActiveTextPanel(panel);
    document.querySelectorAll("[data-align]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.align === align);
    });
    scheduleToolbarSync();
    return;
  }

  document.execCommand(map[align] || "justifyLeft", false, null);
  cacheSelectionIfEditable();
  document.querySelectorAll("[data-align]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.align === align);
  });
}

function runInlineCommand(cmd) {
  if (!requireTextSelection()) return;
  document.execCommand(cmd, false, null);
  cacheSelectionIfEditable();
  scheduleToolbarSync();
}

function splitFragmentIntoLines(fragment) {
  const lines = [];
  let current = document.createDocumentFragment();

  const flush = () => {
    lines.push(current);
    current = document.createDocumentFragment();
  };

  const appendNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = node.textContent.split(/\n/);
      parts.forEach((part, i) => {
        if (i > 0) flush();
        if (part) current.appendChild(document.createTextNode(part));
      });
      return;
    }

    if (node.nodeName === "BR") {
      flush();
      return;
    }

    if (node.nodeName === "DIV" || node.nodeName === "P" || node.nodeName === "H3") {
      if (current.hasChildNodes()) flush();
      [...node.childNodes].forEach(appendNode);
      if (current.hasChildNodes()) flush();
      return;
    }

    if (node.nodeName === "UL" || node.nodeName === "OL") {
      [...node.children].forEach((li) => {
        if (current.hasChildNodes()) flush();
        [...li.childNodes].forEach((child) => current.appendChild(child.cloneNode(true)));
        flush();
      });
      return;
    }

    current.appendChild(node.cloneNode(true));
  };

  [...fragment.childNodes].forEach(appendNode);
  if (current.hasChildNodes() || lines.length === 0) flush();

  return lines.filter((frag) => {
    const text = frag.textContent ?? "";
    return text.trim().length > 0 || frag.querySelector?.("img,br");
  });
}

function applyBullets() {
  if (!requireTextSelection()) return;

  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  const startEl = nodeToElement(range.startContainer);
  const existingList = startEl?.closest("ul, ol");

  // Si ya está en una lista, quitar viñetas (toggle)
  if (existingList && existingList.contains(nodeToElement(range.endContainer))) {
    document.execCommand("insertUnorderedList", false, null);
    cacheSelectionIfEditable();
    return;
  }

  const contents = range.extractContents();
  const lines = splitFragmentIntoLines(contents);

  if (!lines.length) {
    flashFormatHint("Seleccioná el texto al que querés agregar viñetas.");
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "recipe-bullets";

  lines.forEach((frag) => {
    const li = document.createElement("li");
    li.appendChild(frag);
    ul.appendChild(li);
  });

  range.insertNode(ul);

  const next = document.createRange();
  next.selectNodeContents(ul);
  sel.removeAllRanges();
  sel.addRange(next);
  savedRange = next.cloneRange();
}

const TAB_MAX_LEVEL = 12;

function findTabIndentWrapper(range) {
  const startEl = nodeToElement(range.startContainer);
  const endEl = nodeToElement(range.endContainer);
  if (!startEl || !endEl) return null;
  const startWrap = startEl.closest?.(".tab-indent");
  const endWrap = endEl.closest?.(".tab-indent");
  if (startWrap && startWrap === endWrap) return startWrap;
  return null;
}

function unwrapElement(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function ensureEditorFocus() {
  const live = window.getSelection();
  if (live?.rangeCount && getSelectionEditable()) {
    cacheSelectionIfEditable();
    return true;
  }
  if (restoreSavedSelection()) return true;

  const editable = getActiveContent();
  if (!editable) return false;
  editable.focus();

  const sel = window.getSelection();
  if (sel.rangeCount) return true;

  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  savedRange = range.cloneRange();
  return true;
}

function getBlockForIndent(range) {
  const el = nodeToElement(range.startContainer);
  const editable = el?.closest?.(".page-content");
  if (!el || !editable) return null;

  const tab = el.closest(".tab-indent");
  if (tab && editable.contains(tab)) return tab;

  const block = el.closest("li, p, h3, .block");
  if (block && editable.contains(block) && block !== editable) return block;

  // Subir hasta un hijo directo del área editable
  let cur = el;
  while (cur.parentElement && cur.parentElement !== editable) {
    cur = cur.parentElement;
  }
  if (cur && cur !== editable && editable.contains(cur)) return cur;
  return null;
}

function setTabLevel(wrapper, level) {
  wrapper.dataset.level = String(level);
  wrapper.style.setProperty("--tab-level", String(level));
}

function adjustTabLevel(wrapper, outdent, sel) {
  let level = Number(wrapper.dataset.level || wrapper.style.getPropertyValue("--tab-level") || 1);
  if (!Number.isFinite(level) || level < 1) level = 1;
  level = outdent ? level - 1 : level + 1;

  if (level <= 0) {
    const caret = document.createRange();
    caret.selectNodeContents(wrapper);
    caret.collapse(true);
    unwrapElement(wrapper);
    sel.removeAllRanges();
    sel.addRange(caret);
    savedRange = caret.cloneRange();
    return;
  }

  level = Math.min(TAB_MAX_LEVEL, level);
  setTabLevel(wrapper, level);
  cacheSelectionIfEditable();
}

function wrapElementWithTabIndent(el, sel) {
  if (el.classList.contains("tab-indent")) {
    adjustTabLevel(el, false, sel);
    return;
  }
  const parentTab = el.closest(".tab-indent");
  if (parentTab) {
    adjustTabLevel(parentTab, false, sel);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "tab-indent";
  setTabLevel(wrapper, 1);
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);

  const caret = document.createRange();
  caret.selectNodeContents(el);
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);
  savedRange = caret.cloneRange();
}

function wrapRangeWithTabIndent(range, sel) {
  const wrapper = document.createElement("div");
  wrapper.className = "tab-indent";
  setTabLevel(wrapper, 1);
  try {
    range.surroundContents(wrapper);
  } catch {
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
  }
  const next = document.createRange();
  next.selectNodeContents(wrapper);
  sel.removeAllRanges();
  sel.addRange(next);
  savedRange = next.cloneRange();
}

function applyTabIndent(outdent = false) {
  if (!ensureEditorFocus()) {
    flashFormatHint("Poné el cursor en la hoja para sangrar.");
    return;
  }

  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);

  // Con selección: sangrar el bloque seleccionado
  if (!range.collapsed) {
    const existing = findTabIndentWrapper(range);
    if (existing) {
      adjustTabLevel(existing, outdent, sel);
      return;
    }
    if (outdent) {
      flashFormatHint("No hay sangría para quitar en esta selección.");
      return;
    }
    wrapRangeWithTabIndent(range, sel);
    return;
  }

  // Solo cursor: sangrar el bloque/línea actual (lo que está delante)
  const block = getBlockForIndent(range);
  if (block) {
    if (block.classList.contains("tab-indent")) {
      adjustTabLevel(block, outdent, sel);
      return;
    }
    const parentTab = block.closest(".tab-indent");
    if (parentTab) {
      adjustTabLevel(parentTab, outdent, sel);
      return;
    }
    if (outdent) {
      flashFormatHint("No hay sangría para quitar.");
      return;
    }
    wrapElementWithTabIndent(block, sel);
    return;
  }

  if (outdent) {
    flashFormatHint("No hay sangría para quitar.");
    return;
  }

  // Cursor suelto: insertar sangría envolviendo desde el cursor hasta fin de línea/bloque
  const editable = getSelectionEditable() || getActiveContent();
  if (!editable) return;

  const lineRange = document.createRange();
  lineRange.setStart(range.startContainer, range.startOffset);

  // Extender hasta el final del contenedor editable o del bloque
  const endContainer = editable;
  lineRange.setEnd(endContainer, endContainer.childNodes.length);

  if (lineRange.collapsed) {
    // Al final del documento: crear un contenedor vacío sangrado y dejar el cursor ahí
    const wrapper = document.createElement("div");
    wrapper.className = "tab-indent";
    setTabLevel(wrapper, 1);
    wrapper.appendChild(document.createElement("br"));
    editable.appendChild(wrapper);
    const caret = document.createRange();
    caret.setStart(wrapper, 0);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    savedRange = caret.cloneRange();
    return;
  }

  wrapRangeWithTabIndent(lineRange, sel);
  // Dejar el cursor al inicio del contenido sangrado
  const wrapped = sel.anchorNode && nodeToElement(sel.anchorNode)?.closest(".tab-indent");
  if (wrapped) {
    const caret = document.createRange();
    caret.selectNodeContents(wrapped);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    savedRange = caret.cloneRange();
  }
}

function isEditableKeyTarget(target) {
  if (!target) return false;
  if (target.closest?.(".page-content")) return true;
  return false;
}

function wireEditorKeys() {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab") return;
      if (e.target?.closest?.("input, select, textarea")) return;

      const inPage =
        isEditableKeyTarget(e.target) ||
        Boolean(getSelectionEditable()) ||
        (savedRange &&
          nodeToElement(savedRange.startContainer)?.closest?.(".page-content"));

      if (!inPage) return;

      e.preventDefault();
      applyTabIndent(e.shiftKey);
    },
    true
  );
}

function setMobileView(view) {
  const workspace = $("workspace");
  if (!workspace) return;
  workspace.dataset.mobileView = view;
  document.querySelectorAll("[data-mobile-view]").forEach((btn) => {
    if (!btn.classList.contains("mobile-nav-btn")) return;
    btn.classList.toggle("is-active", btn.dataset.mobileView === view);
  });
  if (view === "editor") {
    requestAnimationFrame(updatePageScale);
  }
}

function wireMobileNav() {
  document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMobileView(btn.dataset.mobileView));
  });
}

function measureA4WidthPx() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:210mm;height:0;pointer-events:none;";
  document.body.appendChild(probe);
  const width = probe.offsetWidth || 794;
  probe.remove();
  return width;
}

function updatePageScale() {
  const stage = $("stage");
  if (!stage || stage.offsetParent === null) return;
  if (window.matchMedia("print").matches) {
    document.documentElement.style.setProperty("--page-scale", "1");
    return;
  }
  if (window.innerWidth > 980) {
    document.documentElement.style.setProperty("--page-scale", "1");
    return;
  }
  const available = Math.max(200, stage.clientWidth - 8);
  const a4w = measureA4WidthPx();
  const scale = Math.min(1, available / a4w);
  document.documentElement.style.setProperty("--page-scale", String(scale));
}

function wirePageScale() {
  updatePageScale();
  window.addEventListener("resize", updatePageScale);
  window.addEventListener("orientationchange", () => setTimeout(updatePageScale, 150));
  if (typeof ResizeObserver !== "undefined") {
    const stage = $("stage");
    if (stage) new ResizeObserver(updatePageScale).observe(stage);
  }
}

function isImageFile(file) {
  if (!file) return false;
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name || "");
}

function getAppBasePath() {
  let path = window.location.pathname || "/";
  if (path.endsWith(".html")) {
    path = path.slice(0, path.lastIndexOf("/") + 1);
  } else if (!path.endsWith("/")) {
    path += "/";
  }
  return path;
}

function assetUrl(relativePath) {
  const clean = String(relativePath || "").replace(/^\.\//, "");
  return new URL(clean, window.location.origin + getAppBasePath()).href;
}

async function loadRepoBackgrounds() {
  const manifestUrl = assetUrl("backgrounds/manifest.json");
  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) {
      console.warn("Manifest no encontrado:", manifestUrl, res.status);
      if ($("bgStatus")) {
        $("bgStatus").textContent =
          `No se encontró ${manifestUrl} (${res.status}). Revisá que exista backgrounds/manifest.json en el repo publicado.`;
      }
      return [];
    }
    const data = await res.json();
    const list = Array.isArray(data?.backgrounds) ? data.backgrounds : [];
    const hidden = new Set(getHiddenRepoBackgroundIds());
    return list
      .filter((b) => b && (b.file || b.src))
      .map((b, i) => {
        const file = b.file || b.src;
        const id = `repo-${b.id || file || i}`;
        const src =
          file.startsWith("http") || file.startsWith("data:")
            ? file
            : assetUrl(
                file.startsWith("backgrounds/") ? file : `backgrounds/${file}`
              );
        return {
          id,
          name: b.name || file,
          custom: true,
          repo: true,
          file: file.replace(/^backgrounds\//, ""),
          src,
        };
      })
      .filter((b) => !hidden.has(b.id));
  } catch (err) {
    console.warn("No se pudo leer backgrounds/manifest.json", err);
    if ($("bgStatus")) {
      $("bgStatus").textContent =
        "Error al leer backgrounds/manifest.json. Mirá la consola para más detalle.";
    }
    return [];
  }
}

function safeFileName(name, fallbackExt = "jpg") {
  const base = String(name || "fondo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `${base || "fondo"}.${fallbackExt}`;
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = String(dataUrl).split(",");
  const mime = (header.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function pickBackgroundsDirectory() {
  if (!window.showDirectoryPicker) {
    $("bgStatus").textContent =
      "Tu navegador no permite elegir carpeta. Usá Chrome o Edge, o copiá los archivos a mano a backgrounds/.";
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({
      id: "recetas-backgrounds",
      mode: "readwrite",
      startIn: "documents",
    });
    await rememberBackgroundsDirectory(handle);
    return handle;
  } catch (err) {
    if (err?.name === "AbortError") return null;
    throw err;
  }
}

async function getWritableBackgroundsDirectory({ forcePick = false } = {}) {
  if (!forcePick) {
    if (state.backgroundsDirHandle && (await ensureDirPermission(state.backgroundsDirHandle))) {
      return state.backgroundsDirHandle;
    }
    const saved = await loadSavedBackgroundsDirectory();
    if (saved) return saved;
  }
  return pickBackgroundsDirectory();
}

async function writeFileToDirectory(dirHandle, filename, blob) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function buildRepoManifest(extraLocal = []) {
  const fromRepo = state.repoBackgrounds.map((b) => ({
    id: String(b.id).replace(/^repo-/, ""),
    name: b.name.replace(/\s·\srepo$/, ""),
    file: b.file || (b.src || "").replace(/^backgrounds\//, ""),
  }));

  const fromLocal = extraLocal.map((b) => ({
    id: b.exportId || b.id.replace(/^custom-/, "local-"),
    name: b.name,
    file: b.exportFile || safeFileName(b.name, "jpg"),
  }));

  const seen = new Set(fromRepo.map((b) => b.file));
  const merged = [...fromRepo];
  for (const item of fromLocal) {
    if (seen.has(item.file)) continue;
    seen.add(item.file);
    merged.push(item);
  }

  return { backgrounds: merged };
}

function prepareLocalBackgroundsForExport(list = state.customBackgrounds) {
  return list
    .filter((b) => b.dataUrl)
    .map((bg) => {
      const exportFile =
        bg.exportFile ||
        safeFileName(bg.name, bg.dataUrl.includes("image/png") ? "png" : "jpg");
      const exportId = bg.exportId || bg.id.replace(/^custom-/, "");
      return { ...bg, exportFile, exportId };
    });
}

/**
 * Escribe imágenes + manifest.json en la carpeta backgrounds/ del proyecto.
 * Nunca dispara descargas al sistema.
 */
async function writeBackgroundsToRepoFolder(prepared, { forcePick = false } = {}) {
  const dirHandle = await getWritableBackgroundsDirectory({ forcePick });
  if (!dirHandle) return false;

  const manifest = buildRepoManifest(prepared);
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  for (const bg of prepared) {
    await writeFileToDirectory(dirHandle, bg.exportFile, dataUrlToBlob(bg.dataUrl));
  }
  await writeFileToDirectory(dirHandle, "manifest.json", manifestBlob);
  return true;
}

/**
 * Opcional: guardar una copia en la carpeta local backgrounds/.
 * No descarga archivos a Descargas.
 */
async function exportBackgroundsForRepo() {
  const prepared = prepareLocalBackgroundsForExport();
  if (!prepared.length) {
    $("bgStatus").textContent =
      "No hay fondos locales para guardar. Importá uno primero (queda en el navegador).";
    return;
  }

  $("bgStatus").textContent =
    "Elegí la carpeta backgrounds/ del proyecto (no se descarga nada)…";

  try {
    const ok = await writeBackgroundsToRepoFolder(prepared, { forcePick: true });
    if (ok) {
      $("bgStatus").textContent =
        "Guardado en la carpeta elegida (sin descargas). Para publicarlo: commit + push.";
    } else {
      $("bgStatus").textContent =
        "Cancelado. No se descargó ni guardó nada.";
    }
  } catch (err) {
    console.error(err);
    $("bgStatus").textContent =
      "No se pudo escribir en la carpeta. No se descargó nada.";
  }
}

/** Importa al navegador (IndexedDB). Sin descargas ni escritura al disco. */
async function importBackgroundFiles(files) {
  const list = [...files].filter(isImageFile);
  if (!list.length) {
    $("bgStatus").textContent = "Solo se aceptan JPG, PNG o WebP.";
    return;
  }

  $("bgStatus").textContent = `Importando ${list.length} imagen${list.length === 1 ? "" : "es"}…`;
  let lastId = null;

  try {
    for (const file of list) {
      const dataUrl = await optimizeImage(file);
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 28) || "Fondo";
      const exportFile = safeFileName(name, "jpg");
      const bg = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        custom: true,
        dataUrl,
        createdAt: Date.now(),
        exportFile,
        exportId: exportFile.replace(/\.[^.]+$/, ""),
      };
      state.customBackgrounds.unshift(bg);
      await saveCustomBackground(bg);
      lastId = bg.id;
    }

    if (lastId) state.backgroundId = lastId;
    renderBackgroundGrid();
    applyBackgroundToPages();
    $("bgStatus").textContent =
      "Fondo listo en este navegador. No se descargó nada.";
  } catch (err) {
    console.error(err);
    $("bgStatus").textContent = "No se pudo importar la imagen. Probá con un archivo más liviano.";
  }
}

function wireDropZone(dropEl, onFiles) {
  if (!dropEl) return;
  ["dragenter", "dragover"].forEach((evt) => {
    dropEl.addEventListener(evt, (e) => {
      e.preventDefault();
      dropEl.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropEl.addEventListener(evt, (e) => {
      e.preventDefault();
      dropEl.classList.remove("dragover");
    });
  });
  dropEl.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (files?.length) onFiles(files);
  });
}

function wireToolbar() {
  document.addEventListener("selectionchange", cacheSelectionIfEditable);

  $("fontFamily").addEventListener("change", (e) => applyFontFamily(e.target.value));

  const fontSizeInput = $("fontSizeInput");
  const commitTypedSize = () => applyFontSize(fontSizeInput.value);
  // Solo aplicar si el usuario confirma en el campo (Enter) o elige de la lista
  // con el input aún enfocado. Evita que, al hacer clic en la hoja, el blur
  // reaparezca el tamaño anterior sobre otra selección.
  fontSizeInput.addEventListener("change", () => {
    if (document.activeElement === fontSizeInput) {
      commitTypedSize();
    } else {
      scheduleToolbarSync();
    }
  });
  fontSizeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTypedSize();
      fontSizeInput.blur();
    }
  });

  $("lineHeight").addEventListener("change", (e) => applyLineHeight(e.target.value));
  $("textColor").addEventListener("input", (e) => applyTextColor(e.target.value));

  document.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => runInlineCommand(btn.dataset.cmd));
  });

  $("btnBullets").addEventListener("click", applyBullets);
  $("btnIndent").addEventListener("click", () => applyTabIndent(false));
  $("btnOutdent").addEventListener("click", () => applyTabIndent(true));
  const btnTextPanel = $("btnTextPanel");
  if (btnTextPanel) {
    btnTextPanel.addEventListener("click", applyTextPanel);
  }

  const panelOpacity = $("panelOpacity");
  if (panelOpacity) {
    panelOpacity.value = String(state.panelOpacity);
    const label = $("panelOpacityValue");
    if (label) label.textContent = `${state.panelOpacity}%`;

    const lockPanelFromUi = () => {
      opacitySliderDragging = true;
      const panel = findTextPanelNearSelection() || activeTextPanel;
      if (panel && document.body.contains(panel)) setActiveTextPanel(panel);
    };

    panelOpacity.addEventListener("pointerdown", lockPanelFromUi);
    panelOpacity.addEventListener("mousedown", lockPanelFromUi);
    panelOpacity.addEventListener("touchstart", lockPanelFromUi, { passive: true });
    panelOpacity.addEventListener("input", (e) => {
      opacitySliderDragging = true;
      applyPanelOpacity(e.target.value);
    });
    const endDrag = () => {
      opacitySliderDragging = false;
    };
    panelOpacity.addEventListener("pointerup", endDrag);
    panelOpacity.addEventListener("mouseup", endDrag);
    panelOpacity.addEventListener("touchend", endDrag);
    panelOpacity.addEventListener("change", (e) => {
      opacitySliderDragging = false;
      applyPanelOpacity(e.target.value);
    });
  }

  // Clic en un recuadro → queda activo para recalibrar opacidad
  document.addEventListener(
    "pointerdown",
    (e) => {
      const handle = e.target?.closest?.(".text-panel-handle");
      if (handle) {
        startPanelResize(handle, e);
        return;
      }

      const panel = e.target?.closest?.(".text-panel");
      if (panel?.closest?.(".page-content")) {
        setActiveTextPanel(panel);
        const pct = readPanelOpacity(panel);
        if (pct != null) {
          state.panelOpacity = pct;
          syncPanelOpacityControls(pct);
        }
        return;
      }
      // Clic en la hoja fuera de un recuadro (y no en el slider)
      if (
        e.target?.closest?.(".page-content") &&
        !e.target?.closest?.("#panelOpacity") &&
        !opacitySliderDragging
      ) {
        clearActiveTextPanel();
      }
    },
    true
  );

  document.querySelectorAll("[data-align]").forEach((btn) => {
    btn.addEventListener("click", () => applyAlign(btn.dataset.align));
  });

  // Evitar que los botones roben el foco y borren la selección
  document.querySelectorAll(".toolbar .icon-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
  });

  // Al hacer clic o moverse en la hoja, refrescar el panel (incluye caret sin selección)
  document.addEventListener(
    "mouseup",
    (e) => {
      if (e.target?.closest?.(".page-content")) scheduleToolbarSync();
    },
    true
  );
  document.addEventListener(
    "keyup",
    (e) => {
      if (e.target?.closest?.(".page-content")) scheduleToolbarSync();
    },
    true
  );
  document.addEventListener(
    "click",
    (e) => {
      if (e.target?.closest?.(".page-content")) scheduleToolbarSync();
    },
    true
  );

  $("btnAddPage").addEventListener("click", addPage);
  $("btnPrint").addEventListener("click", () => window.print());
  $("btnInsert").addEventListener("click", insertSelected);
  $("btnSelectAll").addEventListener("click", () => {
    document
      .querySelectorAll('#sectionsList input[type="checkbox"]')
      .forEach((el) => {
        el.checked = true;
      });
  });

  $("bgFit").addEventListener("change", (e) => {
    state.bgFit = e.target.value;
    applyBackgroundToPages();
  });

  $("bgOverlay").addEventListener("input", (e) => {
    state.bgOverlay = Number(e.target.value);
    $("overlayValue").textContent = `${state.bgOverlay}%`;
    applyBackgroundToPages();
  });

  const exportBtn = $("btnExportBgs");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportBackgroundsForRepo());
  }
}

function wireFileInputs() {
  const pdfInput = $("pdfInput");
  const bgInput = $("bgInput");

  pdfInput.addEventListener("change", () => {
    const file = pdfInput.files?.[0];
    if (file) loadPdf(file);
  });

  bgInput.addEventListener("change", () => {
    if (bgInput.files?.length) {
      importBackgroundFiles(bgInput.files);
      bgInput.value = "";
    }
  });

  wireDropZone(pdfInput.closest(".file-drop"), (files) => {
    const file = files[0];
    if (file?.type === "application/pdf") loadPdf(file);
    else $("pdfStatus").textContent = "Solo se aceptan archivos PDF.";
  });

  wireDropZone(bgInput.closest(".file-drop"), (files) => {
    importBackgroundFiles(files);
  });
}

async function initApp() {
  clearLegacyLocalStorageBackup();
  loadPrefs();
  await loadSavedBackgroundsDirectory();

  try {
    state.repoBackgrounds = await loadRepoBackgrounds();
  } catch (err) {
    console.error(err);
    state.repoBackgrounds = [];
  }

  try {
    state.customBackgrounds = await loadCustomBackgrounds();
    await backupBackgroundsToLocalStorage();
  } catch (err) {
    console.error(err);
    state.customBackgrounds = [];
  }

  if (
    state.backgroundId !== "plain" &&
    !allBackgrounds().some((b) => b.id === state.backgroundId)
  ) {
    state.backgroundId = state.repoBackgrounds[0]?.id || "plain";
  }

  renderBackgroundGrid();
  ensurePages(1);
  wireToolbar();
  wireEditorKeys();
  wireMobileNav();
  wireFileInputs();
  wirePageScale();
  applyBackgroundToPages();
}

let started = false;
function boot() {
  if (started) return;
  if (window.__RECETAS_READY || !$("app")?.hidden) {
    started = true;
    initApp();
  }
}

document.addEventListener("recetas:ready", () => {
  if (started) return;
  started = true;
  initApp();
});
boot();
