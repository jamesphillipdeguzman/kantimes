# Fuzzy Name Deduplication & Google Apps Script Guard

Comprehensive documentation for choir member profile deduplication in `kantimes.vercel.app`, including client-side fuzzy similarity matching, roster caching, interactive confirmation modal, and backend Google Apps Script deduplication safety checks.

---

## 1. Problem Overview
Choir members frequently register multiple times on different devices or rehearsal days with slight variations of their name:
- **Typographical errors:** e.g., *"Jonathan Smith"* vs. *"Jonathon Smith"*, *"Maria Elena Sotero"* vs. *"Maria Elena Soterro"*
- **Middle initials / names omitted:** e.g., *"Maria Sotero"* vs. *"Maria Elena Sotero"* or *"Maria E. Sotero"*
- **Spacing / punctuation differences:** e.g., *"Juan dela Cruz"* vs. *"Juan de la Cruz"*, *"Rosemarie Santos"* vs. *"Rose Marie Santos"*

These minor differences caused fragmented practice statistics across separate rows in Google Sheets and diluted individual and section standings on the leaderboard.

---

## 2. Client-Side Implementation

### 2.1 Roster Cache (`script.js`)
- `cachedKnownSingers`: In-memory array containing known singers `{ name, section, avatar, totalMins }`.
- Persisted to `localStorage.getItem("kantime_known_singers")` for instant, offline-first deduplication.
- Initialized on page boot via `initKnownSingers()` which initiates a background fetch to `APPS_SCRIPT_URL` when online.
- Automatically synchronized with fresh leaderboard data in `loadLeaderboard()`.

### 2.2 String Normalization & Similarity Algorithm
- `normalizeSingerName(str)`:
  1. Trims whitespace and converts to lowercase.
  2. Strips Unicode diacritics / accents (`\u0300-\u036f`).
  3. Replaces punctuation (dots, hyphens, commas) with whitespace.
  4. Collapses multi-spaces.
- `calculateNameSimilarity(nameA, nameB)`:
  - **100% (1.0):** Exact match or space-collapsed match (`"juandelacruz"` === `"juandelacruz"`).
  - **95% (0.95):** Identical words in different order (`"Cruz Juan"` vs `"Juan Cruz"`).
  - **88% (0.88):** Matching first and last names with middle initial or middle name omitted (`"Maria Sotero"` vs `"Maria Elena Sotero"`).
  - **85% (0.85):** Subset of words with identical first name (`"Mark Anthony Santos"` vs `"Mark Santos"`).
  - **Character Similarity:** Computes Levenshtein edit distance:
    $$\text{Sim} = 1.0 - \frac{\text{levDist}}{\max(\text{len}_A, \text{len}_B)}$$
- `findSimilarSinger(inputName)`:
  - Evaluates entered name against all known roster members.
  - Ignores the user's currently signed-in profile name so members can freely update voice parts or avatars in Settings without false alarms.
  - Flags any existing singer with similarity score $\ge 80\%$.

### 2.3 Interactive Confirmation Modal (`#duplicateConfirmModal`)
When a close match is detected during registration or settings update:
- **Title:** *"Existing Singer Found! 🎵"*
- **Message:** *"Did you mean **[Matched Name] ([Voice Part])**? A profile with a similar name already exists in the choir roster."*
- **Matched Singer Card:** Displays portrait/avatar, full name, voice badge, and practice minutes summary.
- **Two Distinct Actions:**
  1. **"Yes, That's Me!" (Accept):**
     - Directly links device `localStorage` (`choir_name`, `choir_section`, `choir_voice`, `choir_avatar`) to the existing profile.
     - Does NOT submit a redundant record to Google Sheets.
     - Displays welcome-back confirmation toast and unlocks the practice dashboard.
  2. **"No, Create New Profile" (Reject / Override):**
     - Affirms that the user is a distinct choir member with a similar name.
     - Proceeds with creating the profile under the entered name.

---

## 3. Backend Google Apps Script Guard (Google Sheets Safety Check)

For developers deploying or maintaining the Google Apps Script Web App endpoint, add the following deduplication guard in your `Code.gs` script.

### Canonical Deduplication Helper
```javascript
/**
 * Normalizes a name string for canonical comparison.
 */
function normalizeNameForSheet(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // remove all non-alphanumeric chars and spaces
    .trim();
}

/**
 * Finds an existing singer row in the practice sheet by canonical name.
 * Returns { rowIndex, rowData, canonicalName } or null if not found.
 */
function findExistingSinger(sheet, singerName) {
  var normTarget = normalizeNameForSheet(singerName);
  if (!normTarget) return null;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var namesRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < namesRange.length; i++) {
    var existingName = namesRange[i][0];
    if (normalizeNameForSheet(existingName) === normTarget) {
      return {
        rowIndex: i + 2,
        name: existingName
      };
    }
  }
  return null;
}
```

### Enhanced `doPost(e)` Handler
```javascript
function doPost(e) {
  try {
    var rawData = e.postData ? e.postData.contents : null;
    if (!rawData) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No post data" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var payload = JSON.parse(rawData);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("PracticeLogs") || ss.getActiveSheet();

    var name = (payload.name || "").trim();
    var section = (payload.section || "Choir").trim();
    var minutes = Number(payload.minutes) || 0;
    var avatar = (payload.avatar || "").trim();
    var timestamp = payload.timestamp || new Date().toISOString();
    var songTitle = (payload.songTitle || "").trim();

    // ── Canonical Name Deduplication Guard ──
    var existingMatch = findExistingSinger(sheet, name);
    var canonicalName = existingMatch ? existingMatch.name : name;

    // Append session row using canonical name to maintain unified records
    sheet.appendRow([
      canonicalName,
      section,
      minutes,
      avatar,
      timestamp,
      songTitle
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      matchedExisting: !!existingMatch,
      canonicalName: canonicalName
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## 4. Verification Checklist
- [x] Case-insensitive, space-insensitive, and accent-insensitive normalization.
- [x] Levenshtein distance detects 1–2 character typos with similarity $\ge 80\%$.
- [x] First + Last name matching catches omitted middle initials and names.
- [x] Existing user editing their own profile in Settings is never prompted with false alarms.
- [x] "Yes, That's Me!" links device locally without creating duplicate server rows.
- [x] "No, Create New Profile" respects distinct singers and proceeds normally.
- [x] Modal is fully responsive, supports frosted glass aesthetic and dark theme tokens.
