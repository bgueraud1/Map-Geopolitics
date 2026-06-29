const COUNTRIES_GEOJSON_URL =
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

const DATA_BASE = "./data/";

const map = L.map("map", {
  worldCopyJump: true,
  minZoom: 2,
  maxZoom: 8,
}).setView([20, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
}).addTo(map);

/* Z-order clair :
   - pays dessous
   - points dessus
*/
map.createPane("countryPane");
map.getPane("countryPane").style.zIndex = 350;

map.createPane("pointPane");
map.getPane("pointPane").style.zIndex = 650;

const popupOverlay = document.getElementById("popupOverlay");
const popupTitle = document.getElementById("popupTitle");
const popupSubtitle = document.getElementById("popupSubtitle");
const popupBody = document.getElementById("popupBody");
const closeBtn = document.getElementById("closeBtn");
const backBtn = document.getElementById("backBtn");

let currentRecord = null;
const popupStack = [];

const countryIndexByKey = new Map();
let countryLayer = null;
const pointsLayer = L.layerGroup().addTo(map);

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolvePath(path) {
  if (!path) return path;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("/")) return path;
  return path.startsWith("data/") ? `./${path}` : `${DATA_BASE}${path}`;
}

async function loadJSON(path) {
  const response = await fetch(resolvePath(path), { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Impossible de charger ${path} (${response.status})`);
  }
  return response.json();
}

function registerCountryEntry(item) {
  if (!item || typeof item !== "object") return;

  const keys = new Set();

  if (item.iso_a3) keys.add(item.iso_a3);
  if (item.name) keys.add(item.name);
  if (Array.isArray(item.aliases)) {
    for (const alias of item.aliases) keys.add(alias);
  }

  for (const key of keys) {
    countryIndexByKey.set(normalize(key), item);
  }
}

function getFeatureIsoA3(properties = {}) {
  return (
    properties.ISO_A3 ||
    properties.iso_a3 ||
    properties.ADM0_A3 ||
    properties.adm0_a3 ||
    properties.ISO3 ||
    ""
  );
}

function getFeatureNames(properties = {}) {
  return [
    properties.NAME_FR,
    properties.NAME_EN,
    properties.NAME,
    properties.ADMIN,
    properties.name,
    properties.FORMAL_FR,
    properties.FORMAL_EN,
    properties.SOVEREIGNT,
    properties.sovereignt,
  ].filter(Boolean);
}

function renderParts(parts = []) {
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (part.type === "text") return escapeHTML(part.value);
      if (part.type === "link") {
        const label = part.label || part.target || "Lien";
        return `<button type="button" class="inline-link" data-target="${escapeHTML(
          part.target || ""
        )}" data-label="${escapeHTML(label)}">${escapeHTML(label)}</button>`;
      }
      if (part.type === "em") {
        return `<em>${escapeHTML(part.value)}</em>`;
      }
      return "";
    })
    .join("");
}

function renderBlocks(blocks = [], depth = 0) {
  let html = "";
  let bulletGroup = [];

  const flushBullets = () => {
    if (!bulletGroup.length) return;
    html += `<ul class="bullet-list">`;
    html += bulletGroup
      .map((bullet) => `<li>${renderParts(bullet.parts || [])}</li>`)
      .join("");
    html += `</ul>`;
    bulletGroup = [];
  };

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;

    if (block.type === "bullet") {
      bulletGroup.push(block);
      continue;
    }

    flushBullets();

    if (block.type === "paragraph") {
      html += `<p class="paragraph">${renderParts(block.parts || [])}</p>`;
      continue;
    }

    if (block.type === "quote") {
      html += `<blockquote>${escapeHTML(block.value || "")}</blockquote>`;
      continue;
    }

    if (block.type === "section") {
      html += renderSection(block, depth + 1);
    }
  }

  flushBullets();
  return html;
}

function renderSection(section, depth = 0) {
  const tag = depth === 0 ? "h3" : depth === 1 ? "h4" : "h5";
  const title = escapeHTML(section.title || "");
  const subtitle = section.subtitle
    ? `<p class="section-subtitle">${escapeHTML(section.subtitle)}</p>`
    : "";

  return `
    <section class="content-section depth-${depth}">
      <${tag}>${title}</${tag}>
      ${subtitle}
      ${renderBlocks(section.blocks || [], depth)}
    </section>
  `;
}

