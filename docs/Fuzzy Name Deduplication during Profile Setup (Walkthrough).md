# Walkthrough: Fuzzy Name Deduplication during Profile Setup

Prevented duplicate records in Google Sheets and fragmented practice statistics in `kantimes.vercel.app` by implementing offline-first roster caching, string normalization, a Levenshtein and word-boundary similarity matching algorithm, and an interactive confirmation modal with profile linking.

---

## 1. Summary of Changes

### 1.1 Fuzzy Name Matching Engine (`script.js`)
- **Offline Roster Cache (`kantime_known_singers`)**:
  - Maintained an in-memory roster `cachedKnownSingers` persisted in `localStorage`.
  - Initialized on page boot (`initKnownSingers()`) with background sync to Google Apps Script (`APPS_SCRIPT_URL`) so singer names are available before the user completes registration.
  - Automatically refreshed whenever fresh leaderboard statistics arrive in `loadLeaderboard()`.
- **String Normalization (`normalizeSingerName`)**:
  - Trims, lowercases, removes Unicode diacritics/accents, replaces punctuation with spaces, and collapses multi-spaces.
- **Lightweight Hybrid Similarity Metric (`calculateNameSimilarity`)**:
  - **100% (1.0)**: Exact match or space-collapsed match (`"juandelacruz"` === `"juandelacruz"`).
  - **95% (0.95)**: Identical words in different order (`"Cruz Juan"` vs `"Juan Cruz"`).
  - **88% (0.88)**: Matching first and last names with middle initial/name omitted (`"Maria Sotero"` vs `"Maria Elena Sotero"`).
  - **85% (0.85)**: Subset of words with identical first name (`"Mark Anthony Santos"` vs `"Mark Santos"`).
  - **Levenshtein Distance**: Edit-distance character similarity for typos (`"Jonathon"` vs `"Jonathan"`).
- **Registration & Settings Guard (`findSimilarSinger`)**:
  - Checks entered name against cached singers.
  - Ignores the user's currently active profile name so that editing one's own voice part or settings never prompts false alarms.
  - Returns best match if similarity $\ge 80\%$.

### 1.2 Interactive Confirmation Modal (`index.html` & `css/style.css`)
- **Modal Component (`#duplicateConfirmModal`)**:
  - **Title**: *"Existing Singer Found! 🎵"*
  - **Lead Message**: *"Did you mean **[Matched Name] ([Voice Part])**? A profile with a similar name already exists in the choir roster."*
  - **Matched Singer Card**: Glowing frosted card with avatar portrait or fallback note icon (`🎵`), full name, voice part badge, and practice minutes statistics.
  - **Two Action Buttons**:
    - **"Yes, That's Me!" (Accept)**: Links `localStorage` directly to the existing matched profile/voice part, updates the UI, displays a welcome-back toast, and unlocks the practice dashboard without posting a duplicate record to Google Sheets.
    - **"No, Create New Profile" (Reject/Override)**: Confirms the user is a distinct singer and proceeds to create their new profile.
- **Styling**:
  - Frosted glass backdrop (`backdrop-filter: blur(6px)`), responsive card layout, mobile-optimized button stacks (`flex-direction: column-reverse` on narrow screens), and full dark mode support using CSS variables.

### 1.3 Backend Google Apps Script Guard Documentation
- Created [`docs/Fuzzy Name Deduplication & Google Apps Script Guard.md`](file:///c:/Users/PC/OneDrive%20-%20Lucky%20mobile/Documents/.WEBSITES/kantimes/docs/Fuzzy%20Name%20Deduplication%20&%20Google%20Apps%20Script%20Guard.md) with ready-to-use Google Apps Script code for canonical name matching in `doPost(e)` to enforce deduplication on the sheet side.

---

## 2. Verification Results

### 2.1 Algorithm Unit Test Results
| Input Name           | Existing Roster Name | Similarity | Classification |
| :------------------- | :------------------- | :--------: | :------------: |
| `Juan de la Cruz`    | `Juan dela Cruz`     |  **1.00**  |   **MATCH**    |
| `Jonathan Smith`     | `Jonathon Smith`     |  **0.93**  |   **MATCH**    |
| `Maria Elena Sotero` | `Maria Sotero`       |  **0.88**  |   **MATCH**    |
| `Maria E. Sotero`    | `Maria Elena Sotero` |  **0.88**  |   **MATCH**    |
| `Rosemarie Santos`   | `Rose Marie Santos`  |  **1.00**  |   **MATCH**    |
| `David Miller`       | `Daniel Miller`      |  **0.77**  |  **DISTINCT**  |
| `Pedro Gomez`        | `Juan Carlos Gomez`  |  **0.47**  |  **DISTINCT**  |

### 2.2 Code Structure & DOM Integrity Tests
- Verified that all required elements (`#duplicateConfirmModal`, `#duplicateMatchedName`, `#duplicateMatchedVoice`, `#duplicateMatchAvatar`, `#btnConfirmExistingSinger`, `#btnConfirmNewSinger`) exist in `index.html`.
- Verified that all CSS classes (`.duplicate-modal-backdrop`, `.duplicate-modal-box`, `.duplicate-match-card`, `.duplicate-match-avatar`, `.duplicate-match-name`) are present in `css/style.css`.
- Verified syntax balance in `script.js`:
  - Braces balance: **0**
  - Parens balance: **0**
  - Brackets balance: **0**
- Service worker cache version and cache busters bumped to `v2.5.4` in `sw.js` and `index.html`.
