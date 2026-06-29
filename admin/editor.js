import {
  blankBlock,
  blankDoc,
  blankPart,
  basename,
  deepClone,
  escapeHTML,
  joinCommaList,
  kindToFolder,
  makeCountryIndexEntry,
  normalizeDoc,
  parseCommaList,
  prettyJSON,
  saveJSON,
  slugify,
  upsertCountryIndex,
} from "./schema.js";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("fileInput");

let doc = blankDoc("country");
let currentFilePath = "countries/japon.json";
let countryIndex = [];
let currentIndexSource = "../data/country-index.json";

setStatus("Chargement de l’index pays…");
await loadCountryIndex();
render();

function setStatus(message) {
  statusEl.textContent = message;
}

async function loadCountryIndex() {
  try {
    const res = await fetch(currentIndexSource, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    countryIndex = await res.json();
    setStatus(`Index pays chargé : ${countryIndex.length} entrée(s).`);
  } catch (error) {
    countryIndex = [];
    setStatus("Index pays introuvable ou non chargé. Tu peux quand même éditer une fiche.");
    console.warn(error);
  }
}

function safeValue(value) {
  return escapeHTML(String(value ?? ""));
}

function parsePath(path) {
  return String(path)
    .split(".")
    .filter(Boolean)
    .map((token) => (/^\d+$/.test(token) ? Number(token) : token));
}

function setByPath(root, path, value) {
  const clone = deepClone(root);
  const parts = parsePath(path);
  let cursor = clone;

  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor = cursor[parts[i]];
  }
  cursor[parts.at(-1)] = value;
  return clone;
}

function updateArrayAtPath(root, arrayPath, updater) {
  const clone = deepClone(root);
  const parts = parsePath(arrayPath);
  let cursor = clone;

  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor = cursor[parts[i]];
  }

  const key = parts.at(-1);
  const current = Array.isArray(cursor[key]) ? cursor[key] : [];
  cursor[key] = updater(current);
  return clone;
}

function removeItemAtPath(root, arrayPath, index) {
  return updateArrayAtPath(root, arrayPath, (arr) => {
    const next = arr.slice();
    next.splice(index, 1);
    return next;
  });
}