function normalizeRecord(record, fallbackTitle = "") {
  const safe = record && typeof record === "object" ? record : {};
  return {
    id: safe.id || normalize(safe.name || fallbackTitle),
    name: safe.name || fallbackTitle || "Sans titre",
    subtitle: safe.subtitle || "",
    sections: Array.isArray(safe.sections) ? safe.sections : [],
  };
}

function buildFallbackCountryRecord({ name, iso }) {
  return normalizeRecord(
    {
      id: normalize(iso || name),
      name,
      subtitle: iso ? `Code ISO : ${iso}` : "Fiche automatique",
      sections: [
        {
          title: "Informations générales",
          blocks: [
            {
              type: "bullet",
              parts: [{ type: "text", value: `Nom du pays : ${name}` }],
            },
            {
              type: "bullet",
              parts: [
                {
                  type: "text",
                  value:
                    "Ce contenu est généré automatiquement tant qu’aucun fichier dédié n’existe.",
                },
              ],
            },
          ],
        },
        {
          title: "Politique",
          blocks: [
            {
              type: "bullet",
              parts: [
                {
                  type: "text",
                  value:
                    "Zone prévue pour les institutions, la gouvernance, les élections et les repères politiques.",
                },
              ],
            },
          ],
        },
        {
          title: "Actualités",
          blocks: [
            {
              type: "bullet",
              parts: [
                {
                  type: "text",
                  value:
                    "Zone prévue pour un résumé d’actualité, des alertes ou des notes éditoriales.",
                },
              ],
            },
          ],
        },
      ],
    },
    name
  );
}

function buildFallbackPointRecord({ name, subtitle, file }) {
  return normalizeRecord({
    id: normalize(name),
    name: name || "Point cliquable",
    subtitle:
      subtitle ||
      (file ? `Fichier introuvable : ${file}` : "Fiche de point géocodé"),
    sections: [
      {
        title: "Informations générales",
        blocks: [
          {
            type: "bullet",
            parts: [{ type: "text", value: "Ce point est cliquable sur la carte." }],
          },
        ],
      },
      {
        title: "Politique",
        blocks: [
          {
            type: "bullet",
            parts: [
              {
                type: "text",
                value:
                  "Tu peux y mettre un focus local, institutionnel ou territorial.",
              },
            ],
          },
        ],
      },
      {
        title: "Actualités",
        blocks: [
          {
            type: "bullet",
            parts: [
              {
                type: "text",
                value:
                  "Ce bloc peut servir à lister des événements, des signaux faibles ou des notes d’actualité.",
              },
            ],
          },
        ],
      },
    ],
  });
}

function renderRecord(record) {
  const safe = normalizeRecord(record);

  popupTitle.textContent = safe.name;
  popupSubtitle.textContent = safe.subtitle || "";

  if (!safe.sections.length) {
    popupBody.innerHTML = `<div class="empty-state">Aucun contenu disponible.</div>`;
    return;
  }

  popupBody.innerHTML = safe.sections.map((section) => renderSection(section, 0)).join("");
}

function syncPopupUI() {
  popupOverlay.classList.remove("hidden");
  popupOverlay.setAttribute("aria-hidden", "false");
  backBtn.classList.toggle("hidden", popupStack.length === 0);
}

function showRecord(record, pushCurrent = true) {
  if (pushCurrent && currentRecord) {
    popupStack.push(currentRecord);
  }
  currentRecord = normalizeRecord(record);
  renderRecord(currentRecord);
  syncPopupUI();
}

function closePopup() {
  popupStack.length = 0;
  currentRecord = null;
  popupOverlay.classList.add("hidden");
  popupOverlay.setAttribute("aria-hidden", "true");
  popupBody.innerHTML = "";
}

function goBack() {
  if (!popupStack.length) return;
  currentRecord = popupStack.pop();
  renderRecord(currentRecord);
  syncPopupUI();
}

async function openTarget(target, fallbackTitle = "") {
  try {
    const record = await loadJSON(target);
    showRecord(normalizeRecord(record, fallbackTitle));
  } catch (error) {
    console.warn(error);
    showRecord(
      buildFallbackPointRecord({
        name: fallbackTitle || target,
        subtitle: `Sous-popup non trouvé : ${target}`,
        file: target,
      })
    );
  }
}

