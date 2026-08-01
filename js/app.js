import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const PLAIN_BACKGROUND = { id: "plain", name: "Hoja blanca", custom: false, plain: true };

const DB_NAME = "recetas-a4";
const DB_STORE = "backgrounds";
const PREFS_KEY = "recetas_bg_prefs";
const BG_BACKUP_KEY = "recetas_bgs_backup";

const state = {
  backgroundId: "plain",
  customBackgrounds: [],
  repoBackgrounds: [],
  bgFit: "cover",
  bgOverlay: 28,
  sections: [],
  activePageIndex: 0,
  pageCount: 1,
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
    })
  );
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
    console.warn("IndexedDB no disponible, usando respaldo local", err);
  }

  if (!items.length) {
    try {
      const raw = localStorage.getItem(BG_BACKUP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          items = parsed;
          // Rehidratar IndexedDB en segundo plano
          for (const bg of items) {
            try {
              await saveCustomBackground(bg, false);
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return items
    .filter((b) => b && b.id && b.dataUrl)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function backupBackgroundsToLocalStorage(list) {
  try {
    localStorage.setItem(BG_BACKUP_KEY, JSON.stringify(list));
  } catch (err) {
    // Cuota llena: guardar solo los más recientes hasta que entre
    console.warn("No se pudo respaldar todos los fondos en localStorage", err);
    const trimmed = [...list];
    while (trimmed.length > 0) {
      trimmed.pop();
      try {
        localStorage.setItem(BG_BACKUP_KEY, JSON.stringify(trimmed));
        break;
      } catch {
        /* seguir recortando */
      }
    }
  }
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

/** Comprime/redimensiona para no saturar IndexedDB. */
async function optimizeImage(file) {
  const rawUrl = await readFileAsDataUrl(file);
  const img = await loadImage(rawUrl);
  const maxEdge = 2200;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const quality = mime === "image/jpeg" ? 0.86 : undefined;
  return canvas.toDataURL(mime, quality);
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

    if (!bg.repo) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "bg-delete";
      del.title = "Quitar fondo local";
      del.setAttribute("aria-label", `Eliminar ${bg.name}`);
      del.textContent = "×";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
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
    }

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

  const html = selected
    .map((s) => {
      const lines = escapeHtml(s.text).split("\n");
      const title = escapeHtml(
        s.kind === "page" ? `Página ${s.page}` : s.title.split("\n")[0]
      );
      const body = lines.map((line) => (line ? line : "<br>")).join("<br>");
      return `<div class="block"><h3 class="block-title">${title}</h3><div>${body}</div></div>`;
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

function cacheSelectionIfEditable() {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;
  const editable = getSelectionEditable();
  if (!editable) return;
  try {
    savedRange = sel.getRangeAt(0).cloneRange();
    const pages = [...document.querySelectorAll(".page-content")];
    const idx = pages.indexOf(editable);
    if (idx >= 0) state.activePageIndex = idx;
  } catch {
    /* ignore */
  }
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

function applyAlign(align) {
  const map = {
    left: "justifyLeft",
    center: "justifyCenter",
    right: "justifyRight",
    justify: "justifyFull",
  };
  // Restaurar selección/caret dentro de la hoja; la alineación actúa sobre el bloque
  if (!restoreSavedSelection()) {
    getActiveContent()?.focus();
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

async function loadRepoBackgrounds() {
  try {
    const res = await fetch("backgrounds/manifest.json", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.backgrounds) ? data.backgrounds : [];
    return list
      .filter((b) => b && (b.file || b.src))
      .map((b, i) => {
        const file = b.file || b.src;
        const id = `repo-${b.id || file || i}`;
        return {
          id,
          name: b.name || file,
          custom: true,
          repo: true,
          file,
          src: file.startsWith("http") || file.startsWith("backgrounds/")
            ? file
            : `backgrounds/${file}`,
        };
      });
  } catch (err) {
    console.warn("No se pudo leer backgrounds/manifest.json", err);
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

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
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

  // Evitar duplicar por nombre de archivo
  const seen = new Set(fromRepo.map((b) => b.file));
  const merged = [...fromRepo];
  for (const item of fromLocal) {
    if (seen.has(item.file)) continue;
    seen.add(item.file);
    merged.push(item);
  }

  return {
    backgrounds: merged,
  };
}

function downloadManifestForRepo(extraLocal = []) {
  const manifest = buildRepoManifest(extraLocal);
  const text = JSON.stringify(manifest, null, 2);
  downloadBlob(
    "manifest.json",
    new Blob([text], { type: "application/json;charset=utf-8" })
  );
}

async function exportBackgroundsForRepo() {
  const locals = state.customBackgrounds.filter((b) => b.dataUrl);
  if (!locals.length && !state.repoBackgrounds.length) {
    $("bgStatus").textContent = "No hay fondos para exportar.";
    return;
  }

  const prepared = [];
  for (const bg of locals) {
    const exportFile = safeFileName(bg.name, bg.dataUrl.includes("image/png") ? "png" : "jpg");
    const exportId = bg.id.replace(/^custom-/, "");
    prepared.push({ ...bg, exportFile, exportId });
    downloadDataUrl(exportFile, bg.dataUrl);
    await new Promise((r) => setTimeout(r, 250));
  }

  downloadManifestForRepo(prepared);
  $("bgStatus").textContent =
    "Se descargaron las imágenes y manifest.json. Subilos a la carpeta backgrounds/ del repo y hacé push.";
}

async function importBackgroundFiles(files) {
  const list = [...files].filter(isImageFile);
  if (!list.length) {
    $("bgStatus").textContent = "Solo se aceptan JPG, PNG o WebP.";
    return;
  }

  $("bgStatus").textContent = `Importando ${list.length} imagen${list.length === 1 ? "" : "es"}…`;
  let lastId = null;
  const prepared = [];

  try {
    for (const file of list) {
      const dataUrl = await optimizeImage(file);
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 28) || "Fondo";
      const exportFile = safeFileName(name, file.type === "image/png" ? "png" : "jpg");
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
      downloadDataUrl(exportFile, dataUrl);
      prepared.push(bg);
      lastId = bg.id;
      await new Promise((r) => setTimeout(r, 200));
    }

    if (lastId) state.backgroundId = lastId;
    downloadManifestForRepo(prepared);
    renderBackgroundGrid();
    applyBackgroundToPages();
    $("bgStatus").textContent =
      "Fondos listos. Se descargaron las imágenes + manifest.json: subilos a backgrounds/ en GitHub y hacé push.";
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
  fontSizeInput.addEventListener("change", commitTypedSize);
  fontSizeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTypedSize();
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

  document.querySelectorAll("[data-align]").forEach((btn) => {
    btn.addEventListener("click", () => applyAlign(btn.dataset.align));
  });

  // Evitar que los botones roben el foco y borren la selección
  document.querySelectorAll(".toolbar .icon-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
  });

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
  loadPrefs();

  try {
    state.repoBackgrounds = await loadRepoBackgrounds();
  } catch (err) {
    console.error(err);
    state.repoBackgrounds = [];
  }

  try {
    state.customBackgrounds = await loadCustomBackgrounds();
    await backupBackgroundsToLocalStorage(state.customBackgrounds);
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