function moveItemAtPath(root, arrayPath, index, direction) {
  return updateArrayAtPath(root, arrayPath, (arr) => {
    const next = arr.slice();
    const target = index + direction;
    if (target < 0 || target >= next.length) return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

function render() {
  const indexEntryPreview = doc.kind === "country"
    ? JSON.stringify(makeCountryIndexEntry(doc, currentFilePath), null, 2)
    : "Le module d’index concerne surtout les fiches pays.";

  app.innerHTML = `
    <section class="card sidebar">
      <div class="card-header">
        <h2>Bibliothèque</h2>
      </div>
      <div class="card-body">
        <div class="help">
          Tu peux ouvrir une fiche existante depuis l’index, ou importer un JSON local.
        </div>

        <div class="button-row">
          <button type="button" data-action="reload-index">Recharger l’index</button>
          <button type="button" data-action="import-file">Importer JSON</button>
        </div>

        <div class="field-grid">
          <label>
            Type de fiche
            <select id="kindSelect" data-path="kind">
              <option value="country" ${doc.kind === "country" ? "selected" : ""}>Pays</option>
              <option value="topic" ${doc.kind === "topic" ? "selected" : ""}>Topic</option>
              <option value="point" ${doc.kind === "point" ? "selected" : ""}>Point</option>
            </select>
          </label>

          <label>
            Chemin du fichier dans /data
            <input id="filePathInput" value="${safeValue(currentFilePath)}" placeholder="countries/jpn.json" />
          </label>

          <div class="button-row">
            <button type="button" class="primary" data-action="new-doc">Nouveau</button>
            <button type="button" data-action="suggest-path">Suggérer le chemin</button>
            <button type="button" data-action="save-doc">Enregistrer / Télécharger</button>
          </div>
        </div>

        <div>
          <h3>Pays connus</h3>
          <div class="country-list">
            ${
              countryIndex.length
                ? countryIndex
                    .map(
                      (entry) => `
                        <div class="country-item">
                          <button type="button" data-action="open-country" data-file="${safeValue(
                            entry.file || ""
                          )}">
                            ${safeValue(entry.name || entry.iso_a3 || entry.file || "Sans nom")}
                          </button>
                          <small>${safeValue(entry.file || "")}</small>
                        </div>`
                    )
                    .join("")
                : `<div class="help">Aucune entrée chargée.</div>`
            }
          </div>
        </div>
      </div>
    </section>

    <section class="card editor">
      <div class="card-header">
        <h2>Fiche en cours</h2>
      </div>

      <div class="toolbar">
        <div class="toolbar-grid">
          <label>
            Identifiant
            <input data-path="id" value="${safeValue(doc.id)}" placeholder="jpn" />
          </label>

          <label>
            Nom
            <input data-path="name" value="${safeValue(doc.name)}" placeholder="Japon" />
          </label>
        </div>

        <div class="toolbar-grid">
          <label>
            ISO A3
            <input data-path="iso_a3" value="${safeValue(doc.iso_a3)}" placeholder="JPN" />
          </label>

          <label>
            Aliases (séparés par des virgules)
            <input data-path="aliases" value="${safeValue(joinCommaList(doc.aliases))}" placeholder="Japan, Nippon" />
          </label>
        </div>

        <label>
          Sous-titre
          <input data-path="subtitle" value="${safeValue(doc.subtitle)}" placeholder="Exemple de fiche complète" />
        </label>

        <div class="button-row">
          <button type="button" data-action="add-top-section">Ajouter une section</button>
          <button type="button" data-action="copy-index-entry">Copier l’entrée d’index</button>
          ${
            doc.kind === "country"
              ? `<button type="button" data-action="save-index">Enregistrer / Télécharger country-index.json</button>`
              : ""
          }
        </div>

        <div class="index-preview">
          <div class="small">
            Prévisualisation de l’entrée d’index générée depuis cette fiche
          </div>
          <pre>${safeValue(indexEntryPreview)}</pre>
        </div>
      </div>

      <div class="card-body">
        ${renderSections(doc.sections, "sections", 0)}
      </div>
    </section>

    <section class="card preview">
      <div class="card-header">
        <h2>JSON final</h2>
      </div>
      <div class="card-body">
        <textarea id="jsonPreview" readonly></textarea>
      </div>
    </section>
  `;

  document.getElementById("jsonPreview").value = prettyJSON(doc);
  document.getElementById("filePathInput").value = currentFilePath;
}

function renderSections(sections, arrayPath, depth) {
  return (sections || [])
    .map((section, index) => renderSection(section, arrayPath, index, depth))
    .join("");
}

function renderSection(section, parentArrayPath, index, depth) {
  const sectionPath = `${parentArrayPath}.${index}`;
  const blocks = Array.isArray(section.blocks) ? section.blocks : [];

  return `
    <div class="section-card depth-${Math.min(depth, 3)}">
      <div class="section-head">
        <strong>${depth === 0 ? "Section" : "Sous-section"} ${index + 1}</strong>
        <div class="inline-actions">
          <button type="button" data-action="move-up" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">↑</button>
          <button type="button" data-action="move-down" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">↓</button>
          <button type="button" class="danger" data-action="remove-item" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">Suppr.</button>
        </div>
      </div>

      <div class="section-body">
        <div class="field-grid">
          <label>
            Titre
            <input data-path="${safeValue(sectionPath)}.title" value="${safeValue(section.title)}" />
          </label>
          <label>
            Sous-titre
            <input data-path="${safeValue(sectionPath)}.subtitle" value="${safeValue(section.subtitle)}" />
          </label>
        </div>

        <div class="button-row" style="margin-top:12px">
          <button type="button" data-action="add-block" data-parent="${safeValue(sectionPath)}.blocks" data-type="bullet">+ Bullet</button>
          <button type="button" data-action="add-block" data-parent="${safeValue(sectionPath)}.blocks" data-type="paragraph">+ Paragraphe</button>
          <button type="button" data-action="add-block" data-parent="${safeValue(sectionPath)}.blocks" data-type="quote">+ Citation</button>
          <button type="button" data-action="add-block" data-parent="${safeValue(sectionPath)}.blocks" data-type="section">+ Sous-section</button>
        </div>

        <div class="blocks" style="margin-top:12px">
          ${renderBlocks(blocks, `${sectionPath}.blocks`, depth + 1)}
        </div>
      </div>
    </div>
  `;
}

function renderBlocks(blocks, parentArrayPath, depth) {
  return (blocks || [])
    .map((block, index) => renderBlock(block, parentArrayPath, index, depth))
    .join("");
}

function renderBlock(block, parentArrayPath, index, depth) {
  const blockPath = `${parentArrayPath}.${index}`;
  const wrapperDepth = Math.min(depth, 3);

  if (block.type === "section") {
    return renderSection(block, parentArrayPath, index, wrapperDepth);
  }

  if (block.type === "quote") {
    return `
      <div class="block-card">
        <div class="block-head">
          <strong>Citation</strong>
          <div class="inline-actions">
            <button type="button" data-action="move-up" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">↑</button>
            <button type="button" data-action="move-down" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">↓</button>
            <button type="button" class="danger" data-action="remove-item" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">Suppr.</button>
          </div>
        </div>
        <div class="block-body">
          <label>
            Texte
            <textarea data-path="${safeValue(blockPath)}.value">${safeValue(block.value)}</textarea>
          </label>
        </div>
      </div>
    `;
  }

  const parts = Array.isArray(block.parts) ? block.parts : [blankPart("text")];

  return `
    <div class="block-card">
      <div class="block-head">
        <strong>${block.type === "paragraph" ? "Paragraphe" : "Bullet"}</strong>
        <div class="inline-actions">
          <button type="button" data-action="move-up" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">↑</button>
          <button type="button" data-action="move-down" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">↓</button>
          <button type="button" class="danger" data-action="remove-item" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">Suppr.</button>
        </div>
      </div>

      <div class="block-body">
        ${renderParts(parts, `${blockPath}.parts`, block.type)}
      </div>
    </div>
  `;
}

function renderParts(parts, parentArrayPath, blockType) {
  return `
    <div class="parts">
      ${(parts || [])
        .map((part, index) => {
          const partPath = `${parentArrayPath}.${index}`;
          const type = part.type || "text";

          return `
            <div class="part-row ${type === "link" ? "link" : ""}">
              <select data-path="${safeValue(partPath)}.type">
                <option value="text" ${type === "text" ? "selected" : ""}>Texte</option>
                <option value="link" ${type === "link" ? "selected" : ""}>Lien</option>
                <option value="em" ${type === "em" ? "selected" : ""}>Emphase</option>
              </select>

              ${
                type === "link"
                  ? `
                    <input data-path="${safeValue(partPath)}.label" value="${safeValue(part.label || part.value || "")}" placeholder="Label" />
                    <input data-path="${safeValue(partPath)}.target" value="${safeValue(part.target || "")}" placeholder="data/topics/..." />
                  `
                  : `
                    <input data-path="${safeValue(partPath)}.value" value="${safeValue(part.value || part.label || "")}" placeholder="${
                      type === "em" ? "Texte en emphase" : "Texte"
                    }" />
                  `
              }

              <button type="button" class="danger" data-action="remove-item" data-parent="${safeValue(parentArrayPath)}" data-index="${index}">Suppr.</button>
            </div>
          `;
        })
        .join("")}

      <div class="button-row">
        <button type="button" data-action="add-part" data-parent="${safeValue(parentArrayPath)}" data-type="text">+ Morceau texte</button>
        <button type="button" data-action="add-part" data-parent="${safeValue(parentArrayPath)}" data-type="link">+ Morceau lien</button>
        <button type="button" data-action="add-part" data-parent="${safeValue(parentArrayPath)}" data-type="em">+ Morceau emphase</button>
      </div>
    </div>
  `;
}

function refreshFromDocChanges() {
  render();
}

function currentSuggestedPath() {
  const folder = kindToFolder(doc.kind);
  const base = slugify(doc.id || doc.name || "nouveau-contenu") || "nouveau-contenu";
  return `${folder}/${base}.json`;
}

function upsertCurrentIndex() {
  if (doc.kind !== "country") return null;
  const entry = makeCountryIndexEntry(doc, currentFilePath);
  countryIndex = upsertCountryIndex(countryIndex, entry);
  return entry;
}

async function loadDocumentFromRepoPath(repoPath) {
  const path = `../data/${repoPath}`;
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Impossible de charger ${repoPath}`);
  const raw = await res.json();
  doc = normalizeDoc(raw);
  currentFilePath = repoPath;
  setStatus(`Fiche chargée : ${repoPath}`);
  refreshFromDocChanges();
}

async function importLocalFile(file) {
  const text = await file.text();
  const raw = JSON.parse(text);
  doc = normalizeDoc(raw);
  if (!currentFilePath || currentFilePath === "countries/japon.json") {
    currentFilePath = file.name || currentSuggestedPath();
  }
  setStatus(`Fichier importé : ${file.name}`);
  refreshFromDocChanges();
}

async function exportCurrentDoc() {
  const filename = basename(currentFilePath || currentSuggestedPath());
  await saveJSON(filename, doc);
  setStatus(`Fiche exportée : ${filename}`);
}

async function exportCountryIndex() {
  if (doc.kind !== "country") {
    setStatus("L’export de country-index.json concerne surtout les fiches pays.");
    return;
  }

  upsertCurrentIndex();
  await saveJSON("country-index.json", countryIndex);
  setStatus("country-index.json exporté.");
  render();
}

async function copyIndexEntryToClipboard() {
  if (doc.kind !== "country") {
    setStatus("L’entrée d’index concerne surtout les fiches pays.");
    return;
  }

  const entry = makeCountryIndexEntry(doc, currentFilePath);
  await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
  setStatus("Entrée d’index copiée dans le presse-papiers.");
}

app.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;

  try {
    if (action === "reload-index") {
      await loadCountryIndex();
      render();
      return;
    }

    if (action === "import-file") {
      fileInput.value = "";
      fileInput.click();
      return;
    }

    if (action === "new-doc") {
      doc = blankDoc(document.getElementById("kindSelect")?.value || "country");
      currentFilePath = currentSuggestedPath();
      setStatus("Nouvelle fiche créée.");
      refreshFromDocChanges();
      return;
    }

    if (action === "suggest-path") {
      currentFilePath = currentSuggestedPath();
      setStatus(`Chemin suggéré : ${currentFilePath}`);
      refreshFromDocChanges();
      return;
    }

    if (action === "save-doc") {
      await exportCurrentDoc();
      return;
    }

    if (action === "save-index") {
      await exportCountryIndex();
      return;
    }

    if (action === "copy-index-entry") {
      await copyIndexEntryToClipboard();
      return;
    }

    if (action === "open-country") {
      const file = btn.dataset.file;
      if (file) await loadDocumentFromRepoPath(file);
      return;
    }

    if (action === "add-top-section") {
      doc.sections.push(blankDoc(doc.kind).sections[0]);
      setStatus("Section ajoutée.");
      refreshFromDocChanges();
      return;
    }

    if (action === "add-block") {
      const parent = btn.dataset.parent;
      const type = btn.dataset.type || "bullet";
      doc = updateArrayAtPath(doc, parent, (arr) => [...arr, blankBlock(type)]);
      setStatus(`Bloc ajouté : ${type}.`);
      refreshFromDocChanges();
      return;
    }

    if (action === "add-part") {
      const parent = btn.dataset.parent;
      const type = btn.dataset.type || "text";
      doc = updateArrayAtPath(doc, parent, (arr) => [...arr, blankPart(type)]);
      setStatus(`Morceau ajouté : ${type}.`);
      refreshFromDocChanges();
      return;
    }

    if (action === "remove-item") {
      const parent = btn.dataset.parent;
      const index = Number(btn.dataset.index);
      doc = removeItemAtPath(doc, parent, index);
      setStatus("Élément supprimé.");
      refreshFromDocChanges();
      return;
    }

    if (action === "move-up") {
      const parent = btn.dataset.parent;
      const index = Number(btn.dataset.index);
      doc = moveItemAtPath(doc, parent, index, -1);
      refreshFromDocChanges();
      return;
    }

    if (action === "move-down") {
      const parent = btn.dataset.parent;
      const index = Number(btn.dataset.index);
      doc = moveItemAtPath(doc, parent, index, +1);
      refreshFromDocChanges();
      return;
    }
  } catch (error) {
    console.error(error);
    setStatus(`Erreur : ${error.message}`);
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!target.matches("[data-path], #filePathInput, #kindSelect")) return;

  if (target.id === "filePathInput") {
    currentFilePath = target.value.trim() || currentSuggestedPath();
    setStatus(`Chemin mis à jour : ${currentFilePath}`);
    return;
  }

  if (target.id === "kindSelect") {
    doc = setByPath(doc, "kind", target.value);
    setStatus(`Type de fiche : ${target.value}`);
    refreshFromDocChanges();
    return;
  }

  const path = target.dataset.path;
  if (!path) return;

  if (path === "aliases") {
    doc = setByPath(doc, path, parseCommaList(target.value));
    refreshFromDocChanges();
    return;
  }

  if (path.endsWith(".type")) {
    const parentPath = path.slice(0, -5);
    const oldValue = target.value;
    doc = setByPath(doc, parentPath, (() => {
      const current = parentPath.split(".").reduce((acc, key) => acc?.[key], doc) || {};
      if (oldValue === "link") {
        return { type: "link", label: current.label || current.value || "", target: current.target || "" };
      }
      if (oldValue === "em") {
        return { type: "em", value: current.value || current.label || "" };
      }
      return { type: "text", value: current.value || current.label || "" };
    })());
    refreshFromDocChanges();
    return;
  }

  doc = setByPath(doc, path, target.value);
  refreshFromDocChanges();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    await importLocalFile(file);
  } catch (error) {
    console.error(error);
    setStatus(`Import impossible : ${error.message}`);
  }
});