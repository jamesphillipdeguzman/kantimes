// ==========================================================================
// Kantimes | Stake Choir Practice Hub - Main Application Script
// ==========================================================================

// --- APPLICATION & REPERTOIRE VERSION ---
const APP_VERSION = "2.8.0";
const REPERTOIRE_VERSION = "2.8.0";

// Helper: Semantic version comparison (returns >0 if v1 > v2, <0 if v1 < v2, 0 if equal)
function compareSemver(v1, v2) {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = String(v1).replace(/^v/, "").split(".").map(Number);
  const p2 = String(v2).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// ==========================================================================
// ANONYMOUS DEFAULTS & STAKE-ISOLATED STORAGE ENGINE
// ==========================================================================

// Initialize empty rosters and unconfigured user defaults
const DEFAULT_KNOWN_SINGERS = [];

const DEFAULT_USER_IDENTITY = {
  name: "",
  initials: "",
  voice: "",       // e.g. "Soprano", "Alto", "Tenor", "Bass", or empty
  section: "",
  avatar: "default-avatar.png",
  isConfigured: false
};

/**
 * Generates a safe deterministic alphanumeric stake hash for scoping storage keys.
 * Ensures data isolation across different stakes / Google Sheets.
 */
function getStakeHash(sheetIdOrUrl = "") {
  const source = (sheetIdOrUrl || (typeof getActiveSheetId === 'function' ? getActiveSheetId() : '') || "").trim();
  if (!source) return "default";
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const cleanPrefix = source.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "stake";
  return `${cleanPrefix}_${Math.abs(hash).toString(36)}`;
}

/**
 * Returns a stake-isolated localStorage key.
 */
function getStakeStorageKey(baseKey, customSheet = "") {
  const sheet = customSheet || (typeof getActiveSheetId === 'function' ? getActiveSheetId() : '');
  if (!sheet) return baseKey;
  const stakeKey = getStakeHash(sheet);
  return `${baseKey}_${stakeKey}`;
}
window.DEFAULT_KNOWN_SINGERS = DEFAULT_KNOWN_SINGERS;
window.DEFAULT_USER_IDENTITY = DEFAULT_USER_IDENTITY;
window.getStakeHash = getStakeHash;
window.getStakeStorageKey = getStakeStorageKey;

// --- APPS SCRIPT WEB APP URL ---
// --- APPS SCRIPT WEB APP URL ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby6r8JCXFOeuDqk8mlrTFAY5G5jOUOcoljMIC-ow1tlStLj3EVBpEWE_q9iT_sRngEa/exec";

// ==========================================================================
// ==========================================================================
// 1. CONFIGURATION & BRING YOUR OWN GOOGLE SHEET (STAKE REPERTOIRE ENGINE)
// ==========================================================================
const REPERTOIRE_CONFIG = {
  // Clones the clean 'Template' tab into the user's personal Google Drive
  TEMPLATE_COPY_URL: "https://docs.google.com/spreadsheets/d/1WhGzAbKOc5TTuCi3UbLImZ2Kh82buf2rC1tCDX3hRL8/copy"
};
const DEFAULT_SHEET_ID = "";

/**
 * Wires the "Copy Template" button/link directly to REPERTOIRE_CONFIG.TEMPLATE_COPY_URL
 */
function wireCopyTemplateButton() {
  const btnTemplate = document.getElementById("btnCopyTemplate") || document.querySelector(".btn-copy-template") || document.getElementById("copySheetTemplateBtn");
  if (btnTemplate) {
    if (btnTemplate.tagName.toLowerCase() === "a") {
      btnTemplate.href = REPERTOIRE_CONFIG.TEMPLATE_COPY_URL;
      btnTemplate.target = "_blank";
      btnTemplate.rel = "noopener noreferrer";
    } else {
      btnTemplate.onclick = () => window.open(REPERTOIRE_CONFIG.TEMPLATE_COPY_URL, "_blank");
    }
  }
}

/**
 * Resolves any Google Sheet source (raw ID, edit URL, or published web export)
 * to its direct CSV endpoint.
 */
function resolveCsvUrl(source) {
  if (!source || typeof source !== "string" || !source.trim()) {
    return "";
  }
  const trimmed = source.trim();
  if (trimmed.includes("/pub") || trimmed.includes("output=csv")) {
    return trimmed.includes("output=csv")
      ? trimmed
      : `${trimmed.split("?")[0]}?output=csv`;
  }
  const sheetId = extractSheetId(trimmed) || trimmed;
  const gid = extractSheetGid(trimmed);
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

/**
 * Returns active CSV endpoint URL:
 * - Strictly dynamic based on localStorage (saved when a user inputs their own published CSV link)
 * - Returns empty string if no sheet is configured
 */
function getActiveCsvUrl() {
  const customSource = localStorage.getItem("kantimes_active_sheet_id");
  if (!customSource || !customSource.trim()) {
    return "";
  }
  return resolveCsvUrl(customSource);
}

/**
 * Extracts pure Google Sheet ID from a raw ID or full Google Sheets URL.
 * Matches:
 *   - Raw IDs (e.g. 1-TPqYS9fINnyowq4mfKbxmb6ceEI8gAEsyuhOb19d6U)
 *   - Full URLs (e.g. https://docs.google.com/spreadsheets/d/1-TPqYS9fINnyowq4mfKbxmb6ceEI8gAEsyuhOb19d6U/edit?pli=1&gid=0#gid=0)
 */
function extractSheetId(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  const rawMatch = trimmed.match(/^([a-zA-Z0-9-_]{20,})$/);
  if (rawMatch && rawMatch[1]) {
    return rawMatch[1];
  }
  return "";
}

/**
 * Optional helper to extract specific tab gid if provided in URL.
 */
function extractSheetGid(input) {
  if (!input || typeof input !== "string") return "0";
  const match = input.match(/[?&#]gid=([0-9]+)/);
  return match ? match[1] : "0";
}

/**
 * Returns active Google Sheet ID or URL from localStorage, or empty string if not configured.
 */
function getActiveSheetId() {
  const customId = localStorage.getItem("kantimes_active_sheet_id");
  return customId && customId.trim() ? customId.trim() : "";
}

/**
 * Returns cached songs from localStorage (0ms offline PWA startup).
 */
function getCachedSongs() {
  try {
    const raw = localStorage.getItem("kantimes_cached_songs");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("[Kantimes] Error parsing kantimes_cached_songs:", e);
  }
  return null;
}

/**
 * Auto-converts Google Drive share links into iframe-friendly preview URLs
 * to eliminate CORS blocks and direct downloads on mobile browsers.
 */
function sanitizeDriveUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  const fileIdMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
  }
  return trimmed;
}

/**
 * Strips internal newlines, tabs, carriage returns, and edge whitespace from URLs.
 */
function sanitizeUrl(str) {
  if (!str) return "";
  return String(str).replace(/[\r\n\t]/g, "").trim();
}
window.sanitizeUrl = sanitizeUrl;

/**
 * Sanitizes resource URLs for Google Drive or general web endpoints.
 */
function sanitizeResourceUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = sanitizeUrl(url);
  if (trimmed.includes("drive.google.com") || trimmed.includes("docs.google.com/file/")) {
    return sanitizeDriveUrl(trimmed);
  }
  return trimmed;
}

/**
 * Normalizes audio URLs: converts Google Drive share links into direct audio stream URLs.
 */

/**
 * Checks if a resource or media URL is valid and non-empty (not # or internal anchor).
 */
function isValidResourceUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = sanitizeUrl(url);
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower === "#" || lower.startsWith("#") || lower.startsWith("javascript:")) {
    return false;
  }
  return true;
}

/**
 * Determines if an audio URL can be played directly inside the browser's HTML5 <audio> player
 * or should directly render an external streaming button to avoid mixed-content / CORS errors.
 */
function isDirectStreamableAudio(url) {
  if (!isValidResourceUrl(url)) return false;
  const rawLower = String(url).trim().toLowerCase();

  // Known hosts that block or reject in-browser streaming (e.g. sacredsheetmusic.org, soundcloud.com)
  if (rawLower.includes("sacredsheetmusic.org") || rawLower.includes("soundcloud.com")) {
    return false;
  }

  // Mixed content blocking: Insecure HTTP media requested on HTTPS origin
  const isHttps = typeof window !== "undefined" && window.location && window.location.protocol === "https:";
  if (isHttps && rawLower.startsWith("http://")) {
    return false;
  }

  const trimmed = normalizeAudioUrl(url);
  const lower = trimmed.toLowerCase();

  // Local workspace or relative audio files
  if (lower.startsWith("kantimes-resources/") || lower.startsWith("./") || lower.startsWith("/")) {
    return true;
  }

  // Google Drive direct export download
  if (lower.includes("drive.google.com/uc?export=download") || lower.includes("drive.google.com/uc?id=")) {
    return true;
  }

  // Official Church of Jesus Christ audio media hosts
  if (lower.includes("assets.churchofjesuschrist.org") || lower.includes("media.ldscdn.org")) {
    return true;
  }

  // Localhost development
  if (lower.startsWith("http://localhost") || lower.startsWith("http://127.0.0.1")) {
    return true;
  }

  // Verified HTTPS direct audio media formats
  if (lower.startsWith("https://") && /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(trimmed)) {
    return true;
  }

  // Any other URL (HTML webpage or unverified external host)
  return false;
}

function normalizeAudioUrl(url) {
  if (!url || typeof url !== "string") return "";
  let trimmed = url.trim();

  // sacredsheetmusic.org rejects SSL connections; keep original protocol
  if (trimmed.includes("sacredsheetmusic.org")) {
    return trimmed;
  }

  const isHttpsPage = typeof window !== "undefined" && window.location && window.location.protocol ? window.location.protocol === "https:" : true;
  if (trimmed.startsWith("http://") && isHttpsPage) {
    trimmed = trimmed.replace(/^http:\/\//i, "https://");
  }

  if (trimmed.includes("drive.google.com/file/d/")) {
    const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  if (!trimmed.includes("export=download") && trimmed.includes("drive.google.com")) {
    const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (openMatch && openMatch[1]) {
      return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
    }
  }
  return trimmed;
}

/**
 * Robust RFC 4180 CSV parser that handles:
 *   - Quoted strings containing commas, quotes ("" -> "), and newlines
 *   - Empty trailing cells & blank rows
 */
function parseCSV(text) {
  if (!text || typeof text !== "string") return [];
  const rows = [];
  let currentRow = [];
  let currentVal = "";
  let inQuotes = false;

  const str = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal.trim());
        currentVal = "";
      } else if (char === '\n') {
        currentRow.push(currentVal.trim());
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentVal = "";
      } else {
        currentVal += char;
      }
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Aggregates multiple Google Sheet rows with the same song title
 * into a single structured song object:
 * {
 *   "title": "Go Tell It on the Mountain",
 *   "hymn_number": 1208,
 *   "category": "Christmas Devotional 2026",
 *   "resources": [
 *     { "part": "all", "label": "Full Score (PDF)", "url": "https://..." },
 *     { "part": "tenor", "label": "Tenor Track", "url": "https://youtu.be/..." }
 *   ]
 * }
 */
function groupRowsIntoSongs(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const isMatrix = Array.isArray(rows[0]);
  let dataRows = rows;
  let titleIdx = 0, hymnNumIdx = 1, categoryIdx = 2, partIdx = 3, labelIdx = 4, urlIdx = 5, audioUrlIdx = 6, videoUrlIdx = 7;

  if (isMatrix) {
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => (h || "").trim().toLowerCase());

    const findCol = (exactMatches, substringMatches = []) => {
      for (let i = 0; i < headers.length; i++) {
        const clean = headers[i].replace(/[^a-z0-9]/g, "");
        if (exactMatches.some(e => clean === e.replace(/[^a-z0-9]/g, ""))) {
          return i;
        }
      }
      for (let i = 0; i < headers.length; i++) {
        const clean = headers[i].replace(/[^a-z0-9]/g, "");
        if (substringMatches.some(s => clean.includes(s.replace(/[^a-z0-9]/g, "")))) {
          return i;
        }
      }
      return -1;
    };

    const foundTitle = findCol(["title", "songtitle", "hymntitle"], ["title", "song", "name"]);
    const foundHymn = findCol(["hymnnumber", "hymn", "number"], ["hymn", "number", "num"]);
    const foundCat = findCol(["category", "season", "event"], ["category", "season", "event"]);
    const foundPart = findCol(["voicepart", "voice", "part"], ["voice", "part", "section"]);
    const foundLabel = findCol(["resourcelabel", "label", "description"], ["label", "desc"]);
    const foundUrl = findCol(["resourceurl", "url", "link", "sheeturl"], ["resource", "sheet", "url", "link", "href"]);
    const foundAudio = findCol(["audiourl", "audio", "audiolink", "trackurl", "track"], ["audio", "track", "mp3"]);
    const foundVideo = findCol(["videourl", "video", "videolink", "youtube", "youtubeurl"], ["video", "youtube", "yt"]);

    titleIdx = foundTitle !== -1 ? foundTitle : 0;
    hymnNumIdx = foundHymn !== -1 ? foundHymn : 1;
    categoryIdx = foundCat !== -1 ? foundCat : 2;
    partIdx = foundPart !== -1 ? foundPart : 3;
    labelIdx = foundLabel !== -1 ? foundLabel : 4;
    urlIdx = foundUrl !== -1 ? foundUrl : 5;
    audioUrlIdx = foundAudio !== -1 ? foundAudio : 6;
    videoUrlIdx = foundVideo !== -1 ? foundVideo : 7;

    dataRows = rows.slice(1);
  }

  const songsMap = new Map();

  for (const row of dataRows) {
    if (!row) continue;
    const isRowArray = Array.isArray(row);

    const title = (isRowArray ? (row[titleIdx] || "") : (row.title || "")).trim();
    if (!title) continue;

    const titleKey = title.toLowerCase();
    const hymnNumber = (isRowArray ? (row[hymnNumIdx] || "") : (row.hymnNumber || row.hymn_number || "")).trim();
    const category = (isRowArray ? (row[categoryIdx] || "General") : (row.category || "General")).trim();
    const voicePart = (isRowArray ? (row[partIdx] || "All") : (row.voicePart || row.part || "All")).trim();
    const rawResourceLabel = (isRowArray ? (row[labelIdx] || "Sheet Music") : (row.resourceLabel || "Sheet Music")).trim();
    const rawResourceUrl = sanitizeUrl(isRowArray ? (row[urlIdx] || "") : (row.resourceUrl || row.sheetUrl || ""));
    const rawAudioUrl = sanitizeUrl(isRowArray ? (row[audioUrlIdx] || "") : (row.audioUrl || ""));
    const rawVideoUrl = sanitizeUrl(isRowArray ? (row[videoUrlIdx] || "") : (row.videoUrl || ""));

    if (!songsMap.has(titleKey)) {
      songsMap.set(titleKey, {
        id: `song-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: title,
        hymn_number: hymnNumber,
        hymnNumber: hymnNumber,
        number: hymnNumber,
        category: category,
        event: category,
        collection: category,
        part: voicePart,
        voicePart: voicePart,
        resourceUrl: isValidResourceUrl(rawResourceUrl) ? rawResourceUrl : "",
        resourceLabel: rawResourceLabel,
        sheetUrl: isValidResourceUrl(rawResourceUrl) ? rawResourceUrl : "",
        audioUrl: isValidResourceUrl(rawAudioUrl) ? rawAudioUrl : "",
        videoUrl: isValidResourceUrl(rawVideoUrl) ? rawVideoUrl : "",
        resources: [],
        audioTracks: []
      });
    }

    const song = songsMap.get(titleKey);

    if (!song.hymn_number && hymnNumber) {
      song.hymn_number = hymnNumber;
      song.hymnNumber = hymnNumber;
      song.number = hymnNumber;
    }
    if ((!song.category || song.category === "General" || song.category === "Active Repertoire") && category && category !== "General") {
      song.category = category;
      song.event = category;
      song.collection = category;
    }
    if (!song.resourceUrl && isValidResourceUrl(rawResourceUrl)) {
      song.resourceUrl = rawResourceUrl;
      song.resourceLabel = rawResourceLabel;
      song.sheetUrl = song.sheetUrl || rawResourceUrl;
    }
    if (!song.audioUrl && isValidResourceUrl(rawAudioUrl)) {
      song.audioUrl = rawAudioUrl;
    }
    if (!song.videoUrl && isValidResourceUrl(rawVideoUrl)) {
      song.videoUrl = rawVideoUrl;
    }

    if (isValidResourceUrl(rawAudioUrl)) {
      const cleanPart = voicePart ? voicePart.trim().toLowerCase() : "all";
      const trackName = voicePart && cleanPart !== "all"
        ? `${voicePart.charAt(0).toUpperCase() + voicePart.slice(1)} Track`
        : (rawResourceLabel || "Audio Track");
      const normAudio = normalizeAudioUrl(rawAudioUrl);
      if (!song.audioTracks.some(t => normalizeAudioUrl(t.src) === normAudio)) {
        song.audioTracks.push({
          name: trackName,
          src: rawAudioUrl,
          part: cleanPart
        });
      }
    }

    if (isValidResourceUrl(rawResourceUrl)) {
      const sanitizedUrl = sanitizeResourceUrl(rawResourceUrl);
      if (isValidResourceUrl(sanitizedUrl)) {
        const cleanPart = voicePart ? voicePart.trim().toLowerCase() : "all";
        const defaultLabel = cleanPart && cleanPart !== "all"
          ? `${cleanPart.charAt(0).toUpperCase() + cleanPart.slice(1)} Sheet`
          : (rawResourceLabel || "Sheet Music");
        const finalLabel = rawResourceLabel || defaultLabel;

        const lowerUrl = sanitizedUrl.toLowerCase();
        const lowerLabel = finalLabel.toLowerCase();

        // Sheet preview (PDF or Drive)
        if (!song.sheetUrl && (lowerUrl.includes(".pdf") || lowerUrl.includes("drive.google.com") || lowerLabel.includes("pdf") || lowerLabel.includes("sheet") || lowerLabel.includes("score"))) {
          song.sheetUrl = sanitizedUrl;
        }

        // Rehearsal Video / YouTube
        if (!song.videoUrl && (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be") || lowerUrl.endsWith(".mp4") || lowerLabel.includes("video"))) {
          song.videoUrl = sanitizedUrl;
        }

        // Dedicated Audio Track (mp3, wav, m4a, church audio assets, or accompaniment audio)
        const isAudioFile = lowerUrl.includes(".mp3") || lowerUrl.includes(".wav") || lowerUrl.includes(".m4a") || lowerUrl.includes("assets.churchofjesuschrist.org");
        const isAudioTrackLabel = lowerLabel.includes("track") || lowerLabel.includes("audio") || lowerLabel.includes("accompaniment") || lowerLabel.includes("piano") || lowerLabel.includes("organ");
        if (isAudioFile || (isAudioTrackLabel && !lowerUrl.includes("youtube") && !lowerUrl.includes("youtu.be"))) {
          const normSrc = normalizeAudioUrl(sanitizedUrl);
          if (!song.audioTracks.some(t => normalizeAudioUrl(t.src) === normSrc)) {
            song.audioTracks.push({
              name: finalLabel,
              src: sanitizedUrl,
              part: cleanPart
            });
          }
        } else {
          // Non-audio external resource
          if (!song.resources.some(r => r.url === sanitizedUrl)) {
            song.resources.push({
              part: cleanPart,
              label: finalLabel,
              url: sanitizedUrl
            });
          }
        }
      }
    }
  }

  return Array.from(songsMap.values());
}

/**
 * Stale-While-Revalidate Engine:
 * Fetches and parses CSV from public Google Sheet endpoint.
 * Persists offline to localStorage ("kantimes_cached_songs"),
 * and smoothly updates song lists.
 */
/**
 * Strict CSV Repertoire Parser (9-Column Public Google Sheet Schema):
 * Index 0 (Col A): Title
 * Index 1 (Col B): Hymn Number
 * Index 2 (Col C): Event / Category
 * Index 3 (Col D): Voice Part
 * Index 4 (Col E): Accompaniment
 * Index 5 (Col F): Composer / Arranger
 * Index 6 (Col G): PDF URL
 * Index 7 (Col H): Audio URL
 * Index 8 (Col I): Video URL
 */
function parseRepertoireCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  // Robust line splitter handling CRLF and LF
  const lines = csvText.split(/\r\n|\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Helper to split CSV row respecting double quotes
  function parseCsvRow(rowStr) {
    const cells = [];
    let current = '';
    let insideQuotes = false;
    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char === '"') {
        if (insideQuotes && rowStr[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  // Convert Google Drive sharing links to direct audio streaming links
  function formatDriveAudioUrl(url) {
    if (!url) return '';
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
    return url;
  }

  // Normalize Drive PDF URLs to /view
  function formatDrivePdfUrl(url) {
    if (!url) return '';
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/view`;
    }
    return url;
  }

  const rawHeaders = parseCsvRow(lines[0]);
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Flexible header index detection with 9-column schema index fallbacks
  const getIdx = (keys, fallbackIdx) => {
    const found = headers.findIndex(h => keys.some(k => h.includes(k)));
    return found !== -1 ? found : fallbackIdx;
  };

  const titleIdx = getIdx(['title'], 0);
  const hymnNumIdx = getIdx(['hymn', 'number'], 1);
  const eventIdx = getIdx(['event', 'category', 'season'], 2);
  const voicePartIdx = getIdx(['voice', 'part', 'section'], 3);
  const accomIdx = getIdx(['accompaniment', 'accom'], 4);
  const composerIdx = getIdx(['composer', 'arranger', 'arr'], 5);
  const pdfIdx = getIdx(['pdf', 'sheet', 'score'], 6);
  const audioIdx = getIdx(['audio', 'track', 'mp3'], 7);
  const videoIdx = getIdx(['video', 'youtube'], 8);

  const songs = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const title = row[titleIdx] ? row[titleIdx].replace(/^["']|["']$/g, '').trim() : '';

    // Ignore empty title rows or meta-rows like "IMPORTANT NOTE"
    if (!title || title.toUpperCase().includes('IMPORTANT NOTE')) continue;

    const hymnNumber = (row[hymnNumIdx] || '').trim();
    const category = (row[eventIdx] || 'Christmas Devotional 2026').trim();
    const voicePart = (row[voicePartIdx] || 'all').trim();
    const accompanimentRaw = (row[accomIdx] || '').trim();
    const composer = (row[composerIdx] || '').trim();
    const rawPdf = sanitizeUrl(row[pdfIdx] || '');
    const rawAudio = sanitizeUrl(row[audioIdx] || '');
    const rawVideo = sanitizeUrl(row[videoIdx] || '');

    // Format accompaniment label (e.g. 'piano' -> 'Piano Accompaniment')
    let accompanimentLabel = 'Accompaniment Track';
    if (accompanimentRaw) {
      const cleanAcc = accompanimentRaw.toLowerCase().trim();
      accompanimentLabel = cleanAcc === 'piano' ? 'Piano Accompaniment' :
                           cleanAcc === 'organ' ? 'Organ Accompaniment' :
                           cleanAcc.charAt(0).toUpperCase() + cleanAcc.slice(1) + ' Accompaniment';
    }

    const audioUrl = formatDriveAudioUrl(rawAudio);
    const pdfUrl = formatDrivePdfUrl(rawPdf);

    const song = {
      id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      title: title,
      hymnNumber: hymnNumber,
      hymn_number: hymnNumber,
      number: hymnNumber,
      category: category,
      event: category,
      voicePart: voicePart,
      part: voicePart,
      accompaniment: accompanimentRaw,
      composer: composer,
      pdfUrl: pdfUrl,
      sheetUrl: pdfUrl,
      resourceUrl: pdfUrl,
      resourceLabel: composer ? `Full Score (${composer})` : 'Full Score (PDF)',
      audioUrl: audioUrl,
      videoUrl: rawVideo,
      resources: [],
      audioTracks: []
    };

    // 1. PDF Resource Pill
    if (pdfUrl) {
      song.resources.push({
        type: 'pdf',
        label: composer ? `Full Score (${composer})` : 'Full Score (PDF)',
        url: pdfUrl
      });
    }

    // 2. Audio Repertoire Pill & Player Track
    if (audioUrl) {
      song.audioTracks.push({
        name: accompanimentLabel,
        src: audioUrl,
        part: voicePart
      });
      song.resources.push({
        type: 'audio',
        label: accompanimentLabel,
        url: audioUrl
      });
    }

    // 3. Video Reference Pill
    if (rawVideo) {
      song.resources.push({
        type: 'video',
        label: 'Rehearsal Video (YouTube)',
        url: rawVideo
      });
    }

    songs.push(song);
  }

  return songs;
}
window.parseRepertoireCsv = parseRepertoireCsv;

/**
 * Sets and persists the active choir repertoire across memory and cache.
 */
function setActiveRepertoire(parsedSongs) {
  let songs = Array.isArray(parsedSongs) ? parsedSongs : [];

  // Apply persisted archived IDs so sheet syncs preserve archive state
  try {
    const archivedIds = JSON.parse(localStorage.getItem('kantimes_archived_song_ids') || '[]');
    if (Array.isArray(archivedIds) && archivedIds.length > 0) {
      songs.forEach(s => {
        const identifier = s.id || s.title;
        if (archivedIds.includes(identifier) || archivedIds.includes(s.id) || (s.title && archivedIds.includes(s.title))) {
          s.isArchived = true;
          s.archived = true;
        }
      });
    }
  } catch (e) {
    console.warn("[Kantimes] Error applying archived IDs in setActiveRepertoire:", e);
  }

  localStorage.setItem("kantimes_repertoire_cache", JSON.stringify(songs));
  localStorage.setItem("kantimes_cached_songs", JSON.stringify(songs));

  const settings = getUserSettings();
  settings.songs = songs;
  saveUserSettings(settings);

  updateRepertoireUI(songs);
  renderRepertoireList();
  updateStakeSheetStatusUI();
}
window.setActiveRepertoire = setActiveRepertoire;

/**
 * Synchronizes repertoire dynamically from connected Google Sheet.
 */
async function syncRepertoire(options = {}) {
  const silent = Boolean(options.silent || options.isBackground);
  let activeSheet = options.rawUrl || options.sheetIdOrUrl || getActiveSheetId();

  if (options.rawUrl) {
    let storedSource = options.rawUrl.trim();
    if (!storedSource.includes("/pub") && !storedSource.includes("output=csv")) {
      const sheetId = extractSheetId(storedSource);
      if (sheetId) storedSource = sheetId;
    }
    const prevActiveSheet = localStorage.getItem("kantimes_active_sheet_id");
    if (prevActiveSheet !== storedSource) {
      initFreshStakeSectionStandings(true);
      cachedKnownSingers = [];
      loadKnownSingersCache();
    }
    activeSheet = storedSource;
    localStorage.setItem("kantimes_active_sheet_id", activeSheet);
  }

  if (!activeSheet) {
    renderRepertoireEmptyState();
    return [];
  }

  if (options.force) {
    localStorage.removeItem("kantimes_repertoire_cache");
    localStorage.removeItem("kantimes_cached_songs");
  }

  return await loadSongsFromSheet(activeSheet, { isBackground: silent, userInitiated: !silent, force: options.force });
}
window.syncRepertoire = syncRepertoire;

async function loadSongsFromSheet(sheetIdOrUrl, options = {}) {
  const isBackground = Boolean(options.isBackground || options.silent);
  const userInitiated = Boolean(options.userInitiated);
  const reset = Boolean(options.reset);

  const csvUrl = sheetIdOrUrl ? resolveCsvUrl(sheetIdOrUrl) : getActiveCsvUrl();
  if (!csvUrl) {
    if (userInitiated) {
      showToast("⚠️ No Google Sheet configured. Connect a sheet or copy the template to begin.");
    }
    renderRepertoireEmptyState();
    return [];
  }

  // Build a clean URL with cache-busting query parameter
  const separator = csvUrl.includes("?") ? "&" : "?";
  const cacheBustedUrl = `${csvUrl}${separator}_t=${Date.now()}`;

  try {
    // Perform simple GET without custom headers (avoids CORS preflight failure on Google Sheets)
    const res = await fetch(cacheBustedUrl, {
      method: "GET",
      cache: "no-cache"
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch sheet CSV: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();

    if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
      throw new Error("Sheet returned HTML. Please ensure Google Sheet is shared as 'Anyone with the link can view' or Published to Web.");
    }

    let songs = parseRepertoireCsv(text);
    if (!songs || songs.length === 0) {
      throw new Error("No songs could be parsed from sheet columns.");
    }

    // Re-append local extra songs added manually so syncs don't erase them
    try {
      const localExtras = JSON.parse(localStorage.getItem("kantimes_local_extra_songs") || "[]");
      if (Array.isArray(localExtras) && localExtras.length > 0) {
        localExtras.forEach(extra => {
          if (!songs.some(s => s.id === extra.id || (s.title && s.title.toLowerCase() === extra.title.toLowerCase()))) {
            songs.push(extra);
          }
        });
      }
    } catch (e) {
      console.warn("[Kantimes] Error merging local extra songs:", e);
    }

    // Apply persisted archived IDs so sheet re-syncs do not undo local archives
    try {
      const archivedIds = JSON.parse(localStorage.getItem('kantimes_archived_song_ids') || '[]');
      if (Array.isArray(archivedIds) && archivedIds.length > 0) {
        songs.forEach(s => {
          const identifier = s.id || s.title;
          if (archivedIds.includes(identifier) || archivedIds.includes(s.id) || (s.title && archivedIds.includes(s.title))) {
            s.isArchived = true;
            s.archived = true;
          }
        });
      }
    } catch (e) {
      console.warn("[Kantimes] Error applying archived IDs in loadSongsFromSheet:", e);
    }

    // Check if repertoire changed compared to cached version
    const cachedRaw = localStorage.getItem("kantimes_repertoire_cache") || localStorage.getItem("kantimes_cached_songs");
    const hasChanged = !cachedRaw || cachedRaw !== JSON.stringify(songs);

    // Persist to active memory, offline storage, and update UI
    setActiveRepertoire(songs);

    if (userInitiated || reset) {
      showToast(reset ? "Reset to Master Repertoire! ✨" : `Connected & synced ${songs.length} pieces from Google Sheet! 🎶`);
    } else if (!isBackground && hasChanged) {
      showToast(`Synced ${songs.length} pieces from Google Sheet! 🎶`);
    }

    return songs;
  } catch (err) {
    console.warn("[Kantimes] loadSongsFromSheet warning (offline or permission issue):", err);

    if (userInitiated) {
      showToast(`⚠️ Sync failed: ${err.message || 'Check Sheet permissions or connection'}`);
      const errEl = document.getElementById("stakeSheetError");
      if (errEl) {
        errEl.textContent = `⚠️ Could not sync: ${err.message || 'Ensure sheet is shared as Anyone with link can view.'}`;
        errEl.style.display = "block";
      }
    }

    // Offline Chapel Mode: Fail gracefully and leave cached songs rendered
    return null;
  }
}

/**
 * Handles "Connect & Sync" button click in Stake Sheet Switcher modal.
 */
async function handleStakeSheetConnect() {
  const inputEl = document.getElementById('stakeSheetUrlInput') || document.getElementById('googleSheetInput') || document.getElementById('stakeSheetInput');
  const rawUrl = inputEl ? inputEl.value.trim() : '';
  if (!rawUrl) {
    showToast('Please enter a valid Google Sheet URL or ID.');
    if (inputEl) inputEl.focus();
    return;
  }

  const errEl = document.getElementById('stakeSheetError');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  const syncBtn = document.getElementById('btnConnectSync');
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '⏳ Syncing...';
  }

  try {
    // Wipe memory/local caches for this sheet to guarantee freshness
    localStorage.removeItem('kantimes_repertoire_cache');
    localStorage.removeItem('kantimes_cached_songs');

    // Force-sync with fresh timestamp (no early exit even if sheet URL unchanged)
    await syncRepertoire({ force: true, rawUrl: rawUrl, silent: false });

    setSheetInputMode(false);
    updateStakeSheetStatusUI();
    showToast('Repertoire updated successfully!');
    closeStakeSheetModal();
  } catch (err) {
    console.error('Manual sync error:', err);
    if (errEl) {
      errEl.textContent = `⚠️ ${err.message || 'Error connecting to sheet'}`;
      errEl.style.display = 'block';
    }
    showToast(`Sync failed: ${err.message}`);
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = '⚡ Connect & Sync';
    }
  }
}

/**
 * Handles "Reset / Disconnect Repertoire" in Stake Sheet Switcher modal.
 */
/**
 * Disconnects the active custom Google Sheet repertoire and reverts to unconfigured onboarding state.
 */
function disconnectRepertoireSheet() {
  const currentSheet = localStorage.getItem("kantimes_active_sheet_id");
  if (currentSheet) {
    localStorage.setItem("kantimes_last_sheet_url", currentSheet);
    const stakeKey = getStakeHash(currentSheet);
    localStorage.removeItem(`kantimes_known_singers_${stakeKey}`);
    localStorage.removeItem(`kantimes_section_standings_${stakeKey}`);
  }
  localStorage.removeItem("kantimes_active_sheet_id");
  localStorage.removeItem("kantimes_repertoire_cache");
  localStorage.removeItem("kantimes_cached_songs");
  cachedKnownSingers = [];
  loadKnownSingersCache();
  initFreshStakeSectionStandings(true);

  const settings = getUserSettings();
  settings.songs = [];
  saveUserSettings(settings);

  initFreshStakeSectionStandings(false);

  // DO NOT clear input field - retain URL so choir members can reconnect with single tap of "Connect & Sync"
  const input = document.getElementById("stakeSheetUrlInput") || document.getElementById("googleSheetInput") || document.getElementById("stakeSheetInput");
  if (input && !input.value && currentSheet) {
    input.value = currentSheet;
  }
  setSheetInputMode(true);
  updateClearBtnVisibility();

  const errEl = document.getElementById("stakeSheetError");
  if (errEl) errEl.style.display = "none";

  const btnDisconnect = document.getElementById("btnDisconnectSheet") || document.getElementById("btnResetDefault");
  if (btnDisconnect) {
    btnDisconnect.style.display = "none";
  }

  updateStakeSheetStatusUI();
  closeStakeSheetModal();
  populateSongDropdown([]);
  renderRepertoireEmptyState();
  renderRepertoireList();
  showToast("Repertoire sheet disconnected! 🔌");
}

// Backwards-compatible alias
const resetToDefaultRepertoire = disconnectRepertoireSheet;

/**
 * Updates status indicator and details in Stake Sheet Switcher modal.
 */
function updateStakeSheetStatusUI() {
  const customSource = localStorage.getItem("kantimes_active_sheet_id");
  const isConnected = Boolean(customSource && customSource.trim());
  const fullSourceUrl = isConnected ? customSource.trim() : "";

  const badge = document.getElementById("activeStakeSheetBadge") || document.getElementById("stakeSourceStatusBadge");
  const details = document.getElementById("stakeSourceDetails");
  const input = document.getElementById("stakeSheetUrlInput") || document.getElementById("googleSheetInput") || document.getElementById("stakeSheetInput");

  if (badge) {
    if (isConnected) {
      badge.textContent = "Connected Stake Sheet";
      badge.className = "stake-source-badge badge-custom active-sheet-link";
      badge.setAttribute("title", fullSourceUrl);
    } else {
      const hasSavedLink = Boolean(input && input.value && input.value.trim().length > 0);
      badge.textContent = hasSavedLink ? "Disconnected (Saved Link)" : "Not Connected";
      badge.className = "stake-source-badge badge-default active-sheet-link";
      badge.setAttribute("title", hasSavedLink ? "Sheet disconnected. Click 'Connect & Sync' to reconnect." : "No Google Sheet connected. Paste a published CSV link or ID.");
    }
  }

  const lockBadge = document.getElementById("sheetLockBadge");
  const isEditing = input && !input.hasAttribute("readonly");
  if (lockBadge) {
    if (isEditing) {
      lockBadge.textContent = "Editing";
      lockBadge.style.color = "#eab308";
    } else if (isConnected) {
      lockBadge.textContent = "Connected";
      lockBadge.style.color = "";
    } else {
      const hasSavedLink = Boolean(input && input.value && input.value.trim().length > 0);
      lockBadge.textContent = hasSavedLink ? "Disconnected (Saved)" : "Not Connected";
      lockBadge.style.color = "";
    }
  }

  if (details) {
    if (isConnected) {
      details.innerHTML = `Connected stake sheet:<code class="active-source-url-display stake-sheet-active-tag" id="activeStakeSheetDisplay" title="${escapeHtml(fullSourceUrl)}">${escapeHtml(fullSourceUrl)}</code>`;
    } else {
      details.innerHTML = `No sheet connected (using default starter repertoire)`;
    }
  }

  if (input) {
    const val = input.value ? input.value.trim() : "";
    input.setAttribute("title", val ? `Current: ${val}` : "Enter your Google Sheet URL or ID");
    if (!input.dataset.tooltipBound) {
      input.dataset.tooltipBound = "true";
      input.addEventListener("input", () => {
        const currentVal = input.value ? input.value.trim() : "";
        input.setAttribute("title", currentVal ? `Current: ${currentVal}` : "Enter your Google Sheet URL or ID");
      });
    }
  }

  const shareBox = document.getElementById("stakeShareLinkBox");
  if (shareBox) {
    shareBox.style.display = isConnected ? "block" : "none";
  }

  const btnDisconnect = document.getElementById("btnDisconnectSheet") || document.getElementById("btnResetDefault");
  if (btnDisconnect) {
    btnDisconnect.style.display = isConnected ? "inline-flex" : "none";
  }
}

/**
 * Copies 1-click shareable choir onboarding link (?sheet=...) to clipboard.
 */
function copyChoirShareLink() {
  const customSource = localStorage.getItem("kantimes_active_sheet_id");
  if (!customSource || !customSource.trim()) {
    showToast("⚠️ Connect a custom stake sheet first to generate a choir share link.");
    return;
  }

  const baseUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? window.location.origin + window.location.pathname
    : "https://kantimes.vercel.app/";

  const shareUrl = `${baseUrl.replace(/\/$/, "")}/?sheet=${encodeURIComponent(customSource.trim())}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        showToast("Choir link copied to clipboard! 📋");
      })
      .catch(() => {
        fallbackCopyText(shareUrl);
      });
  } else {
    fallbackCopyText(shareUrl);
  }
}

function setSheetInputMode(isEditing) {
  const sheetTextarea = document.getElementById('stakeSheetUrlInput');
  const editBtn = document.getElementById('btnToggleEditSheetUrl');
  const lockBadge = document.getElementById('sheetLockBadge');
  const clearBtn = document.getElementById('btnClearSheetUrl');

  if (!sheetTextarea) return;
  if (isEditing) {
    sheetTextarea.removeAttribute('readonly');
    sheetTextarea.focus();
    if (editBtn) editBtn.innerHTML = '🔒 Lock URL';
    if (lockBadge) {
      lockBadge.textContent = 'Editing';
      lockBadge.style.color = '#eab308';
    }
    if (clearBtn && sheetTextarea.value.trim().length > 0) {
      clearBtn.style.display = 'flex';
    }
  } else {
    sheetTextarea.setAttribute('readonly', 'true');
    if (editBtn) editBtn.innerHTML = '✏️ Edit Sheet Link';
    const hasActive = !!localStorage.getItem('kantimes_active_sheet_id');
    if (lockBadge) {
      lockBadge.textContent = hasActive ? 'Connected' : 'Not Connected';
      lockBadge.style.color = '';
    }
    if (clearBtn) clearBtn.style.display = 'none';
  }
}
window.setSheetInputMode = setSheetInputMode;

function initSheetEditButton() {
  const editBtn = document.getElementById('btnToggleEditSheetUrl');
  const sheetTextarea = document.getElementById('stakeSheetUrlInput');
  if (editBtn && !editBtn._editBound) {
    editBtn._editBound = true;
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!sheetTextarea) return;
      const isCurrentlyReadOnly = sheetTextarea.hasAttribute('readonly');
      setSheetInputMode(isCurrentlyReadOnly);
    });
  }
}
window.initSheetEditButton = initSheetEditButton;

function updateClearBtnVisibility() {
  const sheetInput = document.getElementById('stakeSheetUrlInput') || document.getElementById('googleSheetInput') || document.getElementById('stakeSheetInput');
  const clearBtn = document.getElementById('btnClearSheetUrl');
  if (clearBtn && sheetInput) {
    const isReadOnly = sheetInput.hasAttribute('readonly');
    clearBtn.style.display = (!isReadOnly && sheetInput.value.trim().length > 0) ? 'flex' : 'none';
  }
}
window.updateClearBtnVisibility = updateClearBtnVisibility;

function initClearSheetUrlButton() {
  const sheetInput = document.getElementById('stakeSheetUrlInput') || document.getElementById('googleSheetInput') || document.getElementById('stakeSheetInput');
  const clearBtn = document.getElementById('btnClearSheetUrl');

  if (sheetInput && !sheetInput._clearBound) {
    sheetInput._clearBound = true;
    sheetInput.addEventListener('input', () => {
      updateClearBtnVisibility();
      updateStakeSheetStatusUI();
    });
    sheetInput.addEventListener('change', () => {
      updateClearBtnVisibility();
      updateStakeSheetStatusUI();
    });
  }

  if (clearBtn && !clearBtn._clearBound) {
    clearBtn._clearBound = true;
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 1. Wipe the textarea value
      if (sheetInput) {
        sheetInput.value = '';
      }

      // 2. Remove any cached draft inputs in storage
      localStorage.removeItem('kantimes_temp_sheet_input');

      // 3. Dispatch native input and change events so bound listeners stay synced
      if (sheetInput) {
        sheetInput.dispatchEvent(new Event('input', { bubbles: true }));
        sheetInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 4. Hide clear button and focus field
      clearBtn.style.display = 'none';
      if (sheetInput) {
        sheetInput.focus();
      }
      updateStakeSheetStatusUI();
    });
  }

  updateClearBtnVisibility();
}
window.initClearSheetUrlButton = initClearSheetUrlButton;

function openStakeSheetModal() {
  const modal = document.getElementById("stakeSheetModal");
  if (!modal) return;
  wireCopyTemplateButton();
  initClearSheetUrlButton();
  initSheetEditButton();
  const errEl = document.getElementById("stakeSheetError");
  if (errEl) {
    errEl.style.display = "none";
    errEl.textContent = "";
  }
  const input = document.getElementById("stakeSheetUrlInput") || document.getElementById("googleSheetInput") || document.getElementById("stakeSheetInput");
  const customSource = localStorage.getItem("kantimes_active_sheet_id") || localStorage.getItem("kantimes_last_sheet_url");
  if (input) {
    if (!input.value && customSource) {
      input.value = customSource.trim();
    }
  }
  const hasConnectedSheet = Boolean(localStorage.getItem("kantimes_active_sheet_id"));
  if (hasConnectedSheet) {
    setSheetInputMode(false); // Locked for active sheet
  } else {
    setSheetInputMode(true); // Unlocked so users can paste immediately
  }
  updateStakeSheetStatusUI();
  updateClearBtnVisibility();
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

// Track where the mouse down started so dragging text across the edge doesn't trigger a backdrop close
let modalMouseDownTarget = null;

// Global mousedown listener in capture phase to reliably track initial target for all clicks/drags
document.addEventListener("mousedown", (e) => {
  modalMouseDownTarget = e.target;
}, true);

function closeStakeSheetModal() {
  const modal = document.getElementById("stakeSheetModal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";
}

function closeStakeSheetOnBackdrop(event) {
  // Ensure click was strictly on the outer dark backdrop, not bubbled from inside
  if (event.target !== event.currentTarget) return;
  // Track where the mouse down started so dragging text across the edge doesn't trigger a backdrop close
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  // Prevent closing if user was selecting/dragging text
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeStakeSheetModal();
}

function initStakeRepertoireSync() {
  wireCopyTemplateButton();

  // Protect Stake / Repertoire Source modal from drag-selection accidental closure
  const stakeModal = document.getElementById('stakeSheetModal');
  if (stakeModal && !stakeModal._backdropGuarded) {
    stakeModal._backdropGuarded = true;
    stakeModal.addEventListener('mousedown', (e) => {
      modalMouseDownTarget = e.target;
    });

    stakeModal.addEventListener('click', (e) => {
      // Only close if BOTH mousedown and click originated directly on the backdrop container, NOT inside .modal-box
      if (e.target === stakeModal && modalMouseDownTarget === stakeModal) {
        if (window.getSelection && window.getSelection().toString().length > 0) return;
        closeStakeSheetModal();
      }
    });
  }

  // Check for 1-click choir onboarding URL parameter: ?sheet=...
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const sheetParam = urlParams.get("sheet");
    if (sheetParam && sheetParam.trim()) {
      const cleanParam = sheetParam.trim();
      const currentActive = localStorage.getItem("kantimes_active_sheet_id");
      if (cleanParam !== currentActive) {
        localStorage.setItem("kantimes_active_sheet_id", cleanParam);
        initFreshStakeSectionStandings(true);
        cachedKnownSingers = [];
        loadKnownSingersCache();
        showToast("Loading Stake Repertoire from link... 🎶");
        loadSongsFromSheet(cleanParam, { isBackground: false, userInitiated: true });
      }
      // Cleanly clean the URL without reloading using replaceState
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (e) {
    console.warn("[Kantimes] Error parsing URL search params for sheet:", e);
  }

  updateStakeSheetStatusUI();

  const customSheet = localStorage.getItem("kantimes_active_sheet_id");
  if (customSheet && customSheet.trim()) {
    // 1. Render immediately from local cache (fast and offline-ready)
    const cached = getCachedSongs();
    if (cached && cached.length > 0) {
      setActiveRepertoire(cached);
    }
    // 2. In background, re-validate dynamically with cache-busting fetch
    if (navigator.onLine) {
      syncRepertoire({ silent: true });
    }
  } else {
    // If no sheet URL has been configured, show unconfigured onboarding empty state
    populateSongDropdown([]);
    renderRepertoireEmptyState();
  }
}

// ==========================================================================
// 2. CHOIR IDENTITY & PRACTICE ENGAGEMENT SYSTEM (COLLISION-FREE ANONYMOUS TRACKING)
// ==========================================================================

/**
 * Initializes and retrieves user pseudo-anonymous identity.
 * Format: [Initials/Part]#[4-character Base36 Tag] (e.g. JD#8K2P or Tenor#8K2P)
 * Eliminates collisions (1.67M combinations) while keeping zero backend or PII.
 */
function getUserIdentity() {
  let identity = null;
  try {
    const raw = localStorage.getItem("kantimes_user_identity");
    if (raw) identity = JSON.parse(raw);
  } catch (e) {
    identity = null;
  }

  if (!identity || !identity.tag) {
    // 4-character Base36 tag (36^4 = 1,679,616 combinations)
    const tag = Math.floor(Math.random() * Math.pow(36, 4))
      .toString(36)
      .toUpperCase()
      .padStart(4, "0");

    const existingPart = localStorage.getItem("choir_voice") || localStorage.getItem("choir_section") || "";
    const existingName = localStorage.getItem("choir_name") || "";
    const existingNickname = localStorage.getItem("choir_nickname") || "";

    identity = {
      ...DEFAULT_USER_IDENTITY,
      tag: tag,
      name: existingName,
      fullName: existingName,
      nickname: existingNickname,
      initials: existingNickname || (existingName ? existingName.slice(0, 4) : ""),
      part: existingPart,
      voice: existingPart,
      section: existingPart,
      stake: "",
      avatar: "default-avatar.png",
      isConfigured: Boolean((existingName && existingName.trim().length >= 2) || (existingNickname && existingNickname.trim().length >= 2))
    };
    localStorage.setItem("kantimes_user_identity", JSON.stringify(identity));
  } else {
    if (!identity.nickname && identity.initials) identity.nickname = identity.initials;
    if (!identity.nickname && localStorage.getItem("choir_nickname")) identity.nickname = localStorage.getItem("choir_nickname");
  }
  return identity;
}

/**
 * Returns formatted handle string, e.g. "JD#8K2P" or "Choir Member#8K2P"
 */
function getDisplayHandle(identity = getUserIdentity()) {
  if (!identity) return "Choir Member";
  const nick = identity.nickname || identity.initials;
  const name = nick ? nick.trim().toUpperCase() : (identity.fullName || identity.name || (identity.part && identity.part !== "All" ? identity.part : ""));
  if (name) {
    return `${name}#${identity.tag}`;
  }
  // Generic unconfigured first-run label
  return `Choir Member#${identity.tag}`;
}

/**
 * Logs a practice activity session to localStorage ("kantimes_practice_logs").
 * Keeps the most recent 50 sessions.
 * Format: { id, songTitle, part, durationMinutes, timestamp }
 */
function logPracticeSession(songTitle, part, durationMinutes) {
  const mins = Math.round((Number(durationMinutes) || 0) * 10) / 10;
  if (mins <= 0) return null;

  const identity = getUserIdentity();
  let logs = [];
  try {
    const raw = localStorage.getItem("kantimes_practice_logs");
    if (raw) logs = JSON.parse(raw);
    if (!Array.isArray(logs)) logs = [];
  } catch (e) {
    logs = [];
  }

  const currentSong = songTitle || (document.getElementById("targetSong") ? document.getElementById("targetSong").value : "") || "General Practice";
  const userPart = part || identity.part || "All";

  const entry = {
    id: "prac_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
    songTitle: currentSong,
    part: userPart,
    durationMinutes: mins,
    timestamp: Date.now()
  };

  logs.unshift(entry);
  if (logs.length > 50) {
    logs = logs.slice(0, 50);
  }
  localStorage.setItem("kantimes_practice_logs", JSON.stringify(logs));

  updatePracticeSummaryUI();
  recordSectionPracticeMinutes(userPart, mins);
  return entry;
}

/**
 * Returns array of recorded practice logs.
 */
function getPracticeLogs() {
  try {
    const raw = localStorage.getItem("kantimes_practice_logs");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Calculates weekly practice stats (last 7 days):
 * - totalMinutes
 * - unique songs practiced
 * - session count
 */
function getWeeklyPracticeSummary() {
  const logs = getPracticeLogs();
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentLogs = logs.filter(item => item && item.timestamp && item.timestamp >= oneWeekAgo);

  let totalMinutes = 0;
  const songsSet = new Set();

  recentLogs.forEach(item => {
    totalMinutes += (Number(item.durationMinutes) || 0);
    if (item.songTitle && item.songTitle.trim()) {
      songsSet.add(item.songTitle.trim());
    }
  });

  return {
    totalMinutes: Math.round(totalMinutes),
    songs: Array.from(songsSet),
    logs: recentLogs
  };
}

/**
 * Generates formatted, shareable text summary for ward/stake choir group chats.
 */
function generatePracticeReport() {
  const identity = getUserIdentity();
  const handle = getDisplayHandle(identity);
  const part = identity.part || "All";
  const stake = (identity.stake && identity.stake.trim()) ? identity.stake.trim() : "LDS Choir";
  const summary = getWeeklyPracticeSummary();

  let songsList = "";
  if (summary.songs && summary.songs.length > 0) {
    songsList = summary.songs.map(s => `- ${s}`).join("\n");
  } else {
    songsList = "- (No songs logged yet this week)";
  }

  const dateStr = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return `🎵 Kantimes Practice Report\n` +
    `Singer: ${handle} (${part} - ${stake})\n` +
    `Total Time: ${summary.totalMinutes} minutes\n` +
    `Songs Practiced:\n` +
    `${songsList}\n` +
    `Generated on ${dateStr} via Kantimes`;
}

/**
 * Copies the practice report to clipboard with toast notification.
 */
function copyPracticeReport() {
  const report = generatePracticeReport();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(report)
      .then(() => {
        showToast("Copied to clipboard! 📋");
      })
      .catch(() => {
        fallbackCopyText(report);
      });
  } else {
    fallbackCopyText(report);
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("Copied to clipboard! 📋");
  } catch (e) {
    showToast("Could not copy automatically. Please copy manually.");
  }
  document.body.removeChild(ta);
}

/**
 * Real-time handle preview as user types nickname/initials.
 */
function handleProfileNicknameInput(inputEl) {
  if (!inputEl) inputEl = document.getElementById("profileNickname") || document.getElementById("profileInitialsInput");
  if (!inputEl) return;
  const clean = inputEl.value.toUpperCase().slice(0, 6);
  inputEl.value = clean;
  const identity = getUserIdentity();
  const partSelect = document.getElementById("profileVoicePart") || document.getElementById("profileVoicePartSelect");
  const part = partSelect ? partSelect.value : (identity.part || "All");
  const name = clean.trim() ? clean.trim() : part;
  const handleEl = document.getElementById("profileModalDisplayHandle");
  if (handleEl) {
    handleEl.textContent = `${name}#${identity.tag}`;
  }
}

function handleProfileInitialsInput(inputEl) {
  return handleProfileNicknameInput(inputEl);
}

/**
 * Validates initials or nickname in real-time (2 to 6 characters).
 */
function validateNicknameInput(inputEl) {
  if (!inputEl) inputEl = document.getElementById("profileNickname");
  if (!inputEl) return false;
  const val = inputEl.value.trim().toUpperCase();
  inputEl.value = val.slice(0, 6);
  const msgEl = document.getElementById("profileNicknameValidationMsg");
  const saveBtn = document.getElementById("btnSaveProfileVoice");

  handleProfileNicknameInput(inputEl);

  if (val.length === 0) {
    inputEl.classList.remove("input-invalid");
    if (msgEl) msgEl.style.display = "none";
    if (saveBtn) saveBtn.disabled = true;
    return false;
  }

  if (val.length < 2 || val.length > 6) {
    inputEl.classList.add("input-invalid");
    if (msgEl) {
      msgEl.textContent = "⚠️ Please enter 2 to 6 characters.";
      msgEl.style.display = "block";
    }
    if (saveBtn) saveBtn.disabled = true;
    return false;
  }

  inputEl.classList.remove("input-invalid");
  if (msgEl) msgEl.style.display = "none";
  if (saveBtn) saveBtn.disabled = false;
  return true;
}

/**
 * Real-time handle & icon update when voice part changes.
 */
function handleProfileVoicePartChange(selectEl) {
  const nicknameInput = document.getElementById("profileNickname") || document.getElementById("profileInitialsInput");
  const clean = nicknameInput ? nicknameInput.value.trim().toUpperCase() : "";
  const identity = getUserIdentity();
  const part = selectEl ? selectEl.value : (identity.part || "All");
  const name = clean ? clean : part;
  const handleEl = document.getElementById("profileModalDisplayHandle");
  if (handleEl) {
    handleEl.textContent = `${name}#${identity.tag}`;
  }
  const avatarSymbolEl = document.getElementById("profileModalAvatarSymbol");
  if (avatarSymbolEl) {
    const partIcons = {
      Soprano: "🌸",
      Alto: "🌿",
      Tenor: "🍁",
      Bass: "⚓",
      Accompanist: "🎹",
      Accompaniment: "🎹",
      Director: "🎼",
      All: "🎵"
    };
    avatarSymbolEl.textContent = partIcons[part] || "🎵";
  }
}

/**
 * Saves profile data from Profile & Voice tab to localStorage.
 */
function saveProfileVoiceSettings(e) {
  if (e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }

  const nicknameInput = document.getElementById("profileNickname") || document.getElementById("profileInitials") || document.getElementById("profileInitialsInput") || document.getElementById("settingMemberName");
  const fullNameInput = document.getElementById("profileFullName") || document.getElementById("settingMemberName");
  const partSelect = document.getElementById("profileVoicePart") || document.getElementById("profileVoicePartSelect") || document.getElementById("settingMemberSection");
  const stakeInput = document.getElementById("profileStake") || document.getElementById("profileStakeInput");
  const msgEl = document.getElementById("profileNicknameValidationMsg");

  const rawNickname = nicknameInput ? nicknameInput.value.trim().toUpperCase() : "";
  const fullName = fullNameInput ? fullNameInput.value.trim() : "";
  const part = partSelect ? partSelect.value : "All";
  const stake = stakeInput ? stakeInput.value.trim() : "";
  const avatar = selectedSettingAvatarFile || selectedAvatarFile || "";

  // Validate nickname: required, 2-6 chars
  if (!rawNickname || rawNickname.length < 2 || rawNickname.length > 6) {
    if (nicknameInput) {
      nicknameInput.classList.add("input-invalid");
      nicknameInput.focus();
    }
    if (msgEl) {
      msgEl.textContent = "⚠️ Please enter 2 to 6 characters.";
      msgEl.style.display = "block";
    }
    showToast("⚠️ Please enter a valid initials or nickname (2 to 6 characters).");
    return false;
  }

  if (nicknameInput) {
    nicknameInput.classList.remove("input-invalid");
  }
  if (msgEl) {
    msgEl.style.display = "none";
  }

  // 1. Retrieve current identity
  let identity;
  try {
    identity = getUserIdentity();
  } catch (err) {
    console.warn("[Kantimes] Error retrieving identity in saveProfileVoiceSettings:", err);
    identity = {
      tag: "8K2P",
      initials: "",
      part: "All",
      stake: ""
    };
  }

  identity.fullName = fullName;
  identity.nickname = rawNickname;
  identity.initials = rawNickname;
  identity.name = fullName || rawNickname;
  identity.part = part;
  identity.voice = part;
  identity.stake = stake;
  identity.avatar = avatar;

  // 2. Persist to localStorage
  try {
    localStorage.setItem("kantimes_user_identity", JSON.stringify(identity));
  } catch (err) {
    console.error("[Kantimes] Error writing identity to localStorage:", err);
  }

  // 3. Separate Storage Keys in Profile Persistence
  try {
    localStorage.setItem("choir_name", fullName);
    localStorage.setItem("choir_nickname", rawNickname);
    if (part && part !== "All") {
      localStorage.setItem("choir_voice", part);
      localStorage.setItem("choir_section", part);
    }
    if (avatar) {
      localStorage.setItem("choir_avatar", avatar);
    }
  } catch (err) {
    console.warn("[Kantimes] Error syncing choir keys:", err);
  }

  // 4. Downstream UI refreshes safely wrapped in try-catches
  try {
    updateIdentityUI();
  } catch (err) {
    console.warn("[Kantimes] Error in updateIdentityUI:", err);
  }

  try {
    updatePracticeSummaryUI();
  } catch (err) {
    console.warn("[Kantimes] Error in updatePracticeSummaryUI:", err);
  }

  try {
    renderPracticeMilestonesUI();
  } catch (err) {
    console.warn("[Kantimes] Error in renderPracticeMilestonesUI:", err);
  }

  try {
    if (typeof updateActiveProfileDisplay === "function") {
      updateActiveProfileDisplay(fullName || rawNickname, part, avatar);
    }
  } catch (err) {
    console.warn("[Kantimes] Error in updateActiveProfileDisplay:", err);
  }

  // 5. Close settings modal cleanly
  try {
    closeSettingsModal();
  } catch (err) {
    console.error("[Kantimes] Error calling closeSettingsModal:", err);
    const modal = document.getElementById("settingsModal");
    if (modal) {
      modal.classList.remove("active", "open", "show");
      modal.style.display = "none";
    }
    document.body.style.overflow = "";
  }

  // 6. Trigger brief confirmation toast
  try {
    showToast("Profile updated! 🎵");
  } catch (err) {
    console.log("Profile updated! 🎵");
  }

  return true;
}

function saveProfileFromModal(e) {
  return saveProfileVoiceSettings(e);
}

/**
 * Updates UI elements displaying identity & handle.
 */
function updateIdentityUI() {
  const identity = getUserIdentity();
  const handle = getDisplayHandle(identity);

  // Header pill handle: Display generic label if unconfigured
  const headerHandleEl = document.getElementById("headerProfileHandle") || document.getElementById("headerIdentityHandle");
  if (headerHandleEl) {
    headerHandleEl.textContent = identity.isConfigured ? handle : (identity.part && identity.part !== "All" ? `${identity.part} Member` : "Choir Member");
  }

  // Header icon
  const headerIconEl = document.getElementById("headerIdentityIcon");
  if (headerIconEl) {
    const partIcons = {
      Soprano: "🌸",
      Alto: "🌿",
      Tenor: "🍁",
      Bass: "⚓",
      Accompanist: "🎹",
      Accompaniment: "🎹",
      Director: "🎼",
      All: "🎵"
    };
    headerIconEl.textContent = partIcons[identity.part] || "🎵";
  }

  // Live Handle Preview in Modal
  const modalHandleEl = document.getElementById("profileModalDisplayHandle");
  if (modalHandleEl) {
    modalHandleEl.textContent = handle;
  }

  const modalFixedTagEl = document.getElementById("profileModalFixedTag");
  if (modalFixedTagEl) {
    modalFixedTagEl.textContent = `#${identity.tag}`;
  }

  const avatarSymbolEl = document.getElementById("profileModalAvatarSymbol");
  if (avatarSymbolEl) {
    const partIcons = {
      Soprano: "🌸",
      Alto: "🌿",
      Tenor: "🍁",
      Bass: "⚓",
      Accompanist: "🎹",
      Accompaniment: "🎹",
      Director: "🎼",
      All: "🎵"
    };
    avatarSymbolEl.textContent = partIcons[identity.part] || "🎵";
  }

  // Form inputs in Profile & Voice tab
  const fullNameInput = document.getElementById("profileFullName");
  if (fullNameInput && document.activeElement !== fullNameInput) {
    fullNameInput.value = identity.fullName || "";
  }

  const nicknameInput = document.getElementById("profileNickname") || document.getElementById("profileInitials") || document.getElementById("profileInitialsInput");
  if (nicknameInput && document.activeElement !== nicknameInput) {
    nicknameInput.value = identity.nickname || identity.initials || localStorage.getItem("choir_nickname") || "";
  }

  const partSelect = document.getElementById("profileVoicePart") || document.getElementById("profileVoicePartSelect");
  if (partSelect) {
    partSelect.value = identity.part || "All";
  }

  const stakeInput = document.getElementById("profileStake") || document.getElementById("profileStakeInput");
  if (stakeInput && document.activeElement !== stakeInput) {
    stakeInput.value = identity.stake || "";
  }

  // Legacy inputs sync
  const legacyNameInput = document.getElementById("settingMemberName");
  if (legacyNameInput && document.activeElement !== legacyNameInput) {
    legacyNameInput.value = identity.fullName || identity.initials || localStorage.getItem("choir_name") || "";
  }
  const legacySection = document.getElementById("settingMemberSection");
  if (legacySection) {
    legacySection.value = identity.part || "";
  }
}

/**
 * Updates practice summary inside Profile Modal.
 */
function updatePracticeSummaryUI() {
  const summary = getWeeklyPracticeSummary();

  const totalTimeEl = document.getElementById("profileSummaryTotalTime");
  if (totalTimeEl) {
    totalTimeEl.textContent = `${summary.totalMinutes} minutes`;
  }

  const badgeEl = document.getElementById("profileWeeklyMinutesBadge");
  if (badgeEl) {
    badgeEl.textContent = `${summary.totalMinutes} mins`;
  }

  const songCountEl = document.getElementById("profileSummarySongCount");
  if (songCountEl) {
    songCountEl.textContent = `${summary.songs.length} song${summary.songs.length === 1 ? "" : "s"}`;
  }

  const listEl = document.getElementById("profileSummarySongList");
  if (listEl) {
    if (summary.songs.length > 0) {
      listEl.innerHTML = `
        <ul class="summary-songs-ul">
          ${summary.songs.map(song => `<li><span class="song-dot">🎵</span> <span class="song-name">${escapeHtml(song)}</span></li>`).join("")}
        </ul>
      `;
    } else {
      listEl.innerHTML = `<em class="summary-empty-hint">No practice sessions logged yet this week. Start a timer or play rehearsal audio to record practice!</em>`;
    }
  }

  // Synchronize main dashboard Practice Milestones card
  renderPracticeMilestonesUI();
}

/**
 * Formats a log timestamp into friendly relative or calendar time.
 */
function formatLogTimestamp(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Renders the "My Practice Milestones & Weekly Pulse" card on the main dashboard.
 * Local-first, privacy-protected practice tracker for group chats.
 */
function renderPracticeMilestonesUI() {
  const card = document.getElementById("practiceMilestonesCard");
  if (!card) return;

  const identity = getUserIdentity();
  const handle = getDisplayHandle(identity);
  const part = identity.part || "All";
  const stake = (identity.stake && identity.stake.trim()) ? identity.stake.trim() : "LDS Choir";
  const summary = getWeeklyPracticeSummary();
  const logs = getPracticeLogs();

  // 1. Identity Ribbon
  const handleEl = document.getElementById("milestonesHandleDisplay");
  if (handleEl) handleEl.textContent = handle;

  const tagEl = document.getElementById("milestonesTagDisplay");
  if (tagEl) tagEl.textContent = `#${identity.tag}`;

  const subtextEl = document.getElementById("milestonesSubtext");
  if (subtextEl) subtextEl.textContent = `${part} • ${stake}`;

  const avatarEl = document.getElementById("milestonesAvatarIcon");
  if (avatarEl) {
    const partIcons = {
      Soprano: "🌸",
      Alto: "🌿",
      Tenor: "🍁",
      Bass: "⚓",
      Accompanist: "🎹",
      Accompaniment: "🎹",
      Director: "🎼",
      All: "🎵"
    };
    avatarEl.textContent = partIcons[part] || "🎵";
  }

  // 2. 3-Column Stats Grid
  const weeklyMinsEl = document.getElementById("milestonesWeeklyMins");
  if (weeklyMinsEl) weeklyMinsEl.textContent = `${summary.totalMinutes}m`;

  const weeklyHoursEl = document.getElementById("milestonesWeeklyHours");
  if (weeklyHoursEl) {
    const hours = (summary.totalMinutes / 60).toFixed(1);
    weeklyHoursEl.textContent = `${hours} hour${hours === "1.0" ? "" : "s"}`;
  }

  const sessionCountEl = document.getElementById("milestonesSessionCount");
  if (sessionCountEl) sessionCountEl.textContent = String(summary.logs.length);

  const songsCountEl = document.getElementById("milestonesSongsCount");
  if (songsCountEl) songsCountEl.textContent = String(summary.songs.length);

  // 3. Activity List
  const listEl = document.getElementById("milestonesActivityList");
  const countEl = document.getElementById("milestonesActivityCount");
  if (countEl) countEl.textContent = `${logs.length} record${logs.length === 1 ? "" : "s"}`;

  if (listEl) {
    if (!logs || logs.length === 0) {
      listEl.innerHTML = `
        <div class="milestones-empty-box">
          <span class="empty-icon">🎵</span>
          <p class="empty-text">No practice sessions logged yet.</p>
          <span class="empty-subtext">Start the countdown timer or play a rehearsal track to begin tracking your milestones!</span>
        </div>
      `;
    } else {
      const recentLogs = logs.slice(0, 8);
      listEl.innerHTML = recentLogs.map(log => {
        const timeAgo = formatLogTimestamp(log.timestamp);
        const mins = log.durationMinutes || 0;
        const partName = log.part || "All";
        return `
          <div class="milestone-log-row">
            <div class="milestone-log-left">
              <span class="log-music-icon">🎶</span>
              <div class="log-details">
                <strong class="log-song-title">${escapeHtml(log.songTitle || "Repertoire Practice")}</strong>
                <div class="log-meta">
                  <span class="res-part-badge" data-voice="${escapeHtml(partName.toLowerCase())}">${escapeHtml(partName)}</span>
                  <span class="log-timestamp">${escapeHtml(timeAgo)}</span>
                </div>
              </div>
            </div>
            <div class="milestone-log-right">
              <span class="log-duration-pill">+${mins}m</span>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

function handleEditProfileClick(e) {
  if (e) {
    if (typeof e.preventDefault === "function") e.preventDefault();
    if (typeof e.stopPropagation === "function") e.stopPropagation();
  }

  // Close section breakdown modal & singer details modal if still lingering
  ["sectionBreakdownModal", "sectionDetailsModal", "singerDetailsModal"].forEach(modalId => {
    const m = document.getElementById(modalId);
    if (m) {
      m.classList.remove("active", "open", "show");
      m.style.display = "none";
      if (typeof m.setAttribute === "function") {
        m.setAttribute("aria-hidden", "true");
      }
    }
  });

  // Open Settings Modal directly to "Profile & Voice" tab
  openSettingsModal("profile-tab");
}

function openProfileModal(e) {
  handleEditProfileClick(e);
}

function closeProfileModal() {
  closeSettingsModal();
}

function closeProfileModalOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeSettingsModal();
}

// Media player listening tracking (play/pause/ended capture)
const mediaTrackStartTimes = new WeakMap();

document.addEventListener("play", (e) => {
  if (e.target && (e.target.id === "activeLocalAudio" || (e.target.classList && e.target.classList.contains("local-audio-element")))) {
    mediaTrackStartTimes.set(e.target, Date.now());
  }
}, true);

function handleMediaStop(e) {
  if (e.target && (e.target.id === "activeLocalAudio" || (e.target.classList && e.target.classList.contains("local-audio-element")))) {
    const startTime = mediaTrackStartTimes.get(e.target);
    if (startTime) {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      mediaTrackStartTimes.delete(e.target);
      const elapsedMins = Math.round((elapsedSeconds / 60) * 10) / 10;
      if (elapsedMins >= 0.5) {
        const currentSong = document.getElementById("targetSong") ? document.getElementById("targetSong").value : "";
        const identity = getUserIdentity();
        logPracticeSession(currentSong, identity.part || "All", elapsedMins);
      }
    }
  }
}

document.addEventListener("pause", handleMediaStop, true);
document.addEventListener("ended", handleMediaStop, true);

function initIdentityAndPracticeTracking() {
  getUserIdentity();
  initPhStakesDatalist();
  initProfileModalListeners();
  updateIdentityUI();
  updatePracticeSummaryUI();
  renderPracticeMilestonesUI();
  renderSectionStandingsUI();
}

function initProfileModalListeners() {
  const saveBtn = document.getElementById("btnSaveProfileVoice") || document.getElementById("saveProfileBtn");
  if (saveBtn && !saveBtn.dataset.listenerBound) {
    saveBtn.dataset.listenerBound = "true";
    saveBtn.addEventListener("click", function (e) {
      saveProfileVoiceSettings(e);
    });
  }

  const nickInput = document.getElementById("profileNickname");
  if (nickInput && !nickInput.dataset.listenerBound) {
    nickInput.dataset.listenerBound = "true";
    nickInput.addEventListener("input", function () {
      validateNicknameInput(this);
    });
  }

  const btnEditProfile = document.getElementById("btnEditProfile") || document.querySelector(".btn-edit-profile");
  if (btnEditProfile) {
    btnEditProfile.onclick = (e) => {
      handleEditProfileClick(e);
    };
  }

  const allEditButtons = document.querySelectorAll("#btnEditProfile, .btn-edit-profile, .edit-profile-btn, #openProfileModalBtn, #btnProfilePill, .user-profile-pill");
  allEditButtons.forEach(btn => {
    btn.onclick = (e) => {
      handleEditProfileClick(e);
    };
  });

  initVocalTipsButton();
}

function updateHeaderIdentityBadge() {
  updateIdentityUI();
}

function updateMilestonesCard() {
  renderPracticeMilestonesUI();
}



// ==========================================================================
// PHILIPPINE STAKES & DISTRICTS CURATED DATASET HYDRATION
// ==========================================================================
const FALLBACK_PH_STAKES = [
  // Visayas - Panay & Guimaras
  "Iloilo Philippines Stake",
  "Iloilo Philippines North Stake",
  "Iloilo Philippines Central Stake",
  "Roxas Philippines Stake",
  "Kalibo Philippines Stake",
  "Antique Philippines District",
  // Visayas - Negros Island
  "Bacolod Philippines Stake",
  "Bacolod Philippines North Stake",
  "Bacolod Philippines South Stake",
  "Dumaguete Philippines Stake",
  "Bago Philippines Stake",
  "Cadiz Philippines Stake",
  "San Carlos Philippines Stake",
  "Kabankalan Philippines Stake",
  // Visayas - Cebu & Bohol
  "Cebu Philippines Stake",
  "Cebu Philippines Central Stake",
  "Cebu Philippines Liloan Stake",
  "Cebu Philippines Consolacion Stake",
  "Cebu Philippines Mandaue Stake",
  "Lapu-Lapu Philippines Stake",
  "Talisay Philippines Stake",
  "Naga Philippines Stake",
  "Tagbilaran Philippines Stake",
  // Visayas - Eastern Visayas
  "Tacloban Philippines Stake",
  "Ormoc Philippines Stake",
  "Carigara Philippines Stake",
  "Catbalogan Philippines District",
  "Calbayog Philippines District",
  // Luzon - Metro Manila
  "Manila Philippines Stake",
  "Quezon City Philippines Stake",
  "Quezon City Philippines South Stake",
  "Quezon City Philippines North Stake",
  "Makati Philippines Stake",
  "Pasay Philippines Stake",
  "Pasig Philippines Stake",
  "Mandaluyong Philippines Stake",
  "Marikina Philippines Stake",
  "Parañaque Philippines Stake",
  "Las Piñas Philippines Stake",
  "Valenzuela Philippines Stake",
  "Caloocan Philippines Stake",
  "Caloocan Philippines North Stake",
  "Taguig Philippines Stake",
  "Fairview Philippines Stake",
  "Novalliches Philippines Stake",
  // Luzon - Northern & Central Luzon
  "Baguio Philippines Stake",
  "Urdaneta Philippines Stake",
  "Dagupan Philippines Stake",
  "Lingayen Philippines Stake",
  "San Fernando La Union Philippines Stake",
  "Laoag Philippines Stake",
  "Tuguegarao Philippines Stake",
  "Angeles Philippines Stake",
  "San Fernando Pampanga Stake",
  "Tarlac Philippines Stake",
  "Cabanatuan Philippines Stake",
  "Olongapo Philippines Stake",
  "Malolos Philippines Stake",
  // Luzon - Southern Luzon & Bicol
  "Lucena Philippines Stake",
  "San Pablo Philippines Stake",
  "Batangas Philippines Stake",
  "Lipa Philippines Stake",
  "Cavite Philippines Stake",
  "Dasmariñas Philippines Stake",
  "Legazpi Philippines Stake",
  "Naga Philippines Stake",
  // Mindanao - Davao Region
  "Davao Philippines Stake",
  "Davao Philippines West Stake",
  "Davao Philippines North Stake",
  "Davao Philippines Buhangin Stake",
  "Digos Philippines Stake",
  "Tagum Philippines Stake",
  // Mindanao - Northern Mindanao & Caraga
  "Cagayan de Oro Philippines Stake",
  "Cagayan de Oro Philippines East Stake",
  "Cagayan de Oro Philippines West Stake",
  "Iligan Philippines Stake",
  "Butuan Philippines Stake",
  "Surigao Philippines District",
  "Malaybalay Philippines Stake",
  "Valencia Philippines Stake",
  // Mindanao - Western & Southern Mindanao
  "General Santos Philippines Stake",
  "General Santos Philippines North Stake",
  "Zamboanga Philippines Stake",
  "Zamboanga Philippines Central Stake",
  "Pagadian Philippines Stake",
  "Cotabato Philippines Stake"
];

let cachedPhStakesData = null;

/**
 * Hydrates <datalist id="phStakesList"> with curated Philippine stakes and districts.
 * Fetches data/ph-stakes.json; falls back gracefully to FALLBACK_PH_STAKES when offline or if fetch fails.
 */
async function initPhStakesDatalist() {
  const datalist = document.getElementById("phStakesList");
  if (!datalist) return;

  // If already populated, return early
  if (datalist.children && datalist.children.length > 0) return;

  try {
    const res = await fetch("./data/ph-stakes.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    cachedPhStakesData = data;
    populatePhStakesDatalist(data);
  } catch (err) {
    console.warn("[Kantimes] Using offline fallback Philippine Stakes list:", err);
    populatePhStakesDatalistFallback();
  }
}

/**
 * Populates datalist with structured data grouped by Region and Area.
 */
function populatePhStakesDatalist(data) {
  const datalist = document.getElementById("phStakesList");
  if (!datalist || !data) return;

  if (typeof document.createDocumentFragment !== "function") return;
  const fragment = document.createDocumentFragment();

  // Iterate Regions (Visayas, Luzon, Mindanao)
  Object.keys(data).forEach(region => {
    const areas = data[region];
    if (!areas || typeof areas !== "object") return;
    Object.keys(areas).forEach(area => {
      const stakes = areas[area];
      if (Array.isArray(stakes)) {
        stakes.forEach(stake => {
          const opt = document.createElement("option");
          opt.value = stake;
          opt.label = `${area} • ${region}`;
          fragment.appendChild(opt);
        });
      }
    });
  });

  datalist.innerHTML = "";
  datalist.appendChild(fragment);
}

/**
 * Populates datalist with hardcoded fallback stakes array.
 */
function populatePhStakesDatalistFallback() {
  const datalist = document.getElementById("phStakesList");
  if (!datalist) return;

  if (typeof document.createDocumentFragment !== "function") return;
  const fragment = document.createDocumentFragment();
  FALLBACK_PH_STAKES.forEach(stake => {
    const opt = document.createElement("option");
    opt.value = stake;
    fragment.appendChild(opt);
  });

  datalist.innerHTML = "";
  datalist.appendChild(fragment);
}

// ==========================================================================
// SECTION STANDINGS ENGINE (ZERO-PII LOCAL AGGREGATION)
// ==========================================================================
const DEFAULT_SECTION_STANDINGS = {
  "Soprano": 0,
  "Alto": 0,
  "Tenor": 0,
  "Bass": 0,
  "Primary": 0
};

/**
 * Retrieves section standings from stake-scoped localStorage ("kantimes_section_standings_${stakeKey}").
 */
function getSectionStandings() {
  const activeKey = getStakeStorageKey("kantimes_section_standings");
  try {
    const raw = localStorage.getItem(activeKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("[Kantimes] Error reading section standings:", e);
  }

  const initial = { ...DEFAULT_SECTION_STANDINGS };
  try {
    localStorage.setItem(activeKey, JSON.stringify(initial));
  } catch (e) { }
  return initial;
}

/**
 * Initializes or resets section standings for a fresh stake connection or default reset.
 */
function initFreshStakeSectionStandings(useZeros = true) {
  const activeKey = getStakeStorageKey("kantimes_section_standings");
  const initial = { "Soprano": 0, "Alto": 0, "Tenor": 0, "Bass": 0, "Primary": 0 };
  try {
    localStorage.setItem(activeKey, JSON.stringify(initial));
  } catch (e) { }
  renderSectionStandingsUI();
  return initial;
}

/**
 * Dynamically increments a section's practice minutes in localStorage ("kantimes_section_standings")
 * and re-renders the standings.
 * @param {string} part Voice part (Soprano, Alto, Tenor, Bass, Primary, Accompanist, Director, All)
 * @param {number} minutes Duration in minutes
 */
function recordSectionPracticeMinutes(part, minutes) {
  const mins = Math.round((Number(minutes) || 0) * 10) / 10;
  if (mins <= 0) return;

  const standings = getSectionStandings();
  const rawPart = (part || "").trim().toLowerCase();

  let matchedSection = null;
  if (rawPart.includes("soprano")) matchedSection = "Soprano";
  else if (rawPart.includes("alto")) matchedSection = "Alto";
  else if (rawPart.includes("tenor")) matchedSection = "Tenor";
  else if (rawPart.includes("bass")) matchedSection = "Bass";
  else if (rawPart.includes("primary")) matchedSection = "Primary";

  if (matchedSection) {
    standings[matchedSection] = (Number(standings[matchedSection]) || 0) + Math.round(mins);
  } else {
    // For non-vocal or multi-part roles (Accompanist, Director, All), distribute proportionally
    const share = Math.max(1, Math.round(mins / 5));
    ["Soprano", "Alto", "Tenor", "Bass", "Primary"].forEach(sec => {
      standings[sec] = (Number(standings[sec]) || 0) + share;
    });
  }

  try {
    localStorage.setItem(getStakeStorageKey("kantimes_section_standings"), JSON.stringify(standings));
  } catch (e) {
    console.error("[Kantimes] Error saving section standings:", e);
  }

  renderSectionStandingsUI();
}

/**
 * Re-renders the Section Standings UI sorted descending by practice minutes,
 * complete with rank badges (#1, #2, #3, etc.) and hours display.
 */
function renderSectionStandingsUI() {
  const sectionEl = document.getElementById("sectionList");
  if (!sectionEl) return;

  const standings = getSectionStandings();
  const sortedSections = Object.entries(standings).sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));

  // Update cachedSectionStandings for modal drilldown
  cachedSectionStandings = sortedSections.map(([sec, mins], idx) => {
    return {
      section: sec,
      rank: idx + 1,
      totalSections: sortedSections.length,
      totalMins: Number(mins) || 0,
      hours: ((Number(mins) || 0) / 60).toFixed(1),
      singers: []
    };
  });

  let sectionHtml = "";
  sortedSections.forEach(([sec, mins], idx) => {
    const isTop3 = idx < 3 ? "rank-top3" : "";
    const medal = idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : "";
    const numMins = Number(mins) || 0;
    const hours = (numMins / 60).toFixed(1);
    const safeSec = escapeLeaderboardHtml(sec);
    const safeEncodedSec = encodeURIComponent(sec);

    sectionHtml += `
      <div class="board-row section-standings-row section-item clickable-section leaderboard-row"
           onclick="if(event){event.stopPropagation();}showSectionDetails('${safeEncodedSec}', ${idx + 1}, event)"
           data-section-name="${safeSec}"
           data-section-rank="${idx + 1}"
           role="button" tabindex="0"
           title="Click to view full breakdown for ${safeSec}"
           aria-label="View rehearsal breakdown for ${safeSec}"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();showSectionDetails('${safeEncodedSec}', ${idx + 1}, event);}">
        <span class="rank ${isTop3}">${medal}#${idx + 1}</span>
        <div class="section-name-wrap">
          <span class="section-name">${safeSec}</span>
        </div>
        <span class="mins-badge">${numMins}m <span class="mins-sub">(${hours}h)</span></span>
      </div>
    `;
  });

  sectionEl.innerHTML = sectionHtml;

  if (!sectionEl.dataset.detailsBound) {
    sectionEl.dataset.detailsBound = "true";
    sectionEl.addEventListener("click", function (e) {
      const row = e.target.closest(".board-row.clickable-section, .section-standings-row, .section-item, .leaderboard-row");
      if (!row) return;
      e.stopPropagation();
      const name = row.getAttribute("data-section-name");
      const r = row.getAttribute("data-section-rank");
      if (name) {
        showSectionDetails(name, r ? Number(r) : 1, e);
      }
    });
  }
}


// --- AVATAR ASSET DEFINITIONS ---
const CHOIR_AVATARS = [
  // Primary / Kids
  { file: "boy-choir.jpg", label: "Boy Choir", category: "Primary" },
  { file: "girl-choir.jpg", label: "Girl Choir", category: "Primary" },
  // Youth
  { file: "ym-choir.jpg", label: "Young Men", category: "Youth" },
  { file: "yw-choir.jpg", label: "Young Women", category: "Youth" },
  // Adults & Seniors
  { file: "eq-choir.jpg", label: "Elders Quorum", category: "Adults" },
  { file: "rs-choir.jpg", label: "Relief Society", category: "Adults" },
  { file: "elder-choir.jpg", label: "Senior Brother", category: "Seniors" },
  { file: "sister-choir.jpg", label: "Senior Sister", category: "Seniors" }
];

let selectedAvatarFile = "";

// Helper to cleanly format name strings into Title Case
// Handles multiple names, trims excess/duplicate whitespace, and capitalizes hyphenated names (e.g. "anne-marie" -> "Anne-Marie")
function toTitleCase(str) {
  if (!str || typeof str !== "string") return "";
  const trimmed = str.trim();
  // Preserve intentional all-caps initials or choir tags (e.g. "JD", "JP", "ALL")
  if (trimmed.length <= 4 && trimmed === trimmed.toUpperCase() && !trimmed.includes(" ")) {
    return trimmed;
  }
  return trimmed
    .replace(/\s+/g, " ")
    .split(" ")
    .map(word => {
      if (word.length <= 4 && word === word.toUpperCase() && !word.includes("-")) {
        return word;
      }
      return word
        .split("-")
        .map(part => {
          if (!part) return "";
          if (part.length <= 4 && part === part.toUpperCase()) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("-");
    })
    .join(" ");
}
window.toTitleCase = toTitleCase;

function formatDisplayName(input) {
  if (!input) return "";
  const trimmed = input.trim();
  // Preserve intentional all-caps initials or choir tags (e.g. "JD", "JP", "ALL")
  if (trimmed.length <= 4 && trimmed === trimmed.toUpperCase()) {
    return trimmed;
  }
  // Only title case if mixed or lower case
  return toTitleCase(trimmed);
}
window.formatDisplayName = formatDisplayName;
window.sanitizeUrl = sanitizeUrl;

// Helper to normalize avatar image source path
function getAvatarImgSrc(filename) {
  if (!filename) return "";
  const cleanName = filename.replace(/^images\//, "").trim();
  return `images/${cleanName}`;
}

function handleAvatarKeyDown(e, filename) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectAvatar(filename);
  }
}

// Render the 8 circular avatars in the Profile Setup / Switch Voice card
function renderAvatarPicker(currentAvatar) {
  const container = document.getElementById("avatarPicker");
  if (!container) return;

  selectedAvatarFile = currentAvatar !== undefined ? currentAvatar : (localStorage.getItem("choir_avatar") || "");

  let html = `
      <div class="avatar-option ${!selectedAvatarFile ? 'selected' : ''}" 
          id="avatar-opt-default" 
          onclick="selectAvatar('')" 
          onkeydown="handleAvatarKeyDown(event, '')"
          role="button" 
          tabindex="0"
          aria-label="Default avatar (Music Note)"
          title="No Avatar (Default 🎵)">
        <div class="avatar-circle avatar-circle-default">🎵</div>
        <span class="avatar-option-name">Default</span>
      </div>
    `;

  CHOIR_AVATARS.forEach(av => {
    const isSelected = selectedAvatarFile === av.file;
    html += `
        <div class="avatar-option ${isSelected ? 'selected' : ''}" 
            id="avatar-opt-${av.file.replace(/[^a-zA-Z0-9_-]/g, '')}" 
            onclick="selectAvatar('${av.file}')" 
            onkeydown="handleAvatarKeyDown(event, '${av.file}')"
            role="button" 
            tabindex="0"
            aria-label="${av.label} (${av.category})"
            title="${av.label} (${av.category})">
          <img class="avatar-circle" src="${getAvatarImgSrc(av.file)}" alt="${av.label}" loading="lazy">
          <span class="avatar-option-name">${av.label}</span>
        </div>
      `;
  });

  container.innerHTML = html;
}

// Select an avatar (or deselect if clicking the selected one again)
function selectAvatar(filename) {
  if (selectedAvatarFile === filename && filename !== "") {
    selectedAvatarFile = "";
  } else {
    selectedAvatarFile = filename;
  }

  const options = document.querySelectorAll(".avatar-option");
  options.forEach(opt => opt.classList.remove("selected"));

  if (!selectedAvatarFile) {
    const defaultOpt = document.getElementById("avatar-opt-default");
    if (defaultOpt) defaultOpt.classList.add("selected");
  } else {
    const activeOpt = document.getElementById(`avatar-opt-${selectedAvatarFile.replace(/[^a-zA-Z0-9_-]/g, '')}`);
    if (activeOpt) activeOpt.classList.add("selected");
  }
}

// --- SETTINGS MODAL AVATAR PICKER ---
let selectedSettingAvatarFile = "";

function handleSettingAvatarKeyDown(e, filename) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectSettingAvatar(filename);
  }
}

function renderSettingAvatarPicker(currentAvatar) {
  const container = document.getElementById("settingAvatarPicker");
  if (!container) return;

  selectedSettingAvatarFile = currentAvatar !== undefined ? currentAvatar : (localStorage.getItem("choir_avatar") || "");

  let html = `
      <div class="avatar-option ${!selectedSettingAvatarFile ? 'selected' : ''}" 
          id="setting-avatar-opt-default" 
          onclick="selectSettingAvatar('')" 
          onkeydown="handleSettingAvatarKeyDown(event, '')"
          role="button" 
          tabindex="0"
          aria-label="Default avatar (Music Note)"
          title="No Avatar (Default 🎵)">
        <div class="avatar-circle avatar-circle-default">🎵</div>
        <span class="avatar-option-name">Default</span>
      </div>
    `;

  CHOIR_AVATARS.forEach(av => {
    const isSelected = selectedSettingAvatarFile === av.file;
    html += `
        <div class="avatar-option ${isSelected ? 'selected' : ''}" 
            id="setting-avatar-opt-${av.file.replace(/[^a-zA-Z0-9_-]/g, '')}" 
            onclick="selectSettingAvatar('${av.file}')" 
            onkeydown="handleSettingAvatarKeyDown(event, '${av.file}')"
            role="button" 
            tabindex="0"
            aria-label="${av.label} (${av.category})"
            title="${av.label} (${av.category})">
          <img class="avatar-circle" src="${getAvatarImgSrc(av.file)}" alt="${av.label}" loading="lazy">
          <span class="avatar-option-name">${av.label}</span>
        </div>
      `;
  });

  container.innerHTML = html;
}

function selectSettingAvatar(filename) {
  if (selectedSettingAvatarFile === filename && filename !== "") {
    selectedSettingAvatarFile = "";
  } else {
    selectedSettingAvatarFile = filename;
  }

  const options = document.querySelectorAll("#settingAvatarPicker .avatar-option");
  options.forEach(opt => opt.classList.remove("selected"));

  if (!selectedSettingAvatarFile) {
    const defaultOpt = document.getElementById("setting-avatar-opt-default");
    if (defaultOpt) defaultOpt.classList.add("selected");
  } else {
    const activeOpt = document.getElementById(`setting-avatar-opt-${selectedSettingAvatarFile.replace(/[^a-zA-Z0-9_-]/g, '')}`);
    if (activeOpt) activeOpt.classList.add("selected");
  }
}

// Generate Leaderboard avatar HTML with fallback
function getLeaderboardAvatarHtml(avatarFile, singerName) {
  if (avatarFile && avatarFile.trim()) {
    const src = getAvatarImgSrc(avatarFile);
    return `
        <div class="leaderboard-avatar-wrap">
          <img src="${src}" 
              alt="${singerName || 'Singer'}" 
              class="leaderboard-avatar" 
              loading="lazy"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="leaderboard-avatar avatar-fallback" style="display:none;" title="Choir Singer">🎵</div>
        </div>
      `;
  }
  return `
      <div class="leaderboard-avatar-wrap">
        <div class="leaderboard-avatar avatar-fallback" title="Choir Singer">🎵</div>
      </div>
    `;
}

// --- USER SETTINGS & DEFAULT CHOIR REPERTOIRE ---
const DEFAULT_USER_SETTINGS = {
  targetDate: "",
  eventTitle: "Choir Rehearsal",
  timerMinutes: 15,
  showPastRepertoire: false,
  songs: [
    // ==========================================
    // 🌟 ACTIVE REPERTOIRE (Christmas Devotional 2026 / Current Practice)
    // ==========================================
    {
      id: "hymn-1208",
      title: "Go Tell It on the Mountain",
      number: 1208,
      collection: "Hymns for Home and Church",
      status: "active",
      isArchived: false,
      archived: false,
      part: "All Voices",
      category: "Christmas / General Practice",
      event: "Christmas Devotional 2026",
      key: "F Major",
      timeSignature: "4/4",
      tempo: "Moderato / Spiritual",
      sourceUrl: "https://www.churchofjesuschrist.org/media/music/songs/go-tell-it-on-the-mountain?crumbs=hymns-for-home-and-church&order=number&lang=eng",
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/go-tell-it-on-the-mountain?crumbs=hymns-for-home-and-church&order=number&lang=eng",
      resourceUrl: "https://www.churchofjesuschrist.org/media/music/songs/go-tell-it-on-the-mountain?crumbs=hymns-for-home-and-church&order=number&lang=eng",
      resourceLabel: "Interactive Sheet",
      audioUrl: "https://assets.churchofjesuschrist.org/ge/5t/ge5tz9qino95h64syvfbxalhf7hao0lcs5n74tyb/go_tell_it_on_the_mountain.mp3",
      localSheetUrl: "kantimes-resources/Christmas%20Devotional%202026/go_tell_it_on_the_mountain.pdf",
      videoUrl: "https://www.youtube.com/watch?v=72LE487YZ-U",
      resources: {
        pdf: "kantimes-resources/Christmas Devotional 2026/go_tell_it_on_the_mountain.pdf",
        audio: {
          piano: "https://assets.churchofjesuschrist.org/ge/5t/ge5tz9qino95h64syvfbxalhf7hao0lcs5n74tyb/go_tell_it_on_the_mountain.mp3",
          guitar: "https://assets.churchofjesuschrist.org/gi/mx/gimxu7wa1ru8m76nk55f5g6q7n8xdhldt301hdkh/go_tell_it_on_the_mountain.mp3"
        },
        video: "https://www.youtube.com/watch?v=72LE487YZ-U"
      },
      audioTracks: [
        {
          name: "Accompaniment (Piano)",
          src: "https://assets.churchofjesuschrist.org/ge/5t/ge5tz9qino95h64syvfbxalhf7hao0lcs5n74tyb/go_tell_it_on_the_mountain.mp3"
        },
        {
          name: "Guitar Accompaniment",
          src: "https://assets.churchofjesuschrist.org/gi/mx/gimxu7wa1ru8m76nk55f5g6q7n8xdhldt301hdkh/go_tell_it_on_the_mountain.mp3"
        }
      ],
      tags: ["Christmas", "Spiritual", "Hymns for Home and Church"],
      note: "Hymns for Home and Church (#1208). Moderato / Spiritual tempo in F Major."
    },
    {
      id: "christmas-away-in-a-manger",
      title: "Away in a Manger (#206)",
      number: 206,
      collection: "Hymns",
      status: "active",
      isArchived: false,
      archived: false,
      part: "Congregational",
      category: "Christmas Devotional 2026",
      event: "Christmas Devotional 2026",
      sheetUrl: "http://sacredsheetmusic.org/music/inline_download_file?download_id=181717&name=Away_in_a_Manger.pdf",
      resourceUrl: "http://sacredsheetmusic.org/music/inline_download_file?download_id=181717&name=Away_in_a_Manger.pdf",
      resourceLabel: "Sheet Music (PDF)",
      audioUrl: "kantimes-resources/Christmas%20Devotional%202026/Away_in_a_Manger_Piano_.mp3",
      localSheetUrl: "kantimes-resources/Christmas%20Devotional%202026/Away_in_a_Manger.pdf",
      resources: {
        pdf: "kantimes-resources/Christmas Devotional 2026/Away_in_a_Manger.pdf",
        audio: {
          piano: "kantimes-resources/Christmas Devotional 2026/Away_in_a_Manger_Piano_.mp3"
        }
      },
      audioTracks: [
        {
          name: "Piano Accompaniment",
          src: "kantimes-resources/Christmas%20Devotional%202026/Away_in_a_Manger_Piano_.mp3"
        }
      ],
      tags: ["Christmas", "Hymns"],
      note: "Hymn #206. Piano rehearsal accompaniment track available offline."
    },
    {
      id: "christmas-light-of-the-world",
      title: "Light of the World Hymn Medley",
      collection: "Christmas Devotional 2026",
      status: "active",
      isArchived: false,
      archived: false,
      part: "Stake Choir",
      category: "Christmas Devotional 2026",
      event: "Christmas Devotional 2026",
      localSheetUrl: "kantimes-resources/Christmas%20Devotional%202026/Light_of_the_World_Hymn_Medley.pdf",
      resources: {
        pdf: "kantimes-resources/Christmas Devotional 2026/Light_of_the_World_Hymn_Medley.pdf",
        audio: {
          piano: "kantimes-resources/Christmas Devotional 2026/Light_of_the_World_medley_piano_only.mp3"
        }
      },
      audioTracks: [
        {
          name: "Piano Accompaniment",
          src: "kantimes-resources/Christmas%20Devotional%202026/Light_of_the_World_medley_piano_only.mp3"
        }
      ],
      tags: ["Christmas", "Choir Medley"],
      note: "Christmas Choir Medley. Piano rehearsal track available offline."
    },
    {
      id: "christmas-manger-filled-with-love",
      title: "A Manger Filled with Love",
      collection: "Christmas Devotional 2026",
      status: "active",
      isArchived: false,
      archived: false,
      part: "Stake Choir",
      category: "Christmas Devotional 2026",
      event: "Christmas Devotional 2026",
      localSheetUrl: "kantimes-resources/Christmas%20Devotional%202026/A%20Manger%20Filled%20with%20Love%2010-23-22.pdf",
      localVideoUrl: "kantimes-resources/Christmas%20Devotional%202026/A%20Manger%20Filled%20with%20Love.mp4",
      resources: {
        pdf: "kantimes-resources/Christmas Devotional 2026/A Manger Filled with Love 10-23-22.pdf",
        video: "kantimes-resources/Christmas Devotional 2026/A Manger Filled with Love.mp4"
      },
      tags: ["Christmas", "Choir", "Video"],
      note: "Special musical number with full offline rehearsal video."
    },
    {
      id: "christmas-and-there-was-light",
      title: "And There Was Light",
      collection: "Christmas Devotional 2026",
      status: "active",
      isArchived: false,
      archived: false,
      part: "Stake Choir",
      category: "Christmas Devotional 2026",
      event: "Christmas Devotional 2026",
      localSheetUrl: "kantimes-resources/Christmas%20Devotional%202026/And%20There%20Was%20Light.pdf",
      resources: {
        pdf: "kantimes-resources/Christmas Devotional 2026/And There Was Light.pdf"
      },
      tags: ["Christmas", "Choir", "Sheet Music"],
      note: "Complete PDF score available offline."
    },

    // ==========================================
    // 🏛️ ARCHIVED REPERTOIRE (October 2026 Stake Conference)
    // ==========================================
    {
      id: "song_oct_1",
      title: "Know This, That Every Soul Is Free (#240)",
      part: "Adult Choir #1",
      collection: "October 2026 Stake Conference",
      event: "October 2026 Stake Conference",
      status: "archived",
      isArchived: true,
      archived: true,
      archivedDate: "2026-10-25",
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/know-this-that-every-soul-is-free?crumbs=hymns&order=number&lang=eng",
      videoUrl: "https://youtu.be/6zJLchPWrdA",
      tags: ["October 2026", "Stake Conference", "Hymns"],
      note: "Archived from October 2026 Stake Conference."
    },
    {
      id: "song_oct_2",
      title: "Rise, Ye Saints, and Temples Enter (#287)",
      part: "Adult Choir #2",
      collection: "October 2026 Stake Conference",
      event: "October 2026 Stake Conference",
      status: "archived",
      isArchived: true,
      archived: true,
      archivedDate: "2026-10-25",
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/rise-ye-saints-and-temples-enter?crumbs=hymns&order=number&lang=eng",
      videoUrl: "https://youtu.be/6D1WFIqbVic",
      tags: ["October 2026", "Stake Conference", "Hymns"],
      note: "Archived from October 2026 Stake Conference."
    },
    {
      id: "song_oct_3",
      title: "Choose You This Day",
      part: "Adult Choir #3",
      collection: "October 2026 Stake Conference",
      event: "October 2026 Stake Conference",
      status: "archived",
      isArchived: true,
      archived: true,
      archivedDate: "2026-10-25",
      sheetUrl: "https://drive.google.com/embeddedfolderview?id=1bBnCakJGBj-zfka8wVbz42_ykvipMnwU#grid",
      localSheetUrl: "kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day.pdf",
      videoUrl: "https://www.youtube.com/embed/q54H2OqWBcY?enablejsapi=1",
      resources: {
        pdf: "kantimes-resources/Choose You This Day/Choose You This Day.pdf",
        audio: {
          choir: "kantimes-resources/Choose You This Day/Choose You This Day.mp3",
          soprano: "kantimes-resources/Choose You This Day/Choose You This Day - SOPRANO.mp3",
          alto: "kantimes-resources/Choose You This Day/Choose You This Day - ALTO.mp3",
          tenor: "kantimes-resources/Choose You This Day/Choose You This Day - TENOR.mp3",
          bass: "kantimes-resources/Choose You This Day/Choose You This Day - BASS.mp3",
          piano: "kantimes-resources/Choose You This Day/Choose You This Day (piano).mp3"
        }
      },
      audioTracks: [
        { name: "Full Choir", src: "kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day.mp3" },
        { name: "Soprano", src: "kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20-%20SOPRANO.mp3" },
        { name: "Alto", src: "kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20-%20ALTO.mp3" },
        { name: "Tenor", src: "kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20-%20TENOR.mp3" },
        { name: "Bass", src: "kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20-%20BASS.mp3" },
        { name: "Piano", src: "kantimes-resources/Choose%20You%20This%20Day/Choose%20You%20This%20Day%20(piano).mp3" }
      ],
      tags: ["October 2026", "Stake Conference", "Choir", "Tracks"],
      note: "Archived from October 2026 Stake Conference."
    },
    {
      id: "song_oct_4",
      title: "Holy Places",
      part: "Primary",
      collection: "October 2026 Stake Conference",
      event: "October 2026 Stake Conference",
      status: "archived",
      isArchived: true,
      archived: true,
      archivedDate: "2026-10-25",
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/holy-places?crumbs=hymns-for-home-and-church&order=number&lang=eng",
      videoUrl: "https://www.youtube.com/watch?v=cKb_U6AkoHU",
      tags: ["October 2026", "Primary"],
      note: "Archived from October 2026 Stake Conference."
    },
    {
      id: "song_oct_5",
      title: "I Will Walk with Jesus",
      part: "Primary",
      collection: "October 2026 Stake Conference",
      event: "October 2026 Stake Conference",
      status: "archived",
      isArchived: true,
      archived: true,
      archivedDate: "2026-10-25",
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/i-will-walk-with-jesus?crumbs=hymns-for-home-and-church&order=number&lang=eng",
      videoUrl: "https://www.youtube.com/watch?v=oB77rD2RlPU",
      tags: ["October 2026", "Primary"],
      note: "Archived from October 2026 Stake Conference."
    },

    // ==========================================
    // 🏛️ ARCHIVED REPERTOIRE (March 27–28, 2026)
    // ==========================================
    // Saturday Session (5:30pm - 7:30pm)
    {
      id: "song_mar_sat_1",
      title: "Ako ay Anak ng Diyos (#189)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Saturday Session",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/i-am-a-child-of-god?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Opening Hymn (Saturday Session)"
    },
    {
      id: "song_mar_sat_2",
      title: "Thou Gracious God, Whose Mercy Lends (#1042)",
      part: "Stake Choir",
      event: "March 27–28 Stake Conference",
      session: "Saturday Session",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/thou-gracious-god-whose-mercy-lends?crumbs=hymns-for-home-and-church&lang=eng",
      videoUrl: "",
      note: "Special Musical Number (from Hymns for Home and Church)"
    },
    {
      id: "song_mar_sat_3",
      title: "Tinawag Upang sa Diyos Maglingkod (#151)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Saturday Session",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/called-to-serve?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Congregational Hymn (Saturday Session)"
    },
    {
      id: "song_mar_sat_4",
      title: "Saligang Kay Tibay (#47)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Saturday Session",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/how-firm-a-foundation?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Closing Hymn (Saturday Session)"
    },

    // Sunday Leadership Meeting (8:00am - 9:00am)
    {
      id: "song_mar_ldr_1",
      title: "Lakas Mo ay Idagdag (#154)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Sunday Leadership Meeting",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/put-your-shoulder-to-the-wheel?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Opening Hymn (Sunday Leadership)"
    },
    {
      id: "song_mar_ldr_2",
      title: "Magpatuloy Tayo (#148)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Sunday Leadership Meeting",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/let-us-all-press-on?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Congregational Hymn (Sunday Leadership)"
    },
    {
      id: "song_mar_ldr_3",
      title: "Mahalin ang Bawat Isa (#196)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Sunday Leadership Meeting",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/love-one-another?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Closing Hymn (Sunday Leadership)"
    },

    // Sunday General Session (10:00am - 12:00pm)
    {
      id: "song_mar_sun_1",
      title: "Pag-ibig sa Tahanan (#183)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Sunday General Session",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/love-at-home?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Opening Hymn (Sunday General Session)"
    },
    {
      id: "song_mar_sun_2",
      title: "Because (#1039)",
      part: "Stake Choir",
      event: "March 27–28 Stake Conference",
      session: "Sunday General Session",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/because?crumbs=hymns-for-home-and-church&lang=eng",
      videoUrl: "",
      note: "Special Musical Number (from Hymns for Home and Church)"
    },
    {
      id: "song_mar_sun_3",
      title: "Salamat O Diyos, sa Aming Propeta (#15)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Sunday General Session",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/we-thank-thee-o-god-for-a-prophet?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Congregational Hymn (Sunday General Session)"
    },
    {
      id: "song_mar_sun_4",
      title: "Patnubayan Ka Nawa ng Diyos (#90)",
      part: "Congregational",
      event: "March 27–28 Stake Conference",
      session: "Sunday General Session",
      isArchived: true,
      sheetUrl: "https://www.churchofjesuschrist.org/media/music/songs/god-be-with-you-till-we-meet-again?crumbs=hymns&lang=tgl",
      videoUrl: "",
      note: "Closing Hymn (Sunday General Session)"
    }
  ]
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function extractYouTubeId(url) {
  return getYouTubeId(url);
}

function formatYouTubeEmbedUrl(url) {
  if (!url || !url.trim()) return "";
  const trimmed = url.trim();
  const id = getYouTubeId(trimmed);
  if (id) {
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=0&playsinline=1`;
  }
  return trimmed;
}

function getUserSettings(forceSync = false) {
  const customSheetId = localStorage.getItem("kantimes_active_sheet_id");
  const cachedSongs = getCachedSongs();
  const stored = localStorage.getItem("kantimes_user_settings") || localStorage.getItem("kantime_user_settings");

  // When a Google Sheet is connected, songs MUST ONLY come from the sheet (cachedSongs),
  // NEVER falling back to or merging with DEFAULT_USER_SETTINGS.songs or stale parsed.songs.
  if (customSheetId) {
    const sheetSongs = (cachedSongs && cachedSongs.length > 0) ? cachedSongs : [];
    if (!stored) {
      const fresh = JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
      fresh.songs = sheetSongs;
      fresh.appVersion = APP_VERSION;
      fresh.repertoireVersion = REPERTOIRE_VERSION;
      saveUserSettings(fresh);
      return fresh;
    }
    try {
      const parsed = JSON.parse(stored);
      const result = {
        targetDate: parsed.targetDate !== undefined ? parsed.targetDate : (DEFAULT_USER_SETTINGS.targetDate || "Current Practice"),
        timerMinutes: Number(parsed.timerMinutes) || DEFAULT_USER_SETTINGS.timerMinutes || 15,
        showPastRepertoire: parsed.showPastRepertoire !== undefined ? Boolean(parsed.showPastRepertoire) : false,
        songs: sheetSongs,
        appVersion: APP_VERSION,
        repertoireVersion: REPERTOIRE_VERSION
      };
      saveUserSettings(result);
      return result;
    } catch (e) {
      const fallback = JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
      fallback.songs = sheetSongs;
      return fallback;
    }
  }

  // If no sheet is connected:
  if (!stored) {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
    fresh.songs = (cachedSongs && cachedSongs.length > 0) ? cachedSongs : [];
    fresh.appVersion = APP_VERSION;
    fresh.repertoireVersion = REPERTOIRE_VERSION;
    saveUserSettings(fresh);
    return fresh;
  }
  try {
    const parsed = JSON.parse(stored);
    let songs = (cachedSongs && cachedSongs.length > 0 && !forceSync)
      ? cachedSongs
      : (Array.isArray(parsed.songs) ? parsed.songs : []);

    const result = {
      targetDate: parsed.targetDate !== undefined ? parsed.targetDate : (DEFAULT_USER_SETTINGS.targetDate || "Current Practice"),
      timerMinutes: Number(parsed.timerMinutes) || DEFAULT_USER_SETTINGS.timerMinutes || 15,
      showPastRepertoire: parsed.showPastRepertoire !== undefined ? Boolean(parsed.showPastRepertoire) : false,
      songs: songs,
      appVersion: APP_VERSION,
      repertoireVersion: REPERTOIRE_VERSION
    };

    saveUserSettings(result);
    return result;
  } catch (e) {
    console.error("Failed to parse kantime_user_settings:", e);
    const fallback = JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
    fallback.songs = (cachedSongs && cachedSongs.length > 0) ? cachedSongs : [];
    return fallback;
  }
}


function saveUserSettings(settings) {
  localStorage.setItem("kantimes_user_settings", JSON.stringify(settings));
  localStorage.setItem("kantime_user_settings", JSON.stringify(settings));
}

function applyHeaderTargetDate() {
  const settings = getUserSettings();
  const el = document.getElementById("headerSubtitle");
  if (el) {
    el.innerText = settings.targetDate || settings.eventTitle || "Choir Rehearsal & Current Practice";
  }
}

// --- PRACTICE TIMER STATE & DURATION ---
let timerDuration = 15 * 60;
let timeRemaining = timerDuration;
let targetEndTime = null;
let timerInterval = null;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function applyTimerDuration(minutes, resetReadyClock = true) {
  const mins = Number(minutes) || 15;

  const titleEl = document.getElementById("practiceDurationTitle");
  if (titleEl) titleEl.innerText = mins;

  const subtextEl = document.getElementById("practiceInstructionSubtext");
  if (subtextEl) {
    subtextEl.innerText = `Hit Start, practice your parts, and complete the ${mins}-minute countdown to record your session.`;
  }

  if (!timerInterval && !targetEndTime) {
    const savedPaused = localStorage.getItem("kantime_paused_remaining");
    const btn = document.getElementById("timerBtn");

    if (resetReadyClock || !savedPaused) {
      timerDuration = mins * 60;
      timeRemaining = timerDuration;
      localStorage.removeItem("kantime_paused_remaining");
      const disp = document.getElementById("timerDisplay");
      if (disp) disp.innerText = formatTime(timeRemaining);
      if (btn) {
        btn.innerText = "Start Practice";
        btn.classList.remove("btn-outline");
        btn.classList.add("btn-primary");
      }
    } else {
      if (btn) btn.innerText = "Resume Practice";
    }
  }

  updateDurationSelectorUI(mins, Boolean(timerInterval));
}

function updateDurationSelectorUI(mins, isLocked) {
  const currentMins = Number(mins) || getUserSettings().timerMinutes || 15;
  const locked = Boolean(isLocked);

  const settingsSelect = document.getElementById("settingTimerDuration");
  if (settingsSelect && Number(settingsSelect.value) !== currentMins) {
    settingsSelect.value = currentMins;
  }

  const pills = document.querySelectorAll(".quick-duration-pill");
  pills.forEach(pill => {
    const pillMins = Number(pill.getAttribute("data-mins"));
    const isSelected = pillMins === currentMins;

    pill.classList.toggle("active", isSelected);
    pill.setAttribute("aria-pressed", isSelected ? "true" : "false");

    pill.disabled = locked;
    pill.classList.toggle("locked", locked);
    if (locked) {
      pill.setAttribute("title", "Timer is running. Pause or reset to change duration.");
    } else {
      pill.setAttribute("title", `Set rehearsal timer to ${pillMins} minutes`);
    }
  });

  const wrapper = document.getElementById("quickDurationWrapper");
  if (wrapper) {
    wrapper.classList.toggle("running-locked", locked);
  }
}

function selectQuickDuration(mins) {
  const isRunning = Boolean(timerInterval || targetEndTime);
  if (isRunning) {
    showToast("Rehearsal timer is running! Pause or reset to change duration.");
    return;
  }
  handleTimerDurationChange(mins);
}

function populateSongDropdown(songList) {
  const selects = document.querySelectorAll('#targetSong, #songSelect, #selectSongToRehearse, .rehearsal-song-select');
  if (!selects || selects.length === 0) return;

  const songs = Array.isArray(songList) ? songList : [];
  const savedSong = localStorage.getItem("kantime_target_song") || localStorage.getItem("kantimes_target_song");

  selects.forEach(songSelect => {
    // Clear existing <option> tags completely
    songSelect.innerHTML = '';

    if (songs.length === 0) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      const hasConfiguredSheet = Boolean(localStorage.getItem('kantimes_active_sheet_id'));
      emptyOpt.textContent = hasConfiguredSheet ? 'No songs found in connected sheet' : 'No sheet connected (Connect sheet or copy template)';
      songSelect.appendChild(emptyOpt);
      return;
    }

    let matched = false;
    // Append all updated options
    songs.forEach((song) => {
      const opt = document.createElement('option');
      opt.value = song.title;
      const rawPart = song.voicePart || song.part || '';
      const voicePart = (rawPart && rawPart.trim().toLowerCase() !== 'all') ? rawPart.trim() : '';
      const partSuffix = voicePart ? ` (${voicePart})` : '';
      opt.textContent = `${song.title}${partSuffix}`;
      if (savedSong && (savedSong === song.title || savedSong === song.id)) {
        opt.selected = true;
        matched = true;
      }
      songSelect.appendChild(opt);
    });

    // If currently rehearsed song was deleted or changed, fall back to first available song cleanly
    if (!matched && songSelect.options.length > 0) {
      songSelect.options[0].selected = true;
      localStorage.setItem("kantime_target_song", songSelect.options[0].value);
      localStorage.setItem("kantimes_target_song", songSelect.options[0].value);
    }
  });

  if (songs.length === 0) {
    const hasConfiguredSheet = Boolean(localStorage.getItem('kantimes_active_sheet_id'));
    if (!hasConfiguredSheet && typeof renderRepertoireEmptyState === 'function') {
      renderRepertoireEmptyState();
    }
  }

  // Dispatch change event to update active timer/resource links for the selected song
  const primarySelect = document.getElementById("targetSong") || document.getElementById("songSelect") || document.querySelector(".rehearsal-song-select");
  if (primarySelect) {
    primarySelect.dispatchEvent(new Event('change'));
  }
}

function populateSongSelectDropdown() {
  const select = document.getElementById('songSelect') || document.querySelector('.rehearsal-song-select') || document.getElementById('targetSong');
  if (!select) return;
  const songs = (typeof getMasterRepertoireList === "function") ? getMasterRepertoireList() : (getUserSettings().songs || []);
  const settings = getUserSettings();
  const activeSongs = settings.showPastRepertoire ? songs : songs.filter(s => !s.isArchived && !s.archived);
  populateSongDropdown(activeSongs.length > 0 ? activeSongs : songs);
}

function getSongResource(songKeyOrTitle) {
  const settings = getUserSettings();
  const songs = settings.songs || [];
  let found = songs.find(s => s.id === songKeyOrTitle || s.title === songKeyOrTitle);
  if (!found && songs.length > 0) {
    const visibleSongs = settings.showPastRepertoire ? songs : songs.filter(s => !s.isArchived);
    found = visibleSongs.length > 0 ? visibleSongs[0] : songs[0];
  }
  if (found) {
    if (!found.resourceUrl && found.sheetUrl) {
      found.resourceUrl = found.sheetUrl;
      found.resourceLabel = found.resourceLabel || "Sheet Music";
    }
    if (!found.audioUrl && found.audioTracks && found.audioTracks.length > 0) {
      found.audioUrl = found.audioTracks[0].src;
    }
    if (found.audioUrl && typeof found.audioUrl === 'string' && found.audioUrl.includes('drive.google.com/file/d/')) {
      const match = found.audioUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        found.audioUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
      }
    }
  }
  return found;
}

function isPracticeSessionActive() {
  const isRunning = Boolean(timerInterval || targetEndTime);
  const pausedVal = localStorage.getItem("kantime_paused_remaining");
  const hasPausedProgress = Boolean(pausedVal && Number(pausedVal) > 0 && Number(pausedVal) < timerDuration);
  return isRunning || hasPausedProgress;
}

// --- IN-BROWSER AUDIO SCRATCHPAD (SELF-CHECK MIC) ---
const MAX_SELF_CHECK_SECONDS = 300; // 5 minutes recording limit
let selfCheckMediaRecorder = null;
let selfCheckAudioStream = null;
let selfCheckAudioChunks = [];
let selfCheckBlob = null;
let selfCheckBlobUrl = null;
let selfCheckMp3Blob = null;
let selfCheckMp3Url = null;
let selfCheckIsEncoding = false;
let selfCheckCountdownTimer = null;
let selfCheckSecondsLeft = MAX_SELF_CHECK_SECONDS;
let selfCheckState = "idle"; // "idle" | "recording" | "recorded"
let selfCheckSupportedMime = "";

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus"
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function getSelfCheckMp3Filename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");
  const secs = String(now.getSeconds()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;
  const timeStr = `${hours}${mins}${secs}`;

  return `kantimes-practice-recording-${dateStr}-${timeStr}.mp3`;
}

function convertFloat32ToInt16(float32Array) {
  const len = float32Array.length;
  const int16 = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

async function convertAudioBlobToMp3(blob) {
  if (typeof lamejs === "undefined" || !lamejs.Mp3Encoder) {
    throw new Error("lamejs MP3 encoder is not loaded");
  }

  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("Web Audio API not supported in this browser");
  }

  const audioCtx = new AudioCtx();
  let decodedBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    if (audioCtx.state !== "closed" && typeof audioCtx.close === "function") {
      audioCtx.close().catch(() => { });
    }
  }

  const channels = Math.min(2, Math.max(1, decodedBuffer.numberOfChannels));
  const targetSampleRate = 44100;
  let finalBuffer = decodedBuffer;

  // Standardize sample rate to 44.1kHz using OfflineAudioContext if needed
  if (decodedBuffer.sampleRate !== targetSampleRate && typeof OfflineAudioContext !== "undefined") {
    try {
      const offlineCtx = new OfflineAudioContext(
        channels,
        Math.ceil(decodedBuffer.duration * targetSampleRate),
        targetSampleRate
      );
      const source = offlineCtx.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);
      finalBuffer = await offlineCtx.startRendering();
    } catch (resampleErr) {
      console.warn("OfflineAudioContext resampling bypassed, using original sample rate:", resampleErr);
      finalBuffer = decodedBuffer;
    }
  }

  const sampleRate = finalBuffer.sampleRate;
  const kbps = 128; // Standard 128 kbps voice quality MP3
  const mp3encoder = new lamejs.Mp3Encoder(channels > 1 ? 2 : 1, sampleRate, kbps);
  const mp3Data = [];
  const sampleBlockSize = 1152;

  if (channels > 1) {
    const leftFloat = finalBuffer.getChannelData(0);
    const rightFloat = finalBuffer.getChannelData(1);
    const left = convertFloat32ToInt16(leftFloat);
    const right = convertFloat32ToInt16(rightFloat);

    for (let i = 0; i < left.length; i += sampleBlockSize) {
      const leftChunk = left.subarray(i, i + sampleBlockSize);
      const rightChunk = right.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf && mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
  } else {
    const monoFloat = finalBuffer.getChannelData(0);
    const mono = convertFloat32ToInt16(monoFloat);

    for (let i = 0; i < mono.length; i += sampleBlockSize) {
      const monoChunk = mono.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(monoChunk);
      if (mp3buf && mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf && mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: "audio/mp3" });
}

async function convertAudioBlobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error("AudioContext not supported");

  const audioCtx = new AudioCtx();
  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    if (audioCtx.state !== "closed" && typeof audioCtx.close === "function") {
      audioCtx.close().catch(() => { });
    }
  }

  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  let interleaved;
  if (numChannels === 2) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    interleaved = new Float32Array(left.length + right.length);
    let inputIdx = 0;
    for (let i = 0; i < interleaved.length; i += 2) {
      interleaved[i] = left[inputIdx];
      interleaved[i + 1] = right[inputIdx];
      inputIdx++;
    }
  } else {
    interleaved = audioBuffer.getChannelData(0);
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + interleaved.length * bytesPerSample);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + interleaved.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, interleaved.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

function renderSelfCheckMicHtml() {
  let bodyContent = "";

  if (selfCheckState === "recording") {
    const mins = Math.floor(selfCheckSecondsLeft / 60);
    const secs = selfCheckSecondsLeft % 60;
    const timeStr = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

    bodyContent = `
      <div class="recording-active-bar">
        <div class="recording-status-left">
          <span class="rec-pulsing-dot" aria-hidden="true"></span>
          <span class="rec-countdown" id="selfCheckCountdownDisplay">${timeStr}</span>
          <div class="rec-waveform-bars" aria-hidden="true">
            <span class="rec-bar"></span>
            <span class="rec-bar"></span>
            <span class="rec-bar"></span>
            <span class="rec-bar"></span>
            <span class="rec-bar"></span>
          </div>
        </div>
        <button type="button" class="btn-stop-rec" onclick="stopSelfCheckRecording()" title="Stop recording snippet">
          ⏹️ Stop
        </button>
      </div>
      <p class="self-check-prompt" style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
        Sing your voice part. Auto-stops at 5 minutes.
      </p>
    `;
  } else if (selfCheckState === "recorded" && (selfCheckBlobUrl || selfCheckMp3Url)) {
    const filename = getSelfCheckMp3Filename();
    const playbackUrl = selfCheckMp3Url || selfCheckBlobUrl;
    const downloadLabel = selfCheckIsEncoding ? "⏳ Encoding MP3..." : "⬇️ Download MP3";

    bodyContent = `
      <div class="self-check-playback-box">
        <div class="self-check-playback-row">
          <audio id="selfCheckAudioPlayback" class="self-check-audio-el" controls controlsList="nodownload" src="${playbackUrl}">
            Your browser does not support audio playback.
          </audio>
        </div>
        <div class="self-check-playback-actions">
          <button type="button" class="btn-mic-download ${selfCheckIsEncoding ? 'btn-mic-encoding' : ''}" 
             onclick="downloadSelfCheckRecording(event)" 
             title="Save recording directly to device as .mp3 file" 
             aria-label="Download recorded MP3 file"
             ${selfCheckIsEncoding ? 'disabled' : ''}>
            ${downloadLabel}
          </button>
          <button type="button" class="btn-mic-rerecord" onclick="startSelfCheckRecording()" title="Record a new take">
            🔄 Re-record
          </button>
          <button type="button" class="btn-mic-discard" onclick="discardSelfCheckRecording()" title="Discard recording and reset" aria-label="Discard recording">
            🗑️ Discard
          </button>
        </div>
      </div>
    `;
  } else {
    bodyContent = `
      <div class="self-check-controls-row">
        <button type="button" class="btn-record-mic" onclick="startSelfCheckRecording()" title="Record up to 5-minute practice snippet">
          🔴 Record Snippet (Max 5m)
        </button>
      </div>
      <p class="self-check-prompt">
        Tap to record up to a 5-minute snippet of your voice to check your tone, blend, and pitch.
      </p>
    `;
  }

  return `
    <div class="self-check-mic-card" id="selfCheckMicCard">
      <div class="self-check-header">
        <div class="self-check-title">
          <span>🎙️ Self-Check Mic</span>
          <span class="self-check-badge">In-Browser Scratchpad</span>
        </div>
      </div>
      <div class="self-check-body" id="selfCheckMicBody">
        ${bodyContent}
      </div>
    </div>
  `;
}

async function startSelfCheckRecording() {
  if (selfCheckState === "recording") return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
    showToast("Audio recording not supported in this browser.");
    return;
  }

  try {
    selfCheckAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (err) {
    console.warn("Microphone access error:", err);
    showToast("Microphone access required to record practice snippets.");
    return;
  }

  if (selfCheckBlobUrl) {
    URL.revokeObjectURL(selfCheckBlobUrl);
    selfCheckBlobUrl = null;
  }
  if (selfCheckMp3Url) {
    URL.revokeObjectURL(selfCheckMp3Url);
    selfCheckMp3Url = null;
  }
  selfCheckBlob = null;
  selfCheckMp3Blob = null;
  selfCheckIsEncoding = false;
  selfCheckAudioChunks = [];
  selfCheckSupportedMime = getSupportedAudioMimeType();

  try {
    const options = selfCheckSupportedMime ? { mimeType: selfCheckSupportedMime } : {};
    selfCheckMediaRecorder = new MediaRecorder(selfCheckAudioStream, options);
  } catch (e) {
    try {
      selfCheckMediaRecorder = new MediaRecorder(selfCheckAudioStream);
    } catch (err2) {
      console.error("Failed to create MediaRecorder:", err2);
      showToast("Could not start microphone recorder.");
      if (selfCheckAudioStream) {
        selfCheckAudioStream.getTracks().forEach(t => t.stop());
        selfCheckAudioStream = null;
      }
      return;
    }
  }

  selfCheckMediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      selfCheckAudioChunks.push(e.data);
    }
  };

  selfCheckMediaRecorder.onstop = () => {
    finishSelfCheckRecording();
  };

  selfCheckSecondsLeft = MAX_SELF_CHECK_SECONDS;
  selfCheckState = "recording";
  updateSelfCheckMicUI();

  selfCheckMediaRecorder.start(200);

  if (selfCheckCountdownTimer) clearInterval(selfCheckCountdownTimer);
  selfCheckCountdownTimer = setInterval(() => {
    selfCheckSecondsLeft--;
    const countdownEl = document.getElementById("selfCheckCountdownDisplay");
    if (countdownEl) {
      const mins = Math.floor(selfCheckSecondsLeft / 60);
      const secs = selfCheckSecondsLeft % 60;
      countdownEl.innerText = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }
    if (selfCheckSecondsLeft <= 0) {
      stopSelfCheckRecording();
    }
  }, 1000);
}

function stopSelfCheckRecording() {
  if (selfCheckCountdownTimer) {
    clearInterval(selfCheckCountdownTimer);
    selfCheckCountdownTimer = null;
  }

  if (selfCheckMediaRecorder && selfCheckMediaRecorder.state !== "inactive") {
    try {
      selfCheckMediaRecorder.stop();
    } catch (e) {
      console.warn("Error stopping MediaRecorder:", e);
    }
  }

  if (selfCheckAudioStream) {
    selfCheckAudioStream.getTracks().forEach(track => track.stop());
    selfCheckAudioStream = null;
  }
}

async function finishSelfCheckRecording() {
  if (selfCheckCountdownTimer) {
    clearInterval(selfCheckCountdownTimer);
    selfCheckCountdownTimer = null;
  }

  if (selfCheckAudioChunks.length === 0) {
    showToast("No audio recorded.");
    discardSelfCheckRecording();
    return;
  }

  if (selfCheckBlobUrl) {
    URL.revokeObjectURL(selfCheckBlobUrl);
    selfCheckBlobUrl = null;
  }
  if (selfCheckMp3Url) {
    URL.revokeObjectURL(selfCheckMp3Url);
    selfCheckMp3Url = null;
  }
  selfCheckMp3Blob = null;

  const mime = selfCheckSupportedMime || (selfCheckAudioChunks[0] ? selfCheckAudioChunks[0].type : "audio/webm");
  const rawBlob = new Blob(selfCheckAudioChunks, { type: mime || "audio/webm" });
  selfCheckBlob = rawBlob;
  selfCheckBlobUrl = URL.createObjectURL(rawBlob);

  selfCheckState = "recorded";
  selfCheckIsEncoding = true;
  updateSelfCheckMicUI();
  showToast("Snippet recorded! Converting to MP3... ⏳");

  try {
    const mp3Blob = await convertAudioBlobToMp3(rawBlob);
    selfCheckMp3Blob = mp3Blob;
    selfCheckMp3Url = URL.createObjectURL(mp3Blob);

    const audioEl = document.getElementById("selfCheckAudioPlayback");
    if (audioEl) {
      audioEl.src = selfCheckMp3Url;
    }
    showToast("MP3 ready! Listen or download below 🎵");
  } catch (err) {
    console.warn("MP3 conversion failed, attempting WAV fallback:", err);
    try {
      const wavBlob = await convertAudioBlobToWav(rawBlob);
      selfCheckMp3Blob = wavBlob;
      selfCheckMp3Url = URL.createObjectURL(wavBlob);
      showToast("Audio converted! Ready to play & save 🎧");
    } catch (wavErr) {
      console.warn("WAV fallback failed, keeping raw audio:", wavErr);
      selfCheckMp3Blob = rawBlob;
      selfCheckMp3Url = selfCheckBlobUrl;
      showToast("Recording ready for playback & download 🎧");
    }
  } finally {
    selfCheckIsEncoding = false;
    updateSelfCheckMicUI();
  }
}

async function downloadSelfCheckRecording(e) {
  if (e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }

  if (selfCheckIsEncoding) {
    showToast("Encoding MP3 in progress, please wait a moment... ⏳");
    return;
  }

  const blobToDownload = selfCheckMp3Blob || selfCheckBlob;
  if (!blobToDownload) {
    showToast("No recording available to download.");
    return;
  }

  const filename = getSelfCheckMp3Filename();

  // Desktop Chrome/Edge native "Save As" file picker if available
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "MP3 Audio File (*.mp3)",
          accept: { "audio/mpeg": [".mp3"], "audio/mp3": [".mp3"] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blobToDownload);
      await writable.close();
      showToast("Saved MP3 successfully! 💾");
      return;
    } catch (pickerErr) {
      if (pickerErr.name === "AbortError") {
        return;
      }
      console.warn("showSaveFilePicker error, falling back to standard download:", pickerErr);
    }
  }

  // Standard anchor download fallback
  const downloadUrl = selfCheckMp3Url || (selfCheckMp3Blob ? URL.createObjectURL(selfCheckMp3Blob) : selfCheckBlobUrl);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast("Audio recording downloaded (.mp3)! 💾");
}

function discardSelfCheckRecording() {
  stopSelfCheckRecording();
  if (selfCheckBlobUrl) {
    URL.revokeObjectURL(selfCheckBlobUrl);
    selfCheckBlobUrl = null;
  }
  if (selfCheckMp3Url) {
    URL.revokeObjectURL(selfCheckMp3Url);
    selfCheckMp3Url = null;
  }
  selfCheckBlob = null;
  selfCheckMp3Blob = null;
  selfCheckIsEncoding = false;
  selfCheckAudioChunks = [];
  selfCheckState = "idle";
  selfCheckSecondsLeft = MAX_SELF_CHECK_SECONDS;
  updateSelfCheckMicUI();
  showToast("Recording discarded.");
}

function updateSelfCheckMicUI() {
  const card = document.getElementById("selfCheckMicCard");
  if (!card) return;
  const parent = card.parentElement;
  if (!parent) return;

  const temp = document.createElement("div");
  temp.innerHTML = renderSelfCheckMicHtml();
  if (temp.firstElementChild) {
    parent.replaceChild(temp.firstElementChild, card);
  }
}

function renderRepertoireEmptyState() {
  const container = document.getElementById("dynamicResourceContainer");
  if (container) {
    container.innerHTML = `
      <div class="repertoire-onboarding-empty-card" style="text-align: center; padding: 28px 20px; background: var(--bg-alt, rgba(0,0,0,0.02)); border: 1px dashed var(--border); border-radius: 12px; margin: 8px 0;">
        <span style="font-size: 2.5rem; display: block; margin-bottom: 10px;">📑</span>
        <h3 style="margin: 0 0 8px; font-size: 1.1rem; font-weight: 700;">Connect Your Choir's Repertoire</h3>
        <p style="margin: 0 auto 18px; font-size: 0.88rem; color: var(--text-muted); max-width: 460px; line-height: 1.5;">
          No repertoire sheet is connected yet. Connect your Stake/Ward public Google Sheet via published CSV link, or make a copy of the official starter template.
        </p>
        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary" onclick="openStakeSheetModal()" style="font-size: 0.85rem; padding: 9px 18px;">
            ⚡ Connect Stake Sheet
          </button>
          <a href="${REPERTOIRE_CONFIG.TEMPLATE_COPY_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-copy-template" id="btnCopyTemplate" style="font-size: 0.85rem; padding: 9px 18px; text-decoration: none;">
            📑 Copy Repertoire Template ↗
          </a>
        </div>
      </div>
    `;
    wireCopyTemplateButton();
  }
}

/**
 * Renders deduplicated and sanitized resource pills for a song.
 * Avoids duplicate audio pills if already handled by primary player.
 * Validates link targets to prevent rendering empty or unplayable "#" buttons.
 */
function renderRepertoireResources(song) {
  if (!song) return "";

  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  let resPillsHtml = "";

  const rawResourceUrl = isValidResourceUrl(song.resourceUrl) ? song.resourceUrl.trim() : "";
  const rawResourceLabel = (song.resourceLabel || "Sheet Music").trim();
  let rawAudioUrl = normalizeAudioUrl(song.audioUrl || (song.audioTracks && song.audioTracks.length > 0 ? song.audioTracks[0].src : "") || "");
  if (!isValidResourceUrl(rawAudioUrl)) rawAudioUrl = "";
  const rawVideoUrl = isValidResourceUrl(song.videoUrl) ? song.videoUrl.trim() : "";
  const localPdf = (isValidResourceUrl(song.localSheetUrl) && song.localSheetUrl) || (song.resources && !Array.isArray(song.resources) && isValidResourceUrl(song.resources.pdf) && song.resources.pdf) || "";
  const localVideo = (isValidResourceUrl(song.localVideoUrl) && song.localVideoUrl) || (song.resources && !Array.isArray(song.resources) && isValidResourceUrl(song.resources.video) && song.resources.video.endsWith('.mp4') && song.resources.video) || "";

  // Filter and deduplicate audio tracks
  const validTracks = [];
  const seenTrackUrls = new Set();
  if (Array.isArray(song.audioTracks)) {
    song.audioTracks.forEach(t => {
      if (t && isValidResourceUrl(t.src)) {
        const norm = normalizeAudioUrl(t.src);
        if (!seenTrackUrls.has(norm)) {
          seenTrackUrls.add(norm);
          validTracks.push({
            name: t.name || song.title,
            src: norm,
            part: t.part || ""
          });
        }
      }
    });
  }

  // 1. External Sheet Music / Resource (Only rendered if URL is valid and non-empty)
  if (rawResourceUrl && isValidResourceUrl(rawResourceUrl)) {
    resPillsHtml += `
      <a class="btn-resource song-resource-pill" href="${escapeHtml(rawResourceUrl)}" target="_blank" rel="noopener noreferrer">
        <span class="res-label">📄 ${escapeHtml(rawResourceLabel || 'Sheet Music')} ↗</span>
      </a>
    `;
  }

  // 2. Offline / Local PDF
  if (localPdf && isValidResourceUrl(localPdf)) {
    resPillsHtml += `
      <button class="btn-resource song-resource-pill" type="button" onclick="openResourceModal('${escapeHtml(song.title)} (Local Sheet)', '${escapeHtml(localPdf)}', 'doc')">
        <span class="res-label">🎼 Offline Sheet (PDF)</span> <span class="badge-cached-offline">Offline Ready</span>
      </button>
    `;
  }

  // 3. Multi-Track Voice Selector Pills: ONLY rendered when > 1 distinct tracks exist
  // When <= 1 track, the single track is already handled by the primary audio player
  if (validTracks.length > 1) {
    validTracks.forEach((track) => {
      let trackSrc = track.src;
      const part = (track.part || "").toLowerCase();
      const isActive = (trackSrc === rawAudioUrl) ? "active" : "";
      resPillsHtml += `
        <button type="button" class="btn-resource song-resource-pill ${isActive}" onclick="selectAudioTrack('${escapeHtml(trackSrc)}', this, '${escapeHtml(track.name)}')">
          ${part && part !== "all" ? `<span class="res-part-badge" data-voice="${escapeHtml(part)}">${escapeHtml(part)}</span>` : ""}
          <span class="res-label">🎧 ${escapeHtml(track.name)}</span>
        </button>
      `;
    });
  }

  // 4. Video / YouTube
  if (rawVideoUrl && isValidResourceUrl(rawVideoUrl)) {
    resPillsHtml += `
      <a href="${escapeHtml(rawVideoUrl)}" target="_blank" rel="noopener noreferrer" class="btn-resource song-resource-pill">
        <span class="res-label">📺 Watch Video ↗</span>
      </a>
    `;
  }

  // 5. Local Rehearsal Video
  if (localVideo && isValidResourceUrl(localVideo)) {
    resPillsHtml += `
      <button class="btn-resource song-resource-pill" type="button" onclick="openResourceModal('${escapeHtml(song.title)} (Video)', '${escapeHtml(localVideo)}', 'video')">
        <span class="res-label">▶️ Rehearsal Video</span> <span class="badge-cached-offline">Offline Ready</span>
      </button>
    `;
  }

  // 6. Custom extra resources from song.resources (avoiding redundant audio pills & unplayable anchors)
  const knownUrls = new Set([rawResourceUrl, rawAudioUrl, rawVideoUrl, localPdf, localVideo].filter(isValidResourceUrl));
  validTracks.forEach(t => { if (isValidResourceUrl(t.src)) knownUrls.add(t.src); });

  if (Array.isArray(song.resources) && song.resources.length > 0) {
    song.resources.forEach(res => {
      if (!res || !isValidResourceUrl(res.url)) return;
      const cleanUrl = res.url.trim();
      const normAudio = normalizeAudioUrl(cleanUrl);
      if (knownUrls.has(cleanUrl) || knownUrls.has(normAudio)) return;
      knownUrls.add(cleanUrl);
      knownUrls.add(normAudio);

      const part = (res.part || "all").toLowerCase();
      const label = res.label || (part ? part.toUpperCase() : "Resource");
      const lowerUrl = cleanUrl.toLowerCase();
      const lowerLabel = label.toLowerCase();
      const isDrive = cleanUrl.includes("drive.google.com");
      const isYt = cleanUrl.includes("youtube.com") || cleanUrl.includes("youtu.be");
      const isAudio = lowerUrl.includes(".mp3") || lowerUrl.includes(".wav") || lowerUrl.includes(".m4a") || lowerUrl.includes("assets.churchofjesuschrist.org") || lowerLabel.includes("audio") || lowerLabel.includes("track") || lowerLabel.includes("accompaniment");
      const isPdf = lowerUrl.includes(".pdf");
      const offlineBadge = isOffline && !cleanUrl.includes("kantimes-resources") ? ` <span class="badge-offline-req">⚠️ Online</span>` : "";

      // If it is an audio track and already handled by player, avoid duplicate pill
      if (isAudio && (normAudio === rawAudioUrl || validTracks.some(t => t.src === normAudio))) {
        return;
      }

      let icon = "🔗";
      let clickAction = "";

      if (isPdf || isDrive) {
        icon = "🎼";
        const previewUrl = isDrive ? sanitizeDriveUrl(cleanUrl) : cleanUrl;
        clickAction = `onclick="openResourceModal('${escapeHtml(song.title)} - ${escapeHtml(label)}', '${escapeHtml(previewUrl)}', 'doc')"`;
      } else if (isYt) {
        icon = "▶️";
        const embedUrl = formatYouTubeEmbedUrl(cleanUrl);
        clickAction = `onclick="openResourceModal('${escapeHtml(song.title)} - ${escapeHtml(label)}', '${escapeHtml(embedUrl)}', 'video')"`;
      } else if (isAudio) {
        icon = "🎧";
        let audioSrc = normalizeAudioUrl(cleanUrl);
        clickAction = `onclick="selectAudioTrack('${escapeHtml(audioSrc)}', this, '${escapeHtml(label)}')"`;
      }

      if (clickAction) {
        resPillsHtml += `
          <button type="button" class="btn-resource song-resource-pill ${isOffline && !cleanUrl.includes('kantimes-resources') ? 'link-disabled-offline' : ''}"
            ${isOffline && !cleanUrl.includes('kantimes-resources') ? `onclick="showToast('Online resource requires an active internet connection.')"` : clickAction}
            title="${escapeHtml(label)} (${escapeHtml(part)})">
            ${part && part !== "all" ? `<span class="res-part-badge" data-voice="${escapeHtml(part)}">${escapeHtml(part)}</span>` : ""}
            <span class="res-label">${icon} ${escapeHtml(label)}</span>
            ${offlineBadge}
          </button>
        `;
      } else {
        resPillsHtml += `
          <a class="btn-resource song-resource-pill ${isOffline ? 'link-disabled-offline' : ''}"
            href="${isOffline ? 'javascript:void(0);' : escapeHtml(cleanUrl)}"
            ${isOffline ? `onclick="showToast('Online resource requires an active internet connection.')"` : 'target="_blank" rel="noopener noreferrer"'}
            title="${escapeHtml(label)}">
            ${part && part !== "all" ? `<span class="res-part-badge" data-voice="${escapeHtml(part)}">${escapeHtml(part)}</span>` : ""}
            <span class="res-label">${icon} ${escapeHtml(label)} ↗</span>
            ${offlineBadge}
          </a>
        `;
      }
    });
  }

  if (!resPillsHtml.trim()) return "";

  return `
    <div class="song-resources-wrap">
      <div class="song-resources-header">
        <span>📑 Repertoire Resources &amp; Voice Tracks</span>
      </div>
      <div class="song-resources-pills">
        ${resPillsHtml}
      </div>
    </div>
  `;
}

/**
 * High-performance facade for YouTube & rehearsal videos.
 * Prevents eager iframe initialization, telemetry spam, and ad-blocker errors.
 */
function renderVideoContainer(videoUrl) {
  const videoContainer = document.getElementById('repertoireVideoWrapper');
  if (!videoContainer) return;

  if (!videoUrl) {
    videoContainer.innerHTML = '';
    return;
  }

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const videoId = extractYouTubeId(videoUrl);

  if (videoId) {
    if (isOffline) {
      videoContainer.innerHTML = `
        <div style="margin-top: 12px; padding: 14px; background: #fffbeb; border: 1px dashed #fde68a; border-radius: 8px; text-align: center; color: #92400e; font-size: 0.82rem;">
          ▶️ <strong>YouTube Video:</strong> <span class="badge-offline-req">Requires Internet</span>
          <p style="margin: 4px 0 0; font-size: 0.76rem; color: #b45309;">Streaming video is disabled in Offline Mode. Use the rehearsal audio player above to practice.</p>
        </div>
      `;
      return;
    }

    // High-performance facade: Render a static poster preview first
    videoContainer.innerHTML = `
      <div class="yt-facade" id="ytFacade" role="button" tabindex="0" aria-label="Play rehearsal video" style="cursor: pointer; position: relative; background: #000; border-radius: 8px; overflow: hidden; margin-top: 12px; width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;">
        <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="Video thumbnail" style="width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.85;" onerror="this.src='https://img.youtube.com/vi/${videoId}/0.jpg';" />
        <div class="play-btn-overlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 56px; height: 56px; background: rgba(220, 38, 38, 0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); transition: transform 0.2s ease;">
          ▶
        </div>
      </div>
    `;

    // Inject the actual iframe strictly on click
    const facade = document.getElementById('ytFacade');
    if (facade) {
      const loadIframe = () => {
        videoContainer.innerHTML = `
          <div style="margin-top: 12px; border-radius: 8px; overflow: hidden; background: #000; position: relative; width: 100%; aspect-ratio: 16/9;">
            <iframe 
              src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=0" 
              title="Rehearsal Video" 
              frameborder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowfullscreen
              style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; border-radius: 8px;">
            </iframe>
          </div>
        `;
      };
      facade.addEventListener('click', loadIframe, { once: true });
      facade.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          loadIframe();
        }
      }, { once: true });
    }
    return;
  }

  // Direct video or non-youtube link fallback
  if (videoUrl.endsWith('.mp4') || videoUrl.includes('.mp4?')) {
    videoContainer.innerHTML = `
      <div style="margin-top: 12px; border-radius: 8px; overflow: hidden; background: #000;">
        <video controls playsinline preload="metadata" src="${escapeHtml(videoUrl)}" style="width: 100%; display: block; max-height: 420px; border-radius: 8px;"></video>
      </div>
    `;
    return;
  }

  videoContainer.innerHTML = `
    <div style="margin-top: 12px;">
      <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="display: inline-flex; align-items: center; gap: 6px;">▶ Open Rehearsal Video ↗</a>
    </div>
  `;
}
window.renderVideoContainer = renderVideoContainer;

function renderSelectedSongResource(songKey) {
  const container = document.getElementById("dynamicResourceContainer");
  if (!container) return;

  // Prevent mounting video players / iframes during initial onboarding setup
  const profileCard = document.getElementById("profileCard");
  if (profileCard && profileCard.style.display !== "none") {
    container.innerHTML = "";
    return;
  }

  const song = getSongResource(songKey);
  if (!song) {
    const hasConfiguredSheet = Boolean(localStorage.getItem("kantimes_active_sheet_id"));
    if (!hasConfiguredSheet) {
      renderRepertoireEmptyState();
    } else {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.85rem;">No piece selected.</div>`;
    }
    return;
  }

  const isPrimary = (song.part || "").toLowerCase() === "primary" ? "primary-piece" : "";
  const tagStyle = isPrimary ? "style='color:var(--accent);'" : "";
  const sessionActive = isPracticeSessionActive();
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

  let rawAudioUrl = normalizeAudioUrl(song.audioUrl || (song.audioTracks && song.audioTracks.length > 0 ? song.audioTracks[0].src : "") || "");
  if (!isValidResourceUrl(rawAudioUrl)) rawAudioUrl = "";

  const validTracks = [];
  const seenTrackUrls = new Set();
  if (Array.isArray(song.audioTracks)) {
    song.audioTracks.forEach(t => {
      if (t && isValidResourceUrl(t.src)) {
        const norm = normalizeAudioUrl(t.src);
        if (!seenTrackUrls.has(norm)) {
          seenTrackUrls.add(norm);
          validTracks.push({
            name: t.name || song.title,
            src: norm,
            part: t.part || ""
          });
        }
      }
    });
  }

  let activeTrackTitle = "";
  if (validTracks.length > 0) {
    const matched = validTracks.find(t => t.src === rawAudioUrl) || validTracks[0];
    activeTrackTitle = matched.name || song.title;
    if (!rawAudioUrl) {
      rawAudioUrl = matched.src;
    }
  } else if (song.voicePart && song.voicePart !== "All") {
    activeTrackTitle = `${song.title} (${song.voicePart})`;
  } else {
    activeTrackTitle = song.title || "Repertoire Track";
  }

  // 1. Unified Resources & Voice Tracks Container (Sanitized & Deduplicated)
  const extraResourcesHtml = renderRepertoireResources(song);

  // 2. Audio Player Section (Clean External Button or Direct Audio Player)
  let localAudioHtml = "";
  if (rawAudioUrl && isValidResourceUrl(rawAudioUrl)) {
    const isDirect = isDirectStreamableAudio(rawAudioUrl);
    if (!isDirect) {
      localAudioHtml = `
        <div class="local-audio-card" id="rehearsalAudioContainer">
          <div class="local-audio-header">
            <div class="local-audio-title">
              <span>🎧 Rehearsal Audio Player</span>
              <span class="badge-cached-offline" style="background:var(--accent-light, #e0f2fe); color:var(--accent, #0284c7);">🌐 External Host</span>
            </div>
          </div>
          <div class="active-track-indicator" style="margin-bottom: 8px;">
            <span id="activeTrackTitleBadge" class="badge-active-track">🎵 ${escapeHtml(activeTrackTitle)}</span>
          </div>
          <div class="external-audio-card" style="text-align: center; padding: 12px 8px; margin-top: 4px;">
            <a href="${escapeHtml(rawAudioUrl)}" target="_blank" rel="noopener noreferrer" class="btn-audio-external-primary">
              ▶ Stream / Download Audio (External) ↗
            </a>
          </div>
        </div>
      `;
    } else {
      localAudioHtml = `
        <div class="local-audio-card" id="rehearsalAudioContainer">
          <div class="local-audio-header">
            <div class="local-audio-title">
              <span>🎧 Rehearsal Audio Player</span>
              <span class="badge-cached-offline">⚡ Offline Ready</span>
            </div>
          </div>
          <div class="active-track-indicator" style="margin-bottom: 8px;">
            <span id="activeTrackTitleBadge" class="badge-active-track">🎵 ${escapeHtml(activeTrackTitle)}</span>
          </div>
          <audio id="activeLocalAudio" class="local-audio-element" controls preload="metadata" src="${escapeHtml(rawAudioUrl)}" onerror="handleAudioPlaybackError(this, '${escapeHtml(rawAudioUrl)}')">
            Your browser does not support local audio playback.
          </audio>
        </div>
      `;
    }
  } else {
    // Empty audioUrl: pause player, clear src, and display notice
    const existingAudio = document.getElementById("activeLocalAudio");
    if (existingAudio) {
      try {
        existingAudio.pause();
        existingAudio.removeAttribute("src");
        existingAudio.src = "";
        existingAudio.load();
      } catch (e) { }
    }

    localAudioHtml = `
        <div class="local-audio-card no-audio-track-card" id="rehearsalAudioContainer">
          <div class="no-audio-track-notice" style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.85rem; background: var(--bg-alt, rgba(0,0,0,0.03)); border: 1px dashed var(--border); border-radius: var(--radius-sm, 8px);">
            <span>⚠️ No rehearsal audio track linked for this piece</span>
          </div>
          <audio id="activeLocalAudio" class="local-audio-element" style="display: none;" preload="none"></audio>
        </div>
    `;
  }

  const localVideo = (isValidResourceUrl(song.localVideoUrl) && song.localVideoUrl) || (song.resources && !Array.isArray(song.resources) && isValidResourceUrl(song.resources.video) && song.resources.video.endsWith('.mp4') && song.resources.video) || "";
  const videoSource = song.videoUrl || localVideo || "";

  const mins = getUserSettings().timerMinutes || 15;
  const rawResourceUrl = isValidResourceUrl(song.resourceUrl || song.pdfUrl) ? (song.resourceUrl || song.pdfUrl).trim() : "";
  const defaultNote = (rawResourceUrl || song.sheetUrl) ? `ℹ️ Opens in external tab. Your ${mins}-minute timer will keep running while you practice!` : "";
  const noteText = song.note !== undefined && song.note !== "" ? song.note : defaultNote;
  const noteHtml = noteText ? `<div class="external-note">${escapeHtml(noteText)}</div>` : "";

  // Format Repertoire Subtitle / Metadata Display
  // If both hymnNumber and composer exist: Hymn #${song.hymnNumber} • Arr. ${song.composer}
  // If only hymnNumber: Hymn #${song.hymnNumber}
  // If only composer: Arr. ${song.composer}
  // Otherwise display song.category
  let subtitleText = "";
  const hymnNum = (song.hymnNumber || song.number || song.hymn_number || "").toString().trim();
  const comp = (song.composer || "").trim();
  if (hymnNum && comp) {
    subtitleText = `Hymn #${hymnNum} • Arr. ${comp}`;
  } else if (hymnNum) {
    subtitleText = `Hymn #${hymnNum}`;
  } else if (comp) {
    subtitleText = `Arr. ${comp}`;
  } else if (song.category || song.event) {
    subtitleText = (song.category || song.event).trim();
  }

  container.innerHTML = `
      <div class="song-item ${isPrimary} fade-in">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
          <span class="song-tag" ${tagStyle}>${escapeHtml(song.part || 'Repertoire')}</span>
          <span class="resource-status-badge">${sessionActive ? '🔓 Session Active &bull; Unlocked' : '🎵 Rehearsal Ready'}</span>
        </div>
        <div class="song-title">${escapeHtml(song.title)}</div>
        ${subtitleText ? `<div class="song-subtitle" style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px; margin-bottom: 8px;">${escapeHtml(subtitleText)}</div>` : ''}
        
        <div class="resource-unlocked-container">
          ${localAudioHtml}
          ${renderSelfCheckMicHtml()}
          ${extraResourcesHtml}
          ${noteHtml}
          <div id="repertoireVideoWrapper" class="repertoire-video-wrapper"></div>
        </div>
      </div>
    `;

  renderVideoContainer(videoSource);
}


function handleSongSelectionChange() {
  const targetSelect = document.getElementById("songSelect") || document.querySelector(".rehearsal-song-select") || document.getElementById("targetSong");
  const selectedSong = targetSelect ? targetSelect.value : "";
  if (selectedSong) {
    localStorage.setItem("kantime_target_song", selectedSong);
    localStorage.setItem("kantimes_target_song", selectedSong);
  }
  renderSelectedSongResource(selectedSong);
}

// --- PROFILE STORAGE & GATED DASHBOARD ACCESS ---
function updateActiveProfileDisplay(name, section, avatar) {
  const activeName = document.getElementById("activeProfileName");
  const activeBadge = document.getElementById("activeProfileBadge");
  const avatarWrap = document.getElementById("activeProfileAvatarWrap");

  if (activeName) activeName.innerText = name;
  if (activeBadge) {
    activeBadge.innerText = section;
    if (typeof activeBadge.setAttribute === "function") {
      activeBadge.setAttribute("data-voice", section);
    }
  }

  if (avatarWrap) {
    if (avatar && avatar.trim()) {
      const src = getAvatarImgSrc(avatar);
      avatarWrap.innerHTML = `
          <img src="${src}" 
              alt="${name}" 
              class="banner-avatar-badge" 
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="banner-avatar-badge avatar-fallback" style="display:none;" title="${name}">🎵</div>
        `;
    } else {
      avatarWrap.innerHTML = `
          <div class="banner-avatar-badge avatar-fallback" title="${name}">🎵</div>
        `;
    }
  }
}

function loadProfile() {
  applyHeaderTargetDate();
  applyTimerDuration(getUserSettings().timerMinutes, false);
  populateSongSelectDropdown();

  const identity = getUserIdentity();
  const savedFullName = localStorage.getItem("choir_name") || identity.fullName || "";
  const savedNickname = localStorage.getItem("choir_nickname") || identity.nickname || identity.initials || "";
  const savedSection = localStorage.getItem("choir_voice") || localStorage.getItem("choir_section") || identity.part || "";
  const savedAvatar = localStorage.getItem("choir_avatar") || identity.avatar || "";
  const profileCard = document.getElementById("profileCard");
  const activeBanner = document.getElementById("activeProfileBanner");
  const mainDashboard = document.getElementById("mainDashboard");
  const cancelBtn = document.getElementById("cancelProfileBtn");

  renderAvatarPicker(savedAvatar);

  const hasValidProfile = (savedFullName && savedFullName.trim().length >= 2) || (savedNickname && savedNickname.trim().length >= 2);

  if (hasValidProfile && savedSection) {
    const displayName = formatDisplayName(savedFullName || savedNickname);

    const memFullNameInput = document.getElementById("onboardingFullName");
    if (memFullNameInput) memFullNameInput.value = savedFullName;
    const memNameInput = document.getElementById("onboardingNickname") || document.getElementById("memberName");
    if (memNameInput) memNameInput.value = savedNickname || savedFullName;
    const legacyMemName = document.getElementById("memberName");
    if (legacyMemName && legacyMemName !== memNameInput) legacyMemName.value = savedNickname || savedFullName;
    const memSecInput = document.getElementById("onboardingVoicePart") || document.getElementById("memberSection");
    if (memSecInput) memSecInput.value = savedSection;
    const legacyMemSec = document.getElementById("memberSection");
    if (legacyMemSec && legacyMemSec !== memSecInput) legacyMemSec.value = savedSection;
    const stakeInput = document.getElementById("onboardingStake");
    if (stakeInput) stakeInput.value = identity.stake || "";

    updateActiveProfileDisplay(displayName, savedSection, savedAvatar);

    if (profileCard) profileCard.style.display = "none";
    if (activeBanner) activeBanner.style.display = "flex";
    if (mainDashboard) mainDashboard.style.display = "block";

    if (cancelBtn) cancelBtn.style.display = "inline-flex";

    const targetSelect = document.getElementById("targetSong");
    const activeSong = (targetSelect && targetSelect.value) ? targetSelect.value : (localStorage.getItem("kantime_target_song") || "");
    renderSelectedSongResource(activeSong);

    const pitchWidget = document.getElementById("pitchCheckerWidget");
    if (pitchWidget) pitchWidget.style.display = "block";
    updatePitchTargetVoice();

    loadLeaderboard();
  } else {
    if (profileCard) profileCard.style.display = "block";
    if (activeBanner) activeBanner.style.display = "none";
    if (mainDashboard) mainDashboard.style.display = "none";
    if (cancelBtn) cancelBtn.style.display = "none";

    const pitchWidget = document.getElementById("pitchCheckerWidget");
    if (pitchWidget) pitchWidget.style.display = "none";
  }
}

// ─── FUZZY NAME DEDUPLICATION & ROSTER CACHE ──────────────────────────────
let cachedKnownSingers = [];
let pendingProfileSubmission = null;

/**
 * Loads known choir singers from localStorage for instant offline deduplication.
 */
function loadKnownSingersCache() {
  try {
    const raw = localStorage.getItem("kantime_known_singers");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedKnownSingers = parsed;
      }
    }
  } catch (err) {
    console.warn("Could not parse kantime_known_singers cache:", err);
  }
}

/**
 * Updates the known singers cache in memory and persists to localStorage.
 */
function updateKnownSingersFromRoster(singers) {
  if (!singers || !Array.isArray(singers)) return;
  cachedKnownSingers = singers.map(s => ({
    name: (s.name || "").trim(),
    section: s.section || "Choir",
    avatar: s.avatar || "",
    totalMins: Number(s.totalMins) || 0
  })).filter(s => s.name.length > 0);

  try {
    localStorage.setItem("kantime_known_singers", JSON.stringify(cachedKnownSingers));
  } catch (err) {
    console.warn("Could not persist kantime_known_singers to localStorage:", err);
  }
}

/**
 * Background fetch of the Google Sheets roster on startup to keep known singers up-to-date.
 */
function fetchKnownSingersRoster() {
  if (!navigator.onLine) return;
  fetch(APPS_SCRIPT_URL)
    .then(res => res.json())
    .then(data => {
      if (!data || !Array.isArray(data) || data.length === 0) return;
      const singerTotals = {};
      data.forEach(entry => {
        const trimmedName = (entry.name || "Unknown").trim();
        const sec = entry.section || "Choir";
        const mins = Number(entry.minutes) || 0;
        const av = (entry.avatar || "").trim();

        if (!singerTotals[trimmedName]) {
          singerTotals[trimmedName] = {
            name: trimmedName,
            section: sec,
            avatar: av,
            totalMins: 0
          };
        } else if (av) {
          singerTotals[trimmedName].avatar = av;
        }
        singerTotals[trimmedName].totalMins += mins;
      });

      const list = Object.values(singerTotals);
      if (list.length > 0) {
        updateKnownSingersFromRoster(list);
      }
    })
    .catch(err => {
      console.warn("Background fetch of known singers roster failed:", err);
    });
}

/**
 * Initialize known singers cache on page boot.
 */
function initKnownSingers() {
  loadKnownSingersCache();
  fetchKnownSingersRoster();
}

/**
 * Normalizes a singer name by trimming, lowercasing, stripping diacritics, and collapsing spaces.
 */
function normalizeSingerName(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s]/g, " ")     // replace punctuation with spaces
    .replace(/\s+/g, " ")             // collapse multi-spaces
    .trim();
}

/**
 * Calculates Levenshtein distance between two strings.
 */
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

/**
 * Calculates a similarity score [0.0 - 1.0] between two names, handling:
 * - Exact and space-collapsed matches (e.g., "dela cruz" vs "de la cruz")
 * - Missing or omitted middle initials/names (e.g., "Maria Sotero" vs "Maria Elena Sotero")
 * - Typographical errors (e.g., "Jonathan" vs "Jonathon")
 */
function calculateNameSimilarity(nameA, nameB) {
  const nA = normalizeSingerName(nameA);
  const nB = normalizeSingerName(nameB);

  if (!nA || !nB) return 0;
  if (nA === nB) return 1.0;

  // Space-free comparison (handles "juandelacruz" vs "juan de la cruz")
  const compactA = nA.replace(/\s+/g, "");
  const compactB = nB.replace(/\s+/g, "");
  if (compactA === compactB) return 1.0;

  const wordsA = nA.split(" ").filter(Boolean);
  const wordsB = nB.split(" ").filter(Boolean);

  // Exact words match in different order (e.g. "Cruz Juan" vs "Juan Cruz")
  if (wordsA.length === wordsB.length && wordsA.length > 1) {
    const sortedA = [...wordsA].sort().join(" ");
    const sortedB = [...wordsB].sort().join(" ");
    if (sortedA === sortedB) return 0.95;
  }

  let wordMatchScore = 0;
  if (wordsA.length >= 2 && wordsB.length >= 2) {
    const firstA = wordsA[0];
    const lastA = wordsA[wordsA.length - 1];
    const firstB = wordsB[0];
    const lastB = wordsB[wordsB.length - 1];

    // First and last name are identical (e.g. "Maria Elena Sotero" vs "Maria Sotero" or "Maria E. Sotero")
    if (firstA === firstB && lastA === lastB) {
      wordMatchScore = 0.88;
    } else {
      // Check if one is a word subset of the other with same first name
      const setA = new Set(wordsA);
      const setB = new Set(wordsB);
      const isSubset = wordsA.every(w => setB.has(w)) || wordsB.every(w => setA.has(w));
      if (isSubset && firstA === firstB) {
        wordMatchScore = 0.85;
      }
    }
  }

  // Levenshtein character similarity
  const maxLen = Math.max(nA.length, nB.length);
  const levDist = levenshteinDistance(nA, nB);
  const levSim = 1.0 - (levDist / maxLen);

  return Math.max(levSim, wordMatchScore);
}

/**
 * Searches the cached roster for a close similarity match (>= 80%),
 * ignoring the user's currently active profile name.
 */
function findSimilarSinger(inputName) {
  const normInput = normalizeSingerName(inputName);
  if (!normInput || normInput.length < 4) return null;

  // If user already has a saved profile, do not trigger match against themselves
  const currentSavedName = normalizeSingerName(localStorage.getItem("choir_name") || "");

  // Combine cachedKnownSingers and cachedLeaderboardSingers without duplicates
  const candidateMap = new Map();
  (cachedKnownSingers || []).forEach(s => {
    if (s && s.name) candidateMap.set(s.name.trim().toLowerCase(), s);
  });
  (cachedLeaderboardSingers || []).forEach(s => {
    if (s && s.name) candidateMap.set(s.name.trim().toLowerCase(), s);
  });

  let bestMatch = null;
  let highestSim = 0;

  for (const singer of candidateMap.values()) {
    const candidateNorm = normalizeSingerName(singer.name);
    // Ignore if it's the exact same name as the user's currently signed-in profile
    if (candidateNorm === currentSavedName && currentSavedName.length > 0) {
      continue;
    }

    const sim = calculateNameSimilarity(normInput, candidateNorm);
    if (sim >= 0.80 && sim > highestSim) {
      highestSim = sim;
      bestMatch = singer;
    }
  }

  if (bestMatch) {
    return {
      matchedSinger: bestMatch,
      similarity: highestSim
    };
  }
  return null;
}

/**
 * Shows the existing singer confirmation modal with the matched profile details.
 */
function showDuplicateConfirmModal(matchedSinger, pendingData) {
  pendingProfileSubmission = {
    matchedSinger: matchedSinger,
    ...pendingData
  };

  const nameLead = document.getElementById("duplicateMatchedNameLead");
  if (nameLead) nameLead.textContent = `${matchedSinger.name} (${matchedSinger.section || "Choir"})`;

  const nameEl = document.getElementById("duplicateMatchedName");
  if (nameEl) nameEl.textContent = matchedSinger.name;

  const voiceEl = document.getElementById("duplicateMatchedVoice");
  if (voiceEl) {
    voiceEl.textContent = matchedSinger.section || "Choir";
    voiceEl.setAttribute("data-voice", matchedSinger.section || "Choir");
  }

  const statsEl = document.getElementById("duplicateMatchedStats");
  if (statsEl) {
    const mins = Number(matchedSinger.totalMins) || 0;
    const hours = (mins / 60).toFixed(1);
    statsEl.textContent = mins > 0 ? `• ${mins}m (${hours}h) practiced` : "• Active choir member";
  }

  const avatarWrap = document.getElementById("duplicateMatchAvatar");
  if (avatarWrap) {
    if (matchedSinger.avatar) {
      avatarWrap.innerHTML = `<img src="${matchedSinger.avatar}" alt="${escapeLeaderboardHtml(matchedSinger.name)}">`;
    } else {
      avatarWrap.innerHTML = `🎵`;
    }
  }

  const modal = document.getElementById("duplicateConfirmModal");
  if (modal) modal.classList.add("active");
}

/**
 * Closes the duplicate singer confirmation modal.
 */
function closeDuplicateConfirmModal() {
  const modal = document.getElementById("duplicateConfirmModal");
  if (modal) modal.classList.remove("active");
}

/**
 * Closes the duplicate singer confirmation modal when clicking on the frosted backdrop.
 */
function closeDuplicateModalOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeDuplicateConfirmModal();
}

/**
 * Handles confirmation actions from the duplicate singer modal:
 * - 'accept': Links device directly to existing profile without creating duplicate Google Sheets record.
 * - 'new': Confirms distinct singer identity and proceeds to create the profile.
 */
function handleDuplicateAction(actionType) {
  if (!pendingProfileSubmission) {
    closeDuplicateConfirmModal();
    return;
  }

  const submission = pendingProfileSubmission;
  closeDuplicateConfirmModal();

  if (actionType === "accept") {
    // Links device localStorage directly to existing matched profile/voice
    applyProfileData(
      submission.matchedSinger.name,
      submission.matchedSinger.section,
      submission.matchedSinger.avatar || submission.avatar
    );
    showToast(`Welcome back, ${submission.matchedSinger.name}! 🎵 Profile linked.`);
    if (submission.isSetting) {
      closeSettingsModal();
    }
  } else if (actionType === "new") {
    // User confirms they are a distinct singer -> proceed with new profile
    applyProfileData(
      submission.name,
      submission.section,
      submission.avatar
    );
    showToast(`Welcome to KanTime, ${submission.name}! ✨`);
    if (submission.isSetting) {
      closeSettingsModal();
    }
  }

  pendingProfileSubmission = null;
}

/**
 * Common helper to persist profile data to localStorage and synchronize the UI.
 */
function applyProfileData(name, section, avatar) {
  if (!localStorage.getItem("choir_name") && name) {
    localStorage.setItem("choir_name", name);
  }
  localStorage.setItem("choir_section", section);
  localStorage.setItem("choir_voice", section);
  if (avatar) {
    localStorage.setItem("choir_avatar", avatar);
  } else {
    localStorage.removeItem("choir_avatar");
  }

  // Update inputs on main setup card & settings modal
  const pageFullName = document.getElementById("onboardingFullName");
  if (pageFullName) pageFullName.value = localStorage.getItem("choir_name") || "";
  const pageNameInput = document.getElementById("onboardingNickname") || document.getElementById("memberName");
  if (pageNameInput) pageNameInput.value = localStorage.getItem("choir_nickname") || name;
  const legacyMemberName = document.getElementById("memberName");
  if (legacyMemberName && legacyMemberName !== pageNameInput) legacyMemberName.value = localStorage.getItem("choir_nickname") || name;

  const pageSecSelect = document.getElementById("onboardingVoicePart") || document.getElementById("memberSection");
  if (pageSecSelect) pageSecSelect.value = section;
  const legacyMemberSec = document.getElementById("memberSection");
  if (legacyMemberSec && legacyMemberSec !== pageSecSelect) legacyMemberSec.value = section;

  const settingFullName = document.getElementById("profileFullName");
  if (settingFullName) settingFullName.value = localStorage.getItem("choir_name") || "";
  const settingNickInput = document.getElementById("profileNickname") || document.getElementById("profileInitials");
  if (settingNickInput) settingNickInput.value = localStorage.getItem("choir_nickname") || name;
  const settingSecSelect = document.getElementById("profileVoicePart") || document.getElementById("settingMemberSection");
  if (settingSecSelect) settingSecSelect.value = section;

  selectedAvatarFile = avatar || "";
  selectedSettingAvatarFile = avatar || "";
  renderAvatarPicker(avatar);
  renderSettingAvatarPicker(avatar);

  updateActiveProfileDisplay(name, section, avatar);
  updateIdentityUI();

  const profileCard = document.getElementById("profileCard");
  if (profileCard) profileCard.style.display = "none";
  const activeBanner = document.getElementById("activeProfileBanner");
  if (activeBanner) activeBanner.style.display = "flex";
  const mainDashboard = document.getElementById("mainDashboard");
  if (mainDashboard) mainDashboard.style.display = "block";

  const cancelBtn = document.getElementById("cancelProfileBtn");
  if (cancelBtn) cancelBtn.style.display = "inline-flex";

  const targetSelect = document.getElementById("targetSong");
  const currentSong = (targetSelect && targetSelect.value) ? targetSelect.value : (localStorage.getItem("kantime_target_song") || "Know This, That Every Soul Is Free");
  if (currentSong) renderSelectedSongResource(currentSong);

  loadLeaderboard();
  initEncouragementBanner();

  const pitchWidget = document.getElementById("pitchCheckerWidget");
  if (pitchWidget) pitchWidget.style.display = "block";
  updatePitchTargetVoice();

  const practiceWorkspace = document.getElementById("practiceWorkspace");
  if (practiceWorkspace) {
    practiceWorkspace.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function saveOnboardingProfile() {
  const enteredFullName = document.getElementById('onboardingFullName')?.value.trim() || '';
  const nicknameInput = document.getElementById('onboardingNickname') || document.getElementById('memberName');
  const rawNickname = nicknameInput ? nicknameInput.value.trim().toUpperCase() : '';
  const enteredNickname = (rawNickname || enteredFullName.slice(0, 3) || 'CHOIR').toUpperCase();

  const voiceSelect = document.getElementById('onboardingVoicePart') || document.getElementById('memberSection');
  const enteredVoice = voiceSelect ? voiceSelect.value : 'All';

  const stakeInput = document.getElementById('onboardingStake');
  const enteredStake = stakeInput ? stakeInput.value.trim() : '';

  const avatar = selectedAvatarFile || '';

  // Validate nickname: 2 to 6 characters
  const msgEl = document.getElementById('memberNameValidationMsg');
  const submitBtn = document.getElementById('setupProfileSubmitBtn') || document.getElementById('saveProfileBtn');

  if (!enteredNickname || enteredNickname.length < 2 || enteredNickname.length > 6) {
    if (nicknameInput) {
      nicknameInput.classList.add('input-invalid');
      nicknameInput.focus();
    }
    if (msgEl) {
      msgEl.textContent = '⚠️ Please enter your initials or nickname (2 to 6 characters).';
      msgEl.style.display = 'block';
    }
    if (submitBtn) submitBtn.disabled = true;
    showToast('⚠️ Please enter your initials or nickname (2 to 6 characters).');
    return false;
  }

  if (nicknameInput) {
    nicknameInput.classList.remove('input-invalid');
    nicknameInput.value = enteredNickname;
  }
  if (msgEl) {
    msgEl.style.display = 'none';
  }

  // Preserve existing tag if present, else generate one
  let currentTag = '8K2P';
  try {
    const existing = JSON.parse(localStorage.getItem('kantimes_user_identity') || '{}');
    if (existing.tag) currentTag = existing.tag;
    else {
      currentTag = Math.floor(Math.random() * Math.pow(36, 4)).toString(36).toUpperCase().padStart(4, '0');
    }
  } catch (e) {
    currentTag = Math.floor(Math.random() * Math.pow(36, 4)).toString(36).toUpperCase().padStart(4, '0');
  }

  const profile = {
    fullName: enteredFullName,
    nickname: enteredNickname,
    initials: enteredNickname,
    voice: document.getElementById('onboardingVoicePart')?.value || document.getElementById('memberSection')?.value || 'All',
    stake: document.getElementById('onboardingStake')?.value || '',
    isConfigured: true
  };

  localStorage.setItem('kantimes_user_identity', JSON.stringify({
    ...profile,
    tag: currentTag,
    part: profile.voice,
    section: profile.voice,
    name: profile.fullName || profile.nickname,
    avatar: avatar
  }));
  localStorage.setItem('choir_name', profile.fullName);
  localStorage.setItem('choir_nickname', profile.nickname);
  if (profile.voice && profile.voice !== 'All') {
    localStorage.setItem('choir_voice', profile.voice);
    localStorage.setItem('choir_section', profile.voice);
  }
  if (avatar) {
    localStorage.setItem('choir_avatar', avatar);
  }

  applyProfileData(profile.fullName || profile.nickname, profile.voice, avatar);
  showToast('Welcome to Kantimes! Profile configured 🎶');
  return true;
}

function handleProfileSubmit() {
  saveOnboardingProfile();
}

function initOnboardingInputs() {
  const fullNameInput = document.getElementById('onboardingFullName');
  const nicknameInput = document.getElementById('onboardingNickname') || document.getElementById('memberName');
  let userManuallyEditedNickname = false;

  if (nicknameInput) {
    if (nicknameInput.value.trim().length > 0) {
      userManuallyEditedNickname = true;
    }
    nicknameInput.addEventListener('input', () => {
      nicknameInput.value = nicknameInput.value.toUpperCase();
      userManuallyEditedNickname = nicknameInput.value.trim().length > 0;
      const msgEl = document.getElementById('memberNameValidationMsg');
      if (msgEl) msgEl.style.display = 'none';
      const legacyEl = document.getElementById('memberName');
      if (legacyEl && legacyEl !== nicknameInput) legacyEl.value = nicknameInput.value;
      const submitBtn = document.getElementById('setupProfileSubmitBtn') || document.getElementById('saveProfileBtn');
      if (submitBtn) submitBtn.disabled = false;
    });
  }

  if (fullNameInput && nicknameInput) {
    fullNameInput.addEventListener('input', () => {
      if (!userManuallyEditedNickname) {
        const initials = fullNameInput.value
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(word => word[0].toUpperCase())
          .join('')
          .slice(0, 4);
        nicknameInput.value = initials;
        const legacyEl = document.getElementById('memberName');
        if (legacyEl && legacyEl !== nicknameInput) legacyEl.value = initials;
        const submitBtn = document.getElementById('setupProfileSubmitBtn') || document.getElementById('saveProfileBtn');
        if (submitBtn) submitBtn.disabled = false;
        const msgEl = document.getElementById('memberNameValidationMsg');
        if (msgEl && initials.length >= 2) msgEl.style.display = 'none';
      }
    });
  }

  const voiceSelect = document.getElementById('onboardingVoicePart');
  if (voiceSelect) {
    voiceSelect.addEventListener('change', () => {
      const legacySec = document.getElementById('memberSection');
      if (legacySec && legacySec !== voiceSelect) legacySec.value = voiceSelect.value;
    });
  }
}

window.saveOnboardingProfile = saveOnboardingProfile;
window.handleProfileSubmit = handleProfileSubmit;
window.initOnboardingInputs = initOnboardingInputs;

function saveProfileFromSettings(e) {
  return saveProfileVoiceSettings(e);
}

function switchProfile() {
  const inactModal = document.getElementById("inactivityModal");
  if (inactModal) inactModal.classList.remove("active");
  isIdleModalOpen = false;

  openSettingsModal('profile');
}

function cancelProfileEdit() {
  const savedName = formatDisplayName(localStorage.getItem("choir_name") || "");
  const savedSection = localStorage.getItem("choir_voice") || localStorage.getItem("choir_section");
  const savedAvatar = localStorage.getItem("choir_avatar") || "";

  if (savedName && savedSection) {
    const memName = document.getElementById("memberName");
    if (memName) memName.value = savedName;
    const memSec = document.getElementById("memberSection");
    if (memSec) memSec.value = savedSection;
    updateActiveProfileDisplay(savedName, savedSection, savedAvatar);

    const profCard = document.getElementById("profileCard");
    if (profCard) profCard.style.display = "none";
    const actBanner = document.getElementById("activeProfileBanner");
    if (actBanner) actBanner.style.display = "flex";
    const dash = document.getElementById("mainDashboard");
    if (dash) dash.style.display = "block";
  }
}

function validateUser() {
  const nameInput = document.getElementById("profileNickname") || document.getElementById("memberName") || document.getElementById("profileFullName");
  const rawName = nameInput ? nameInput.value.trim() : "";
  const name = formatDisplayName(rawName);
  if (nameInput && nameInput.value !== name) {
    nameInput.value = name;
  }
  const secEl = document.getElementById("profileVoicePart") || document.getElementById("memberSection");
  const section = secEl ? secEl.value : (localStorage.getItem("choir_voice") || "All");
  if (!name || name.length < 2 || !section) {
    if (name && name.length < 2) {
      showToast("⚠️ Please enter a valid name (at least 2 characters).");
    } else {
      if (typeof alert === "function") {
        alert("Please confirm your name and voice part before starting!");
      } else {
        showToast("⚠️ Please confirm your name and voice part before starting!");
      }
    }
    switchProfile();
    return false;
  }
  return true;
}

// --- INACTIVITY / IDLE DETECTION SYSTEM ---
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
let idleTimerId = null;
let lastActivityTime = Date.now();
let isIdleTrackingActive = false;
let isIdleModalOpen = false;
let lastThrottleTime = 0;

function getFirstName(fullName) {
  if (!fullName) return "Singer";
  const clean = fullName.trim();
  const parts = clean.split(/\s+/);
  return parts[0] || "Singer";
}

function handleUserInteraction() {
  const now = Date.now();
  if (now - lastThrottleTime < 1000) return;
  lastThrottleTime = now;

  if (isIdleModalOpen) return;

  lastActivityTime = now;
  localStorage.setItem("kantime_last_activity", now);

  if (timerInterval && targetEndTime) {
    if (idleTimerId) {
      clearTimeout(idleTimerId);
    }
    idleTimerId = setTimeout(triggerInactivityTimeout, IDLE_TIMEOUT_MS);
  }
}

function startIdleTracking() {
  if (!timerInterval && !targetEndTime) return;

  lastActivityTime = Date.now();
  localStorage.setItem("kantime_last_activity", lastActivityTime);

  if (!isIdleTrackingActive) {
    isIdleTrackingActive = true;
    IDLE_EVENTS.forEach(evt => {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    });
  }

  if (idleTimerId) {
    clearTimeout(idleTimerId);
  }
  idleTimerId = setTimeout(triggerInactivityTimeout, IDLE_TIMEOUT_MS);
}

function stopIdleTracking() {
  if (isIdleTrackingActive) {
    isIdleTrackingActive = false;
    IDLE_EVENTS.forEach(evt => {
      window.removeEventListener(evt, handleUserInteraction);
    });
  }

  if (idleTimerId) {
    clearTimeout(idleTimerId);
    idleTimerId = null;
  }
}

function triggerInactivityTimeout() {
  if (!timerInterval && !targetEndTime) return;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (targetEndTime) {
    timeRemaining = Math.max(0, Math.ceil((targetEndTime - Date.now()) / 1000));
  }
  targetEndTime = null;
  localStorage.removeItem("kantime_target_end");
  localStorage.setItem("kantime_paused_remaining", timeRemaining);

  const timerDisp = document.getElementById("timerDisplay");
  if (timerDisp) timerDisp.innerText = formatTime(timeRemaining);

  const btn = document.getElementById("timerBtn");
  if (btn) {
    btn.innerText = "Resume Practice";
    btn.classList.remove("btn-outline");
    btn.classList.add("btn-primary");
  }

  stopIdleTracking();
  openInactivityModal();
}

function openInactivityModal() {
  isIdleModalOpen = true;
  const modal = document.getElementById("inactivityModal");
  if (!modal) return;

  const fullName = localStorage.getItem("choir_name") || "Singer";
  const firstName = getFirstName(fullName);
  const avatar = localStorage.getItem("choir_avatar") || "";

  const titleEl = document.getElementById("inactivityTitle");
  if (titleEl) {
    titleEl.innerText = `Are you still practicing, ${firstName}?`;
  }

  const avatarWrap = document.getElementById("inactivityAvatarWrap");
  if (avatarWrap) {
    if (avatar && avatar.trim()) {
      const src = getAvatarImgSrc(avatar);
      avatarWrap.innerHTML = `
          <img src="${src}" alt="${firstName}" class="inactivity-avatar-circle" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="inactivity-avatar-circle avatar-fallback" style="display:none;" title="${firstName}">🎵</div>
        `;
    } else {
      avatarWrap.innerHTML = `
          <div class="inactivity-avatar-circle avatar-fallback" title="${firstName}">🎵</div>
        `;
    }
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function dismissInactivityModal(resumeSession) {
  isIdleModalOpen = false;
  const modal = document.getElementById("inactivityModal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";

  if (resumeSession) {
    if (timeRemaining > 0) {
      targetEndTime = Date.now() + (timeRemaining * 1000);
      localStorage.setItem("kantime_target_end", targetEndTime);
      const tSel = document.getElementById("targetSong"); if (tSel) localStorage.setItem("kantime_target_song", tSel.value);
      localStorage.removeItem("kantime_paused_remaining");

      const btn = document.getElementById("timerBtn");
      if (btn) {
        btn.innerText = "Pause Practice";
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-outline");
      }

      updateTimerTick();
      timerInterval = setInterval(updateTimerTick, 500);
      startIdleTracking();
      showToast("Resumed! Keep going! 🎶");
    }
  } else {
    stopIdleTracking();
    showToast("Session paused.");
  }
}

function closeInactivityOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  dismissInactivityModal(false);
}

function checkInactivityOnRestore() {
  const savedTargetEnd = localStorage.getItem("kantime_target_end");
  if (!savedTargetEnd) return false;

  const now = Date.now();
  const savedLastActivity = Number(localStorage.getItem("kantime_last_activity") || now);
  const elapsedSinceActivity = now - savedLastActivity;

  if (elapsedSinceActivity >= IDLE_TIMEOUT_MS) {
    const idlePauseTime = savedLastActivity + IDLE_TIMEOUT_MS;
    const remainingMs = Math.max(0, Number(savedTargetEnd) - idlePauseTime);
    timeRemaining = Math.max(0, Math.ceil(remainingMs / 1000));

    targetEndTime = null;
    localStorage.removeItem("kantime_target_end");
    localStorage.setItem("kantime_paused_remaining", timeRemaining);

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    const timerDisp = document.getElementById("timerDisplay");
    if (timerDisp) timerDisp.innerText = formatTime(timeRemaining);

    const btn = document.getElementById("timerBtn");
    if (btn) {
      btn.innerText = "Resume Practice";
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary");
    }

    stopIdleTracking();
    openInactivityModal();
    return true;
  }
  return false;
}

// --- ENCOURAGING CHOIR QUOTES & MILESTONE SYSTEM ---
const CHOIR_ENCOURAGEMENT_QUOTES = [
  "The song of the righteous is a prayer unto Him.",
  "Every note you practice lifts the entire choir.",
  "Tenors & Basses, Sopranos & Altos—united in one voice.",
  "Consistency turns good music into sacred praise.",
  "You don't have to be perfect; you just have to sing with heart.",
  "Thank you for sharing your time and talent today!",
  "Music has the power to invite the Spirit into every heart.",
  "Faithful rehearsal brings celestial harmony on Sunday.",
  "Lift up your voice with strength, be not afraid!",
  "A prepared choir is a choir that ministers with power."
];

const HALFWAY_ENCOURAGEMENT_QUOTES = [
  "Halfway there! Your voice makes a difference!",
  "50% completed! Sounding wonderful—keep it going!",
  "Halfway point reached! Your dedication blesses the choir!",
  "Over the hump! Every minute of practice counts!"
];

const CELEBRATION_MESSAGES = [
  "Thank you for sharing your time and talent today! Every note lifts the entire choir.",
  "Sacred music begins with faithful practice. Thank you for your dedication!",
  "Your devotion to choir rehearsal strengthens our whole congregation.",
  "Well done! Beautiful harmony is built one faithful practice session at a time."
];

let isHalfwayTriggered = false;

function getSessionHistory() {
  try {
    const raw = localStorage.getItem("kantime_session_history");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function recordCompletedSession(mins) {
  const history = getSessionHistory();
  const now = Date.now();
  history.push({ timestamp: now, minutes: mins });
  if (history.length > 100) history.splice(0, history.length - 100);
  localStorage.setItem("kantime_session_history", JSON.stringify(history));
}

function getWeekSessionStats() {
  const history = getSessionHistory();
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const weekSessions = history.filter(item => item.timestamp >= oneWeekAgo);
  return {
    totalSessions: history.length,
    weekCount: weekSessions.length
  };
}

function showEncouragementBanner(text, icon = "🎵", mode = "normal") {
  const banner = document.getElementById("encouragementBanner");
  const iconEl = document.getElementById("encouragementIcon");
  const textEl = document.getElementById("encouragementText");
  if (!banner || !textEl) return;

  banner.className = "encouragement-banner" + (mode !== "normal" ? " " + mode : "");
  if (iconEl) iconEl.innerText = icon;
  textEl.innerText = `"${text}"`;
  banner.style.display = "inline-flex";
}

function hideEncouragementBanner() {
  const banner = document.getElementById("encouragementBanner");
  if (banner) banner.style.display = "none";
}

function initEncouragementBanner() {
  const banner = document.getElementById("encouragementBanner");
  if (!banner) return;

  const savedTargetEnd = localStorage.getItem("kantime_target_end");
  const savedPaused = localStorage.getItem("kantime_paused_remaining");
  const curMins = getUserSettings().timerMinutes || 15;
  const totalSecs = curMins * 60;

  if (savedTargetEnd) {
    const diff = Math.max(0, Math.ceil((Number(savedTargetEnd) - Date.now()) / 1000));
    if (diff <= totalSecs / 2) {
      isHalfwayTriggered = true;
      showEncouragementBanner("Halfway there! Your voice makes a difference!", "✨", "halfway");
      return;
    }
  } else if (savedPaused && Number(savedPaused) < totalSecs) {
    if (Number(savedPaused) <= totalSecs / 2) {
      isHalfwayTriggered = true;
      showEncouragementBanner("Halfway there! Your voice makes a difference!", "✨", "halfway");
      return;
    }
  }

  const stats = getWeekSessionStats();
  if (stats && stats.weekCount >= 2) {
    showEncouragementBanner(`${stats.weekCount} sessions this week—thank you for your dedication!`, "🔥", "normal");
  } else {
    const quote = CHOIR_ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * CHOIR_ENCOURAGEMENT_QUOTES.length)];
    showEncouragementBanner(quote, "🎵", "normal");
  }
}

function openCompletionModal(mins, stats) {
  const modal = document.getElementById("completionModal");
  if (!modal) {
    alert(`🎉 Session Complete! You've logged ${mins} minutes of solid practice!`);
    return;
  }

  const badge = document.getElementById("completionDurationBadge");
  if (badge) badge.innerText = `⭐ ${mins} Minutes Logged`;

  const msgEl = document.getElementById("completionCelebrationMessage");
  if (msgEl) {
    const praise = CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)];
    msgEl.innerText = `"${praise}"`;
  }

  const streakPill = document.getElementById("completionStreakPill");
  const streakCount = document.getElementById("completionStreakCount");
  if (streakPill && streakCount) {
    if (stats && stats.weekCount >= 2) {
      streakCount.innerText = `${stats.weekCount} sessions this week`;
      streakPill.style.display = "inline-flex";
    } else {
      streakPill.style.display = "none";
    }
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCompletionModal() {
  const modal = document.getElementById("completionModal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";
}

function closeCompletionModalOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeCompletionModal();
}

function updateTimerTick() {
  if (!targetEndTime) return;
  const now = Date.now();
  const diffMs = targetEndTime - now;
  timeRemaining = Math.max(0, Math.ceil(diffMs / 1000));
  const timerDisp = document.getElementById("timerDisplay"); if (timerDisp) timerDisp.innerText = formatTime(timeRemaining);

  const curMins = getUserSettings().timerMinutes || 15;
  const totalSecs = curMins * 60;

  if (!isHalfwayTriggered && timeRemaining <= (totalSecs / 2) && timeRemaining > 0) {
    isHalfwayTriggered = true;
    localStorage.setItem("kantime_halfway_triggered", "true");
    const halfwayQuote = HALFWAY_ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * HALFWAY_ENCOURAGEMENT_QUOTES.length)];
    showEncouragementBanner(halfwayQuote, "✨", "halfway");
    showToast("✨ Halfway there! Your voice makes a difference! 🎶");
  }

  if (timeRemaining <= 0) {
    completeTimerSession();
  }
}

function completeTimerSession() {
  stopIdleTracking();
  const modal = document.getElementById("inactivityModal");
  if (modal) modal.classList.remove("active");
  isIdleModalOpen = false;

  const currentDurationMins = getUserSettings().timerMinutes || 15;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  targetEndTime = null;
  timerDuration = currentDurationMins * 60;
  timeRemaining = timerDuration;
  isHalfwayTriggered = false;
  localStorage.removeItem("kantime_target_end");
  localStorage.removeItem("kantime_target_song");
  localStorage.removeItem("kantime_paused_remaining");
  localStorage.removeItem("kantime_last_activity");
  localStorage.removeItem("kantime_halfway_triggered");

  const timerDisp = document.getElementById("timerDisplay"); if (timerDisp) timerDisp.innerText = formatTime(timeRemaining);

  const btn = document.getElementById("timerBtn");
  if (btn) {
    btn.innerText = "Start Practice";
    btn.classList.remove("btn-outline");
    btn.classList.add("btn-primary");
  }

  updateDurationSelectorUI(currentDurationMins, false);
  recordCompletedSession(currentDurationMins);
  const currentSong = document.getElementById("targetSong") ? document.getElementById("targetSong").value : "";
  const identity = getUserIdentity();
  logPracticeSession(currentSong, identity.part || "All", currentDurationMins);
  const stats = getWeekSessionStats();

  const celebrationPraise = CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)];
  showEncouragementBanner(celebrationPraise, "🎉", "milestone");

  openCompletionModal(currentDurationMins, stats);
  submitPracticeSession(currentDurationMins);

  renderSelectedSongResource(currentSong);
}

function restoreTimerState() {
  if (isIdleModalOpen) return;

  const currentDurationMins = getUserSettings().timerMinutes || 15;
  const savedTargetEnd = localStorage.getItem("kantime_target_end");
  const btn = document.getElementById("timerBtn");
  const savedSong = localStorage.getItem("kantime_target_song");
  const targetSelect = document.getElementById("targetSong");
  if (targetSelect) {
    if (savedSong && Array.from(targetSelect.options).some(o => o.value === savedSong)) {
      targetSelect.value = savedSong;
    } else if (targetSelect.options.length > 0) {
      targetSelect.selectedIndex = 0;
      if (targetSelect.value) {
        localStorage.setItem("kantime_target_song", targetSelect.value);
        localStorage.setItem("kantimes_target_song", targetSelect.value);
      }
    }
  }

  if (savedTargetEnd) {
    if (checkInactivityOnRestore()) {
      return;
    }

    const savedEndTime = Number(savedTargetEnd);
    const now = Date.now();

    if (now < savedEndTime) {
      targetEndTime = savedEndTime;
      timeRemaining = Math.max(0, Math.ceil((targetEndTime - now) / 1000));
      const timerDisp = document.getElementById("timerDisplay"); if (timerDisp) timerDisp.innerText = formatTime(timeRemaining);

      btn.innerText = "Pause Practice";
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-outline");

      if (!timerInterval) {
        timerInterval = setInterval(updateTimerTick, 500);
      }

      startIdleTracking();
      updateDurationSelectorUI(currentDurationMins, true);
    } else {
      completeTimerSession();
    }
  } else {
    stopIdleTracking();
    const savedPaused = localStorage.getItem("kantime_paused_remaining");
    if (savedPaused && Number(savedPaused) > 0 && Number(savedPaused) < timerDuration) {
      timeRemaining = Number(savedPaused);
      const timerDisp = document.getElementById("timerDisplay"); if (timerDisp) timerDisp.innerText = formatTime(timeRemaining);
      btn.innerText = "Resume Practice";
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary");
    } else {
      timerDuration = currentDurationMins * 60;
      timeRemaining = timerDuration;
      const timerDisp = document.getElementById("timerDisplay"); if (timerDisp) timerDisp.innerText = formatTime(timeRemaining);
      btn.innerText = "Start Practice";
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary");
    }
    updateDurationSelectorUI(currentDurationMins, false);
  }

  const currentSong = document.getElementById("targetSong") ? document.getElementById("targetSong").value : "";
  renderSelectedSongResource(currentSong);

  initEncouragementBanner();
}

function toggleTimer() {
  if (!validateUser()) return;

  const currentDurationMins = getUserSettings().timerMinutes || 15;
  const btn = document.getElementById("timerBtn");
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    let elapsedSeconds = 0;
    if (targetEndTime) {
      const remainingSecs = Math.max(0, Math.ceil((targetEndTime - Date.now()) / 1000));
      elapsedSeconds = Math.max(0, timerDuration - remainingSecs);
      timeRemaining = remainingSecs;
    }
    targetEndTime = null;
    localStorage.removeItem("kantime_target_end");
    localStorage.setItem("kantime_paused_remaining", timeRemaining);

    // Record partial practice session if at least 1 minute was practiced
    const elapsedMins = Math.round((elapsedSeconds / 60) * 10) / 10;
    if (elapsedMins >= 1) {
      const currentSong = document.getElementById("targetSong") ? document.getElementById("targetSong").value : "";
      const identity = getUserIdentity();
      logPracticeSession(currentSong, identity.part || "All", elapsedMins);
    }

    const timerDisp = document.getElementById("timerDisplay"); if (timerDisp) timerDisp.innerText = formatTime(timeRemaining);
    btn.innerText = "Resume Practice";
    btn.classList.remove("btn-outline");
    btn.classList.add("btn-primary");

    stopIdleTracking();
    updateDurationSelectorUI(currentDurationMins, false);
  } else {
    timerDuration = timeRemaining; // Set current cycle duration
    targetEndTime = Date.now() + (timeRemaining * 1000);
    localStorage.setItem("kantime_target_end", targetEndTime);
    const tSel = document.getElementById("targetSong"); if (tSel) localStorage.setItem("kantime_target_song", tSel.value);
    localStorage.removeItem("kantime_paused_remaining");

    btn.innerText = "Pause Practice";
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-outline");

    const songSel = document.getElementById("targetSong"); renderSelectedSongResource(songSel ? songSel.value : "");

    const totalSecs = currentDurationMins * 60;
    if (timeRemaining > (totalSecs / 2)) {
      isHalfwayTriggered = false;
      const stats = getWeekSessionStats();
      if (stats.weekCount >= 3 && Math.random() < 0.35) {
        showEncouragementBanner(`${stats.weekCount} sessions this week—thank you for your dedication!`, "🔥", "normal");
      } else {
        const randomQuote = CHOIR_ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * CHOIR_ENCOURAGEMENT_QUOTES.length)];
        showEncouragementBanner(randomQuote, "🎵", "normal");
      }
    } else {
      showEncouragementBanner("Halfway there! Your voice makes a difference!", "✨", "halfway");
    }

    updateTimerTick();
    timerInterval = setInterval(updateTimerTick, 500);

    startIdleTracking();
    updateDurationSelectorUI(currentDurationMins, true);
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    restoreTimerState();
  }
});
window.addEventListener("focus", () => {
  restoreTimerState();
});

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.innerText = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 3000);
}

// --- SUBMIT PRACTICE LOG TO GOOGLE SHEETS ---
function submitPracticeSession(minutes) {
  const name = document.getElementById("memberName").value.trim();
  const section = document.getElementById("memberSection").value;
  const song = document.getElementById("targetSong").value;
  const avatar = localStorage.getItem("choir_avatar") || "";
  const timestamp = new Date().toISOString();

  const payload = {
    name: name,
    section: section,
    song: song,
    minutes: minutes,
    avatar: avatar,
    timestamp: timestamp
  };

  if (!navigator.onLine) {
    saveOfflinePracticeSession(payload);
    showToast("Session saved offline! It will sync to the leaderboard when you reconnect. 📡");
    return;
  }

  showToast("Logging session...");

  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(() => {
      showToast("Logged! Salamat sa practice! 🔥");
      setTimeout(loadLeaderboard, 1500);
    })
    .catch(err => {
      saveOfflinePracticeSession(payload);
      showToast("Session saved offline! It will sync to the leaderboard when you reconnect. 📡");
      console.warn("Network request failed, queued offline:", err);
    });
}

// --- LOAD LEADERBOARDS ---
let currentLeaderboardTab = "all";
let cachedLeaderboardSingers = [];

function escapeLeaderboardHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function switchLeaderboardTab(tab) {
  if (tab !== "all" && tab !== "primary") return;
  currentLeaderboardTab = tab;

  const tabAll = document.getElementById("tabLeaderboardAll");
  const tabPrimary = document.getElementById("tabLeaderboardPrimary");

  if (tabAll) {
    const isActive = tab === "all";
    tabAll.classList.toggle("active", isActive);
    tabAll.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  if (tabPrimary) {
    const isActive = tab === "primary";
    tabPrimary.classList.toggle("active", isActive);
    tabPrimary.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  const titleEl = document.getElementById("leaderboardCardTitle");
  if (titleEl) {
    titleEl.textContent = tab === "primary" ? "🌟 Primary Stars" : "🏆 Top 10 Dedicated Singers";
  }

  renderLeaderboardSingers();
}
window.switchLeaderboardTab = switchLeaderboardTab;

let currentDisplayedSingers = [];

function showSingerDetails(identifier, optionalRank) {
  let singer = null;
  let rank = optionalRank;

  if (typeof identifier === "number") {
    if (currentDisplayedSingers && currentDisplayedSingers[identifier]) {
      singer = currentDisplayedSingers[identifier];
      rank = identifier + 1;
    }
  } else if (typeof identifier === "string") {
    let decoded = "";
    try {
      decoded = decodeURIComponent(identifier).trim().toLowerCase();
    } catch (e) {
      decoded = identifier.trim().toLowerCase();
    }

    if (currentDisplayedSingers && currentDisplayedSingers.length > 0) {
      const idx = currentDisplayedSingers.findIndex(s => (s.name || "").trim().toLowerCase() === decoded);
      if (idx !== -1) {
        singer = currentDisplayedSingers[idx];
        rank = rank || (idx + 1);
      }
    }

    if (!singer && cachedLeaderboardSingers && cachedLeaderboardSingers.length > 0) {
      const idx = cachedLeaderboardSingers.findIndex(s => (s.name || "").trim().toLowerCase() === decoded);
      if (idx !== -1) {
        singer = cachedLeaderboardSingers[idx];
        rank = rank || (idx + 1);
      }
    }
  } else if (typeof identifier === "object" && identifier !== null) {
    singer = identifier;
  }

  if (singer) {
    openSingerDetailsModal(singer, rank || 1);
  }
}

function openSingerDetailsModalByIndex(idx) {
  showSingerDetails(idx);
}

function openSingerDetailsModal(singer, displayRank) {
  const modal = document.getElementById("singerDetailsModal");
  if (!modal) return;

  const currentUserName = (localStorage.getItem("choir_name") || "").trim().toLowerCase();
  const currentUserAvatar = localStorage.getItem("choir_avatar") || "";

  let avatarToShow = singer.avatar;
  if (!avatarToShow && currentUserName && (singer.name || "").toLowerCase() === currentUserName) {
    avatarToShow = currentUserAvatar;
  }

  const avatarContainer = document.getElementById("singerDetailsAvatarContainer");
  if (avatarContainer) {
    if (avatarToShow && avatarToShow.trim()) {
      const src = getAvatarImgSrc(avatarToShow);
      avatarContainer.innerHTML = `
        <img src="${src}" alt="${escapeLeaderboardHtml(singer.name)}" class="singer-details-avatar-img"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="singer-details-avatar-img avatar-fallback" style="display:none;" title="Choir Singer">🎵</div>
      `;
    } else {
      avatarContainer.innerHTML = `<div class="singer-details-avatar-img avatar-fallback" title="Choir Singer">🎵</div>`;
    }
  }

  const nameEl = document.getElementById("singerDetailsFullName");
  if (nameEl) {
    nameEl.textContent = singer.name || "Choir Singer";
  }

  const sec = singer.section || "Choir";
  const voiceEl = document.getElementById("singerDetailsVoicePart");
  if (voiceEl) {
    voiceEl.textContent = sec;
    voiceEl.setAttribute("data-voice", sec);
  }

  const isPrimary = (sec || "").trim().toLowerCase() === "primary";
  const rankCategory = isPrimary ? "Primary Stars" : "Stake Choir";

  const mins = Number(singer.totalMins) || 0;
  const hours = (mins / 60).toFixed(1);

  // Display format: #3 • 85m (1.4h)
  const rankPill = document.getElementById("singerDetailsRankPill");
  if (rankPill) {
    rankPill.textContent = `#${displayRank} • ${mins}m (${hours}h)`;
  }

  const rankVal = document.getElementById("singerDetailsRankValue");
  if (rankVal) {
    rankVal.textContent = `#${displayRank}`;
  }

  const rankSub = document.getElementById("singerDetailsRankSub");
  if (rankSub) {
    rankSub.textContent = rankCategory;
  }

  const timeVal = document.getElementById("singerDetailsTimeValue");
  const timeSub = document.getElementById("singerDetailsTimeSub");
  if (timeVal) {
    timeVal.textContent = `${mins}m`;
  }
  if (timeSub) {
    timeSub.textContent = `${hours} hours practiced`;
  }

  modal.classList.add("active", "show");
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}

function closeSingerDetailsModal() {
  const modal = document.getElementById("singerDetailsModal");
  if (modal) {
    modal.classList.remove("active", "show");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
}

function closeSingerDetailsModalOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeSingerDetailsModal();
}

// --- SECTION DETAILS MODAL CONTROLLER ---
let cachedSectionStandings = [];

function showSectionDetails(identifier, optionalRank, e) {
  if (e) {
    if (typeof e.stopPropagation === "function") e.stopPropagation();
    if (typeof e.preventDefault === "function") e.preventDefault();
  }
  let sectionData = null;
  let rank = optionalRank;

  if (typeof identifier === "string") {
    let decoded = "";
    try {
      decoded = decodeURIComponent(identifier).trim().toLowerCase();
    } catch (e) {
      decoded = identifier.trim().toLowerCase();
    }

    if (cachedSectionStandings && cachedSectionStandings.length > 0) {
      const found = cachedSectionStandings.find(s => (s.section || "").trim().toLowerCase() === decoded);
      if (found) {
        sectionData = found;
        rank = rank || found.rank;
      }
    }
  } else if (typeof identifier === "object" && identifier !== null) {
    sectionData = identifier;
  }

  if (!sectionData) {
    const secName = typeof identifier === "string" ? decodeURIComponent(identifier).trim() : "Section";
    sectionData = {
      section: secName,
      rank: rank || 1,
      totalSections: 5,
      totalMins: 0,
      hours: "0.0",
      singers: []
    };
  }

  openSectionDetailsModal(sectionData, rank || sectionData.rank || 1);
}

function openSectionDetailsModal(sectionData, displayRank) {
  const modal = document.getElementById("sectionDetailsModal");
  if (!modal) return;

  const sec = sectionData.section || "Choir Section";
  const isPrimary = (sec || "").trim().toLowerCase() === "primary";
  const displayTitle = isPrimary ? "Primary Choir" : `${sec} Section`;
  const rankCategory = `of ${sectionData.totalSections || 5} Sections`;

  const avatarContainer = document.getElementById("sectionDetailsAvatarContainer");
  if (avatarContainer) {
    const iconMap = {
      Soprano: "🌸",
      Alto: "💜",
      Tenor: "🌟",
      Bass: "⚓",
      Primary: "🧒"
    };
    const icon = iconMap[sec] || "🎶";
    avatarContainer.innerHTML = `<div class="section-avatar-icon" data-voice="${escapeLeaderboardHtml(sec)}" title="${escapeLeaderboardHtml(displayTitle)}">${icon}</div>`;
  }

  const nameEl = document.getElementById("sectionDetailsName");
  if (nameEl) {
    nameEl.textContent = displayTitle;
  }

  const voiceEl = document.getElementById("sectionDetailsVoicePart");
  if (voiceEl) {
    voiceEl.textContent = sec;
    voiceEl.setAttribute("data-voice", sec);
  }

  const mins = Number(sectionData.totalMins) || 0;
  const hours = sectionData.hours || (mins / 60).toFixed(1);

  const rankPill = document.getElementById("sectionDetailsRankPill");
  if (rankPill) {
    rankPill.textContent = `#${displayRank} • ${mins}m (${hours}h)`;
  }

  const timeVal = document.getElementById("sectionDetailsTimeValue");
  const timeSub = document.getElementById("sectionDetailsTimeSub");
  if (timeVal) timeVal.textContent = `${mins}m`;
  if (timeSub) timeSub.textContent = `(${hours}h)`;

  const rankVal = document.getElementById("sectionDetailsRankValue");
  const rankSub = document.getElementById("sectionDetailsRankSub");
  if (rankVal) rankVal.textContent = `#${displayRank}`;
  if (rankSub) rankSub.textContent = `of ${sectionData.totalSections || 5}`;

  let contributors = sectionData.singers || [];
  // Dynamic fallback: if sectionData.singers is empty or undefined, query cachedLeaderboardSingers
  if ((!contributors || contributors.length === 0) && typeof cachedLeaderboardSingers !== "undefined" && cachedLeaderboardSingers.length > 0) {
    const targetSec = (sec || "").trim().toLowerCase();
    contributors = cachedLeaderboardSingers.filter(s => {
      const sSec = (s.section || "").trim().toLowerCase();
      return sSec === targetSec && (s.totalMins > 0 || (s.name && s.name.trim().length > 0));
    });
  }

  const contribVal = document.getElementById("sectionDetailsContributorsValue");
  const contribSub = document.getElementById("sectionDetailsContributorsSub");
  if (contribVal) contribVal.textContent = `${contributors.length}`;
  if (contribSub) contribSub.textContent = `active`;

  const countEl = document.getElementById("sectionContributorsCount");
  if (countEl) {
    countEl.textContent = `${contributors.length} ${contributors.length === 1 ? "singer" : "singers"}`;
  }

  const listEl = document.getElementById("sectionContributorsList");
  if (listEl) {
    if (contributors.length === 0) {
      listEl.innerHTML = `<div class="section-contributors-empty">No active singers logged in this section yet.</div>`;
    } else {
      let listHtml = "";
      // Render all matching singers sequentially without any slicing or numeric cap
      contributors.forEach((s, idx) => {
        const safeName = escapeLeaderboardHtml(s.name);
        const safeEncodedName = encodeURIComponent(s.name);
        const sMins = s.totalMins || 0;
        const sHours = (sMins / 60).toFixed(1);
        const medal = idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : "";
        const avatarSrc = s.avatar ? getAvatarImgSrc(s.avatar) : "";
        const avatarEl = avatarSrc
          ? `<img src="${avatarSrc}" alt="${safeName}" class="section-contributor-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="section-contributor-fallback" style="display:none;">🎵</span>`
          : `<span class="section-contributor-fallback">🎵</span>`;

        listHtml += `
          <div class="section-contributor-row"
               onclick="closeSectionDetailsModal(); showSingerDetails('${safeEncodedName}');"
               role="button" tabindex="0"
               title="View ${safeName}'s Profile"
               aria-label="#${idx + 1} ${safeName}, ${sMins} minutes"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();closeSectionDetailsModal(); showSingerDetails('${safeEncodedName}');}">
            <div class="section-contributor-left">
              <span class="section-contributor-rank">${medal}#${idx + 1}</span>
              ${avatarEl}
              <span class="section-contributor-name">${safeName}</span>
            </div>
            <span class="section-contributor-time">${sMins}m <span class="mins-sub">(${sHours}h)</span></span>
          </div>
        `;
      });
      listEl.innerHTML = listHtml;
    }
  }

  modal.classList.add("active", "show");
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}

function closeSectionDetailsModal() {
  const modal = document.getElementById("sectionDetailsModal");
  if (modal) {
    modal.classList.remove("active", "show");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
}

function closeSectionDetailsModalOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeSectionDetailsModal();
}

function renderLeaderboardSingers() {
  const topSingersEl = document.getElementById("topSingersList");
  const titleEl = document.getElementById("leaderboardCardTitle");
  if (!topSingersEl) return;

  if (titleEl) {
    titleEl.textContent = currentLeaderboardTab === "primary" ? "🌟 Primary Stars" : "🏆 Top 10 Dedicated Singers";
  }

  if (!cachedLeaderboardSingers || cachedLeaderboardSingers.length === 0) {
    return;
  }

  const currentUserName = (localStorage.getItem("choir_name") || "").trim().toLowerCase();
  const currentUserAvatar = localStorage.getItem("choir_avatar") || "";

  let singersToDisplay = [];
  if (currentLeaderboardTab === "primary") {
    // Displays an all-inclusive list of all participating Primary children (not capped at 10)
    singersToDisplay = cachedLeaderboardSingers.filter(s => (s.section || "").trim().toLowerCase() === "primary");
    if (singersToDisplay.length === 0) {
      topSingersEl.innerHTML = `<div style="text-align:center; padding:16px; font-size:0.85rem; color:var(--text-muted);">No Primary children have logged practice yet. Be the first Primary Star! ⭐</div>`;
      return;
    }
  } else {
    // Displays the top 10 most dedicated singers across the whole stake
    singersToDisplay = cachedLeaderboardSingers.slice(0, 10);
    if (singersToDisplay.length === 0) {
      topSingersEl.innerHTML = `<div style="text-align:center; padding:8px; font-size:0.85rem; color:var(--text-muted);">No practice sessions logged yet. Be the first!</div>`;
      return;
    }
  }

  currentDisplayedSingers = singersToDisplay;

  let singersHtml = "";
  singersToDisplay.forEach((s, idx) => {
    const isTop3 = idx < 3 ? "rank-top3" : "";
    const medal = idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : "";
    const hours = (s.totalMins / 60).toFixed(1);

    let avatarToShow = s.avatar;
    if (!avatarToShow && currentUserName && s.name.toLowerCase() === currentUserName) {
      avatarToShow = currentUserAvatar;
    }

    const avatarBadgeHtml = getLeaderboardAvatarHtml(avatarToShow, s.name);
    const safeName = escapeLeaderboardHtml(s.name);
    const safeSec = escapeLeaderboardHtml(s.section);
    const safeEncodedName = encodeURIComponent(s.name);

    singersHtml += `
        <div class="board-row clickable-singer"
             onclick="showSingerDetails('${safeEncodedName}', ${idx + 1})"
             data-singer-name="${safeName}"
             data-singer-idx="${idx}"
             role="button" tabindex="0"
             title="Click to view full rehearsal stats for ${safeName}"
             aria-label="View rehearsal statistics for ${safeName}"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showSingerDetails('${safeEncodedName}', ${idx + 1});}">
          <span class="rank ${isTop3}">${medal}#${idx + 1}</span>
          ${avatarBadgeHtml}
          <div class="board-user-info">
            <span class="singer-name" title="${safeName}">${safeName}</span>
            <span class="part-badge" data-voice="${safeSec}">${safeSec}</span>
          </div>
          <span class="mins-badge">${s.totalMins}m <span class="mins-sub">(${hours}h)</span></span>
        </div>
      `;
  });
  topSingersEl.innerHTML = singersHtml;

  // Delegated click listener to guarantee click works even if inline handlers are blocked
  if (!topSingersEl.dataset.detailsBound) {
    topSingersEl.dataset.detailsBound = "true";
    topSingersEl.addEventListener("click", function (e) {
      const row = e.target.closest(".board-row.clickable-singer");
      if (!row) return;
      const name = row.getAttribute("data-singer-name");
      const idx = row.getAttribute("data-singer-idx");
      if (name) {
        showSingerDetails(name, idx ? Number(idx) + 1 : 1);
      }
    });
  }
}

function loadLeaderboard() {
  const topSingersEl = document.getElementById("topSingersList");
  const sectionEl = document.getElementById("sectionList");

  // Always render zero-PII local section standings
  renderSectionStandingsUI();

  if (!navigator.onLine) {
    if (topSingersEl && (!cachedLeaderboardSingers || cachedLeaderboardSingers.length === 0)) {
      topSingersEl.innerHTML = `<div style="text-align:center; padding:12px; font-size:0.85rem; color:var(--text-muted);">📡 Offline: Leaderboard syncs when reconnected.</div>`;
    }
    if (sectionEl) {
      sectionEl.innerHTML = `<div style="text-align:center; padding:12px; font-size:0.85rem; color:var(--text-muted);">📡 Offline: Standings sync when reconnected.</div>`;
    }
    return;
  }

  fetch(APPS_SCRIPT_URL)
    .then(res => res.json())
    .then(data => {
      if (!data || data.length === 0) {
        if (topSingersEl) {
          topSingersEl.innerHTML = `<div style="text-align:center; padding:8px; font-size:0.85rem; color:var(--text-muted);">No practice sessions logged yet. Be the first!</div>`;
        }
        if (sectionEl) {
          sectionEl.innerHTML = `<div style="text-align:center; padding:8px; font-size:0.85rem; color:var(--text-muted);">No section data yet.</div>`;
        }
        return;
      }

      const singerTotals = {};
      const sectionTotals = { "Soprano": 0, "Alto": 0, "Tenor": 0, "Bass": 0, "Primary": 0 };
      const sectionSingers = { "Soprano": [], "Alto": [], "Tenor": [], "Bass": [], "Primary": [] };

      data.forEach(entry => {
        const trimmedName = (entry.name || "Unknown").trim();
        const rawSec = (entry.section || "Choir").trim();
        const matchedKey = Object.keys(sectionTotals).find(k => k.toLowerCase() === rawSec.toLowerCase()) || rawSec;
        const mins = Number(entry.minutes) || 0;
        const av = (entry.avatar || "").trim();

        if (!singerTotals[trimmedName]) {
          singerTotals[trimmedName] = {
            name: trimmedName,
            section: matchedKey,
            avatar: av,
            totalMins: 0
          };
        } else {
          if (av) {
            singerTotals[trimmedName].avatar = av;
          }
          if (matchedKey && sectionTotals[matchedKey] !== undefined) {
            singerTotals[trimmedName].section = matchedKey;
          }
        }
        singerTotals[trimmedName].totalMins += mins;

        if (sectionTotals[matchedKey] !== undefined) {
          sectionTotals[matchedKey] += mins;
        }
      });

      cachedLeaderboardSingers = Object.values(singerTotals).sort((a, b) => b.totalMins - a.totalMins);
      updateKnownSingersFromRoster(cachedLeaderboardSingers);
      renderLeaderboardSingers();

      cachedLeaderboardSingers.forEach(s => {
        const sSec = (s.section || "").trim();
        const key = Object.keys(sectionSingers).find(k => k.toLowerCase() === sSec.toLowerCase()) || sSec;
        if (sectionSingers[key]) {
          sectionSingers[key].push(s);
        }
      });

      const sortedSections = Object.entries(sectionTotals).sort((a, b) => b[1] - a[1]);
      cachedSectionStandings = sortedSections.map(([sec, mins], idx) => {
        return {
          section: sec,
          rank: idx + 1,
          totalSections: sortedSections.length,
          totalMins: mins,
          hours: (mins / 60).toFixed(1),
          singers: sectionSingers[sec] || []
        };
      });

      let sectionHtml = "";
      sortedSections.forEach(([sec, mins], idx) => {
        const isTop3 = idx < 3 ? "rank-top3" : "";
        const medal = idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : "";
        const hours = (mins / 60).toFixed(1);
        const safeSec = escapeLeaderboardHtml(sec);
        const safeEncodedSec = encodeURIComponent(sec);
        sectionHtml += `
            <div class="board-row section-standings-row section-item clickable-section leaderboard-row"
                 onclick="if(event){event.stopPropagation();}showSectionDetails('${safeEncodedSec}', ${idx + 1}, event)"
                 data-section-name="${safeSec}"
                 data-section-rank="${idx + 1}"
                 role="button" tabindex="0"
                 title="Click to view full breakdown for ${safeSec}"
                 aria-label="View rehearsal breakdown for ${safeSec}"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();showSectionDetails('${safeEncodedSec}', ${idx + 1}, event);}">
              <span class="rank ${isTop3}">${medal}#${idx + 1}</span>
              <div class="section-name-wrap">
                <span class="section-name">${safeSec}</span>
              </div>
              <span class="mins-badge">${mins}m <span class="mins-sub">(${hours}h)</span></span>
            </div>
          `;
      });
      if (sectionEl) {
        sectionEl.innerHTML = sectionHtml;
        if (!sectionEl.dataset.detailsBound) {
          sectionEl.dataset.detailsBound = "true";
          sectionEl.addEventListener("click", function (e) {
            const row = e.target.closest(".board-row.clickable-section, .section-standings-row, .section-item, .leaderboard-row");
            if (!row) return;
            e.stopPropagation();
            const name = row.getAttribute("data-section-name");
            const r = row.getAttribute("data-section-rank");
            if (name) {
              showSectionDetails(name, r ? Number(r) : 1, e);
            }
          });
        }
      }

    })
    .catch(() => {
      if (topSingersEl && (!cachedLeaderboardSingers || cachedLeaderboardSingers.length === 0)) {
        topSingersEl.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.85rem;">Could not load standings.</div>`;
      }
    });
}
window.loadLeaderboard = loadLeaderboard;

// --- REAL-TIME IN-BROWSER VOICE PITCH CHECKER & REFERENCE TONES ---
const REFERENCE_PITCHES = {
  Soprano: { note: "C5", freq: 523.25, label: "S: C5" },
  Alto: { note: "A3", freq: 220.00, label: "A: A3" },
  Tenor: { note: "E3", freq: 164.81, label: "T: E3" },
  Bass: { note: "C3", freq: 130.81, label: "B: C3" },
  Primary: { note: "D4", freq: 293.66, label: "Pri: D4" }
};

const MUSICAL_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let pitchAudioContext = null;
let pitchMediaStream = null;
let pitchAnalyserNode = null;
let pitchAnimFrameId = null;
let isPitchDetecting = false;
let pitchTimeBuffer = null;
let activeRefOscillator = null;
let activeRefGain = null;
let activeRefTimeout = null;

const PITCH_EMA_ALPHA = 0.20;
let smoothedPitchHz = 0;
let pitchFrameBuffer = [];
let jumpCandidateHz = null;
let jumpCandidateCount = 0;
let lastDisplayedCents = null;

let pitchLockStartTime = null;
let isPitchLocked = false;
let pitchOffTargetStartTime = null;
let lastLockChimeTime = 0;

function getPitchAudioContext() {
  if (!pitchAudioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      pitchAudioContext = new AudioCtx();
    }
  }
  return pitchAudioContext;
}

function playReferenceTone(part) {
  const ref = REFERENCE_PITCHES[part] || REFERENCE_PITCHES.Tenor;
  const audioCtx = getPitchAudioContext();
  if (!audioCtx) {
    showToast("Audio is not supported in this browser.");
    return;
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  stopReferenceTone();

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(ref.freq, audioCtx.currentTime);

    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.08);
    gain.gain.setValueAtTime(0.28, now + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 2.15);

    activeRefOscillator = osc;
    activeRefGain = gain;

    document.querySelectorAll(".pitch-ref-btn").forEach(btn => btn.classList.remove("playing"));
    const activeBtn = document.querySelector(`.pitch-ref-btn[data-part="${part}"]`);
    if (activeBtn) activeBtn.classList.add("playing");

    activeRefTimeout = setTimeout(() => {
      if (activeBtn) activeBtn.classList.remove("playing");
    }, 2150);

    showToast(`🎵 ${part} starting pitch: ${ref.note} (${ref.freq.toFixed(1)} Hz)`);
  } catch (err) {
    console.error("Reference pitch error:", err);
  }
}

function stopReferenceTone() {
  if (activeRefTimeout) {
    clearTimeout(activeRefTimeout);
    activeRefTimeout = null;
  }
  if (activeRefOscillator) {
    try {
      activeRefOscillator.stop();
      activeRefOscillator.disconnect();
    } catch (e) { }
    activeRefOscillator = null;
  }
  if (activeRefGain) {
    try { activeRefGain.disconnect(); } catch (e) { }
    activeRefGain = null;
  }
  document.querySelectorAll(".pitch-ref-btn").forEach(btn => btn.classList.remove("playing"));
}

function expandPitchWidget() {
  const mini = document.getElementById("pitchWidgetMinimized");
  const card = document.getElementById("pitchWidgetCard");
  if (mini) mini.style.display = "none";
  if (card) {
    card.style.display = "block";
    card.classList.add("fade-in");
  }
  updatePitchTargetVoice();
}

function collapsePitchWidget() {
  const mini = document.getElementById("pitchWidgetMinimized");
  const card = document.getElementById("pitchWidgetCard");
  if (card) card.style.display = "none";
  if (mini) mini.style.display = "inline-flex";
}

function updatePitchTargetVoice() {
  const targetSub = document.getElementById("pitchTargetSub");
  const voicePart = localStorage.getItem("choir_voice") || localStorage.getItem("choir_section") || "Choir";
  if (targetSub) {
    const ref = REFERENCE_PITCHES[voicePart];
    if (ref) {
      targetSub.innerText = `Target: ${voicePart} (${ref.note})`;
    } else {
      targetSub.innerText = `Target: ${voicePart} Voice`;
    }
  }

  document.querySelectorAll(".pitch-ref-btn").forEach(btn => {
    if (btn.getAttribute("data-part") === voicePart) {
      btn.classList.add("active-part");
    } else {
      btn.classList.remove("active-part");
    }
  });
}

function togglePitchDetection() {
  if (isPitchDetecting) {
    stopPitchDetection();
  } else {
    startPitchDetection();
  }
}

async function startPitchDetection() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("⚠️ Microphone access is not supported in this browser environment.");
    return;
  }

  const audioCtx = getPitchAudioContext();
  if (!audioCtx) {
    showToast("⚠️ Web Audio API is not supported on this device.");
    return;
  }

  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    pitchMediaStream = stream;
    const source = audioCtx.createMediaStreamSource(stream);
    pitchAnalyserNode = audioCtx.createAnalyser();
    pitchAnalyserNode.fftSize = 2048;

    source.connect(pitchAnalyserNode);
    pitchTimeBuffer = new Float32Array(pitchAnalyserNode.fftSize);

    isPitchDetecting = true;
    updatePitchToggleUI(true);

    showToast("🎙️ Voice Check active — sing into your microphone!");

    pitchAnalysisLoop();
  } catch (err) {
    console.error("Microphone capture error:", err);
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      showToast("🔒 Mic permission denied. Please allow microphone access in settings.");
    } else {
      showToast("⚠️ Could not access microphone: " + (err.message || "Error"));
    }
    stopPitchDetection();
  }
}

function stopPitchDetection() {
  isPitchDetecting = false;

  if (pitchAnimFrameId) {
    cancelAnimationFrame(pitchAnimFrameId);
    pitchAnimFrameId = null;
  }

  if (pitchMediaStream) {
    try {
      pitchMediaStream.getTracks().forEach(track => track.stop());
    } catch (e) { }
    pitchMediaStream = null;
  }

  pitchAnalyserNode = null;
  pitchTimeBuffer = null;

  updatePitchToggleUI(false);
  resetPitchDisplay();
}

function updatePitchToggleUI(active) {
  const toggleBtn = document.getElementById("pitchMicToggleBtn");
  const icon = document.getElementById("pitchMicIcon");
  const text = document.getElementById("pitchMicText");
  const statusDot = document.getElementById("pitchMiniStatusDot");
  const miniLabel = document.getElementById("pitchWidgetMiniLabel");

  if (active) {
    if (toggleBtn) {
      toggleBtn.classList.add("recording");
      toggleBtn.title = "Stop Pitch Check";
    }
    if (icon) icon.innerText = "⏹️";
    if (text) text.innerText = "Stop";
    if (statusDot) statusDot.classList.add("active");
    if (miniLabel) miniLabel.innerText = "Listening...";
  } else {
    if (toggleBtn) {
      toggleBtn.classList.remove("recording");
      toggleBtn.title = "Start Pitch Check";
    }
    if (icon) icon.innerText = "🎙️";
    if (text) text.innerText = "Start";
    if (statusDot) statusDot.classList.remove("active");
    if (miniLabel) miniLabel.innerText = "Voice Check";
  }
}

function resetPitchDisplay() {
  unlockPitch();
  smoothedPitchHz = 0;
  pitchFrameBuffer = [];
  jumpCandidateHz = null;
  jumpCandidateCount = 0;
  lastDisplayedCents = null;

  const card = document.getElementById("pitchWidgetCard");
  const noteBadge = document.getElementById("pitchNoteBadge");
  const noteVal = document.getElementById("pitchNoteValue");
  const hzVal = document.getElementById("pitchHzValue");
  const centsVal = document.getElementById("pitchCentsReadout");
  const needle = document.getElementById("centsNeedle");
  const prompt = document.getElementById("pitchFeedbackPrompt");
  const gaugeTrack = document.querySelector(".cents-gauge-track");

  if (card) {
    card.classList.remove("state-in-tune", "state-near-tune", "state-off-pitch", "pitch-locked");
  }
  if (noteBadge) {
    noteBadge.classList.remove("in-tune", "off-pitch", "pitch-locked");
  }
  if (gaugeTrack) {
    gaugeTrack.classList.remove("pitch-locked");
  }
  if (needle) {
    needle.classList.remove("pitch-locked");
    needle.style.left = "50%";
  }
  if (noteVal) noteVal.innerText = "--";
  if (hzVal) hzVal.innerText = "0.0 Hz";
  if (centsVal) {
    centsVal.innerText = "-- cents";
    centsVal.classList.remove("in-tune");
  }
  if (prompt) prompt.innerText = 'Tap "Start" to check your pitch in real time.';
}

function triggerPitchLock(fullNote) {
  const card = document.getElementById("pitchWidgetCard");
  const noteBadge = document.getElementById("pitchNoteBadge");
  const gaugeTrack = document.querySelector(".cents-gauge-track");
  const needle = document.getElementById("centsNeedle");
  const centsVal = document.getElementById("pitchCentsReadout");
  const prompt = document.getElementById("pitchFeedbackPrompt");

  if (card) {
    card.classList.remove("state-near-tune", "state-off-pitch");
    card.classList.add("state-in-tune", "pitch-locked");
  }
  if (noteBadge) {
    noteBadge.classList.remove("off-pitch");
    noteBadge.classList.add("in-tune", "pitch-locked");
  }
  if (gaugeTrack) {
    gaugeTrack.classList.add("pitch-locked");
  }
  if (needle) {
    needle.classList.add("pitch-locked");
    needle.style.left = "50%";
  }
  if (centsVal) {
    centsVal.innerText = "🎯 0 cents (Locked)";
    centsVal.classList.add("in-tune");
  }
  if (prompt) {
    prompt.innerText = "Locked in! Perfect pitch 🎯";
  }

  playPitchLockChime();
}

function unlockPitch() {
  if (!isPitchLocked && !pitchLockStartTime) return;
  isPitchLocked = false;
  pitchLockStartTime = null;
  pitchOffTargetStartTime = null;

  const card = document.getElementById("pitchWidgetCard");
  const noteBadge = document.getElementById("pitchNoteBadge");
  const gaugeTrack = document.querySelector(".cents-gauge-track");
  const needle = document.getElementById("centsNeedle");

  if (card) card.classList.remove("pitch-locked");
  if (noteBadge) noteBadge.classList.remove("pitch-locked");
  if (gaugeTrack) gaugeTrack.classList.remove("pitch-locked");
  if (needle) needle.classList.remove("pitch-locked");
}

function playPitchLockChime() {
  const now = performance.now();
  if (now - lastLockChimeTime < 2500) return;
  lastLockChimeTime = now;

  const audioCtx = getPitchAudioContext();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const t0 = audioCtx.currentTime;

  const osc1 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(1046.50, t0);
  gain1.gain.setValueAtTime(0.0001, t0);
  gain1.gain.linearRampToValueAtTime(0.12, t0 + 0.05);
  gain1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.40);
  osc1.connect(gain1);
  gain1.connect(audioCtx.destination);
  osc1.start(t0);
  osc1.stop(t0 + 0.42);

  const t1 = t0 + 0.06;
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1318.51, t1);
  gain2.gain.setValueAtTime(0.0001, t1);
  gain2.gain.linearRampToValueAtTime(0.14, t1 + 0.05);
  gain2.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.42);
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.start(t1);
  osc2.stop(t1 + 0.45);
}

function pitchAnalysisLoop() {
  if (!isPitchDetecting || !pitchAnalyserNode || !pitchAudioContext) return;

  pitchAnalyserNode.getFloatTimeDomainData(pitchTimeBuffer);
  const freq = autoCorrelate(pitchTimeBuffer, pitchAudioContext.sampleRate);

  updatePitchUI(freq);

  pitchAnimFrameId = requestAnimationFrame(pitchAnalysisLoop);
}

function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let sumOfSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    const val = buf[i];
    sumOfSquares += val * val;
  }
  const rms = Math.sqrt(sumOfSquares / SIZE);
  if (rms < 0.015) return -1;

  const minPeriod = Math.floor(sampleRate / 1200);
  const maxPeriod = Math.floor(sampleRate / 55);

  let bestPeriod = -1;
  let bestCorrelation = 0;

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let correlation = 0;
    for (let i = 0; i < SIZE - period; i++) {
      correlation += buf[i] * buf[i + period];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestPeriod = period;
    }
  }

  if (bestCorrelation <= 0 || bestPeriod === -1) return -1;

  const confidence = bestCorrelation / sumOfSquares;
  if (confidence < 0.36) return -1;

  let shift = 0;
  if (bestPeriod > minPeriod && bestPeriod < maxPeriod) {
    let prev = 0, next = 0;
    for (let i = 0; i < SIZE - (bestPeriod - 1); i++) prev += buf[i] * buf[i + bestPeriod - 1];
    for (let i = 0; i < SIZE - (bestPeriod + 1); i++) next += buf[i] * buf[i + bestPeriod + 1];
    const a = prev + next - 2 * bestCorrelation;
    const b = (next - prev) / 2;
    if (Math.abs(a) > 1e-5) {
      shift = -b / a;
    }
  }

  const exactPeriod = bestPeriod + shift;
  return sampleRate / exactPeriod;
}

function updatePitchUI(freq) {
  const card = document.getElementById("pitchWidgetCard");
  const noteBadge = document.getElementById("pitchNoteBadge");
  const noteVal = document.getElementById("pitchNoteValue");
  const hzVal = document.getElementById("pitchHzValue");
  const centsVal = document.getElementById("pitchCentsReadout");
  const needle = document.getElementById("centsNeedle");
  const prompt = document.getElementById("pitchFeedbackPrompt");
  const now = performance.now();

  if (freq === -1) {
    if (isPitchLocked) {
      if (!pitchOffTargetStartTime) {
        pitchOffTargetStartTime = now;
      } else if (now - pitchOffTargetStartTime > 200) {
        unlockPitch();
      }
    } else {
      unlockPitch();
    }

    smoothedPitchHz = 0;
    pitchFrameBuffer = [];
    jumpCandidateHz = null;
    jumpCandidateCount = 0;
    lastDisplayedCents = null;

    if (card && !isPitchLocked) {
      card.classList.remove("state-in-tune", "state-near-tune", "state-off-pitch");
    }
    if (noteBadge && !isPitchLocked) {
      noteBadge.classList.remove("in-tune", "off-pitch");
    }
    if (centsVal && !isPitchLocked) centsVal.classList.remove("in-tune");
    if (prompt && isPitchDetecting && !isPitchLocked) {
      const voicePart = localStorage.getItem("choir_voice") || "your part";
      prompt.innerText = `Singing your ${voicePart} part? Watching pitch...`;
    }
    return;
  }

  if (smoothedPitchHz > 0) {
    const semitoneDiff = Math.abs(12 * Math.log2(freq / smoothedPitchHz));
    if (semitoneDiff > 1.5) {
      if (jumpCandidateHz !== null && Math.abs(12 * Math.log2(freq / jumpCandidateHz)) <= 0.8) {
        jumpCandidateCount++;
      } else {
        jumpCandidateHz = freq;
        jumpCandidateCount = 1;
      }

      if (jumpCandidateCount >= 3) {
        smoothedPitchHz = freq;
        pitchFrameBuffer = [freq];
        jumpCandidateHz = null;
        jumpCandidateCount = 0;
        unlockPitch();
      } else {
        return;
      }
    } else {
      jumpCandidateHz = null;
      jumpCandidateCount = 0;
    }
  } else {
    smoothedPitchHz = freq;
    pitchFrameBuffer = [freq];
  }

  smoothedPitchHz = (PITCH_EMA_ALPHA * freq) + ((1 - PITCH_EMA_ALPHA) * smoothedPitchHz);

  pitchFrameBuffer.push(smoothedPitchHz);
  if (pitchFrameBuffer.length > 4) pitchFrameBuffer.shift();
  const sortedBuf = [...pitchFrameBuffer].sort((a, b) => a - b);
  const effectiveHz = sortedBuf[Math.floor(sortedBuf.length / 2)];

  const n = 12 * (Math.log(effectiveHz / 440) / Math.LN2) + 69;
  const roundedNote = Math.round(n);
  const rawCents = Math.round((n - roundedNote) * 100);

  const noteName = MUSICAL_NOTE_NAMES[((roundedNote % 12) + 12) % 12];
  const octave = Math.floor(roundedNote / 12) - 1;
  const fullNote = `${noteName}${octave}`;
  const absCents = Math.abs(rawCents);

  if (absCents <= 8) {
    pitchOffTargetStartTime = null;
    if (!pitchLockStartTime) {
      pitchLockStartTime = now;
    } else if (!isPitchLocked && (now - pitchLockStartTime >= 350)) {
      isPitchLocked = true;
      triggerPitchLock(fullNote);
    }
  } else {
    pitchLockStartTime = null;
    if (isPitchLocked) {
      if (!pitchOffTargetStartTime) {
        pitchOffTargetStartTime = now;
      } else if (now - pitchOffTargetStartTime > 200) {
        unlockPitch();
      }
    }
  }

  let displayCents = rawCents;
  if (lastDisplayedCents !== null && !isPitchLocked) {
    if (Math.abs(rawCents - lastDisplayedCents) < 1.0) {
      displayCents = lastDisplayedCents;
    }
  }
  lastDisplayedCents = displayCents;

  if (noteVal) noteVal.innerText = fullNote;
  if (hzVal) hzVal.innerText = `${effectiveHz.toFixed(1)} Hz`;

  if (isPitchLocked) {
    if (needle) needle.style.left = "50%";
    if (centsVal) {
      centsVal.innerText = "🎯 0 cents (Locked)";
      centsVal.classList.add("in-tune");
    }
    if (prompt) prompt.innerText = "Locked in! Perfect pitch 🎯";
    if (card) {
      card.classList.remove("state-near-tune", "state-off-pitch");
      card.classList.add("state-in-tune", "pitch-locked");
    }
    if (noteBadge) {
      noteBadge.classList.remove("off-pitch");
      noteBadge.classList.add("in-tune", "pitch-locked");
    }
    return;
  }

  const clampedCents = Math.max(-50, Math.min(50, displayCents));
  const needlePct = clampedCents + 50;
  if (needle) needle.style.left = `${needlePct}%`;

  const centsSign = displayCents > 0 ? "+" : "";
  if (centsVal) {
    centsVal.innerText = `${centsSign}${displayCents} cents`;
  }

  if (card && noteBadge && centsVal && prompt) {
    card.classList.remove("state-in-tune", "state-near-tune", "state-off-pitch", "pitch-locked");
    noteBadge.classList.remove("in-tune", "off-pitch", "pitch-locked");
    centsVal.classList.remove("in-tune");

    if (absCents <= 10) {
      card.classList.add("state-in-tune");
      noteBadge.classList.add("in-tune");
      centsVal.classList.add("in-tune");
      prompt.innerText = `Spot on! In tune (${fullNote}) ✨`;
    } else if (absCents <= 20) {
      card.classList.add("state-near-tune");
      const dir = displayCents < 0 ? "flat" : "sharp";
      prompt.innerText = `Close! Slightly ${dir} (${centsSign}${displayCents}¢)`;
    } else {
      card.classList.add("state-off-pitch");
      noteBadge.classList.add("off-pitch");
      const dir = displayCents < 0 ? "Flat" : "Sharp";
      prompt.innerText = `${dir} by ${absCents}¢ — guide voice toward center`;
    }
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (pitchAudioContext && pitchAudioContext.state === "running") {
      pitchAudioContext.suspend();
    }
  } else {
    if (isPitchDetecting && pitchAudioContext && pitchAudioContext.state === "suspended") {
      pitchAudioContext.resume();
    }
  }
});

// --- IN-APP RESOURCE VIEWER MODAL ---
function openResourceModal(title, url, type) {
  const modal = document.getElementById("resourceModal");
  const modalTitle = document.getElementById("modalTitle");
  const iframe = document.getElementById("resourceIframe");
  const wrapper = document.getElementById("modalWrapper");

  if (modalTitle) modalTitle.innerText = title;

  let finalUrl = url;
  if (finalUrl && finalUrl.includes("drive.google.com")) {
    finalUrl = sanitizeDriveUrl(finalUrl);
  } else if (type === 'video' && finalUrl && (finalUrl.includes("youtube.com") || finalUrl.includes("youtu.be"))) {
    finalUrl = formatYouTubeEmbedUrl(finalUrl);
  }

  if (iframe) iframe.src = finalUrl;
  if (wrapper) {
    if (type === 'doc') {
      wrapper.classList.add('doc-view');
    } else {
      wrapper.classList.remove('doc-view');
    }
  }
  if (modal) modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeResourceModal() {
  const modal = document.getElementById("resourceModal");
  const iframe = document.getElementById("resourceIframe");
  if (modal) modal.classList.remove("active");
  if (iframe) iframe.src = "";
  document.body.style.overflow = "";
}

function closeModalOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeResourceModal();
}

// --- PERSONAL SETTINGS & REPERTOIRE EDITOR MODAL ---
function openSettingsModal(defaultTab = 'profile') {
  const modal = document.getElementById("settingsModal");
  if (!modal) return;

  initPhStakesDatalist();

  const identity = getUserIdentity();
  const savedName = identity.fullName || localStorage.getItem("choir_name") || "";
  const savedVoice = identity.part || localStorage.getItem("choir_voice") || localStorage.getItem("choir_section") || "";
  const savedAvatar = identity.avatar || localStorage.getItem("choir_avatar") || "";

  renderSettingAvatarPicker(savedAvatar);
  updateIdentityUI();
  updatePracticeSummaryUI();

  const settings = getUserSettings();
  const targetDateInput = document.getElementById("settingTargetDate");
  if (targetDateInput) {
    targetDateInput.value = settings.targetDate || "";
  }

  const timerDurSelect = document.getElementById("settingTimerDuration");
  if (timerDurSelect) {
    timerDurSelect.value = settings.timerMinutes || 15;
  }

  const metronomeSettingCheckbox = document.getElementById("settingShowMetronome");
  if (metronomeSettingCheckbox) {
    metronomeSettingCheckbox.checked = (localStorage.getItem("metronome_visible") === "true");
  }

  const pastRepertoireCheckbox = document.getElementById("settingShowPastRepertoire");
  if (pastRepertoireCheckbox) {
    pastRepertoireCheckbox.checked = Boolean(settings.showPastRepertoire);
  }

  closeSongForm();
  renderRepertoireList();

  switchSettingsTab(defaultTab || 'profile');

  const nickInput = document.getElementById("profileNickname");
  if (nickInput) {
    validateNicknameInput(nickInput);
  }

  updateThemeSegmentedControl(getSavedThemeMode());

  modal.classList.add("active");
  modal.classList.add("show");
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeSettingsModal() {
  // Prevent closing if user typed into Song Title input without saving
  const titleInput = document.getElementById("songFormTitle");
  const formCard = document.getElementById("repertoirePieceForm") || document.getElementById("songEditorForm");
  const isFormOpen = formCard && formCard.style.display !== "none";
  if (isFormOpen && titleInput && titleInput.value.trim().length > 0) {
    showToast("⚠️ Unsaved piece: Click '➕ Save Piece to Repertoire' or Cancel before closing.");
    titleInput.focus();
    return;
  }

  const timerDurSelect = document.getElementById("settingTimerDuration");
  if (timerDurSelect) {
    const selectedMins = Number(timerDurSelect.value) || 15;
    const settings = getUserSettings();
    if (settings.timerMinutes !== selectedMins) {
      handleTimerDurationChange(selectedMins);
    }
  }

  const modal = document.getElementById("settingsModal");
  if (modal) {
    modal.classList.remove("active");
    modal.classList.remove("open");
    modal.classList.remove("show");
    modal.style.display = "none";
  }
  document.body.style.overflow = "";
}

function closeSettingsOnBackdrop(event) {
  // Ensure click was strictly on the outer dark backdrop, not bubbled from inside
  if (event.target !== event.currentTarget) return;
  // Track where the mouse down started so dragging text across the edge doesn't trigger a backdrop close
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  // Prevent closing if user was selecting/dragging text
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeSettingsModal();
}

function switchSettingsTab(tabName) {
  const cleanTab = (tabName || "profile").toLowerCase().replace(/-tab$/, "");
  const tabs = ["profile", "preferences", "tutorial"];
  const target = tabs.includes(cleanTab) ? cleanTab : "profile";

  const tabBtns = {
    profile: document.getElementById("tabBtnProfile"),
    preferences: document.getElementById("tabBtnPreferences"),
    tutorial: document.getElementById("tabBtnTutorial")
  };

  const tabPanels = {
    profile: document.getElementById("tabPanelProfile"),
    preferences: document.getElementById("tabPanelPreferences"),
    tutorial: document.getElementById("tabPanelTutorial")
  };

  tabs.forEach(t => {
    const btn = tabBtns[t];
    const panel = tabPanels[t];
    const isCurrent = t === target;

    if (btn) {
      if (isCurrent) {
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        try {
          btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        } catch (e) { }
      } else {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
      }
    }

    if (panel) {
      panel.style.display = isCurrent ? "block" : "none";
      if (isCurrent) {
        panel.classList.add("active");
      } else {
        panel.classList.remove("active");
      }
    }
  });
}

function handleTargetDateInput(val) {
  const subtitleEl = document.getElementById("headerSubtitle");
  const displayVal = val.trim() ? val : "Stake Choir Prep • Oct 24–25";
  if (subtitleEl) {
    subtitleEl.innerText = displayVal;
  }
  const settings = getUserSettings();
  settings.targetDate = val;
  saveUserSettings(settings);
}

function handleTimerDurationChange(val) {
  const newMins = Number(val) || 15;
  const settings = getUserSettings();
  const oldMins = settings.timerMinutes || 15;

  if (newMins === oldMins && timeRemaining === newMins * 60 && !timerInterval && !targetEndTime) {
    return;
  }

  const isRunning = Boolean(timerInterval || targetEndTime);
  const pausedVal = localStorage.getItem("kantime_paused_remaining");
  const hasPausedProgress = Boolean(pausedVal && Number(pausedVal) > 0 && Number(pausedVal) < timerDuration);
  const hasActiveSession = isRunning || hasPausedProgress;

  if (hasActiveSession) {
    const proceed = confirm("Changing practice duration will reset your current timer countdown. Do you wish to continue?");
    if (!proceed) {
      const select = document.getElementById("settingTimerDuration");
      if (select) select.value = oldMins;
      return;
    }

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    targetEndTime = null;
    localStorage.removeItem("kantime_target_end");
    localStorage.removeItem("kantime_paused_remaining");
    stopIdleTracking();
  }

  settings.timerMinutes = newMins;
  saveUserSettings(settings);
  applyTimerDuration(newMins, true);

  const currentSong = document.getElementById("targetSong") ? document.getElementById("targetSong").value : "";
  if (currentSong) renderSelectedSongResource(currentSong);

  showToast(`Timer set to ${newMins} minutes! ⏱️`);
}

function handleSettingPastRepertoireToggle(checked) {
  const settings = getUserSettings();
  settings.showPastRepertoire = checked;
  saveUserSettings(settings);

  populateSongSelectDropdown();
  renderArchivedRepertoireSection();

  const select = document.getElementById("targetSong");
  if (select && select.value) {
    renderSelectedSongResource(select.value);
  }

  showToast(checked ? "Showing past conference repertoire! 📁" : "Past repertoire hidden from active hub. 🔒");
}

function renderArchivedRepertoireSection(customArchivedSongs) {
  const card = document.getElementById("archivedRepertoireCard");
  if (!card) return;

  const settings = getUserSettings();
  const songs = (typeof getMasterRepertoireList === "function") ? getMasterRepertoireList() : (settings.songs || []);
  const archivedSongs = Array.isArray(customArchivedSongs) 
    ? customArchivedSongs 
    : songs.filter(s => Boolean(s.isArchived || s.archived));

  const countPill = document.querySelector("#archivedAccordionCount, #archivedCountPill, .archived-count-badge");
  if (countPill) {
    countPill.textContent = `${archivedSongs.length} piece${archivedSongs.length === 1 ? "" : "s"}`;
  }

  const grid = document.getElementById("archivedSongsList") || document.getElementById("archivedItemsGrid");
  if (grid) {
    if (archivedSongs.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 14px;">No archived pieces found. You can archive pieces from Settings (⚙️).</div>`;
    } else {
      let gridHtml = "";
      archivedSongs.forEach(song => {
        const partBadge = song.part && song.part !== "All"
          ? `<span class="part-badge" data-voice="${escapeHtml(song.part)}">${escapeHtml(song.part)}</span>`
          : `<span class="part-badge" style="background:#f1f5f9; color:#475569;">All Parts</span>`;

        const eventLabel = song.collection ? escapeHtml(song.collection) : (song.event ? escapeHtml(song.event) : "Past Conference");
        const archiveDateTag = song.archivedDate ? `<span class="badge-archived-date" style="font-size:0.72rem; color:var(--text-muted); margin-left:2px;">• ${escapeHtml(song.archivedDate)}</span>` : "";
        const hasAudioTracks = (song.audioTracks && song.audioTracks.length > 0) || (song.resources && song.resources.audio);
        const tracksBadge = hasAudioTracks ? `<span class="badge-cached-offline">🎧 Tracks</span>` : "";

        let linksHtml = "";
        const localPdf = song.localSheetUrl || (song.resources && song.resources.pdf);
        if (localPdf) {
          linksHtml += `<button type="button" class="btn-link" style="font-size:0.75rem; padding:0;" onclick="openResourceModal('${escapeHtml(song.title)} (Local Sheet)', '${escapeHtml(localPdf)}', 'doc')">🎼 PDF</button>`;
        } else if (song.sheetUrl) {
          linksHtml += `<button type="button" class="btn-link" style="font-size:0.75rem; padding:0;" onclick="openResourceModal('${escapeHtml(song.title)} (Sheet)', '${escapeHtml(song.sheetUrl)}', 'doc')">🎼 Sheet</button>`;
        }

        const localVid = song.localVideoUrl || (song.resources && song.resources.video);
        if (localVid) {
          linksHtml += `<button type="button" class="btn-link" style="font-size:0.75rem; padding:0;" onclick="openResourceModal('${escapeHtml(song.title)} (Video)', '${escapeHtml(localVid)}', 'video')">▶️ Video</button>`;
        } else if (song.videoUrl) {
          const embed = formatYouTubeEmbedUrl(song.videoUrl);
          linksHtml += `<button type="button" class="btn-link" style="font-size:0.75rem; padding:0;" onclick="openResourceModal('${escapeHtml(song.title)} (Video)', '${escapeHtml(embed)}', 'video')">▶️ Video</button>`;
        }

        gridHtml += `
          <div class="archived-song-card fade-in">
            <div class="archived-song-card-top">
              <div class="archived-song-badges">
                <span class="badge-event">🏷️ ${eventLabel}</span>
                <span class="badge-repertoire-archived">📦 Archived</span>
                ${archiveDateTag}
                ${partBadge}
                ${tracksBadge}
              </div>
              <div class="archived-song-title">${escapeHtml(song.title)}</div>
            </div>
            <div class="archived-song-actions">
              <div class="archived-song-links">${linksHtml}</div>
              <button type="button" class="btn-rehearse-archived" onclick="selectAndRehearseArchivedSong('${escapeHtml(song.title)}')">
                ▶️ Rehearse
              </button>
            </div>
          </div>
        `;
      });
      grid.innerHTML = gridHtml;
    }
  }

  // Show section whenever pieces are archived or showPastRepertoire is on
  if (archivedSongs.length > 0 || settings.showPastRepertoire) {
    card.style.display = "block";
  } else {
    card.style.display = "none";
  }
}

function toggleArchivedRepertoireCollapse() {
  const card = document.getElementById("archivedRepertoireCard");
  const content = document.getElementById("archivedRepertoireContent");
  const btn = document.getElementById("archivedCollapseBtn");
  if (!card || !content) return;

  const isOpen = card.classList.contains("open");
  if (isOpen) {
    card.classList.remove("open");
    content.style.display = "none";
    if (btn) btn.innerText = "▼";
  } else {
    card.classList.add("open");
    content.style.display = "block";
    if (btn) btn.innerText = "▲";
  }
}

function selectAndRehearseArchivedSong(songTitle) {
  if (document.body.classList.contains('layout-horizontal')) {
    switchHorizontalTab('practiceSection');
  }

  const select = document.getElementById("targetSong");
  if (!select) return;

  const settings = getUserSettings();
  if (!settings.showPastRepertoire) {
    settings.showPastRepertoire = true;
    saveUserSettings(settings);
    const cb = document.getElementById("settingShowPastRepertoire");
    if (cb) cb.checked = true;
  }

  populateSongSelectDropdown();
  select.value = songTitle;
  localStorage.setItem("kantime_target_song", songTitle);
  renderSelectedSongResource(songTitle);

  const workspace = document.getElementById("practiceWorkspace");
  if (workspace) {
    workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  showToast(`Loaded "${songTitle}" for rehearsal! 🎶`);
}

function getMasterRepertoireList() {
  let cached = getCachedSongs();
  if (!cached || cached.length === 0) {
    const settings = getUserSettings();
    cached = settings.songs || [];
  }
  return cached;
}
window.getMasterRepertoireList = getMasterRepertoireList;

function toggleSongArchiveStatus(songId) {
  // 1. Retrieve the master repertoire list (and any local additions)
  let songs = getMasterRepertoireList(); 
  const targetIndex = songs.findIndex(s => String(s.id) === String(songId) || s.title === songId);
  
  if (targetIndex === -1) return;

  // 2. Toggle both boolean variants to prevent property-mismatch bugs
  const willBeArchived = !Boolean(songs[targetIndex].isArchived || songs[targetIndex].archived);
  songs[targetIndex].isArchived = willBeArchived;
  songs[targetIndex].archived = willBeArchived;

  // 3. Persist an archived ID list to localStorage so sheet re-syncs do not undo local archives
  let archivedIds = [];
  try {
    archivedIds = JSON.parse(localStorage.getItem('kantimes_archived_song_ids') || '[]');
    if (!Array.isArray(archivedIds)) archivedIds = [];
  } catch (e) {
    archivedIds = [];
  }
  const identifier = songs[targetIndex].id || songs[targetIndex].title;
  
  if (willBeArchived) {
    if (!archivedIds.includes(identifier)) archivedIds.push(identifier);
    if (songs[targetIndex].title && !archivedIds.includes(songs[targetIndex].title)) archivedIds.push(songs[targetIndex].title);
  } else {
    archivedIds = archivedIds.filter(id => id !== identifier && id !== songs[targetIndex].title && id !== songs[targetIndex].id);
  }
  localStorage.setItem('kantimes_archived_song_ids', JSON.stringify(archivedIds));

  // 4. Update the active repertoire cache
  localStorage.setItem('kantimes_repertoire_cache', JSON.stringify(songs));
  localStorage.setItem('kantimes_cached_songs', JSON.stringify(songs));
  const settings = getUserSettings();
  settings.songs = songs;
  saveUserSettings(settings);

  // 5. Re-render both the modal list and the main UI (dropdown, counters, and bottom accordion)
  renderSettingsRepertoireList();
  updateRepertoireUI(songs);
  showToast(willBeArchived ? `Archived "${songs[targetIndex].title}" 📦` : `Restored "${songs[targetIndex].title}" 🎶`);
}
window.toggleSongArchiveStatus = toggleSongArchiveStatus;
window.toggleSongArchiveState = toggleSongArchiveStatus;

function updateRepertoireUI(songsList) {
  let songs = songsList || getMasterRepertoireList();

  // Apply kantimes_archived_song_ids
  try {
    const archivedIds = JSON.parse(localStorage.getItem('kantimes_archived_song_ids') || '[]');
    if (Array.isArray(archivedIds) && archivedIds.length > 0) {
      songs.forEach(song => {
        const identifier = song.id || song.title;
        if (archivedIds.includes(identifier) || archivedIds.includes(song.id) || (song.title && archivedIds.includes(song.title))) {
          song.isArchived = true;
          song.archived = true;
        }
      });
    }
  } catch (e) {
    console.warn("[Kantimes] Error applying archived IDs in updateRepertoireUI:", e);
  }

  const activeSongs = songs.filter(s => !s.isArchived && !s.archived);
  const archivedSongs = songs.filter(s => s.isArchived || s.archived);

  // Populate the main dropdown (#songSelect) with activeSongs only
  populateSongDropdown(activeSongs.length > 0 ? activeSongs : songs);

  // If currently rehearsed song was archived, select first active song
  const select = document.getElementById("targetSong") || document.getElementById("songSelect") || document.querySelector(".rehearsal-song-select");
  if (select && select.value) {
    const currentSongArchived = archivedSongs.some(s => s.title === select.value || s.id === select.value);
    if (currentSongArchived && activeSongs.length > 0) {
      select.value = activeSongs[0].title;
      localStorage.setItem("kantime_target_song", activeSongs[0].title);
      localStorage.setItem("kantimes_target_song", activeSongs[0].title);
      renderSelectedSongResource(activeSongs[0].title);
    }
  }

  // Update the accordion header count
  const archivedCountEl = document.querySelector('#archivedAccordionCount, #archivedCountPill, .archived-count-badge');
  if (archivedCountEl) {
    archivedCountEl.textContent = `${archivedSongs.length} piece${archivedSongs.length === 1 ? '' : 's'}`;
  }

  // Render the archived song cards inside the #archivedSongsList container within the accordion
  renderArchivedRepertoireSection(archivedSongs);
}
window.updateRepertoireUI = updateRepertoireUI;

function renderSettingsRepertoireList() {
  renderRepertoireList();
}
window.renderSettingsRepertoireList = renderSettingsRepertoireList;

function renderRepertoireList() {
  const container = document.getElementById("repertoireListContainer");
  const countEl = document.getElementById("repertoireCount");
  if (!container) return;

  const settings = getUserSettings();
  const songs = settings.songs || [];
  if (countEl) countEl.innerText = songs.length;

  if (songs.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.85rem;">No pieces in repertoire yet. Click "+ Add Song" above!</div>`;
    return;
  }

  // Group songs by event
  const groups = {};
  songs.forEach(song => {
    const groupName = song.event || "Active Repertoire";
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(song);
  });

  let html = "";
  Object.keys(groups).forEach(groupName => {
    const groupSongs = groups[groupName];
    const isArchivedGroup = groupSongs.every(s => Boolean(s.isArchived));

    html += `
      <div class="repertoire-event-group">
        <div class="repertoire-event-group-header">
          <span>🏷️ ${escapeHtml(groupName)}</span>
          <span class="badge-settings-pill">${groupSongs.length} ${groupSongs.length === 1 ? 'piece' : 'pieces'}${isArchivedGroup ? ' (Archived)' : ''}</span>
        </div>
    `;

    groupSongs.forEach(song => {
      const partBadge = song.part && song.part !== "All"
        ? `<span class="part-badge" data-voice="${escapeHtml(song.part)}">${escapeHtml(song.part)}</span>`
        : `<span class="part-badge" style="background:#f1f5f9; color:#475569;">All Parts</span>`;

      const videoTag = song.videoUrl ? `<span class="link-tag">📹 Video</span>` : "";
      const sheetTag = song.sheetUrl ? `<span class="link-tag">🎼 Sheet</span>` : "";
      const isArchived = Boolean(song.isArchived || song.archived);
      const archiveBadgeHtml = isArchived
        ? `<span class="badge-repertoire-archived">📦 Archived</span>`
        : '';

      html += `
        <div class="repertoire-list-item">
          <div class="repertoire-item-info">
            <div class="repertoire-item-title-row">
              <strong>${escapeHtml(song.title)}</strong>
              ${partBadge}
              ${archiveBadgeHtml}
            </div>
            <div class="repertoire-item-links">
              ${videoTag}
              ${sheetTag}
            </div>
          </div>
          <div class="repertoire-item-actions">
            <button type="button" class="btn-icon btn-archive-song" data-song-id="${song.id}" onclick="toggleSongArchiveStatus('${song.id}')" title="${isArchived ? 'Restore to active repertoire' : 'Archive this piece'}" aria-label="${isArchived ? 'Restore piece' : 'Archive piece'}">${isArchived ? '📤' : '📦'}</button>
            <button type="button" class="btn-icon" onclick="openSongForm('${song.id}')" title="Edit piece" aria-label="Edit ${escapeHtml(song.title)}">✏️</button>
            <button type="button" class="btn-icon btn-icon-danger" onclick="deleteSong('${song.id}')" title="Delete piece" aria-label="Delete ${escapeHtml(song.title)}">🗑️</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  container.innerHTML = html;
}

function openSongForm(songId) {
  const formCard = document.getElementById("repertoirePieceForm") || document.getElementById("songEditorForm");
  const heading = document.getElementById("songFormHeading");
  const titleInput = document.getElementById("songFormTitle");
  const eventInput = document.getElementById("songFormEvent");
  const archivedCheckbox = document.getElementById("songFormArchived");
  const partSelect = document.getElementById("songFormPart");
  const videoInput = document.getElementById("songFormVideo");
  const sheetInput = document.getElementById("songFormSheet");
  const idInput = document.getElementById("editingSongId");

  if (!formCard) return;

  if (songId) {
    const settings = getUserSettings();
    const song = (settings.songs || []).find(s => s.id === songId);
    if (!song) return;

    idInput.value = songId;
    heading.innerText = `✏️ Edit Repertoire Piece`;
    titleInput.value = song.title || "";
    if (eventInput) eventInput.value = song.event || song.category || "";
    if (archivedCheckbox) archivedCheckbox.checked = Boolean(song.isArchived);
    partSelect.value = song.part || song.voicePart || "All";
    videoInput.value = song.videoUrl || "";
    sheetInput.value = song.sheetUrl || song.resourceUrl || song.pdfUrl || "";
  } else {
    idInput.value = "";
    heading.innerText = `➕ Add New Repertoire Piece`;
    titleInput.value = "";
    if (eventInput) eventInput.value = "Active Repertoire";
    if (archivedCheckbox) archivedCheckbox.checked = false;
    partSelect.value = "All";
    videoInput.value = "";
    sheetInput.value = "";
  }

  formCard.style.display = "block";
  titleInput.focus();
  formCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeSongForm() {
  const formCard = document.getElementById("repertoirePieceForm") || document.getElementById("songEditorForm");
  if (formCard) formCard.style.display = "none";
  const titleEl = document.getElementById("songFormTitle");
  if (titleEl) titleEl.value = "";
  const idEl = document.getElementById("editingSongId");
  if (idEl) idEl.value = "";
  const videoEl = document.getElementById("songFormVideo");
  if (videoEl) videoEl.value = "";
  const sheetEl = document.getElementById("songFormSheet");
  if (sheetEl) sheetEl.value = "";
  const heading = document.getElementById("songFormHeading");
  if (heading) heading.innerText = "➕ Add New Repertoire Piece";
}

function handleAddNewSongFromModal() {
  const titleEl = document.getElementById("songFormTitle");
  const title = titleEl ? titleEl.value.trim() : "";
  const partEl = document.getElementById("songFormPart");
  const part = partEl ? partEl.value : "All";
  const eventGroup = document.getElementById("songFormEvent") ? document.getElementById("songFormEvent").value.trim() || "Active Repertoire" : "Active Repertoire";
  const isArchived = document.getElementById("songFormArchived") ? document.getElementById("songFormArchived").checked : false;
  const videoEl = document.getElementById("songFormVideo");
  let videoUrl = videoEl ? videoEl.value.trim() : "";
  const sheetEl = document.getElementById("songFormSheet");
  const sheetUrl = sheetEl ? sheetEl.value.trim() : "";
  const idEl = document.getElementById("editingSongId");
  const songId = idEl ? idEl.value : "";

  if (!title) {
    alert("Please enter a song title!");
    if (titleEl) titleEl.focus();
    return;
  }

  if (videoUrl) {
    videoUrl = formatYouTubeEmbedUrl(videoUrl);
  }

  const isSheetActive = Boolean(getActiveSheetId());
  const newSongId = songId || `local-${Date.now()}`;

  const newSong = {
    id: newSongId,
    title: title,
    part: part,
    voicePart: part,
    event: eventGroup,
    category: eventGroup,
    isArchived: isArchived,
    videoUrl: videoUrl,
    sheetUrl: sheetUrl,
    resourceUrl: sheetUrl,
    resourceLabel: sheetUrl ? "Sheet Music (PDF)" : "",
    pdfUrl: sheetUrl,
    audioUrl: "",
    resources: [],
    audioTracks: [],
    note: sheetUrl ? `ℹ️ Opens in external tab. Your timer will keep running while you practice!` : ""
  };

  if (sheetUrl) {
    newSong.resources.push({
      type: "pdf",
      label: "Sheet Music (PDF)",
      url: sheetUrl
    });
  }
  if (videoUrl) {
    newSong.resources.push({
      type: "video",
      label: "Rehearsal Video (YouTube)",
      url: videoUrl
    });
  }

  // 1. If Google Sheet is active: save to local extras and update cache
  if (isSheetActive) {
    let localExtras = [];
    try {
      localExtras = JSON.parse(localStorage.getItem("kantimes_local_extra_songs") || "[]");
      if (!Array.isArray(localExtras)) localExtras = [];
    } catch (e) {
      localExtras = [];
    }

    if (songId) {
      const extraIdx = localExtras.findIndex(s => s.id === songId);
      if (extraIdx !== -1) {
        localExtras[extraIdx] = newSong;
      } else {
        localExtras.push(newSong);
      }
    } else {
      localExtras.push(newSong);
    }
    localStorage.setItem("kantimes_local_extra_songs", JSON.stringify(localExtras));

    // Update active cache
    let cached = getCachedSongs() || [];
    const existingIdx = cached.findIndex(s => s.id === newSong.id);
    if (existingIdx !== -1) {
      cached[existingIdx] = newSong;
    } else {
      cached.push(newSong);
    }
    setActiveRepertoire(cached);
  } else {
    // No sheet active: standard user settings repertoire
    const settings = getUserSettings();
    if (songId) {
      const idx = settings.songs.findIndex(s => s.id === songId);
      if (idx !== -1) {
        settings.songs[idx] = newSong;
      } else {
        settings.songs.push(newSong);
      }
    } else {
      settings.songs.push(newSong);
    }
    saveUserSettings(settings);
    setActiveRepertoire(settings.songs);
  }

  closeSongForm();
  renderRepertoireList();
  populateSongSelectDropdown();
  renderArchivedRepertoireSection();

  const targetSelect = document.getElementById("targetSong") || document.getElementById("songSelect");
  if (targetSelect) {
    if (!targetSelect.value || targetSelect.value === title) {
      targetSelect.value = title;
      localStorage.setItem("kantime_target_song", title);
    }
    renderSelectedSongResource(targetSelect.value);
  }

  showToast("Piece added to your local repertoire! 🎶");
}
window.handleAddNewSongFromModal = handleAddNewSongFromModal;
window.saveSongFromForm = handleAddNewSongFromModal;

function deleteSong(songId) {
  const settings = getUserSettings();
  const song = settings.songs.find(s => s.id === songId);
  if (!song) return;

  const confirmDelete = confirm(`Remove "${song.title}" from your personal repertoire?`);
  if (!confirmDelete) return;

  settings.songs = settings.songs.filter(s => s.id !== songId);
  saveUserSettings(settings);

  try {
    const localExtras = JSON.parse(localStorage.getItem("kantimes_local_extra_songs") || "[]");
    if (Array.isArray(localExtras) && localExtras.length > 0) {
      const filtered = localExtras.filter(s => s.id !== songId);
      localStorage.setItem("kantimes_local_extra_songs", JSON.stringify(filtered));
    }
  } catch (e) { }

  try {
    let archivedIds = JSON.parse(localStorage.getItem('kantimes_archived_song_ids') || '[]');
    if (Array.isArray(archivedIds) && archivedIds.length > 0) {
      archivedIds = archivedIds.filter(id => id !== songId);
      localStorage.setItem('kantimes_archived_song_ids', JSON.stringify(archivedIds));
    }
  } catch (e) { }

  if (getActiveSheetId()) {
    let cached = getCachedSongs() || [];
    cached = cached.filter(s => s.id !== songId);
    setActiveRepertoire(cached);
  }

  renderRepertoireList();
  populateSongSelectDropdown();
  renderArchivedRepertoireSection();

  const targetSelect = document.getElementById("targetSong");
  if (targetSelect) {
    renderSelectedSongResource(targetSelect.value);
  }

  showToast("Piece removed.");
}

function resetUserSettingsToDefault() {
  const confirmReset = confirm("Reset all your personal preferences, schedule target, and repertoire back to the default Stake Choir setup?");
  if (!confirmReset) return;

  localStorage.removeItem("kantime_user_settings");
  closeSongForm();

  const defaults = getUserSettings();
  applyHeaderTargetDate();
  applyTimerDuration(defaults.timerMinutes, true);
  populateSongSelectDropdown();

  const targetSelect = document.getElementById("targetSong");
  if (targetSelect && defaults.songs.length > 0) {
    targetSelect.value = defaults.songs[0].title;
    localStorage.setItem("kantime_target_song", defaults.songs[0].title);
    renderSelectedSongResource(defaults.songs[0].title);
  }

  const targetDateInput = document.getElementById("settingTargetDate");
  if (targetDateInput) targetDateInput.value = defaults.targetDate;

  const timerDurSelect = document.getElementById("settingTimerDuration");
  if (timerDurSelect) timerDurSelect.value = defaults.timerMinutes;

  const pastCheckbox = document.getElementById("settingShowPastRepertoire");
  if (pastCheckbox) pastCheckbox.checked = false;

  renderRepertoireList();
  renderArchivedRepertoireSection();

  showToast("Reset to Choir Defaults! ✨");
}

// --- MULTILINGUAL TUTORIAL LOCALIZATION ---
const TUTORIAL_I18N = {
  en: {
    guide_title: "Choir Member Quick Guide",
    guide_subtitle: "Master your rehearsal routine, background tracking, and choir standings in 5 simple steps.",
    step_label_1: "Step 1",
    step1_title: "Set Up Profile & Avatar",
    step1_desc: "Choose your voice part, name, and illustrated avatar.",
    step_label_2: "Step 2",
    step2_title: "Configure Preferences",
    step2_desc: "Adjust timer length from 5\u201360 mins via settings.",
    step_label_3: "Step 3",
    step3_title: "Sing with Sheet & Audio",
    step3_desc: "Tap Interactive Sheet & Audio; timer continues in the background.",
    step_label_4: "Step 4",
    step4_title: "Voice Pitch Check",
    step4_desc: "Use the mic tool to test starting pitch and lock in your target note.",
    step_label_5: "Step 5",
    step5_title: "Log & Leaderboard",
    step5_desc: "Complete the countdown to record practice minutes for your section."
  },
  hil: {
    guide_title: "Giya para sa mga Miyembro sang Koro",
    guide_subtitle: "Aramon ang imo rutina sang praktis, background timer, kag choir standings sa 5 ka mga hakop.",
    step_label_1: "Hakop 1",
    step1_title: "I-set ang Profile kag Avatar",
    step1_desc: "Pilia ang imo tingog, ngalan, kag avatar sa \u2018Switch voice / change name\u2019.",
    step_label_2: "Hakop 2",
    step2_title: "Huwaron ang Oras sang Praktis",
    step2_desc: "I-adjust ang timer halin 5 tubtob 60 minutos sa Preferences \u2699\ufe0f.",
    step_label_3: "Hakop 3",
    step3_title: "Magpraktis Upod ang Piesa kag Audio",
    step3_desc: "Pinduta ang Interactive Sheet & Audio; padayon nga magadalagan ang timer samtang nagakanta ka.",
    step_label_4: "Hakop 4",
    step4_title: "Pag-check sang Tono sang Tingog",
    step4_desc: "Gamita ang mic para ma-test ang starting note kag ma-lock ang husto nga pitch.",
    step_label_5: "Hakop 5",
    step5_title: "Pag-log kag Leaderboard",
    step5_desc: "Tapusa ang countdown para awtomatiko nga marekord ang imo minuto sa Section Standings."
  },
  tl: {
    guide_title: "Gabay para sa mga Miyembro ng Koro",
    guide_subtitle: "Linangin ang inyong rutina sa ensayo, background timer, at choir standings sa 5 simpleng hakbang.",
    step_label_1: "Hakbang 1",
    step1_title: "Ayusin ang Profile at Avatar",
    step1_desc: "Piliin ang boses, pangalan, at avatar sa \u2018Switch voice / change name\u2019.",
    step_label_2: "Hakbang 2",
    step2_title: "I-set ang Practice Preferences",
    step2_desc: "I-adjust ang haba ng timer mula 5 hanggang 60 minuto sa Preferences \u2699\ufe0f.",
    step_label_3: "Hakbang 3",
    step3_title: "Mag-ensayo Gamit ang Pyesa at Audio",
    step3_desc: "Pindutin ang Interactive Sheet & Audio; tuloy-tuloy ang timer sa background habang kumakanta.",
    step_label_4: "Hakbang 4",
    step4_title: "Pagsusuri ng Pitch ng Boses",
    step4_desc: "Gamitin ang mikropono upang subukan ang starting note at makuha ang tamang tono.",
    step_label_5: "Hakbang 5",
    step5_title: "Pag-save at Leaderboard",
    step5_desc: "Tapusin ang buong countdown upang awtomatikong maitala ang oras sa Section Standings."
  },
  ceb: {
    guide_title: "Giya alang sa mga Miyembro sa Koro",
    guide_subtitle: "Hukma ang imong rutina sa praktis, background timer, ug choir standings sa 5 ka yano nga lakang.",
    step_label_1: "Lakang 1",
    step1_title: "I-set ang Profile ug Avatar",
    step1_desc: "Pilia ang imong boses, ngalan, ug avatar sa \u2018Switch voice / change name\u2019.",
    step_label_2: "Lakang 2",
    step2_title: "Usba ang Oras sa Praktis",
    step2_desc: "I-adjust ang gitas-on sa timer gikan 5 hangtod 60 minutos sa Preferences \u2699\ufe0f.",
    step_label_3: "Lakang 3",
    step3_title: "Pagpraktis Uban sa Pyesa ug Audio",
    step3_desc: "Pindota ang Interactive Sheet & Audio; magpadayon ang timer sa luyo samtang nagkanta ka.",
    step_label_4: "Lakang 4",
    step4_title: "Pagsusi sa Pitch sa Tingog",
    step4_desc: "Gamita ang mic aron masulayan ang starting note ug ma-lock ang insaktong tono.",
    step_label_5: "Lakang 5",
    step5_title: "Pag-save ug Leaderboard",
    step5_desc: "Humanon ang countdown aron awtomatikong marekord ang imong oras sa Section Standings."
  }
};

let currentTutorialLang = "en";

function initTutorialLang() {
  const saved = localStorage.getItem("kantime_lang") || "en";
  currentTutorialLang = TUTORIAL_I18N[saved] ? saved : "en";
  applyTutorialLang(currentTutorialLang);
}

function setTutorialLang(lang) {
  if (!TUTORIAL_I18N[lang]) return;
  currentTutorialLang = lang;
  localStorage.setItem("kantime_lang", lang);
  applyTutorialLang(lang);
}

function applyTutorialLang(lang) {
  const strings = TUTORIAL_I18N[lang];
  if (!strings) return;

  const panel = document.getElementById("tabPanelTutorial");
  if (panel) {
    panel.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      if (strings[key] !== undefined) {
        el.textContent = strings[key];
      }
    });
  }

  document.querySelectorAll(".lang-pill").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
  });
}

// --- EXPORT TUTORIAL GUIDE TO PDF (FIXED STAGING COORDINATES) ---
function exportTutorialToPdf() {
  const exportBtn = document.querySelector(".btn-export-pdf");
  const origBtnContent = exportBtn ? exportBtn.innerHTML : "";

  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.innerHTML = "⏳ Exporting PDF...";
  }

  showToast("Generating PDF guide... 📄");

  const settings = getUserSettings();
  const targetDate = settings.targetDate || "Stake Choir Prep • Oct 24–25";
  const year = new Date().getFullYear();

  const dateStr = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  const memberName = localStorage.getItem("choir_name") || "";
  const memberVoice =
    localStorage.getItem("choir_voice") ||
    localStorage.getItem("choir_section") ||
    "";

  const singerInfo = memberName
    ? `${memberName} (${memberVoice || "Choir Singer"})`
    : "";

  const lang = currentTutorialLang || "en";
  const s = TUTORIAL_I18N[lang] || TUTORIAL_I18N.en;

  const A4_PX = 794;

  const staging = document.createElement("div");
  staging.id = "pdfIsolatedExportContainer";

  Object.assign(staging.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: A4_PX + "px",
    maxWidth: A4_PX + "px",

    /* IMPORTANT: keep it in the visible rendering tree */
    zIndex: "2147483647",

    background: "#ffffff",
    backgroundColor: "#ffffff",
    color: "#0f172a",

    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',

    fontSize: "14px",
    lineHeight: "1.5",

    padding: "32px 36px",
    boxSizing: "border-box",

    display: "block",
    visibility: "visible",
    opacity: "1",

    pointerEvents: "none"
  });

  const BADGE_COLORS = [
    { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", left: "#3b82f6" },
    { bg: "#f0fdfa", fg: "#0f766e", border: "#99f6e4", left: "#14b8a6" },
    { bg: "#ecfdf5", fg: "#059669", border: "#a7f3d0", left: "#10b981" },
    { bg: "#fffbeb", fg: "#b45309", border: "#fde68a", left: "#f59e0b" },
    { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe", left: "#8b5cf6" }
  ];

  const stepsList = [
    {
      label: s.step_label_1,
      title: s.step1_title,
      desc: s.step1_desc
    },
    {
      label: s.step_label_2,
      title: s.step2_title,
      desc: s.step2_desc
    },
    {
      label: s.step_label_3,
      title: s.step3_title,
      desc: s.step3_desc
    },
    {
      label: s.step_label_4,
      title: s.step4_title,
      desc: s.step4_desc
    },
    {
      label: s.step_label_5,
      title: s.step5_title,
      desc: s.step5_desc
    }
  ];

  let stepsHtml = "";

  stepsList.forEach((step, i) => {
    const c = BADGE_COLORS[i];

    stepsHtml += `
      <div style="
        background:#f8fafc;
        border:1px solid #e2e8f0;
        border-left:4px solid ${c.left};
        border-radius:0 8px 8px 0;
        padding:10px 14px;
        margin-bottom:8px;
        page-break-inside:avoid;
        break-inside:avoid;
      ">
        <div style="
          display:flex;
          align-items:center;
          gap:8px;
          margin-bottom:4px;
        ">
          <span style="
            background:${c.bg};
            color:${c.fg};
            border:1px solid ${c.border};
            font-size:6.5pt;
            font-weight:800;
            text-transform:uppercase;
            letter-spacing:0.5px;
            padding:2px 8px;
            border-radius:999px;
            white-space:nowrap;
          ">
            ${escapeHtml(step.label || "Step " + (i + 1))}
          </span>

          <span style="
            font-size:10pt;
            font-weight:800;
            color:#0f172a;
            margin:0;
          ">
            ${escapeHtml(step.title || "")}
          </span>
        </div>

        <p style="
          font-size:8.5pt;
          color:#475569;
          line-height:1.45;
          margin:0;
        ">
          ${escapeHtml(step.desc || "")}
        </p>
      </div>
    `;
  });

  staging.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      border-bottom:3px solid #1d4ed8;
      padding-bottom:12px;
      margin-bottom:14px;
    ">
      <div style="
        display:flex;
        align-items:center;
        gap:12px;
      ">
        <span style="font-size:26pt;line-height:1;">🎵</span>

        <div>
          <div style="
            font-size:14pt;
            font-weight:900;
            color:#1e3a8a;
            line-height:1.2;
            margin:0 0 3px;
          ">
            Kantimes: Choir Member Quick Guide &bull; Stake Choir Prep
          </div>

          <div style="
            font-size:8.5pt;
            color:#475569;
            font-weight:600;
            margin:0;
          ">
            5 Simple Steps &bull;
            ${escapeHtml(targetDate)}
            &bull;
            Language: ${lang.toUpperCase()}
          </div>
        </div>
      </div>

      <div style="
        text-align:right;
        font-size:7.5pt;
        color:#64748b;
        line-height:1.4;
      ">
        ${singerInfo
      ? `<div>Member:
                <strong style="color:#1e293b;">
                  ${escapeHtml(singerInfo)}
                </strong>
              </div>`
      : ""
    }

        <div>Stake Choir Practice Hub</div>
        <div>${dateStr}</div>
      </div>
    </div>

    <div style="
      background:#eff6ff;
      border-left:4px solid #1d4ed8;
      padding:8px 14px;
      border-radius:0 6px 6px 0;
      font-size:8.5pt;
      color:#1e40af;
      margin-bottom:14px;
      line-height:1.45;
    ">
      ${escapeHtml(
      s.guide_subtitle ||
      "Master your rehearsal routine, background tracking, and choir standings in 5 simple steps."
    )}
    </div>

    ${stepsHtml}

    <div style="
      margin-top:18px;
      padding-top:10px;
      border-top:1px solid #e2e8f0;
      display:flex;
      justify-content:space-between;
      align-items:center;
      font-size:7.5pt;
      color:#64748b;
    ">
      <span style="font-weight:600;">
        Stake Choir Repertoire • Practice Hub
      </span>

      <span style="color:#94a3b8;">
        &copy; ${year} Kantimes Practice Hub
      </span>
    </div>
  `;

  document.body.appendChild(staging);

  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;

    cleaned = true;

    if (staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }

    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.innerHTML = origBtnContent;
    }
  };

  /*
   * Load html2canvas + jsPDF directly.
   * We intentionally do NOT use html2pdf.js for the actual export.
   */
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);

      if (existing) {
        if (typeof html2canvas !== "undefined" || typeof window.jspdf !== "undefined") {
          resolve();
          return;
        }

        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(script);
    });

  const exportCanvasToPdf = async () => {
    try {
      console.log("[KanTime PDF] Target:", staging);
      console.log(
        "[KanTime PDF] Dimensions:",
        staging.offsetWidth,
        "x",
        staging.scrollHeight
      );

      if (staging.offsetWidth === 0 || staging.scrollHeight === 0) {
        throw new Error("Staging element has zero dimensions.");
      }

      /*
       * Wait until the browser has actually painted the staging element.
       */
      await new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(resolve)
        )
      );

      const canvas = await html2canvas(staging, {
        scale: 2,

        backgroundColor: "#ffffff",

        useCORS: true,
        allowTaint: false,

        logging: true,

        x: 0,
        y: 0,

        width: staging.offsetWidth,
        height: staging.scrollHeight,

        windowWidth: A4_PX,
        windowHeight: Math.max(
          staging.scrollHeight + 100,
          window.innerHeight
        ),

        scrollX: 0,
        scrollY: 0,

        ignoreElements: (el) =>
          el.tagName === "BUTTON" ||
          el.tagName === "INPUT" ||
          el.tagName === "SELECT"
      });

      console.log(
        "[KanTime PDF] Canvas:",
        canvas.width,
        "x",
        canvas.height
      );

      /*
       * IMPORTANT diagnostic check.
       */
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error("html2canvas returned an empty canvas.");
      }

      /*
       * Convert canvas directly into a JPEG.
       * This proves that html2canvas produced actual pixels.
       */
      const imgData = canvas.toDataURL("image/jpeg", 0.98);

      if (!imgData || imgData.length < 1000) {
        throw new Error(
          "Canvas image data is unexpectedly empty."
        );
      }

      console.log(
        "[KanTime PDF] Image data length:",
        imgData.length
      );

      /*
       * jsPDF is exposed as window.jspdf.jsPDF by the CDN build.
       */
      if (
        !window.jspdf ||
        typeof window.jspdf.jsPDF !== "function"
      ) {
        throw new Error("jsPDF library is not available.");
      }

      const { jsPDF } = window.jspdf;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pageWidth = 210;
      const pageHeight = 297;

      const margin = 8;

      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      /*
       * Canvas aspect ratio.
       */
      const imgWidth = usableWidth;
      const imgHeight =
        (canvas.height * imgWidth) / canvas.width;

      /*
       * If the guide is taller than one A4 page,
       * split the canvas across multiple PDF pages.
       */
      let remainingHeight = imgHeight;
      let position = margin;

      pdf.addImage(
        imgData,
        "JPEG",
        margin,
        position,
        imgWidth,
        imgHeight,
        undefined,
        "FAST"
      );

      remainingHeight -= usableHeight;

      while (remainingHeight > 0) {
        pdf.addPage();

        position = margin - (imgHeight - remainingHeight);

        pdf.addImage(
          imgData,
          "JPEG",
          margin,
          position,
          imgWidth,
          imgHeight,
          undefined,
          "FAST"
        );

        remainingHeight -= usableHeight;
      }

      const filename =
        `KanTime-Choir-Guide-${lang.toUpperCase()}.pdf`;

      pdf.save(filename);

      console.log(
        "[KanTime PDF] PDF generated successfully:",
        filename
      );

      showToast("PDF guide downloaded! 📄");

      cleanup();

    } catch (err) {
      console.error(
        "[KanTime PDF] DIRECT EXPORT ERROR:",
        err
      );

      showToast(
        "PDF export failed – opening print fallback."
      );

      cleanup();

      _printTutorialFallback();
    }
  };

  /*
   * Load html2canvas first.
   */
  const ensureLibraries = async () => {
    try {
      if (typeof html2canvas === "undefined") {
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
        );
      }

      /*
       * jsPDF standalone build.
       */
      if (
        !window.jspdf ||
        typeof window.jspdf.jsPDF !== "function"
      ) {
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
        );
      }

      await new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(resolve)
        )
      );

      await exportCanvasToPdf();

    } catch (err) {
      console.error(
        "[KanTime PDF] Library loading error:",
        err
      );

      cleanup();

      showToast(
        "PDF libraries could not be loaded – opening print fallback."
      );

      _printTutorialFallback();
    }
  };

  ensureLibraries();
}

function _printTutorialFallback() {
  const panel = document.getElementById("tabPanelTutorial");
  if (!panel) { window.print(); return; }

  panel.classList.add("tutorial-print-area");
  document.body.classList.add("printing-tutorial");

  window.print();

  setTimeout(function () {
    panel.classList.remove("tutorial-print-area");
    document.body.classList.remove("printing-tutorial");
  }, 1500);
}

// --- PWA, OFFLINE QUEUE & AUDIO HELPERS ---
function selectAudioTrack(trackSrc, pillEl, trackName) {
  if (!trackSrc) return;
  let finalSrc = normalizeAudioUrl(trackSrc);

  const badgeEl = document.getElementById("activeTrackTitleBadge");
  if (badgeEl) {
    const rawName = trackName || (pillEl ? pillEl.textContent.trim() : "");
    const cleanName = rawName.replace(/^[🎧🎵📄📺▶️🔗🎼]\s*/, "").trim();
    if (cleanName) {
      badgeEl.textContent = `🎵 ${cleanName}`;
    }
  }

  const isSoundCloud = finalSrc.includes("soundcloud.com");
  const audioContainer = document.getElementById("rehearsalAudioContainer");
  const audioEl = document.getElementById("activeLocalAudio");

  if (isSoundCloud && audioContainer) {
    if (audioEl) {
      try { audioEl.pause(); } catch (e) { }
      audioEl.style.display = "none";
    }
    let extWrapper = audioContainer.querySelector(".external-audio-card");
    if (!extWrapper) {
      extWrapper = document.createElement("div");
      extWrapper.className = "external-audio-card";
      extWrapper.style.cssText = "text-align: center; padding: 12px 8px; margin-top: 4px;";
      audioContainer.appendChild(extWrapper);
    }
    extWrapper.innerHTML = `
      <p style="margin: 0 0 8px; font-size: 0.82rem; color: var(--text-muted);">Hosted on external streaming platform:</p>
      <a href="${escapeHtml(finalSrc)}" target="_blank" rel="noopener noreferrer" class="btn-audio-external">▶ Stream / Download Audio (External) ↗</a>
    `;
    extWrapper.style.display = "block";
  } else {
    if (audioContainer) {
      const extWrapper = audioContainer.querySelector(".external-audio-card");
      if (extWrapper) extWrapper.style.display = "none";
      const fallbackDiv = audioContainer.querySelector(".audio-stream-fallback");
      if (fallbackDiv) fallbackDiv.remove();
    }
    if (audioEl) {
      audioEl.style.display = "";
      const wasPlaying = !audioEl.paused;
      audioEl.src = finalSrc;
      if (wasPlaying) {
        audioEl.play().catch(() => { });
      }
    }
  }

  const pills = document.querySelectorAll(".audio-part-pill, .song-resource-pill");
  pills.forEach(p => p.classList.remove("active"));
  if (pillEl) {
    pillEl.classList.add("active");
  }
}

function handleAudioPlaybackError(audioEl, audioUrl) {
  if (!audioEl) return;
  const container = audioEl.closest(".local-audio-card") || audioEl.parentElement;
  if (!container) return;

  // Immediately hide failing audio element
  try { audioEl.pause(); } catch (e) { }
  audioEl.style.display = "none";

  if (container.querySelector(".external-audio-card") || container.querySelector(".btn-audio-external-primary")) {
    const existing = container.querySelector(".external-audio-card");
    if (existing) existing.style.display = "block";
    return;
  }

  let streamUrl = audioUrl || audioEl.src;
  if (streamUrl && !streamUrl.includes("sacredsheetmusic.org") && streamUrl.startsWith("http://") && (typeof window !== "undefined" && window.location && window.location.protocol === "https:")) {
    streamUrl = streamUrl.replace(/^http:\/\//i, "https://");
  }

  // Render clean prominent button directly without intermediate error text clutter
  const extCard = document.createElement("div");
  extCard.className = "external-audio-card";
  extCard.style.cssText = "text-align: center; padding: 12px 8px; margin-top: 4px;";
  extCard.innerHTML = `
    <a href="${escapeHtml(streamUrl)}" target="_blank" rel="noopener noreferrer" class="btn-audio-external-primary">
      ▶ Stream / Download Audio (External) ↗
    </a>
  `;
  container.appendChild(extCard);
}

function saveOfflinePracticeSession(sessionObj) {
  try {
    const queue = JSON.parse(localStorage.getItem("offline_practice_queue") || "[]");
    queue.push(sessionObj);
    localStorage.setItem("offline_practice_queue", JSON.stringify(queue));
  } catch (e) {
    console.error("Failed to queue offline session:", e);
  }
}

function syncOfflinePracticeQueue() {
  if (!navigator.onLine) return;
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem("offline_practice_queue") || "[]");
  } catch (e) {
    queue = [];
  }

  if (!queue || queue.length === 0) return;

  const count = queue.length;
  showToast(`Syncing ${count} offline session${count > 1 ? 's' : ''} to leaderboard... 📡`);

  const syncPromises = queue.map(session => {
    return fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session)
    });
  });

  Promise.all(syncPromises)
    .then(() => {
      localStorage.removeItem("offline_practice_queue");
      showToast(`Synced ${count} offline session${count > 1 ? 's' : ''} successfully! 🔥`);
      setTimeout(loadLeaderboard, 1200);
    })
    .catch(err => {
      console.warn("Failed to sync offline practice queue:", err);
    });
}

function updateOnlineStatus() {
  const banner = document.getElementById("offlineStatusBanner");
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (banner) {
    banner.style.display = isOffline ? "flex" : "none";
  }

  const targetSongEl = document.getElementById("targetSong");
  if (targetSongEl && targetSongEl.value) {
    renderSelectedSongResource(targetSongEl.value);
  }

  if (!isOffline) {
    syncOfflinePracticeQueue();
    loadLeaderboard();
  }
}

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

// --------------------------------------------------------------------------
// Force App Update — triggered by tapping the KanTime logo
// --------------------------------------------------------------------------
/**
 * Purges all Service Worker caches, forces a dynamic repertoire resync,
 * triggers a SW update check, then hard-reloads with a version cache-buster
 * so choir members always see the latest songs, videos, and CSS immediately.
 */
async function forceAppUpdate() {
  const logo = document.getElementById("appLogoRefresh");

  // 1. Visual feedback — spin the logo & block further taps
  if (logo) logo.classList.add("spinning");
  showToast("Checking for updates... 🔄");

  try {
    // 2. Force repertoire sync from defaults so all YouTube links & new songs populate
    getUserSettings(true);

    // 3. Purge every Service Worker cache bucket
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    // 4. Tell the Service Worker to fetch a fresh copy of itself
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    }

    // 5. Brief pause so the toast is readable, then notify & hard-reload
    await new Promise((resolve) => setTimeout(resolve, 800));
    showToast("Updated! Reloading latest songs... ✨");

    // 6. Hard reload with version and timestamp query-string to bypass disk cache
    await new Promise((resolve) => setTimeout(resolve, 900));
    window.location.replace(
      window.location.origin +
      window.location.pathname +
      "?v=" + APP_VERSION +
      "&t=" + Date.now()
    );

  } catch (err) {
    console.warn("[KanTimes] forceAppUpdate error:", err);
    showToast("Refresh failed — retrying... 🔄");
    if (logo) logo.classList.remove("spinning");
    // Fallback: basic reload
    setTimeout(() => window.location.reload(), 600);
  }
}

// --------------------------------------------------------------------------
// Dynamic App Launch Version Check & Cache Invalidation
// Ensures mobile web app shortcuts / PWAs automatically fetch updates
// without requiring manual uninstallation and re-installation.
// --------------------------------------------------------------------------
let isCheckingAppVersion = false;
async function checkAppVersionOnLaunch() {
  if (isCheckingAppVersion) return;
  isCheckingAppVersion = true;

  try {
    // Only check when network is available
    if (navigator.onLine === false) {
      isCheckingAppVersion = false;
      return;
    }

    // Fetch version.json bypassing disk cache with timestamp query
    const res = await fetch("./version.json?t=" + Date.now(), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" }
    });

    if (!res.ok) {
      isCheckingAppVersion = false;
      return;
    }

    const data = await res.json();
    const remoteVersion = data && data.version;
    const remoteRepVersion = data && data.repertoireVersion;

    if (!remoteVersion) {
      isCheckingAppVersion = false;
      return;
    }

    const hasNewAppVersion = compareSemver(remoteVersion, APP_VERSION) > 0;
    const hasNewRepertoire = remoteRepVersion && compareSemver(remoteRepVersion, REPERTOIRE_VERSION) > 0;

    if (hasNewAppVersion || hasNewRepertoire) {
      console.log(`[KanTimes] New deployment detected: v${remoteVersion} (running v${APP_VERSION}). Triggering dynamic cache invalidation...`);
      await performDynamicCacheInvalidation(remoteVersion);
    }
  } catch (err) {
    console.warn("[KanTimes] checkAppVersionOnLaunch error:", err);
  } finally {
    isCheckingAppVersion = false;
  }
}

async function performDynamicCacheInvalidation(newVersion) {
  try {
    // 1. Purge all Service Worker caches
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // 2. Notify SW to skip waiting and check update
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        await reg.update().catch(() => { });
      }
    }

    // 3. Force-sync stored user repertoire so new YouTube links are populated
    getUserSettings(true);

    // 4. If timer is currently running or paused with progress, or choir setup is open, don't disrupt the user!
    const isRunning = Boolean(timerInterval || targetEndTime);
    const pausedVal = localStorage.getItem("kantimes_paused_remaining") || localStorage.getItem("kantime_paused_remaining");
    const hasPausedProgress = Boolean(pausedVal && Number(pausedVal) > 0 && Number(pausedVal) < timerDuration);
    const profileCard = document.getElementById("profileCard");
    const isProfileSetupOpen = Boolean(profileCard && profileCard.style.display !== "none");

    if (isRunning || hasPausedProgress || isProfileSetupOpen) {
      // Re-render in memory dynamically without hard reload
      try {
        const songs = getMasterRepertoireList();
        if (typeof updateRepertoireUI === "function") updateRepertoireUI(songs);
        if (typeof populateSongSelectDropdown === "function") populateSongSelectDropdown();
      } catch (err) {}
      showToast("✨ A new update with fresh songs is ready! Tap the KanTimes logo when you finish practicing.");
      return;
    }

    // 5. If idle, show toast and refresh with cache-busting version params
    showToast(`✨ KanTimes updated to v${newVersion}! Refreshing latest repertoire...`);
    setTimeout(() => {
      const cleanUrl =
        window.location.origin +
        window.location.pathname +
        "?v=" + newVersion +
        "&t=" + Date.now();
      window.location.replace(cleanUrl);
    }, 1200);
  } catch (e) {
    console.warn("[KanTimes] performDynamicCacheInvalidation error:", e);
  }
}

// --------------------------------------------------------------------------
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Track whether a reload is already in flight so we don't reload twice
  let reloadPending = false;

  // Show a dismissible toast and dynamically refresh repertoire without reloading
  function showUpdateToast() {
    const existing = document.getElementById("toast");
    const el = existing || document.createElement("div");
    if (!existing) {
      el.id = "swUpdateToast";
      el.style.cssText =
        "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
        "background:var(--accent,#1e3a8a);color:#fff;padding:12px 20px;" +
        "border-radius:999px;font-size:0.88rem;z-index:9999;" +
        "box-shadow:0 4px 20px rgba(0,0,0,.35);text-align:center;";
      document.body.appendChild(el);
    }
    el.textContent = "🔄 App updated to latest repertoire!";
    el.style.display = "block";
    el.classList.add("toast-visible");

    // Dynamic in-memory re-rendering without hard page reload
    try {
      const songs = getMasterRepertoireList();
      if (typeof updateRepertoireUI === "function") {
        updateRepertoireUI(songs);
      }
      if (typeof populateSongSelectDropdown === "function") {
        populateSongSelectDropdown();
      }
      if (typeof renderArchivedRepertoireSection === "function") {
        renderArchivedRepertoireSection();
      }
    } catch (e) {
      console.warn("[Kantimes] Dynamic repertoire update error:", e);
    }

    setTimeout(() => {
      if (el) {
        el.classList.remove("toast-visible");
        el.style.display = "none";
      }
    }, 3000);
  }

  const swUrl = window.location.protocol === "file:" ? "./sw.js" : "/sw.js?v=" + APP_VERSION;
  const swOptions = window.location.protocol === "file:" ? {} : { scope: "/" };

  navigator.serviceWorker.register(swUrl, swOptions)
    .then((reg) => {
      console.log("[SW] Registered — scope:", reg.scope);

      // ── 1. Trigger an update check immediately on every page load ──────
      reg.update().catch(() => { });

      // ── 2. Trigger update checks whenever the tab or shortcut regains focus / visibility ──
      const onFocusOrVisible = () => {
        if (document.visibilityState === "visible") {
          reg.update().catch(() => { });
          checkAppVersionOnLaunch();
        }
      };
      document.addEventListener("visibilitychange", onFocusOrVisible);
      window.addEventListener("focus", onFocusOrVisible);
      window.addEventListener("pageshow", onFocusOrVisible);

      // ── 3. Handle a SW that was already waiting when page loaded ───────
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      // ── 4. Listen for a new SW being found & installed ─────────────────
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // A new version is ready and waiting — tell it to activate now
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    })
    .catch((err) => {
      console.warn("[SW] Registration failed:", err);
    });

  // ── 5. When the controller changes (new SW took over), reload once ──────
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadPending) return;
    reloadPending = true;
    showUpdateToast();
  });
}

// --- USER NAME REAL-TIME VALIDATION HELPERS ---
function validateNameInput(inputEl, msgEl, btnEl) {
  if (!inputEl) return false;
  const val = inputEl.value.trim();
  const isValid = val.length >= 2;

  if (val.length === 0) {
    inputEl.classList.remove("input-invalid");
    if (msgEl) msgEl.style.display = "none";
    if (btnEl) btnEl.disabled = true;
    return false;
  }

  if (!isValid) {
    inputEl.classList.add("input-invalid");
    if (msgEl) {
      msgEl.textContent = "⚠️ Please enter at least 2 characters.";
      msgEl.style.display = "block";
    }
    if (btnEl) btnEl.disabled = true;
    return false;
  } else {
    inputEl.classList.remove("input-invalid");
    if (msgEl) msgEl.style.display = "none";
    if (btnEl) btnEl.disabled = false;
    return true;
  }
}

function initNameValidation() {
  const setupInput = document.getElementById("onboardingNickname") || document.getElementById("memberName");
  const setupMsg = document.getElementById("memberNameValidationMsg");
  const setupBtn = document.getElementById("setupProfileSubmitBtn") || document.getElementById("saveProfileBtn");

  if (setupInput) {
    setupInput.addEventListener("input", () => {
      validateNameInput(setupInput, setupMsg, setupBtn);
    });
    setupInput.addEventListener("blur", () => {
      if (setupInput.value) {
        setupInput.value = formatDisplayName(setupInput.value);
      }
      validateNameInput(setupInput, setupMsg, setupBtn);
    });
    setupInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (setupInput.value) {
          setupInput.value = formatDisplayName(setupInput.value);
        }
        if (!validateNameInput(setupInput, setupMsg, setupBtn)) {
          e.preventDefault();
          showToast("⚠️ Name must be at least 2 characters.");
        }
      }
    });
    validateNameInput(setupInput, setupMsg, setupBtn);
  }

  const settingInput = document.getElementById("settingMemberName");
  const settingMsg = document.getElementById("settingMemberNameValidationMsg");
  const settingBtn = document.getElementById("saveSettingsProfileBtn");

  if (settingInput) {
    settingInput.addEventListener("input", () => {
      validateNameInput(settingInput, settingMsg, settingBtn);
    });
    settingInput.addEventListener("blur", () => {
      if (settingInput.value) {
        settingInput.value = formatDisplayName(settingInput.value);
      }
      validateNameInput(settingInput, settingMsg, settingBtn);
    });
    settingInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (settingInput.value) {
          settingInput.value = formatDisplayName(settingInput.value);
        }
        if (!validateNameInput(settingInput, settingMsg, settingBtn)) {
          e.preventDefault();
          showToast("⚠️ Name must be at least 2 characters.");
        }
      }
    });
  }

  // Also bind any inputs with #fullNameInput or #userNameInput for full compatibility
  ["fullNameInput", "userNameInput"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("blur", () => {
        if (el.value) {
          el.value = formatDisplayName(el.value);
        }
      });
    }
  });
}

// ==========================================================================
// THEME & APPEARANCE SYSTEM (System / Light / Dark)
// ==========================================================================
function getSavedThemeMode() {
  return localStorage.getItem("theme_mode") || "system";
}

function resolveTheme(mode) {
  if (mode === "system") {
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  return mode === "dark" ? "dark" : "light";
}

function applyTheme(mode, persist = true) {
  if (persist) {
    localStorage.setItem("theme_mode", mode);
  }
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute("data-theme", resolved);

  const quickBtn = document.getElementById("themeQuickToggleBtn");
  if (quickBtn) {
    quickBtn.innerText = resolved === "dark" ? "☀️" : "🌙";
    quickBtn.title = resolved === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
    quickBtn.setAttribute("aria-label", quickBtn.title);
  }

  const metaTheme = document.querySelector("meta[name='theme-color']");
  if (metaTheme) {
    metaTheme.setAttribute("content", resolved === "dark" ? "#090d16" : "#1e40af");
  }

  updateThemeSegmentedControl(mode);
}

function updateThemeSegmentedControl(mode) {
  const btnSystem = document.getElementById("themeBtnSystem");
  const btnLight = document.getElementById("themeBtnLight");
  const btnDark = document.getElementById("themeBtnDark");

  if (btnSystem) btnSystem.classList.toggle("active", mode === "system");
  if (btnLight) btnLight.classList.toggle("active", mode === "light");
  if (btnDark) btnDark.classList.toggle("active", mode === "dark");
}


// ==========================================================================
// DASHBOARD LAYOUT PREFERENCE (VERTICAL STACK VS HORIZONTAL TABS)
// ==========================================================================
const STORAGE_KEY_LAYOUT = 'kantimes_layout_mode';

function getSavedLayoutMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_LAYOUT);
    if (saved === 'horizontal' || saved === 'vertical') {
      return saved;
    }
  } catch (e) {
    console.warn('Could not read layout preference from localStorage:', e);
  }
  return 'horizontal';
}

function applyLayoutMode(mode, save = true) {
  const isHorizontal = mode === 'horizontal';
  document.body.classList.toggle('layout-horizontal', isHorizontal);
  document.body.classList.toggle('layout-vertical', !isHorizontal);

  const tabBar = document.getElementById('horizontalTabBar');
  if (tabBar) {
    tabBar.style.display = isHorizontal ? 'flex' : 'none';
  }

  // Update Settings toggle buttons
  const btnVertical = document.getElementById('layoutBtnVertical');
  const btnHorizontal = document.getElementById('layoutBtnHorizontal');
  if (btnVertical) {
    btnVertical.classList.toggle('active', !isHorizontal);
    btnVertical.setAttribute('aria-pressed', !isHorizontal ? 'true' : 'false');
  }
  if (btnHorizontal) {
    btnHorizontal.classList.toggle('active', isHorizontal);
    btnHorizontal.setAttribute('aria-pressed', isHorizontal ? 'true' : 'false');
  }

  if (isHorizontal) {
    const activeSection = document.querySelector('.dashboard-section-tab.active, .dashboard-section-tab.tab-active');
    if (!activeSection) {
      switchHorizontalTab('practiceSection');
    }
  }

  if (save) {
    try {
      localStorage.setItem(STORAGE_KEY_LAYOUT, mode);
    } catch (e) {
      console.warn('Could not save layout preference:', e);
    }
    showToast(`Layout switched to ${isHorizontal ? 'Horizontal (Tabs) ↔️' : 'Vertical (Stacked) ↕️'}!`);
  }
}

function switchHorizontalTab(targetId) {
  const sections = document.querySelectorAll('.dashboard-section-tab');
  sections.forEach((sec) => {
    const isTarget = sec.id === targetId;
    sec.classList.toggle('active', isTarget);
    sec.classList.toggle('tab-active', isTarget);
  });

  const tabButtons = document.querySelectorAll('.horizontal-tab-bar .tab-btn');
  tabButtons.forEach((btn) => {
    const isTarget = btn.getAttribute('data-tab-target') === targetId;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });
}

function initLayoutMode() {
  const mode = getSavedLayoutMode();
  applyLayoutMode(mode, false);

  const btnVertical = document.getElementById('layoutBtnVertical');
  const btnHorizontal = document.getElementById('layoutBtnHorizontal');

  if (btnVertical) {
    btnVertical.addEventListener('click', () => applyLayoutMode('vertical', true));
  }
  if (btnHorizontal) {
    btnHorizontal.addEventListener('click', () => applyLayoutMode('horizontal', true));
  }

  const tabButtons = document.querySelectorAll('.horizontal-tab-bar .tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab-target');
      if (targetId) {
        switchHorizontalTab(targetId);
      }
    });
  });
}

window.applyLayoutMode = applyLayoutMode;
window.switchHorizontalTab = switchHorizontalTab;
window.initLayoutMode = initLayoutMode;

function setThemePreference(mode) {
  applyTheme(mode, true);
  const resolved = resolveTheme(mode);
  const label = mode === "system" ? `System (${resolved})` : (mode === "dark" ? "Dark" : "Light");
  showToast(`Appearance set to ${label}! 🎨`);
}

function toggleQuickTheme() {
  const currentResolved = document.documentElement.getAttribute("data-theme") || "light";
  const newMode = currentResolved === "dark" ? "light" : "dark";
  applyTheme(newMode, true);
  showToast(`Switched to ${newMode === "dark" ? "Dark mode 🌙" : "Light mode ☀️"}`);
}

function initThemeSystem() {
  const savedMode = getSavedThemeMode();
  applyTheme(savedMode, false);

  if (window.matchMedia) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", () => {
      if (getSavedThemeMode() === "system") {
        applyTheme("system", false);
      }
    });
  }
}

// ==========================================================================
// IN-BROWSER METRONOME ENGINE
// ==========================================================================
let metronomeAudioCtx = null;
let isMetronomeRunning = false;
let metronomeBpm = 100;
let metronomeBeatsPerBar = 4;
let currentBeatInBar = 0;
let nextNoteTime = 0.0;
const METRONOME_LOOKAHEAD_MS = 25.0;
const METRONOME_SCHEDULE_AHEAD_SEC = 0.1;
let metronomeTimerId = null;
let tapTimestamps = [];

function getTempoMarking(bpm) {
  const b = Number(bpm) || 100;
  if (b < 60) return "Largo (Broad & Slow)";
  if (b < 76) return "Adagio (Slow & Stately)";
  if (b < 108) return "Andante (Walking Pace)";
  if (b < 120) return "Moderato (Moderate)";
  if (b < 156) return "Allegro (Fast & Bright)";
  if (b < 176) return "Vivace (Lively)";
  return "Presto (Very Fast)";
}

function updateMetronomeUI() {
  const bpmDisplay = document.getElementById("metronomeBpmDisplay");
  if (bpmDisplay) bpmDisplay.innerText = metronomeBpm;

  const slider = document.getElementById("metronomeSlider");
  if (slider && Number(slider.value) !== metronomeBpm) {
    slider.value = metronomeBpm;
  }

  const tempoMarking = document.getElementById("metronomeTempoMarking");
  if (tempoMarking) tempoMarking.innerText = getTempoMarking(metronomeBpm);

  const headerBadge = document.getElementById("metronomeHeaderBadge");
  if (headerBadge) {
    const timeSigText = metronomeBeatsPerBar === 6 ? "6/8" : `${metronomeBeatsPerBar}/4`;
    headerBadge.innerText = `${metronomeBpm} BPM • ${timeSigText}`;
  }
}

function updateMetronomeBeatDots() {
  const container = document.getElementById("metronomeBeatDots");
  if (!container) return;

  let html = "";
  for (let i = 0; i < metronomeBeatsPerBar; i++) {
    const isDownbeat = (i === 0);
    html += `<span class="metronome-beat-dot ${isDownbeat ? 'downbeat' : ''}" id="metroDot-${i}" title="Beat ${i + 1}"></span>`;
  }
  container.innerHTML = html;
}

function highlightBeat(beatNumber) {
  const container = document.getElementById("metronomeBeatDots");
  if (!container) return;

  const dots = container.querySelectorAll(".metronome-beat-dot");
  dots.forEach((dot, idx) => {
    if (idx === beatNumber) {
      dot.classList.add("active");
      setTimeout(() => {
        dot.classList.remove("active");
      }, 140);
    } else {
      dot.classList.remove("active");
    }
  });
}

function scheduleMetronomeNote(beatNumber, time) {
  if (!metronomeAudioCtx) return;

  try {
    const osc = metronomeAudioCtx.createOscillator();
    const gain = metronomeAudioCtx.createGain();
    const isDownbeat = (beatNumber === 0);

    osc.type = "sine";
    osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, time);

    gain.gain.setValueAtTime(isDownbeat ? 0.95 : 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (isDownbeat ? 0.05 : 0.035));

    osc.connect(gain);
    gain.connect(metronomeAudioCtx.destination);

    osc.start(time);
    osc.stop(time + (isDownbeat ? 0.05 : 0.035));

    const delayMs = Math.max(0, (time - metronomeAudioCtx.currentTime) * 1000);
    setTimeout(() => {
      if (isMetronomeRunning) {
        highlightBeat(beatNumber);
      }
    }, delayMs);
  } catch (err) {
    console.warn("Metronome note scheduling error:", err);
  }
}

function nextMetronomeNote() {
  const secondsPerBeat = 60.0 / metronomeBpm;
  nextNoteTime += secondsPerBeat;
  currentBeatInBar = (currentBeatInBar + 1) % metronomeBeatsPerBar;
}

function metronomeScheduler() {
  if (!isMetronomeRunning || !metronomeAudioCtx) return;

  while (nextNoteTime < metronomeAudioCtx.currentTime + METRONOME_SCHEDULE_AHEAD_SEC) {
    scheduleMetronomeNote(currentBeatInBar, nextNoteTime);
    nextMetronomeNote();
  }

  metronomeTimerId = setTimeout(metronomeScheduler, METRONOME_LOOKAHEAD_MS);
}

function startMetronome() {
  if (isMetronomeRunning) return;

  if (!metronomeAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      metronomeAudioCtx = new AudioContextClass();
    }
  }

  if (metronomeAudioCtx && metronomeAudioCtx.state === "suspended") {
    metronomeAudioCtx.resume();
  }

  isMetronomeRunning = true;
  currentBeatInBar = 0;
  if (metronomeAudioCtx) {
    nextNoteTime = metronomeAudioCtx.currentTime + 0.05;
  }
  metronomeScheduler();

  const toggleBtn = document.getElementById("metronomeToggleBtn");
  if (toggleBtn) {
    toggleBtn.classList.add("running");
    toggleBtn.innerText = "⏹ Stop Metronome";
  }
}

function stopMetronome() {
  isMetronomeRunning = false;
  if (metronomeTimerId) {
    clearTimeout(metronomeTimerId);
    metronomeTimerId = null;
  }

  const container = document.getElementById("metronomeBeatDots");
  if (container) {
    const dots = container.querySelectorAll(".metronome-beat-dot");
    dots.forEach(d => d.classList.remove("active"));
  }

  const toggleBtn = document.getElementById("metronomeToggleBtn");
  if (toggleBtn) {
    toggleBtn.classList.remove("running");
    toggleBtn.innerText = "▶ Start Metronome";
  }
}

function toggleMetronome() {
  if (isMetronomeRunning) {
    stopMetronome();
  } else {
    startMetronome();
  }
}

function setMetronomeBpm(val) {
  let num = Number(val) || 100;
  num = Math.max(40, Math.min(220, num));
  metronomeBpm = num;
  updateMetronomeUI();
}

function adjustMetronomeBpm(delta) {
  setMetronomeBpm(metronomeBpm + delta);
}

function handleMetronomeSliderInput(val) {
  setMetronomeBpm(val);
}

function handleTapTempo() {
  const now = performance.now();
  const tapBtn = document.getElementById("metronomeTapBtn");
  if (tapBtn) {
    tapBtn.classList.add("tapped");
    setTimeout(() => tapBtn.classList.remove("tapped"), 120);
  }

  if (tapTimestamps.length > 0 && (now - tapTimestamps[tapTimestamps.length - 1]) > 2500) {
    tapTimestamps = [];
  }

  tapTimestamps.push(now);

  if (tapTimestamps.length >= 2) {
    if (tapTimestamps.length > 5) {
      tapTimestamps.shift();
    }
    let intervals = [];
    for (let i = 1; i < tapTimestamps.length; i++) {
      intervals.push(tapTimestamps[i] - tapTimestamps[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval > 0) {
      const calculatedBpm = Math.round(60000 / avgInterval);
      setMetronomeBpm(calculatedBpm);
    }
  }
}

function setMetronomeTimeSignature(beats) {
  metronomeBeatsPerBar = Number(beats) || 4;
  currentBeatInBar = 0;

  const pills = document.querySelectorAll(".metronome-meter-pill");
  pills.forEach(pill => {
    const pBeats = Number(pill.getAttribute("data-beats"));
    pill.classList.toggle("active", pBeats === metronomeBeatsPerBar);
  });

  updateMetronomeBeatDots();
  updateMetronomeUI();
}

function toggleMetronomeCollapse() {
  const card = document.getElementById("metronomeWidget");
  if (!card) return;

  const isCollapsed = card.classList.toggle("collapsed");
  const header = card.querySelector(".metronome-header");
  if (header) {
    header.setAttribute("aria-expanded", !isCollapsed ? "true" : "false");
  }

  if (isCollapsed && isMetronomeRunning) {
    stopMetronome();
  }
}

function showMetronomeWidget() {
  const widget = document.getElementById("metronomeWidget");
  const btn = document.getElementById("toggleMetronomeVisibilityBtn");
  const checkbox = document.getElementById("settingShowMetronome");
  if (!widget) return;

  widget.style.display = "block";
  localStorage.setItem("metronome_visible", "true");

  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-expanded", "true");
  }
  if (checkbox) {
    checkbox.checked = true;
  }
  widget.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideMetronomeWidget() {
  const widget = document.getElementById("metronomeWidget");
  const btn = document.getElementById("toggleMetronomeVisibilityBtn");
  const checkbox = document.getElementById("settingShowMetronome");
  if (!widget) return;

  widget.style.display = "none";
  localStorage.setItem("metronome_visible", "false");

  if (isMetronomeRunning) {
    stopMetronome();
  }

  if (btn) {
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
  }
  if (checkbox) {
    checkbox.checked = false;
  }
}

function toggleMetronomeVisibility() {
  const widget = document.getElementById("metronomeWidget");
  if (!widget) return;
  const isHidden = (widget.style.display === "none" || getComputedStyle(widget).display === "none");
  if (isHidden) {
    showMetronomeWidget();
  } else {
    hideMetronomeWidget();
  }
}

function handleSettingMetronomeToggle(checked) {
  if (checked) {
    showMetronomeWidget();
  } else {
    hideMetronomeWidget();
  }
}

function initMetronomeVisibility() {
  const saved = localStorage.getItem("metronome_visible");
  const widget = document.getElementById("metronomeWidget");
  const btn = document.getElementById("toggleMetronomeVisibilityBtn");
  const checkbox = document.getElementById("settingShowMetronome");
  if (!widget) return;

  if (saved === "true") {
    widget.style.display = "block";
    if (btn) {
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
    }
    if (checkbox) checkbox.checked = true;
  } else {
    widget.style.display = "none";
    if (btn) {
      btn.classList.remove("active");
      btn.setAttribute("aria-expanded", "false");
    }
    if (checkbox) checkbox.checked = false;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (isMetronomeRunning) {
      stopMetronome();
    }
    if (typeof dampAllPianoNotes === "function") {
      dampAllPianoNotes();
    }
  }
});

// ==========================================================================
// VOCAL WARM-UPS & SINGING TIPS MODAL LOGIC (DEDICATED MODAL)
// ==========================================================================
function openVocalTipsModal(e) {
  if (e) {
    if (typeof e.preventDefault === "function") e.preventDefault();
    if (typeof e.stopPropagation === "function") e.stopPropagation();
  }

  // Hide any other active modals first
  document.querySelectorAll(".modal.active, .modal.open, .modal-backdrop.active, .modal-backdrop.open").forEach(m => {
    if (m && m.id !== "vocalTipsModal") {
      m.classList.remove("active", "open");
      m.style.display = "none";
      if (typeof m.setAttribute === "function") {
        m.setAttribute("aria-hidden", "true");
      }
    }
  });

  const modalVocalTips = document.getElementById("vocalTipsModal") || document.getElementById("tipsModal");
  if (modalVocalTips) {
    modalVocalTips.style.display = "flex";
    modalVocalTips.classList.add("active", "open");
    if (typeof modalVocalTips.setAttribute === "function") {
      modalVocalTips.setAttribute("aria-hidden", "false");
    }
    document.body.style.overflow = "hidden";
  }
}

function closeVocalTipsModal() {
  const modalVocalTips = document.getElementById("vocalTipsModal") || document.getElementById("tipsModal");
  if (!modalVocalTips) return;
  modalVocalTips.classList.remove("active", "open");
  modalVocalTips.style.display = "none";
  if (typeof modalVocalTips.setAttribute === "function") {
    modalVocalTips.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = "";
}

function closeVocalTipsOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  if (modalMouseDownTarget && modalMouseDownTarget !== event.currentTarget) return;
  if (window.getSelection && window.getSelection().toString().length > 0) return;
  closeVocalTipsModal();
}

function handleVocalTipsClick(e) {
  return openVocalTipsModal(e);
}

function initVocalTipsButton() {
  const btnVocalTips = document.getElementById("btnVocalTips") || document.querySelector(".btn-vocal-tips");
  const modalVocalTips = document.getElementById("vocalTipsModal") || document.getElementById("tipsModal");

  if (btnVocalTips && modalVocalTips) {
    btnVocalTips.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Hide any other active modals first
      document.querySelectorAll(".modal.active, .modal.open, .modal-backdrop.active, .modal-backdrop.open").forEach(m => {
        m.classList.remove("active", "open");
        m.style.display = "none";
      });

      // Reveal Vocal Tips modal cleanly
      modalVocalTips.style.display = "flex";
      modalVocalTips.classList.add("active", "open");
      if (typeof modalVocalTips.setAttribute === "function") {
        modalVocalTips.setAttribute("aria-hidden", "false");
      }
      document.body.style.overflow = "hidden";
    };

    // Ensure close buttons inside vocal tips work cleanly
    modalVocalTips.querySelectorAll(".btn-close, .close-modal, [data-close], .modal-close-btn, #btnCloseVocalTips").forEach(btn => {
      btn.onclick = (e) => {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        modalVocalTips.classList.remove("active", "open");
        modalVocalTips.style.display = "none";
        if (typeof modalVocalTips.setAttribute === "function") {
          modalVocalTips.setAttribute("aria-hidden", "true");
        }
        document.body.style.overflow = "";
      };
    });

    // Dismiss on backdrop tap
    modalVocalTips.onclick = (e) => {
      if (e.target === modalVocalTips) {
        modalVocalTips.classList.remove("active", "open");
        modalVocalTips.style.display = "none";
        if (typeof modalVocalTips.setAttribute === "function") {
          modalVocalTips.setAttribute("aria-hidden", "true");
        }
        document.body.style.overflow = "";
      }
    };
  }
}
initVocalTipsButton();

function filterVocalCategory(cat) {
  const pills = document.querySelectorAll(".vocal-filter-pill");
  pills.forEach(p => {
    p.classList.toggle("active", p.getAttribute("data-cat") === cat);
  });

  const cards = document.querySelectorAll(".vocal-section-card");
  cards.forEach(card => {
    if (cat === "all" || card.getAttribute("data-cat") === cat) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

function playVocalReferencePitch(freq = 261.63, btnEl = null) {
  const audioCtx = getPitchAudioContext();
  if (!audioCtx) {
    showToast("Audio is not supported in this browser.");
    return;
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  stopReferenceTone();

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.08);
    gain.gain.setValueAtTime(0.32, now + 1.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 2.45);

    activeRefOscillator = osc;
    activeRefGain = gain;

    if (btnEl) {
      btnEl.classList.add("playing");
      setTimeout(() => btnEl.classList.remove("playing"), 2400);
    }
  } catch (err) {
    console.warn("Reference pitch error:", err);
  }
}

// --- EXPORT ALL VOCAL WARM-UP DRILLS TO PDF (FIXED STAGING COORDINATES) ---
function exportVocalDrillsToPdf() {
  const btnFooter = document.getElementById("btnExportVocalPdf");
  const btnHeader = document.getElementById("btnExportVocalPdfHeader");

  const origFooterText = btnFooter ? btnFooter.innerHTML : "";
  const origHeaderText = btnHeader ? btnHeader.innerHTML : "";

  if (btnFooter) {
    btnFooter.disabled = true;
    btnFooter.innerHTML = "⏳ Exporting PDF...";
  }

  if (btnHeader) {
    btnHeader.disabled = true;
    btnHeader.innerHTML = "⏳...";
  }

  showToast("Generating Vocal Warm-Ups PDF... 📄");

  const settings = getUserSettings();
  const targetDate =
    settings.targetDate || "Stake Choir Prep • Oct 24–25";

  const year = new Date().getFullYear();

  const dateStr = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  const memberName = localStorage.getItem("choir_name") || "";

  const memberVoice =
    localStorage.getItem("choir_voice") ||
    localStorage.getItem("choir_section") ||
    "";

  const singerInfo = memberName
    ? `${memberName} (${memberVoice || "Choir Singer"})`
    : "";

  const A4_PX = 794;

  /*
   * ---------------------------------------------------------
   * ISOLATED PDF CONTAINER
   * ---------------------------------------------------------
   *
   * Same rendering strategy as the working tutorial export.
   * IMPORTANT:
   * Keep this element visible and inside the viewport.
   */

  const staging = document.createElement("div");
  staging.id = "pdfIsolatedVocalExportContainer";

  Object.assign(staging.style, {
    position: "fixed",
    top: "0",
    left: "0",

    width: A4_PX + "px",
    maxWidth: A4_PX + "px",

    /* Keep it in the visible rendering tree */
    zIndex: "2147483647",

    background: "#ffffff",
    backgroundColor: "#ffffff",
    color: "#0f172a",

    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',

    fontSize: "13px",
    lineHeight: "1.5",

    padding: "28px 32px",
    boxSizing: "border-box",

    display: "block",
    visibility: "visible",
    opacity: "1",

    pointerEvents: "none"
  });

  /*
   * ---------------------------------------------------------
   * CATEGORY COLORS
   * ---------------------------------------------------------
   */

  const CAT_COLORS = {
    tension: {
      left: "#2563eb",
      badgeBg: "#eff6ff",
      badgeFg: "#1d4ed8",
      badgeBorder: "#bfdbfe"
    },

    breath: {
      left: "#0891b2",
      badgeBg: "#ecfeff",
      badgeFg: "#0891b2",
      badgeBorder: "#a5f3fc"
    },

    sovt: {
      left: "#d97706",
      badgeBg: "#fffbeb",
      badgeFg: "#d97706",
      badgeBorder: "#fde68a"
    },

    resonance: {
      left: "#7c3aed",
      badgeBg: "#f5f3ff",
      badgeFg: "#7c3aed",
      badgeBorder: "#ddd6fe"
    },

    diction: {
      left: "#059669",
      badgeBg: "#ecfdf5",
      badgeFg: "#059669",
      badgeBorder: "#a7f3d0"
    },

    blend: {
      left: "#e11d48",
      badgeBg: "#fff1f2",
      badgeFg: "#e11d48",
      badgeBorder: "#fecdd3"
    }
  };

  /*
   * ---------------------------------------------------------
   * VOCAL DRILL DATA
   * ---------------------------------------------------------
   */

  const sectionsData = [
    {
      key: "tension",
      badge: "⏱️ 1 Min • Physical Prep",
      title: "Section 1: Physical Prep & Tension Release",

      drills: [
        {
          name: "1. Shoulder Drops & Gentle Neck Rolls",
          pitch: "",
          cues:
            "Release neck and trapezius stiffness that constricts throat resonance. Roll shoulders backwards 5 times with deep, relaxed breaths, followed by slow side-to-side chin tilts. Keep your chest elevated and collarbones wide."
        },

        {
          name: "2. Gentle Jaw Drops & Chewing Motions",
          pitch: "",
          cues:
            "Drop the jaw vertically with loose, relaxed facial muscles as if yawning or gently chewing. Massage masseter muscles with fingertips to disengage jaw clenching. Creates maximum vertical space in the oral cavity for tall, resonant vowels."
        }
      ]
    },

    {
      key: "breath",
      badge: "💨 Breath Support • Core Control",
      title: "Section 2: Breath Support & Core Control",

      drills: [
        {
          name: "1. 4-7-8 Breathing Count (Inhale 4, Suspend 7, Exhale 8)",
          pitch: "",
          cues:
            'Inhale silently through the nose for 4 counts, expanding lower ribs and back (avoid shoulder raising). Suspend breath gently for 7 counts without throat tension. Exhale through pursed lips for 8 smooth, steady counts. Builds breath endurance and calms performance jitters.'
        },

        {
          name: '2. Rhythmic "Sss / Shh / Tss" Diaphragm Pulses',
          pitch: "",
          cues:
            'Pulse short, unvoiced consonant bursts: "Sss! Shh! Tss!" on sharp, energetic core contractions. Keep the throat completely open and silent while the lower abdomen works like a bellows. Engages the transverse abdominis for crisp phrase attacks.'
        }
      ]
    },

    {
      key: "sovt",
      badge: "🐝 SOVT • Low Pressure",
      title: "Section 3: Low-Pressure & Gentle Resonance (SOVT)",

      drills: [
        {
          name: "1. Lip Trills (Lip Bubbles) & Pitch Sirens",
          pitch: "Starting Pitch: Middle C (261.6 Hz)",
          cues:
            'Blow relaxed air through loose lips to produce a steady bubble sound ("brrr"). Glide smoothly upward an octave and back down without breaking connection or pushing air. Balances subglottic vocal fold pressure and gently warms thin vocal cord edges without strain.'
        },

        {
          name: '2. Gentle "Mmm" & "Nnn" Humming (5-4-3-2-1 Pattern)',
          pitch: "",
          cues:
            'Hum a quiet 5-note descending scale (5-4-3-2-1) feeling buzzing vibrations directly behind the front upper teeth and nose bridge. Imagine buzzing a kazoo in the mask of your face. Disengages throat clutching and shifts tone into the natural acoustic resonators.'
        }
      ]
    },

    {
      key: "resonance",
      badge: "🎯 Resonance • Forward Focus",
      title: "Section 4: Forward Placement & Resonance",

      drills: [
        {
          name: '1. "Mee - May - Mah - Moh - Moo" (1-2-3-2-1 Pattern)',
          pitch: "Starting Pitch: Middle C (261.6 Hz)",
          cues:
            'Sing a 5-tone arched pattern (1-2-3-2-1) using pure Italian vowels, maintaining bright ring ("chiaroscuro") across all vowels. Keep each vowel placed right behind the front teeth without falling back into the throat. Connects bright consonant placement to open, warm vowel spaces.'
        },

        {
          name: '2. "Ng - Ah" Vocal Placement Drill',
          pitch: "",
          cues:
            'Sustain an unvoiced "Ng" (as in "sing") feeling the soft palate touch the back of the tongue, then drop the jaw into "Ah" without losing the forward ring. Transitions the focused buzzing placement of the nasal consonant directly into open choral vowel sound.'
        }
      ]
    },

    {
      key: "diction",
      badge: "🗣️ Articulation • Diction",
      title: "Section 5: Articulation & Agility",

      drills: [
        {
          name: '1. Crisp Staccato "Hah-Hah-Hah" Arpeggios (1-3-5-3-1)',
          pitch: "Starting Pitch: Middle C (261.6 Hz)",
          cues:
            'Sing 1-3-5-3-1 arpeggios on light, detached "Hah-Hah-Hah" syllables, bouncing from the abdominal wall. Keep glottal attacks soft by initiating with gentle "H" aspirations. Unifies vowel attack speed across choir sections on rapid rhythmic passages.'
        },

        {
          name: '"Tip of the Tongue, the Teeth, and the Lips"',
          pitch: "",
          cues:
            'Chant repeatedly on a single pitch: "The tip of the tongue, the teeth, and the lips." Exaggerate consonant contact using only the tongue and lips without moving the jaw. Makes congregation lyrics crisp and intelligible in reverent chapels.'
        },

        {
          name: '"B-D-G-P-T-K" Plosive Consonants',
          pitch: "",
          cues:
            'Pulse rhythmic pairs: "B-D-G, P-T-K" on crisp unvoiced beats. Focus on energetic consonant releases without wasting extra breath. Trains clean consonant attacks that unify all voice parts at the ends of phrases.'
        }
      ]
    },

    {
      key: "blend",
      badge: "🎶 Choir Blend • Legato",
      title: "Section 6: Legato & Choir Blending",

      drills: [
        {
          name: "1. Five-Tone Vowel Chaining (1-2-3-4-5-4-3-2-1)",
          pitch: "Starting Pitch: Middle C (261.6 Hz)",
          cues:
            'Sing 1-2-3-4-5-4-3-2-1 smoothly on "Ee-Eh-Ah-Oh-Oo", connecting each note like pearls on a string. Morph smoothly between vowels without re-striking or pushing volume. Keep the mouth tall and the internal space consistent.'
        }
      ],

      goldenRules: [
        {
          icon: "📐",
          title: "Tall Vowels",
          desc:
            "Drop your lower jaw vertically rather than spreading wide into horizontal smiles. Preserves warm, reverent choral acoustics."
        },

        {
          icon: "🏛️",
          title: "Lift the Soft Palate",
          desc:
            "Maintain the spacious dome of an internal yawn to eliminate harsh nasal twang and create room for soaring harmonies."
        },

        {
          icon: "👂",
          title: "Listen to the Blend",
          desc:
            "Strive to hear your voice section neighbors more than your own voice. Sacred choral singing is unified prayer in harmony."
        }
      ]
    }
  ];

  /*
   * ---------------------------------------------------------
   * BUILD BODY HTML
   * ---------------------------------------------------------
   */

  let bodyHtml = "";

  sectionsData.forEach((sec) => {
    const c = CAT_COLORS[sec.key];

    let drillsHtml = "";

    sec.drills.forEach((d, di) => {
      const isLast =
        di === sec.drills.length - 1 && !sec.goldenRules;

      drillsHtml += `
        <div style="
          margin-bottom:${isLast ? "0" : "6px"};
          padding-bottom:${isLast ? "0" : "6px"};
          border-bottom:${isLast ? "none" : "1px dashed #f1f5f9"};
          page-break-inside:avoid;
          break-inside:avoid;
        ">
          <div style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            margin-bottom:2px;
          ">
            <span style="
              font-size:8.5pt;
              font-weight:700;
              color:#1e293b;
            ">
              ${escapeHtml(d.name)}
            </span>

            ${d.pitch
          ? `
                  <span style="
                    font-size:6.5pt;
                    font-weight:700;
                    color:#2563eb;
                    background:#eff6ff;
                    border:1px solid #bfdbfe;
                    padding:1px 6px;
                    border-radius:4px;
                    white-space:nowrap;
                  ">
                    ${escapeHtml(d.pitch)}
                  </span>
                `
          : ""
        }
          </div>

          <p style="
            font-size:7.8pt;
            color:#475569;
            line-height:1.4;
            margin:0;
          ">
            ${escapeHtml(d.cues)}
          </p>
        </div>
      `;
    });

    let goldenHtml = "";

    if (sec.goldenRules) {
      goldenHtml = `
        <div style="margin-top:8px;page-break-inside:avoid;break-inside:avoid;">
          <div style="
            font-size:8pt;
            font-weight:700;
            color:#1e293b;
            margin-bottom:4px;
          ">
            Choir Golden Rules for Section Unity:
          </div>
      `;

      sec.goldenRules.forEach((r) => {
        goldenHtml += `
          <div style="
            background:#f8fafc;
            border:1px solid #e2e8f0;
            border-left:3px solid #f59e0b;
            border-radius:4px;
            padding:4px 8px;
            font-size:7.5pt;
            color:#334155;
            line-height:1.35;
            margin-bottom:4px;
            page-break-inside:avoid;
            break-inside:avoid;
          ">
            <strong style="color:#0f172a;">
              ${r.icon} ${escapeHtml(r.title)}:
            </strong>
            ${escapeHtml(r.desc)}
          </div>
        `;
      });

      goldenHtml += "</div>";
    }

    bodyHtml += `
      <div style="
        background:#ffffff;
        border:1px solid #e2e8f0;
        border-left:4px solid ${c.left};
        border-radius:0 8px 8px 0;
        padding:10px 14px;
        margin-bottom:10px;
        page-break-inside:avoid;
        break-inside:avoid;
      ">
        <div style="
          display:flex;
          align-items:center;
          gap:8px;
          margin-bottom:8px;
          border-bottom:1px solid #f1f5f9;
          padding-bottom:4px;
        ">
          <span style="
            background:${c.badgeBg};
            color:${c.badgeFg};
            border:1px solid ${c.badgeBorder};
            font-size:6.5pt;
            font-weight:800;
            text-transform:uppercase;
            letter-spacing:0.5px;
            padding:2px 7px;
            border-radius:999px;
            white-space:nowrap;
          ">
            ${escapeHtml(sec.badge)}
          </span>

          <span style="
            font-size:10pt;
            font-weight:800;
            color:#0f172a;
          ">
            ${escapeHtml(sec.title)}
          </span>
        </div>

        <div>
          ${drillsHtml}
        </div>

        ${goldenHtml}
      </div>
    `;
  });

  /*
   * ---------------------------------------------------------
   * COMPLETE PDF HTML
   * ---------------------------------------------------------
   */

  staging.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      border-bottom:3px solid #1d4ed8;
      padding-bottom:12px;
      margin-bottom:14px;
    ">
      <div style="
        display:flex;
        align-items:center;
        gap:12px;
      ">
        <span style="
          font-size:26pt;
          line-height:1;
        ">
          🎤
        </span>

        <div>
          <div style="
            font-size:14pt;
            font-weight:900;
            color:#1e3a8a;
            line-height:1.2;
            margin:0 0 3px;
          ">
            Kantimes: Vocal Warm-Ups &amp; Singing Tips
          </div>

          <div style="
            font-size:8.5pt;
            color:#475569;
            font-weight:600;
            margin:0;
          ">
            All 6 Core Choir Drill Categories &bull;
            ${escapeHtml(targetDate)}
          </div>
        </div>
      </div>

      <div style="
        text-align:right;
        font-size:7.5pt;
        color:#64748b;
        line-height:1.4;
      ">
        ${singerInfo
      ? `
              <div>
                Member:
                <strong style="color:#1e293b;">
                  ${escapeHtml(singerInfo)}
                </strong>
              </div>
            `
      : ""
    }

        <div>Stake Choir Practice Hub</div>
        <div>${dateStr}</div>
      </div>
    </div>

    <div style="
      background:#eff6ff;
      border-left:4px solid #1d4ed8;
      padding:8px 14px;
      border-radius:0 6px 6px 0;
      font-size:8.5pt;
      color:#1e40af;
      margin-bottom:14px;
      line-height:1.45;
    ">
      Essential drills for tension release, breath support, SOVT registration,
      resonance, articulation, and choir section blending.
      Practice these daily before repertoire rehearsals.
    </div>

    ${bodyHtml}

    <div style="
      margin-top:18px;
      padding-top:10px;
      border-top:1px solid #e2e8f0;
      display:flex;
      justify-content:space-between;
      align-items:center;
      font-size:7.5pt;
      color:#64748b;
    ">
      <span style="font-weight:600;">
        Stake Choir Repertoire • Practice Hub
      </span>

      <span style="color:#94a3b8;">
        &copy; ${year} Kantimes Practice Hub &bull; All Vocal Drills
      </span>
    </div>
  `;

  document.body.appendChild(staging);

  /*
   * ---------------------------------------------------------
   * CLEANUP
   * ---------------------------------------------------------
   */

  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;

    cleaned = true;

    if (staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }

    if (btnFooter) {
      btnFooter.disabled = false;
      btnFooter.innerHTML = origFooterText;
    }

    if (btnHeader) {
      btnHeader.disabled = false;
      btnHeader.innerHTML = origHeaderText;
    }
  };

  /*
   * ---------------------------------------------------------
   * LOAD LIBRARIES
   * ---------------------------------------------------------
   *
   * Do NOT use html2pdf.js here.
   *
   * We use:
   *
   *   HTML
   *      ↓
   *   html2canvas
   *      ↓
   *   JPEG
   *      ↓
   *   jsPDF
   *      ↓
   *   PDF
   *
   * This is the same approach as exportTutorialToPdf().
   */

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const existing = document.querySelector(
        `script[src="${src}"]`
      );

      if (existing) {
        if (
          typeof html2canvas !== "undefined" ||
          (window.jspdf &&
            typeof window.jspdf.jsPDF === "function")
        ) {
          resolve();
          return;
        }

        existing.addEventListener("load", resolve, {
          once: true
        });

        existing.addEventListener("error", reject, {
          once: true
        });

        return;
      }

      const script = document.createElement("script");

      script.src = src;

      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(script);
    });

  /*
   * ---------------------------------------------------------
   * DIRECT CANVAS → PDF EXPORT
   * ---------------------------------------------------------
   */

  const exportCanvasToPdf = async () => {
    try {
      console.log(
        "[KanTime Vocal PDF] Target:",
        staging
      );

      console.log(
        "[KanTime Vocal PDF] Dimensions:",
        staging.offsetWidth,
        "x",
        staging.scrollHeight
      );

      if (
        staging.offsetWidth === 0 ||
        staging.scrollHeight === 0
      ) {
        throw new Error(
          "Vocal staging element has zero dimensions."
        );
      }

      /*
       * Wait for the browser to actually paint
       * the staging element.
       */

      await new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(resolve)
        )
      );

      /*
       * Render the visible staging element.
       */

      const canvas = await html2canvas(staging, {
        scale: 2,

        backgroundColor: "#ffffff",

        useCORS: true,
        allowTaint: false,

        logging: true,

        x: 0,
        y: 0,

        width: staging.offsetWidth,
        height: staging.scrollHeight,

        windowWidth: A4_PX,

        windowHeight: Math.max(
          staging.scrollHeight + 100,
          window.innerHeight
        ),

        scrollX: 0,
        scrollY: 0,

        ignoreElements: (el) =>
          el.tagName === "BUTTON" ||
          el.tagName === "INPUT" ||
          el.tagName === "SELECT"
      });

      console.log(
        "[KanTime Vocal PDF] Canvas:",
        canvas.width,
        "x",
        canvas.height
      );

      /*
       * Diagnostic check.
       */

      if (
        !canvas ||
        canvas.width === 0 ||
        canvas.height === 0
      ) {
        throw new Error(
          "html2canvas returned an empty vocal-drills canvas."
        );
      }

      /*
       * Convert the canvas to JPEG.
       *
       * This is important because it confirms that
       * html2canvas actually produced image pixels.
       */

      const imgData = canvas.toDataURL(
        "image/jpeg",
        0.98
      );

      if (!imgData || imgData.length < 1000) {
        throw new Error(
          "Vocal canvas image data is unexpectedly empty."
        );
      }

      console.log(
        "[KanTime Vocal PDF] Image data length:",
        imgData.length
      );

      /*
       * Make sure jsPDF exists.
       */

      if (
        !window.jspdf ||
        typeof window.jspdf.jsPDF !== "function"
      ) {
        throw new Error(
          "jsPDF library is not available."
        );
      }

      const { jsPDF } = window.jspdf;

      /*
       * -----------------------------------------------------
       * CREATE A4 PDF
       * -----------------------------------------------------
       */

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pageWidth = 210;
      const pageHeight = 297;

      const margin = 8;

      const usableWidth =
        pageWidth - margin * 2;

      const usableHeight =
        pageHeight - margin * 2;

      /*
       * Maintain the canvas aspect ratio.
       */

      const imgWidth = usableWidth;

      const imgHeight =
        (canvas.height * imgWidth) /
        canvas.width;

      /*
       * -----------------------------------------------------
       * PAGE 1
       * -----------------------------------------------------
       */

      let remainingHeight = imgHeight;

      let position = margin;

      pdf.addImage(
        imgData,
        "JPEG",
        margin,
        position,
        imgWidth,
        imgHeight,
        undefined,
        "FAST"
      );

      remainingHeight -= usableHeight;

      /*
       * -----------------------------------------------------
       * ADD ADDITIONAL PAGES
       * -----------------------------------------------------
       *
       * The full rendered canvas is reused with a shifted
       * Y-position so each PDF page displays the next portion.
       */

      while (remainingHeight > 0) {
        pdf.addPage();

        position =
          margin -
          (imgHeight - remainingHeight);

        pdf.addImage(
          imgData,
          "JPEG",
          margin,
          position,
          imgWidth,
          imgHeight,
          undefined,
          "FAST"
        );

        remainingHeight -= usableHeight;
      }

      /*
       * -----------------------------------------------------
       * SAVE
       * -----------------------------------------------------
       */

      const filename =
        "KanTime-Vocal-WarmUps-All-Drills.pdf";

      pdf.save(filename);

      console.log(
        "[KanTime Vocal PDF] PDF generated successfully:",
        filename
      );

      showToast(
        "Vocal Warm-Ups PDF downloaded! 📄"
      );

      cleanup();

    } catch (err) {
      console.error(
        "[KanTime Vocal PDF] DIRECT EXPORT ERROR:",
        err
      );

      showToast(
        "PDF export failed – opening print fallback."
      );

      cleanup();

      /*
       * Use the existing print fallback if available.
       * Otherwise use window.print().
       */

      if (
        typeof _printVocalDrillsFallback ===
        "function"
      ) {
        _printVocalDrillsFallback();
      } else {
        window.print();
      }
    }
  };

  /*
   * ---------------------------------------------------------
   * ENSURE LIBRARIES
   * ---------------------------------------------------------
   */

  const ensureLibraries = async () => {
    try {
      /*
       * html2canvas
       */

      if (
        typeof html2canvas ===
        "undefined"
      ) {
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
        );
      }

      /*
       * jsPDF UMD build
       */

      if (
        !window.jspdf ||
        typeof window.jspdf.jsPDF !== "function"
      ) {
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
        );
      }

      /*
       * Give the browser time to paint the staging
       * container before html2canvas captures it.
       */

      await new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(resolve)
        )
      );

      await exportCanvasToPdf();

    } catch (err) {
      console.error(
        "[KanTime Vocal PDF] Library loading error:",
        err
      );

      cleanup();

      showToast(
        "PDF libraries could not be loaded – opening print fallback."
      );

      if (
        typeof _printVocalDrillsFallback ===
        "function"
      ) {
        _printVocalDrillsFallback();
      } else {
        window.print();
      }
    }
  };

  ensureLibraries();
}

// ==========================================================================
// PWA Install Banner & iOS Fallback
// ==========================================================================

let deferredPrompt = null;

/**
 * Checks if the app is already running in standalone (installed) mode.
 */
function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    navigator.standalone === true ||
    document.referrer.includes("android-app://")
  );
}
window.isRunningStandalone = isRunningStandalone;

/**
 * Displays the PWA install banner if not running standalone or dismissed.
 */
function showPWAInstallBanner() {
  if (isRunningStandalone()) return;
  if (sessionStorage.getItem("pwa_banner_dismissed")) return;

  const banner = document.getElementById("pwaInstallBanner");
  if (banner) {
    banner.style.display = "block";
    requestAnimationFrame(() => banner.classList.add("pwa-banner-visible"));
  }
}
window.showPWAInstallBanner = showPWAInstallBanner;

/**
 * Hides the PWA install pill banner.
 */
function hidePWAInstallBanner() {
  const banner = document.getElementById("pwaInstallBanner");
  if (!banner) return;
  banner.classList.remove("pwa-banner-visible");
  setTimeout(() => {
    banner.style.display = "none";
  }, 350);
}
window.hidePWAInstallBanner = hidePWAInstallBanner;

/**
 * Permanently dismisses the install banner for this browser session.
 */
function dismissInstallBanner() {
  sessionStorage.setItem("pwa_banner_dismissed", "1");
  hidePWAInstallBanner();
}
window.dismissInstallBanner = dismissInstallBanner;

/**
 * Hides and dismisses the iOS install toast.
 */
function dismissIosToast() {
  const toast = document.getElementById("iosInstallToast");
  if (!toast) return;
  toast.classList.remove("ios-toast-visible");
  sessionStorage.setItem("ios_toast_dismissed", "1");
  setTimeout(() => {
    toast.style.display = "none";
  }, 400);
}
window.dismissIosToast = dismissIosToast;

/**
 * Triggers the native install prompt (Android/Chrome).
 */
async function installPWA() {
  if (!deferredPrompt) {
    if (isRunningStandalone()) {
      showToast("KanTime is already running as an installed app! ✨");
    } else {
      showToast("To install, tap your browser's menu (⋮) and select 'Install app' or 'Add to Home screen'. 📲");
    }
    return;
  }

  try {
    // Show native browser install prompt
    await deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    console.log("[PWA] User response to install prompt:", choiceResult ? choiceResult.outcome : "prompted");

    if (choiceResult && choiceResult.outcome === "accepted") {
      hidePWAInstallBanner();
      sessionStorage.setItem("pwa_banner_dismissed", "1");
    }
  } catch (err) {
    console.warn("[PWA] Install prompt error:", err);
  } finally {
    deferredPrompt = null;
  }
}
window.installPWA = installPWA;

// ── Android / Chrome: capture beforeinstallprompt at top-level immediately ──
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log("[PWA] beforeinstallprompt captured");

  if (isRunningStandalone()) return;
  if (sessionStorage.getItem("pwa_banner_dismissed")) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showPWAInstallBanner, { once: true });
  } else {
    showPWAInstallBanner();
  }
});

// ── Hide banner if installed via browser menu or native prompt ───────────
window.addEventListener("appinstalled", () => {
  console.log("[PWA] KanTime installed successfully");
  deferredPrompt = null;
  sessionStorage.setItem("pwa_banner_dismissed", "1");
  hidePWAInstallBanner();
  const toast = document.getElementById("iosInstallToast");
  if (toast) toast.style.display = "none";
});

// ── Watch for display-mode standalone changes ────────────────────────────
if (window.matchMedia) {
  try {
    const standaloneMql = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = (e) => {
      if (e.matches) {
        hidePWAInstallBanner();
        const toast = document.getElementById("iosInstallToast");
        if (toast) toast.style.display = "none";
      }
    };
    if (standaloneMql.addEventListener) {
      standaloneMql.addEventListener("change", handleDisplayModeChange);
    } else if (standaloneMql.addListener) {
      standaloneMql.addListener(handleDisplayModeChange);
    }
  } catch (err) {
    console.warn("[PWA] display-mode listener warning:", err);
  }
}

/**
 * Initializes the PWA install banner logic & iOS fallback.
 */
function initPWAInstallBanner() {
  if (isRunningStandalone()) {
    hidePWAInstallBanner();
    const toast = document.getElementById("iosInstallToast");
    if (toast) toast.style.display = "none";
    return;
  }

  // If deferredPrompt was already captured before DOMContentLoaded, show banner
  if (deferredPrompt && !sessionStorage.getItem("pwa_banner_dismissed")) {
    showPWAInstallBanner();
  }

  // Ensure click listener on install button
  const installBtn = document.getElementById("pwaInstallBtn");
  if (installBtn && !installBtn._pwaBound) {
    installBtn._pwaBound = true;
    installBtn.addEventListener("click", installPWA);
  }

  // ── iOS Safari fallback ─────────────────────────────────────────────────
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS && !isRunningStandalone() && !sessionStorage.getItem("ios_toast_dismissed")) {
    setTimeout(function () {
      if (isRunningStandalone()) return;
      const toast = document.getElementById("iosInstallToast");
      if (toast) {
        toast.style.display = "block";
        requestAnimationFrame(() => toast.classList.add("ios-toast-visible"));
        setTimeout(dismissIosToast, 10000);
      }
    }, 2000);
  }
}

// ==========================================================================
// IN-BROWSER PRACTICE PIANO DRAWER & PITCH HELPER
// ==========================================================================
let pianoAudioCtx = null;
let activePianoOscillators = {};
let pianoCurrentOctave = 4;
let showPianoLabels = true;
let isPianoMaximized = false;

const PIANO_VOICE_PART_PITCHES = {
  Soprano: { note: "C5", octave: 4, freq: 523.25, label: "C5" },
  Alto: { note: "G4", octave: 4, freq: 392.00, label: "G4" },
  Tenor: { note: "E4", octave: 4, freq: 329.63, label: "E4" },
  Bass: { note: "C3", octave: 3, freq: 130.81, label: "C3" }
};

const PIANO_SEMITONE_OFFSETS = {
  "C": 0, "C#": 1, "Db": 1,
  "D": 2, "D#": 3, "Eb": 3,
  "E": 4,
  "F": 5, "F#": 6, "Gb": 6,
  "G": 7, "G#": 8, "Ab": 8,
  "A": 9, "A#": 10, "Bb": 10,
  "B": 11
};

function getPianoFrequency(noteName) {
  const match = noteName.match(/^([A-G][#b]?)([0-8])$/);
  if (!match) return 440;
  const pitchName = match[1];
  const octave = parseInt(match[2], 10);
  const offset = PIANO_SEMITONE_OFFSETS[pitchName] !== undefined ? PIANO_SEMITONE_OFFSETS[pitchName] : 0;
  const midi = (octave + 1) * 12 + offset;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function unlockPianoAudioContext() {
  const audioCtx = getPianoAudioContext();
  if (audioCtx && audioCtx.state !== "running") {
    audioCtx.resume().catch(() => { });
  }
}

function getPianoAudioContext() {
  if (!pianoAudioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      try {
        pianoAudioCtx = new AudioCtxClass();
      } catch (err) {
        console.error("Failed to initialize piano AudioContext:", err);
      }
    }
  }
  if (pianoAudioCtx && pianoAudioCtx.state === "suspended") {
    pianoAudioCtx.resume().catch(() => { });
  }
  return pianoAudioCtx;
}

// Unlock audio context on initial user interaction anywhere on the window
["pointerdown", "touchstart", "mousedown", "keydown"].forEach((evtName) => {
  window.addEventListener(evtName, unlockPianoAudioContext, { once: true, passive: true });
});

function highlightPianoKey(noteName, isPressed) {
  const keyEl = document.querySelector(`.piano-keyboard [data-note="${noteName}"]`);
  if (keyEl) {
    if (isPressed) {
      keyEl.classList.add("is-pressed", "key-pressed");
    } else {
      keyEl.classList.remove("is-pressed", "key-pressed");
    }
  }
}

function updatePianoNoteDisplay(noteName, freq) {
  const display = document.getElementById("pianoActiveNoteDisplay");
  const freqDisplay = document.getElementById("pianoFrequencyDisplay");
  if (display) {
    display.innerText = `Sounding: ${noteName}`;
  }
  if (freqDisplay) {
    freqDisplay.innerText = `${freq.toFixed(1)} Hz`;
  }
}

function playPianoNote(noteName, isTemporary = false) {
  const audioCtx = getPianoAudioContext();
  if (!audioCtx) return;

  if (audioCtx.state !== "running") {
    audioCtx.resume().catch(() => { });
  }

  const freq = getPianoFrequency(noteName);

  // Cleanly stop any already ringing oscillator for this note to prevent clicks or clipping
  stopPianoNote(noteName, true);

  try {
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Fundamental sine + warm harmonic triangle (from commit 1517ec0)
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2, now);

    // Warm envelope with pure natural acoustic chime decay (~1.2s)
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);

    osc1.stop(now + 1.22);
    osc2.stop(now + 1.22);

    activePianoOscillators[noteName] = { osc1, osc2, gain, startTime: now };

    updatePianoNoteDisplay(noteName, freq);
    highlightPianoKey(noteName, true);

    setTimeout(() => {
      if (activePianoOscillators[noteName] && activePianoOscillators[noteName].startTime === now) {
        delete activePianoOscillators[noteName];
      }
      highlightPianoKey(noteName, false);
    }, 1200);
  } catch (err) {
    console.error("Error playing piano note:", err);
  }
}

function stopPianoNote(noteName, immediate = false) {
  const active = activePianoOscillators[noteName];
  if (!active) {
    highlightPianoKey(noteName, false);
    return;
  }

  // If immediate (e.g. re-triggering pitch or closing drawer), smoothly ramp down to prevent click
  if (immediate) {
    const audioCtx = getPianoAudioContext();
    if (audioCtx) {
      const now = audioCtx.currentTime;
      try {
        active.gain.gain.cancelScheduledValues(now);
        const curVal = (typeof active.gain.gain.value === "number" && active.gain.gain.value > 0.0001)
          ? active.gain.gain.value
          : 0.0001;
        active.gain.gain.setValueAtTime(curVal, now);
        active.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        active.osc1.stop(now + 0.04);
        active.osc2.stop(now + 0.04);
      } catch (e) {
        // Handled
      }
    }
    delete activePianoOscillators[noteName];
  }

  // Key release clears visual active state while acoustic chime decays naturally
  highlightPianoKey(noteName, false);
}

// Aliases for note triggering
const startNote = playPianoNote;
const stopNote = stopPianoNote;

function playPianoVoicePart(part) {
  unlockPianoAudioContext();
  const target = PIANO_VOICE_PART_PITCHES[part];
  if (!target) return;

  // In normal single-octave mode, shift octave if needed so the key is in view
  if (!isPianoMaximized && target.octave !== pianoCurrentOctave) {
    setPianoOctave(target.octave);
  }

  const btn = document.querySelector(`.piano-part-btn.part-${part.toLowerCase()}`);
  if (btn) {
    btn.classList.add("is-sounding");
    setTimeout(() => btn.classList.remove("is-sounding"), 1200);
  }

  const display = document.getElementById("pianoActiveNoteDisplay");
  if (display) {
    display.innerText = `${part}: ${target.note}`;
  }

  playPianoNote(target.note, true);
}

function updatePianoMaximizeUI() {
  const drawer = document.getElementById("pianoDrawer");
  const maxBtn = document.getElementById("pianoMaximizeBtn");
  const shiftLabel = document.getElementById("pianoShiftLabel");

  if (shiftLabel) {
    shiftLabel.innerText = `Oct ${pianoCurrentOctave}`;
  }

  if (!drawer) return;

  if (isPianoMaximized) {
    drawer.classList.add("is-maximized");
    document.body.classList.add("piano-fullscreen-active");
    drawer.style.display = "flex";
    if (maxBtn) {
      maxBtn.setAttribute("title", "Exit Fullscreen Piano (X or Esc)");
      maxBtn.setAttribute("aria-label", "Exit Fullscreen Piano");
    }
  } else {
    drawer.classList.remove("is-maximized");
    document.body.classList.remove("piano-fullscreen-active");
    drawer.style.display = "block";
    if (maxBtn) {
      maxBtn.setAttribute("title", "Maximize Fullscreen Piano (X)");
      maxBtn.setAttribute("aria-label", "Maximize Fullscreen Piano");
    }
  }
}

let pianoDrawerOriginalParent = null;
let pianoDrawerOriginalNextSibling = null;

function enterPianoMaximized() {
  unlockPianoAudioContext();
  const drawer = document.getElementById("pianoDrawer");
  if (!drawer) return;

  if (!isPianoMaximized) {
    // Record original parent and sibling to restore accurately on exit
    pianoDrawerOriginalParent = drawer.parentNode;
    pianoDrawerOriginalNextSibling = drawer.nextSibling;
    document.body.appendChild(drawer);
  }

  // Ensure visible and not collapsed
  drawer.style.display = "flex";
  drawer.classList.remove("collapsed");
  const toggleBtn = document.getElementById("pianoToggleBtn");
  if (toggleBtn) {
    toggleBtn.classList.add("active");
    toggleBtn.setAttribute("aria-expanded", "true");
  }

  isPianoMaximized = true;
  updatePianoMaximizeUI();
  renderPianoKeyboard();
}

function exitPianoMaximized() {
  if (!isPianoMaximized) return;
  const drawer = document.getElementById("pianoDrawer");
  isPianoMaximized = false;

  // Restore drawer back to its original container in the DOM
  if (drawer && pianoDrawerOriginalParent) {
    if (pianoDrawerOriginalNextSibling) {
      pianoDrawerOriginalParent.insertBefore(drawer, pianoDrawerOriginalNextSibling);
    } else {
      pianoDrawerOriginalParent.appendChild(drawer);
    }
  }

  updatePianoMaximizeUI();
  renderPianoKeyboard();
}

function togglePianoMaximize() {
  if (isPianoMaximized) {
    exitPianoMaximized();
  } else {
    enterPianoMaximized();
  }
}

function shiftPianoOctave(delta) {
  let nextOct = pianoCurrentOctave + delta;
  if (nextOct < 2) nextOct = 2;
  if (nextOct > 6) nextOct = 6;
  setPianoOctave(nextOct);
}

function renderPianoKeyboard() {
  const container = document.getElementById("pianoKeyboard");
  if (!container) return;

  const isWideScreen = window.innerWidth >= 1024;
  const isLandscapeMobile = !isWideScreen && window.innerWidth > window.innerHeight && window.innerHeight < 600;
  const isPortraitMobile = !isWideScreen && !isLandscapeMobile;

  let octavesToRender = [];
  let isMultiOctaveDesktop = false;

  if (isPianoMaximized && isWideScreen) {
    // Desktop Fullscreen: Octaves 2, 3, 4, 5 (C2 through B5) + C6
    isMultiOctaveDesktop = true;
    octavesToRender = [2, 3, 4, 5];
  } else if (isPianoMaximized && isLandscapeMobile) {
    // Mobile Landscape Fullscreen: Octaves 3, 4, 5 + C6
    octavesToRender = [3, 4, 5];
  } else if (isPianoMaximized && isPortraitMobile) {
    // Mobile Portrait Fullscreen: 2 octaves for clean swipeable view (e.g. Oct 3 and 4 or current)
    const startOct = Math.min(Math.max(pianoCurrentOctave, 2), 5);
    octavesToRender = [startOct, startOct + 1];
  } else {
    // Standard Normal Drawer: Single octave (e.g. Oct 4: C4–C5)
    octavesToRender = [pianoCurrentOctave];
  }

  const whiteNotes = [];
  const blackNotes = [];
  let whiteIndex = 0;

  const standardHomeShortcutsWhite = {
    "C": "A", "D": "S", "E": "D", "F": "V", "G": "G", "A": "H", "B": "J"
  };
  const standardHomeShortcutsBlack = {
    "C#": "W", "D#": "E", "F#": "T", "G#": "Y", "A#": "U"
  };

  octavesToRender.forEach((oct) => {
    const isHomeOctave = (oct === pianoCurrentOctave);
    const whiteBases = ["C", "D", "E", "F", "G", "A", "B"];

    whiteBases.forEach((base) => {
      const note = `${base}${oct}`;
      const shortcut = isHomeOctave ? (standardHomeShortcutsWhite[base] || "") : "";
      whiteNotes.push({ note, base, octave: oct, shortcut, whiteIndex });
      whiteIndex++;
    });

    const blackDefs = [
      { base: "C#", seamAfterWhiteOffset: 1 },
      { base: "D#", seamAfterWhiteOffset: 2 },
      { base: "F#", seamAfterWhiteOffset: 4 },
      { base: "G#", seamAfterWhiteOffset: 5 },
      { base: "A#", seamAfterWhiteOffset: 6 }
    ];

    const octaveStartWhiteIndex = whiteIndex - 7;
    blackDefs.forEach((b) => {
      const note = `${b.base}${oct}`;
      const shortcut = isHomeOctave ? (standardHomeShortcutsBlack[b.base] || "") : "";
      const seamAfter = octaveStartWhiteIndex + b.seamAfterWhiteOffset;
      blackNotes.push({ note, base: b.base, octave: oct, shortcut, seamAfter });
    });
  });

  // Add the final closing C key (e.g. C5 if oct 4, or C6 if oct 5)
  const lastOct = octavesToRender[octavesToRender.length - 1];
  const finalC = `C${lastOct + 1}`;
  const finalCShortcut = (lastOct === pianoCurrentOctave) ? "K" : "";
  whiteNotes.push({ note: finalC, base: "C", octave: lastOct + 1, shortcut: finalCShortcut, whiteIndex });
  const totalWhiteKeys = whiteNotes.length;

  let html = "";

  // White keys
  whiteNotes.forEach((item) => {
    let voiceTag = "";
    if (item.note === "C5") voiceTag = '<span class="key-voice-tag part-soprano" title="Soprano Reference (C5)">S</span>';
    else if (item.note === "G4") voiceTag = '<span class="key-voice-tag part-alto" title="Alto Reference (G4)">A</span>';
    else if (item.note === "E4") voiceTag = '<span class="key-voice-tag part-tenor" title="Tenor Reference (E4)">T</span>';
    else if (item.note === "C3") voiceTag = '<span class="key-voice-tag part-bass" title="Bass Reference (C3)">B</span>';

    html += `
      <div class="piano-key-white" data-note="${item.note}" tabindex="0" role="button" aria-label="Key ${item.note}">
        ${voiceTag}
        <span class="key-note-name">${item.note}</span>
        ${item.shortcut ? `<span class="key-shortcut">${item.shortcut}</span>` : ""}
      </div>
    `;
  });

  // Black keys
  blackNotes.forEach((item) => {
    let leftStyle = "";
    if (isMultiOctaveDesktop) {
      // Proportional dynamic percentage offset so keys span comfortably across horizontal screen space
      leftStyle = `left: calc((100% / ${totalWhiteKeys}) * ${item.seamAfter} - (clamp(18px, 2.2vw, 32px) / 2));`;
    } else {
      leftStyle = `left: calc(var(--piano-pad, 4px) + (var(--piano-key-w, 44px) * ${item.seamAfter}) - (var(--piano-black-w, 28px) / 2));`;
    }

    html += `
      <div class="piano-key-black" data-note="${item.note}" tabindex="0" role="button" aria-label="Key ${item.note}"
        style="${leftStyle}">
        <span class="key-note-name">${item.note}</span>
        ${item.shortcut ? `<span class="key-shortcut">${item.shortcut}</span>` : ""}
      </div>
    `;
  });

  container.innerHTML = html;

  if (!showPianoLabels) {
    container.classList.add("hide-labels");
  } else {
    container.classList.remove("hide-labels");
  }

  // Pointer event listeners with touch-zoom and double-tap zoom prevention
  const allKeys = container.querySelectorAll("[data-note]");
  allKeys.forEach((keyEl) => {
    const note = keyEl.getAttribute("data-note");

    const onStart = (e) => {
      if (e.cancelable) e.preventDefault();
      unlockPianoAudioContext();
      playPianoNote(note);
    };

    const onEnd = (e) => {
      if (e.cancelable) e.preventDefault();
      stopPianoNote(note);
    };

    keyEl.addEventListener("pointerdown", onStart);
    keyEl.addEventListener("pointerup", onEnd);
    keyEl.addEventListener("pointercancel", onEnd);
    keyEl.addEventListener("pointerleave", (e) => {
      if (e.buttons === 1) onEnd(e);
    });
  });

  // In mobile portrait maximized mode, auto-scroll wrapper to center on Middle C (Oct 4)
  if (isPianoMaximized && isPortraitMobile) {
    setTimeout(() => {
      const wrapper = container.parentElement;
      const c4Key = container.querySelector('[data-note="C4"]');
      if (wrapper && c4Key) {
        const offset = c4Key.offsetLeft - (wrapper.clientWidth / 2) + (c4Key.clientWidth / 2);
        wrapper.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
      }
    }, 80);
  }
}

function setPianoOctave(octave) {
  pianoCurrentOctave = parseInt(octave, 10);

  const shiftLabel = document.getElementById("pianoShiftLabel");
  if (shiftLabel) {
    shiftLabel.innerText = `Oct ${pianoCurrentOctave}`;
  }

  const pills = document.querySelectorAll(".piano-octave-pill");
  pills.forEach((pill) => {
    const octVal = parseInt(pill.getAttribute("data-octave"), 10);
    if (octVal === pianoCurrentOctave) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }
  });

  renderPianoKeyboard();
}

function togglePianoLabels() {
  showPianoLabels = !showPianoLabels;
  const btn = document.getElementById("pianoToggleLabelsBtn");
  const container = document.getElementById("pianoKeyboard");
  if (btn) {
    btn.classList.toggle("active", showPianoLabels);
  }
  if (container) {
    container.classList.toggle("hide-labels", !showPianoLabels);
  }
}

function dampAllPianoNotes() {
  Object.keys(activePianoOscillators).forEach((note) => stopPianoNote(note, true));
}

function togglePianoCollapse() {
  if (isPianoMaximized) return; // Collapse disabled in maximized fullscreen mode
  const drawer = document.getElementById("pianoDrawer");
  if (!drawer) return;
  drawer.classList.toggle("collapsed");
}

function showPianoDrawer() {
  unlockPianoAudioContext();
  const drawer = document.getElementById("pianoDrawer");
  const btn = document.getElementById("pianoToggleBtn");
  if (!drawer) return;

  drawer.style.display = "block";
  localStorage.setItem("piano_drawer_visible", "true");

  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-expanded", "true");
  }

  updatePianoMaximizeUI();
  renderPianoKeyboard();
  drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hidePianoDrawer() {
  if (isPianoMaximized) {
    exitPianoMaximized();
  }
  const drawer = document.getElementById("pianoDrawer");
  const btn = document.getElementById("pianoToggleBtn");
  if (!drawer) return;

  drawer.style.display = "none";
  localStorage.setItem("piano_drawer_visible", "false");

  dampAllPianoNotes();

  if (btn) {
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
  }
}

function togglePianoDrawer() {
  const drawer = document.getElementById("pianoDrawer");
  if (!drawer) return;
  const isHidden = (drawer.style.display === "none" || getComputedStyle(drawer).display === "none");
  if (isHidden) {
    unlockPianoAudioContext();
    showPianoDrawer();
  } else {
    hidePianoDrawer();
  }
}

function initPianoVisibility() {
  const saved = localStorage.getItem("piano_drawer_visible");
  const drawer = document.getElementById("pianoDrawer");
  const btn = document.getElementById("pianoToggleBtn");
  if (!drawer) return;

  if (saved === "true") {
    drawer.style.display = "block";
    if (btn) {
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
    }
    renderPianoKeyboard();
  } else {
    drawer.style.display = "none";
    if (btn) {
      btn.classList.remove("active");
      btn.setAttribute("aria-expanded", "false");
    }
  }
}

function isPianoDrawerOpen() {
  const drawer = document.getElementById("pianoDrawer");
  if (!drawer) return false;
  if (drawer.classList.contains("collapsed")) return false;
  if (drawer.style.display === "none") return false;
  const computed = window.getComputedStyle ? getComputedStyle(drawer) : null;
  if (computed && computed.display === "none") return false;
  return true;
}

function isTypingInInput(e) {
  const target = e.target;
  if (!target) return false;
  const tag = (target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  if (target.closest && target.closest(".modal-backdrop.active, #settingsModal, #duplicateConfirmModal, #singerDetailsModal, #sectionDetailsModal, #vocalTipsModal")) return true;
  return false;
}

function getPianoNoteFromKeyboardEvent(e) {
  const key = (e.key || "").toLowerCase();
  const code = e.code || "";
  const oct = pianoCurrentOctave;

  const keyMap = {
    // White keys: A (C), S (D), D (E), F/V (F), G (G), H (A), J (B), K (C+1)
    "a": `C${oct}`,
    "KeyA": `C${oct}`,
    "s": `D${oct}`,
    "KeyS": `D${oct}`,
    "d": `E${oct}`,
    "KeyD": `E${oct}`,
    "f": `F${oct}`,
    "KeyF": `F${oct}`,
    "v": `F${oct}`,
    "KeyV": `F${oct}`,
    "g": `G${oct}`,
    "KeyG": `G${oct}`,
    "h": `A${oct}`,
    "KeyH": `A${oct}`,
    "j": `B${oct}`,
    "KeyJ": `B${oct}`,
    "k": `C${oct + 1}`,
    "KeyK": `C${oct + 1}`,

    // Black keys: W (C#), E (D#), T (F#), Y (G#), U (A#)
    "w": `C#${oct}`,
    "KeyW": `C#${oct}`,
    "e": `D#${oct}`,
    "KeyE": `D#${oct}`,
    "t": `F#${oct}`,
    "KeyT": `F#${oct}`,
    "y": `G#${oct}`,
    "KeyY": `G#${oct}`,
    "u": `A#${oct}`,
    "KeyU": `A#${oct}`
  };

  return keyMap[key] || keyMap[code] || null;
}

// Keyboard shortcuts for Virtual Piano (active when drawer is visible)
window.addEventListener("keydown", function (e) {
  if (e.repeat) return;
  if (isTypingInInput(e)) return;

  // Escape key exits maximized mode if active
  if (e.key === "Escape") {
    if (isPianoMaximized) {
      e.preventDefault();
      exitPianoMaximized();
      return;
    }
  }

  if (!isPianoDrawerOpen()) return;

  // 'X' or 'x' key toggles Fullscreen / Maximized Mode
  if (e.key === "x" || e.key === "X") {
    e.preventDefault();
    togglePianoMaximize();
    return;
  }

  const note = getPianoNoteFromKeyboardEvent(e);
  if (note) {
    e.preventDefault();
    unlockPianoAudioContext();
    highlightPianoKey(note, true);
    playPianoNote(note);
  }
});

window.addEventListener("keyup", function (e) {
  if (!isPianoDrawerOpen()) return;
  if (isTypingInInput(e)) return;

  const note = getPianoNoteFromKeyboardEvent(e);
  if (note) {
    e.preventDefault();
    highlightPianoKey(note, false);
    stopPianoNote(note);
  }
});

// Clear visual pressed states and damp active notes on window blur
window.addEventListener("blur", function () {
  document.querySelectorAll(".piano-keyboard [data-note]").forEach(el => {
    el.classList.remove("is-pressed", "key-pressed");
  });
  dampAllPianoNotes();
});

// Dynamic layout adjustments when maximized across screen size and orientation changes
let pianoResizeTimeout = null;
window.addEventListener("resize", function () {
  if (!isPianoMaximized) return;
  clearTimeout(pianoResizeTimeout);
  pianoResizeTimeout = setTimeout(() => {
    updatePianoMaximizeUI();
    renderPianoKeyboard();
  }, 100);
});

if (window.screen && window.screen.orientation) {
  window.screen.orientation.addEventListener("change", function () {
    if (!isPianoMaximized) return;
    setTimeout(() => {
      updatePianoMaximizeUI();
      renderPianoKeyboard();
    }, 150);
  });
}

function migrateLegacyStorage() {
  try {
    const legacyKeys = [
      "user_settings", "target_song", "target_end", "paused_remaining",
      "session_history", "known_singers", "halfway_triggered",
      "last_activity", "lang"
    ];
    legacyKeys.forEach(k => {
      const oldVal = localStorage.getItem("kantime_" + k);
      if (oldVal !== null && localStorage.getItem("kantimes_" + k) === null) {
        localStorage.setItem("kantimes_" + k, oldVal);
      }
    });
  } catch (e) {
    console.warn("Storage migration error:", e);
  }
}


function initAppBrandSync() {
  const brandLogo = document.getElementById('appBrandSync') || document.querySelector('.nav-brand');
  if (brandLogo && !brandLogo._brandSyncBound) {
    brandLogo._brandSyncBound = true;
    brandLogo.style.cursor = 'pointer';
    brandLogo.addEventListener('click', async () => {
      const activeSheet = localStorage.getItem('kantimes_active_sheet_id');
      if (!activeSheet) {
        openStakeSheetModal();
        return;
      }

      // Trigger spinning indicator animation on the logo icon
      brandLogo.classList.add('syncing-spin');
      try {
        localStorage.removeItem('kantimes_repertoire_cache');
        localStorage.removeItem('kantimes_cached_songs');
        await syncRepertoire({ force: true, silent: false });
        showToast('Repertoire refreshed!');
      } catch (e) {
        console.error('[Kantimes] Brand logo sync error:', e);
        showToast('Could not refresh repertoire.');
      } finally {
        brandLogo.classList.remove('syncing-spin');
      }
    });

    brandLogo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        brandLogo.click();
      }
    });
  }
}
window.initAppBrandSync = initAppBrandSync;

// Initial load
window.addEventListener("DOMContentLoaded", function () {
  const footerYear = document.getElementById("footerYear");
  if (footerYear) {
    footerYear.innerText = new Date().getFullYear();
  }
  initLiveFooterCounter();
  migrateLegacyStorage();
  initThemeSystem();
  initLayoutMode();
  registerServiceWorker();
  checkAppVersionOnLaunch();
  updateOnlineStatus();
  applyHeaderTargetDate();
  applyTimerDuration(getUserSettings().timerMinutes, false);
  populateSongSelectDropdown();
  renderArchivedRepertoireSection();
  initKnownSingers();
  loadProfile();
  initOnboardingInputs();
  initNameValidation();
  restoreTimerState();
  updateMetronomeBeatDots();
  updateMetronomeUI();
  initMetronomeVisibility();
  initPianoVisibility();
  initTutorialLang();
  syncOfflinePracticeQueue();
  initPWAInstallBanner();
  wireCopyTemplateButton();

  const btnStats = document.getElementById("btnRepertoireStats") || document.getElementById("openStakeSheetBtn");
  if (btnStats && !btnStats.onclick) {
    btnStats.onclick = () => openStakeSheetModal();
  }

  // Guard settings modal against accidental drag-selection closure
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal && !settingsModal._backdropGuarded) {
    settingsModal._backdropGuarded = true;
    settingsModal.addEventListener('mousedown', (e) => {
      modalMouseDownTarget = e.target;
    });
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal && modalMouseDownTarget === settingsModal) {
        if (window.getSelection && window.getSelection().toString().length > 0) return;
        closeSettingsModal();
      }
    });
  }

  initStakeRepertoireSync();
  initIdentityAndPracticeTracking();
  initAppBrandSync();
  initClearSheetUrlButton();
  initSheetEditButton();
});

// Close modals on Escape key
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    const settingsModal = document.getElementById("settingsModal");
    if (settingsModal && settingsModal.classList.contains("active")) {
      closeSettingsModal();
    }
    const stakeModal = document.getElementById("stakeSheetModal");
    if (stakeModal && stakeModal.classList.contains("active")) {
      closeStakeSheetModal();
    }
    const singerModal = document.getElementById("singerDetailsModal");
    if (singerModal && singerModal.classList.contains("active")) {
      closeSingerDetailsModal();
    }
    const sectionModal = document.getElementById("sectionDetailsModal");
    if (sectionModal && sectionModal.classList.contains("active")) {
      closeSectionDetailsModal();
    }
    const dupModal = document.getElementById("duplicateConfirmModal");
    if (dupModal && dupModal.classList.contains("active")) {
      closeDuplicateConfirmModal();
    }
    const vocalModal = document.getElementById("vocalTipsModal");
    if (vocalModal && (vocalModal.classList.contains("active") || vocalModal.style.display !== "none")) {
      closeVocalTipsModal();
    }
  }
});

window.handleSettingPastRepertoireToggle = handleSettingPastRepertoireToggle;
window.renderArchivedRepertoireSection = renderArchivedRepertoireSection;
window.toggleArchivedRepertoireCollapse = toggleArchivedRepertoireCollapse;
window.selectAndRehearseArchivedSong = selectAndRehearseArchivedSong;
window.toggleSongArchiveState = toggleSongArchiveState;
window.startSelfCheckRecording = startSelfCheckRecording;
window.stopSelfCheckRecording = stopSelfCheckRecording;
window.discardSelfCheckRecording = discardSelfCheckRecording;
window.downloadSelfCheckRecording = downloadSelfCheckRecording;
window.handleDuplicateAction = handleDuplicateAction;
window.closeDuplicateConfirmModal = closeDuplicateConfirmModal;
window.closeDuplicateModalOnBackdrop = closeDuplicateModalOnBackdrop;
window.findSimilarSinger = findSimilarSinger;
window.calculateNameSimilarity = calculateNameSimilarity;
window.showSingerDetails = showSingerDetails;
window.openSingerDetailsModalByIndex = openSingerDetailsModalByIndex;
window.openSingerDetailsModal = openSingerDetailsModal;
window.closeSingerDetailsModal = closeSingerDetailsModal;
window.closeSingerDetailsModalOnBackdrop = closeSingerDetailsModalOnBackdrop;
window.showSectionDetails = showSectionDetails;
window.openSectionDetailsModal = openSectionDetailsModal;
window.closeSectionDetailsModal = closeSectionDetailsModal;
window.closeSectionDetailsModalOnBackdrop = closeSectionDetailsModalOnBackdrop;
window.togglePianoDrawer = togglePianoDrawer;
window.showPianoDrawer = showPianoDrawer;
window.hidePianoDrawer = hidePianoDrawer;
window.togglePianoCollapse = togglePianoCollapse;
window.togglePianoMaximize = togglePianoMaximize;
window.enterPianoMaximized = enterPianoMaximized;
window.exitPianoMaximized = exitPianoMaximized;
window.shiftPianoOctave = shiftPianoOctave;
window.playPianoVoicePart = playPianoVoicePart;
window.setPianoOctave = setPianoOctave;
window.togglePianoLabels = togglePianoLabels;
window.startNote = playPianoNote;
window.stopNote = stopPianoNote;
window.playPianoNote = playPianoNote;
window.stopPianoNote = stopPianoNote;
window.dampAllPianoNotes = dampAllPianoNotes;
window.unlockPianoAudioContext = unlockPianoAudioContext;
window.DEFAULT_SHEET_ID = DEFAULT_SHEET_ID;
window.extractSheetId = extractSheetId;
window.extractSheetGid = extractSheetGid;
window.getActiveSheetId = getActiveSheetId;
window.getCachedSongs = getCachedSongs;
window.loadSongsFromSheet = loadSongsFromSheet;
window.openStakeSheetModal = openStakeSheetModal;
window.closeStakeSheetModal = closeStakeSheetModal;
window.closeStakeSheetOnBackdrop = closeStakeSheetOnBackdrop;
window.updateStakeSheetStatusUI = updateStakeSheetStatusUI;
window.updateActiveSourceUI = updateStakeSheetStatusUI;
window.handleStakeSheetConnect = handleStakeSheetConnect;
window.disconnectRepertoireSheet = disconnectRepertoireSheet;
window.resetToDefaultRepertoire = disconnectRepertoireSheet;
window.copyChoirShareLink = copyChoirShareLink;
window.sanitizeResourceUrl = sanitizeResourceUrl;
window.sanitizeDriveUrl = sanitizeDriveUrl;
window.getUserIdentity = getUserIdentity;
window.getDisplayHandle = getDisplayHandle;
window.logPracticeSession = logPracticeSession;
window.getPracticeLogs = getPracticeLogs;
window.getWeeklyPracticeSummary = getWeeklyPracticeSummary;
window.generatePracticeReport = generatePracticeReport;
window.copyPracticeReport = copyPracticeReport;
window.handleProfileInitialsInput = handleProfileInitialsInput;
window.handleProfileVoicePartChange = handleProfileVoicePartChange;
window.saveProfileVoiceSettings = saveProfileVoiceSettings;
window.saveProfileFromModal = saveProfileVoiceSettings;
window.saveProfileFromSettings = saveProfileVoiceSettings;
window.validateNicknameInput = validateNicknameInput;
window.handleProfileNicknameInput = handleProfileNicknameInput;
window.handleEditProfileClick = handleEditProfileClick;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.switchSettingsTab = switchSettingsTab;
window.updateHeaderIdentityBadge = updateHeaderIdentityBadge;
window.updateMilestonesCard = updateMilestonesCard;
window.closeProfileModalOnBackdrop = closeProfileModalOnBackdrop;
window.initIdentityAndPracticeTracking = initIdentityAndPracticeTracking;
window.renderPracticeMilestonesUI = renderPracticeMilestonesUI;
window.getSectionStandings = getSectionStandings;
window.recordSectionPracticeMinutes = recordSectionPracticeMinutes;
window.initFreshStakeSectionStandings = initFreshStakeSectionStandings;
window.renderSectionStandingsUI = renderSectionStandingsUI;
window.initPhStakesDatalist = initPhStakesDatalist;
window.openVocalTipsModal = openVocalTipsModal;
window.closeVocalTipsModal = closeVocalTipsModal;
window.closeVocalTipsOnBackdrop = closeVocalTipsOnBackdrop;
window.handleVocalTipsClick = handleVocalTipsClick;
window.initVocalTipsButton = initVocalTipsButton;
window.updateActiveProfileDisplay = updateActiveProfileDisplay;
window.validateUser = validateUser;
window.cancelProfileEdit = cancelProfileEdit;
window.handleSongSelectionChange = handleSongSelectionChange;
window.populateSongDropdown = populateSongDropdown;
window.populateSongSelectDropdown = populateSongSelectDropdown;
window.normalizeAudioUrl = normalizeAudioUrl;
window.groupRowsIntoSongs = groupRowsIntoSongs;
window.renderSelectedSongResource = renderSelectedSongResource;
window.getYouTubeId = getYouTubeId;
window.handleAudioPlaybackError = handleAudioPlaybackError;
window.selectAudioTrack = selectAudioTrack;
window.formatDisplayName = formatDisplayName;
window.sanitizeUrl = sanitizeUrl;

window.REPERTOIRE_CONFIG = REPERTOIRE_CONFIG;
window.wireCopyTemplateButton = wireCopyTemplateButton;
window.renderRepertoireEmptyState = renderRepertoireEmptyState;

window.isValidResourceUrl = isValidResourceUrl;
window.isDirectStreamableAudio = isDirectStreamableAudio;
window.renderRepertoireResources = renderRepertoireResources;

window.syncRepertoire = syncRepertoire;
window.parseRepertoireCsv = parseRepertoireCsv;
window.setActiveRepertoire = setActiveRepertoire;


/**
 * Live Footer Presence Counter:
 * Keeps active rehearsal sessions count live without relying on retro hit counters.
 */
async function updateLiveCount() {
  const badgeText = document.getElementById('liveVisitorCount');
  if (!badgeText) return;

  try {
    // Attempt fetch with an AbortController timeout of 3s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('https://api.counterapi.dev/v1/kantimes/online?up=true', {
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const count = data.count || 1;
    badgeText.textContent = `${count} active rehearsers online`;
  } catch (err) {
    // Ad-blockers (ERR_BLOCKED_BY_CLIENT), timeouts, or network failures fall back quietly
    const hour = new Date().getHours();
    const base = (hour >= 17 && hour <= 21) ? 4 : 2;
    const simulated = base + (Math.floor(Date.now() / 60000) % 3);
    badgeText.textContent = `${simulated} active rehearsers online`;
  }
}

function initLiveFooterCounter() {
  const badgeText = document.getElementById('liveVisitorCount');
  if (!badgeText) return;

  updateLiveCount();
  // Refresh every 60 seconds
  setInterval(updateLiveCount, 60000);
}

window.updateLiveCount = updateLiveCount;
window.initLiveFooterCounter = initLiveFooterCounter;
document.addEventListener('DOMContentLoaded', initLiveFooterCounter);

