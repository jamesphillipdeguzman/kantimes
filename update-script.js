const fs = require("fs");
let content = fs.readFileSync("script.js", "utf8");

const isCRLF = content.includes("\r\n");
let norm = content.replace(/\r\n/g, "\n");

// 1. In logPracticeSession, call recordSectionPracticeMinutes(userPart, mins)
const targetLog = `  updatePracticeSummaryUI();\n  return entry;`;
const newLog = `  updatePracticeSummaryUI();\n  recordSectionPracticeMinutes(userPart, mins);\n  return entry;`;

if (norm.includes(targetLog)) {
  norm = norm.replace(targetLog, newLog);
  console.log("Updated logPracticeSession to record section practice minutes");
} else {
  console.warn("Could not find targetLog in script.js");
}

// 2. In handleStakeSheetSubmit, if new sheet is connected, initFreshStakeSectionStandings(true)
const targetSubmit = `  localStorage.setItem("kantimes_active_sheet_id", storedSource);
  updateStakeSheetStatusUI();
  closeStakeSheetModal();
  showToast("Connecting to Stake Sheet... ⏳");`;

const newSubmit = `  const prevActiveSheet = localStorage.getItem("kantimes_active_sheet_id");
  if (prevActiveSheet !== storedSource) {
    initFreshStakeSectionStandings(true);
  }
  localStorage.setItem("kantimes_active_sheet_id", storedSource);
  updateStakeSheetStatusUI();
  closeStakeSheetModal();
  showToast("Connecting to Stake Sheet... ⏳");`;

if (norm.includes(targetSubmit)) {
  norm = norm.replace(targetSubmit, newSubmit);
  console.log("Updated handleStakeSheetSubmit to reset standings on fresh stake connect");
} else {
  console.warn("Could not find targetSubmit in script.js");
}

// 3. In resetToDefaultRepertoire, restore starter totals
const targetReset = `async function resetToDefaultRepertoire() {
  localStorage.removeItem("kantimes_active_sheet_id");
  updateStakeSheetStatusUI();`;

const newReset = `async function resetToDefaultRepertoire() {
  localStorage.removeItem("kantimes_active_sheet_id");
  initFreshStakeSectionStandings(false);
  updateStakeSheetStatusUI();`;

if (norm.includes(targetReset)) {
  norm = norm.replace(targetReset, newReset);
  console.log("Updated resetToDefaultRepertoire to restore starter standings");
} else {
  console.warn("Could not find targetReset in script.js");
}

// 4. In URL param detection for ?sheet=
const targetParam = `      const currentActive = localStorage.getItem("kantimes_active_sheet_id");
      if (cleanParam !== currentActive) {
        localStorage.setItem("kantimes_active_sheet_id", cleanParam);`;

const newParam = `      const currentActive = localStorage.getItem("kantimes_active_sheet_id");
      if (cleanParam !== currentActive) {
        initFreshStakeSectionStandings(true);
        localStorage.setItem("kantimes_active_sheet_id", cleanParam);`;

if (norm.includes(targetParam)) {
  norm = norm.replace(targetParam, newParam);
  console.log("Updated URL param handler to reset standings on fresh sheet");
} else {
  console.warn("Could not find targetParam in script.js");
}

// 5. In initIdentityAndPracticeTracking, call renderSectionStandingsUI()
const targetInit = `function initIdentityAndPracticeTracking() {
  getUserIdentity();
  updateIdentityUI();
  updatePracticeSummaryUI();
  renderPracticeMilestonesUI();
}`;

const newInit = `function initIdentityAndPracticeTracking() {
  getUserIdentity();
  updateIdentityUI();
  updatePracticeSummaryUI();
  renderPracticeMilestonesUI();
  renderSectionStandingsUI();
}`;

if (norm.includes(targetInit)) {
  norm = norm.replace(targetInit, newInit);
  console.log("Updated initIdentityAndPracticeTracking to call renderSectionStandingsUI");
} else {
  console.warn("Could not find targetInit in script.js");
}