async function openCountry(feature) {
  const props = feature?.properties || {};
  const iso = getFeatureIsoA3(props);
  const names = getFeatureNames(props);

  const candidates = [iso, ...names];

  for (const candidate of candidates) {
    const hit = countryIndexByKey.get(normalize(candidate));
    if (hit?.file) {
      try {
        const record = await loadJSON(hit.file);
        showRecord(normalizeRecord(record, names[0] || candidate));
        return;
      } catch (error) {
        console.warn(error);
      }
    }
  }

  showRecord(
    buildFallbackCountryRecord({
      name: names[0] || "Pays inconnu",
      iso,
    })
  );
}

function addPoint(point) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;

  const marker = L.circleMarker([point.lat, point.lng], {
    pane: "pointPane",
    radius: 8,
    color: "#0f172a",
    weight: 2,
    fillColor: "#2563eb",
    fillOpacity: 1,
  });

  marker.addTo(pointsLayer);

  if (point.name) {
    marker.bindTooltip(point.name, { sticky: true });
  }

  marker.on("click", async () => {
    if (point.record) {
      showRecord(normalizeRecord(point.record, point.name));
      return;
    }

    if (point.file) {
      await openTarget(point.file, point.name);
      return;
    }

    showRecord(buildFallbackPointRecord(point));
  });
}

function styleCountry() {
  return {
    pane: "countryPane",
    color: "#334155",
    weight: 0.5,
    fillColor: "#93c5fd",
    fillOpacity: 0.16,
  };
}

function highlightCountry(e) {
  const layer = e.target;
  layer.setStyle({
    weight: 1.6,
    fillOpacity: 0.32,
  });
  layer.bringToFront();
}

function resetCountry(e) {
  if (countryLayer) {
    countryLayer.resetStyle(e.target);
  }
}

async function init() {
  closeBtn.addEventListener("click", closePopup);
  backBtn.addEventListener("click", goBack);

  popupBody.addEventListener("click", (event) => {
    const target = event.target.closest("[data-target]");
    if (!target) return;
    event.preventDefault();
    const file = target.getAttribute("data-target");
    const label = target.getAttribute("data-label") || target.textContent.trim();
    openTarget(file, label);
  });

  popupOverlay.addEventListener("click", (event) => {
    if (event.target === popupOverlay) {
      closePopup();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popupOverlay.classList.contains("hidden")) {
      if (popupStack.length) goBack();
      else closePopup();
    }
  });

  try {
    const countryIndex = await loadJSON("country-index.json");
    if (Array.isArray(countryIndex)) {
      for (const item of countryIndex) registerCountryEntry(item);
    }
  } catch (error) {
    console.warn("country-index.json introuvable ou invalide:", error);
  }

  try {
    const geojson = await loadJSON(COUNTRIES_GEOJSON_URL);

    countryLayer = L.geoJSON(geojson, {
      pane: "countryPane",
      style: styleCountry,
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const tooltipName =
          props.NAME_FR ||
          props.NAME_EN ||
          props.NAME ||
          props.ADMIN ||
          "Pays";

        layer.bindTooltip(tooltipName, { sticky: true });
        layer.on({
          mouseover: highlightCountry,
          mouseout: resetCountry,
          click: () => openCountry(feature),
        });
      },
    }).addTo(map);
  } catch (error) {
    console.error("Impossible de charger la couche pays:", error);
    showRecord(
      normalizeRecord(
        {
          name: "Erreur de chargement",
          subtitle: "La carte n’a pas pu charger le GeoJSON des pays.",
          sections: [
            {
              title: "Diagnostic",
              blocks: [
                {
                  type: "bullet",
                  parts: [
                    {
                      type: "text",
                      value:
                        "Vérifie l’URL du GeoJSON ou remplace-la par un fichier local dans ton dépôt.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        "Erreur"
      ),
      false
    );
  }

  try {
    const points = await loadJSON("points.json");
    if (Array.isArray(points)) {
      points.forEach(addPoint);
    }
  } catch (error) {
    console.warn("points.json introuvable ou invalide:", error);
  }
}

init();