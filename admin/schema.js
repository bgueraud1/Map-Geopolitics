export function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function deepClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseCommaList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function joinCommaList(value) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

export function kindToFolder(kind) {
  if (kind === "topic") return "topics";
  if (kind === "point") return "points";
  return "countries";
}

export function blankPart(type = "text") {
  if (type === "link") return { type: "link", label: "", target: "" };
  if (type === "em") return { type: "em", value: "" };
  return { type: "text", value: "" };
}

export function blankBlock(type = "bullet") {
  if (type === "paragraph") {
    return { type: "paragraph", parts: [blankPart("text")] };
  }
  if (type === "quote") {
    return { type: "quote", value: "" };
  }
  if (type === "section") {
    return blankSection("Nouvelle sous-section");
  }
  return { type: "bullet", parts: [blankPart("text")] };
}

export function blankSection(title = "Nouvelle section") {
  return {
    title,
    subtitle: "",
    blocks: [blankBlock("bullet")],
  };
}

export function blankDoc(kind = "country") {
  return {
    kind,
    id: "",
    name: "",
    iso_a3: "",
    aliases: [],
    subtitle: "",
    sections: [
      blankSection("Informations générales"),
      blankSection("Politique"),
      blankSection("Actualités"),
    ],
  };
}

function normalizePart(part) {
  const safe = part && typeof part === "object" ? part : {};
  if (safe.type === "link") {
    return {
      type: "link",
      label: String(safe.label ?? safe.value ?? ""),
      target: String(safe.target ?? ""),
    };
  }
  if (safe.type === "em") {
    return { type: "em", value: String(safe.value ?? "") };
  }
  return { type: "text", value: String(safe.value ?? safe.label ?? "") };
}

function normalizeBlock(block) {
  const safe = block && typeof block === "object" ? block : {};
  if (safe.type === "paragraph") {
    return {
      type: "paragraph",
      parts: Array.isArray(safe.parts) ? safe.parts.map(normalizePart) : [blankPart("text")],
    };
  }
  if (safe.type === "quote") {
    return {
      type: "quote",
      value: String(safe.value ?? ""),
    };
  }
  if (safe.type === "section") {
    return {
      type: "section",
      title: String(safe.title ?? "Nouvelle sous-section"),
      subtitle: String(safe.subtitle ?? ""),
      blocks: Array.isArray(safe.blocks) ? safe.blocks.map(normalizeBlock) : [blankBlock("bullet")],
    };
  }
  return {
    type: "bullet",
    parts: Array.isArray(safe.parts) ? safe.parts.map(normalizePart) : [blankPart("text")],
  };
}

function normalizeSection(section) {
  const safe = section && typeof section === "object" ? section : {};
  return {
    title: String(safe.title ?? "Nouvelle section"),
    subtitle: String(safe.subtitle ?? ""),
    blocks: Array.isArray(safe.blocks) ? safe.blocks.map(normalizeBlock) : [blankBlock("bullet")],
  };
}

export function normalizeDoc(input, kindFallback = "country") {
  const safe = input && typeof input === "object" ? input : {};
  const kind = String(safe.kind ?? kindFallback ?? "country");

  return {
    kind,
    id: String(safe.id ?? ""),
    name: String(safe.name ?? ""),
    iso_a3: String(safe.iso_a3 ?? ""),
    aliases: parseCommaList(safe.aliases ?? []),
    subtitle: String(safe.subtitle ?? ""),
    sections: Array.isArray(safe.sections) ? safe.sections.map(normalizeSection) : blankDoc(kind).sections,
  };
}

export function prettyJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

export function downloadText(filename, content, mime = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function saveJSON(filename, obj) {
  const content = prettyJSON(obj);

  if (window.isSecureContext && "showSaveFilePicker" in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "Fichier JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return;
  }

  downloadText(filename, content);
}

export function basename(path) {
  return String(path ?? "").split(/[\\/]/).pop() || "document.json";
}

export function makeCountryIndexEntry(doc, filePath) {
  const normalized = normalizeDoc(doc, "country");
  return {
    iso_a3: normalized.iso_a3 || undefined,
    name: normalized.name || normalized.id || "Sans nom",
    aliases: normalized.aliases,
    file: String(filePath ?? "").trim(),
  };
}

export function upsertCountryIndex(indexArray, entry) {
  const arr = Array.isArray(indexArray) ? deepClone(indexArray) : [];
  const keyIso = String(entry.iso_a3 ?? "").trim().toLowerCase();
  const keyName = String(entry.name ?? "").trim().toLowerCase();

  const idx = arr.findIndex((item) => {
    const itemIso = String(item?.iso_a3 ?? "").trim().toLowerCase();
    const itemName = String(item?.name ?? "").trim().toLowerCase();
    return (keyIso && itemIso === keyIso) || (keyName && itemName === keyName);
  });

  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...entry };
  } else {
    arr.push(entry);
  }

  return arr;
}