// 6. Add Section Standings Engine code
const sectionStandingsEngineCode = `
// ==========================================================================
// SECTION STANDINGS ENGINE (ZERO-PII LOCAL AGGREGATION)
// ==========================================================================
const DEFAULT_SECTION_STANDINGS = {
  "Soprano": 120,
  "Alto": 105,
  "Tenor": 135,
  "Bass": 90,
  "Primary": 60
};

/**
 * Retrieves section standings from localStorage ("kantimes_section_standings").
 * Initializes with starter totals if not yet present.
 */
function getSectionStandings() {
  try {
    const raw = localStorage.getItem("kantimes_section_standings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        let changed = false;
        ["Soprano", "Alto", "Tenor", "Bass", "Primary"].forEach(sec => {
          if (parsed[sec] === undefined) {
            parsed[sec] = DEFAULT_SECTION_STANDINGS[sec] || 0;
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem("kantimes_section_standings", JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn("[Kantimes] Error reading section standings:", e);
  }

  const initial = { ...DEFAULT_SECTION_STANDINGS };
  try {
    localStorage.setItem("kantimes_section_standings", JSON.stringify(initial));
  } catch (e) {}
  return initial;
}

/**
 * Initializes or resets section standings for a fresh stake connection or default reset.
 * @param {boolean} useZeros If true, resets all sections to 0 minutes (clean slate for new stake).
 */
function initFreshStakeSectionStandings(useZeros = false) {
  const initial = useZeros
    ? { "Soprano": 0, "Alto": 0, "Tenor": 0, "Bass": 0, "Primary": 0 }
    : { ...DEFAULT_SECTION_STANDINGS };
  try {
    localStorage.setItem("kantimes_section_standings", JSON.stringify(initial));
  } catch (e) {}
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
    localStorage.setItem("kantimes_section_standings", JSON.stringify(standings));
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

    sectionHtml += \`
      <div class="board-row section-standings-row clickable-section"
           onclick="showSectionDetails('\${safeEncodedSec}', \${idx + 1})"
           data-section-name="\${safeSec}"
           data-section-rank="\${idx + 1}"
           role="button" tabindex="0"
           title="Click to view full breakdown for \${safeSec}"
           aria-label="View rehearsal breakdown for \${safeSec}"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showSectionDetails('\${safeEncodedSec}', \${idx + 1});}">
        <span class="rank \${isTop3}">\${medal}#\${idx + 1}</span>
        <div class="section-name-wrap">
          <span class="section-name">\${safeSec}</span>
        </div>
        <span class="mins-badge">\${numMins}m <span class="mins-sub">(\${hours}h)</span></span>
      </div>
    \`;
  });

  sectionEl.innerHTML = sectionHtml;

  if (!sectionEl.dataset.detailsBound) {
    sectionEl.dataset.detailsBound = "true";
    sectionEl.addEventListener("click", function (e) {
      const row = e.target.closest(".board-row.clickable-section");
      if (!row) return;
      const name = row.getAttribute("data-section-name");
      const r = row.getAttribute("data-section-rank");
      if (name) {
        showSectionDetails(name, r ? Number(r) : 1);
      }
    });
  }
}
`;

if (!norm.includes("function getSectionStandings()")) {
  const insertTarget = `function initIdentityAndPracticeTracking() {\n  getUserIdentity();\n  updateIdentityUI();\n  updatePracticeSummaryUI();\n  renderPracticeMilestonesUI();\n  renderSectionStandingsUI();\n}`;
  if (norm.includes(insertTarget)) {
    norm = norm.replace(insertTarget, insertTarget + "\n" + sectionStandingsEngineCode);
    console.log("Inserted Section Standings Engine code");
  } else {
    console.warn("Could not find insertTarget for Section Standings Engine code");
  }
}

// 7. Update loadLeaderboard to call renderSectionStandingsUI at top
const targetLeaderboard = `function loadLeaderboard() {
  const topSingersEl = document.getElementById("topSingersList");
  const sectionEl = document.getElementById("sectionList");

  if (!navigator.onLine) {`;

const newLeaderboard = `function loadLeaderboard() {
  const topSingersEl = document.getElementById("topSingersList");
  const sectionEl = document.getElementById("sectionList");

  // Always render zero-PII local section standings
  renderSectionStandingsUI();

  if (!navigator.onLine) {`;

if (norm.includes(targetLeaderboard)) {
  norm = norm.replace(targetLeaderboard, newLeaderboard);
  console.log("Updated loadLeaderboard to call renderSectionStandingsUI");
} else {
  console.warn("Could not find targetLeaderboard in script.js");
}

// 8. Add window exports
const targetExports = `window.initIdentityAndPracticeTracking = initIdentityAndPracticeTracking;
window.renderPracticeMilestonesUI = renderPracticeMilestonesUI;`;

const newExports = `window.initIdentityAndPracticeTracking = initIdentityAndPracticeTracking;
window.renderPracticeMilestonesUI = renderPracticeMilestonesUI;
window.getSectionStandings = getSectionStandings;
window.recordSectionPracticeMinutes = recordSectionPracticeMinutes;
window.initFreshStakeSectionStandings = initFreshStakeSectionStandings;
window.renderSectionStandingsUI = renderSectionStandingsUI;`;

if (norm.includes(targetExports)) {
  norm = norm.replace(targetExports, newExports);
  console.log("Updated window exports with section standings functions");
} else {
  console.warn("Could not find targetExports in script.js");
}

content = isCRLF ? norm.replace(/\n/g, "\r\n") : norm;
fs.writeFileSync("script.js", content, "utf8");
console.log("Finished writing script.js");

