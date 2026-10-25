# Implementation Plan: Repertoire Archiving & In-Browser Audio Scratchpad

Implement two new choir rehearsal features in `kantimes.vercel.app` across `index.html`, `css/style.css`, and `script.js`:
1. **Repertoire Archiving via Settings (⚙️)**: Group songs by event, add a toggle for past repertoire (Oct 24–25 Stake Conference), hide archived songs from the main practice dashboard by default (post-conference mode), and present them in a collapsible "Archived / Past Conferences" section when enabled.
2. **In-Browser Audio Scratchpad (Record & Self-Check)**: Ephemeral, 100% client-side voice recording tool (up to 5 minutes) using the browser's `MediaRecorder` API under the practice audio player with countdown timer, pulsing recording dot, immediate playback, direct download/export option to save audio to device, discard trash button, and graceful mic permission handling.

---

## User Review Required

> [!NOTE]
> - **Default State for Post-Conference Mode**: The toggle `Show Past Repertoire (Oct 24–25 Stake Conference)` will be **disabled by default**, in accordance with post-conference mode. The 5 original Stake Conference songs will be tagged under `Oct 24–25 Stake Conference` and marked as archived. Two standard active hymn pieces ("The Lord Is My Light (#89)" and "I Need Thee Every Hour (#98)") will be provided as active repertoire so the practice hub has active music right away.
> - **Ephemeral Voice Recordings & Direct Export**: Voice recordings are created locally via in-memory blobs (`audio/webm` or `audio/mp4` for iOS Safari) with a 5-minute maximum limit. Users can directly export/download recordings to their local device or discard them. Recordings are never sent to any external server.

---

## Proposed Changes

### 1. Structure & Markup Updates ([index.html](file:///c:/Users/PC/OneDrive%20-%20Lucky%20mobile/Documents/.WEBSITES/kantimes/index.html))

- **Settings Modal (`#tabPanelPreferences`)**:
  - Rename / augment section to **"Event Repertoire & Archives"**.
  - Add the toggle checkbox: `[ ] Show Past Repertoire (Oct 24–25 Stake Conference)`.
  - In `#songEditorForm`, add fields for `Event / Conference Group` and an `Archive this piece (Past Event / Conference)` checkbox.
- **Main Practice Hub Dashboard**:
  - Add a collapsible card `#archivedRepertoireCard` ("📁 Archived / Past Conferences") directly following `#activeResourcesCard`.
  - The card displays an expandable header with piece count badge, and an internal grid of archived repertoire cards with quick "Rehearse This Piece" buttons.

### 2. Styling & Animations ([css/style.css](file:///c:/Users/PC/OneDrive%20-%20Lucky%20mobile/Documents/.WEBSITES/kantimes/css/style.css))

- **Repertoire Archiving Styles**:
  - Styles for `#archivedRepertoireCard`, collapsible header, count pills, and archived song cards.
  - Event tag badges (e.g., `.badge-event`, `.badge-archived`).
  - Settings repertoire grouping headers (`.repertoire-event-group-header`).
- **Self-Check Mic Scratchpad Styles**:
  - Card layout (`.self-check-mic-card`).
  - Pulsing recording dot animation (`@keyframes pulse-record`).
  - Visual recording countdown timer and animated audio activity bars.
  - Playback controls and action buttons (play/pause, discard trash button, re-record).
  - Dark mode variables and support for all new components.

### 3. Application Logic ([script.js](file:///c:/Users/PC/OneDrive%20-%20Lucky%20mobile/Documents/.WEBSITES/kantimes/script.js))

- **Data Models & Migration**:
  - Update `DEFAULT_USER_SETTINGS` to include `showPastRepertoire: false`.
  - Tag the existing Stake Conference songs with `event: "Oct 24–25 Stake Conference"` and `isArchived: true`.
  - Add active repertoire pieces with `event: "Active Repertoire"` and `isArchived: false`.
  - Update `getUserSettings()` migration logic to preserve these properties and backward-compatibility.
- **Repertoire Filtering & Archiving Logic**:
  - Update `populateSongSelectDropdown()`: only active songs appear when `showPastRepertoire` is false; groups active and archived songs into `<optgroup>` when true.
  - Implement `renderArchivedRepertoireSection()` to show/hide and populate the collapsible archived section.
  - Implement `toggleArchivedRepertoireCollapse()` for user expand/collapse of past conferences.
  - Implement `handleSettingPastRepertoireToggle(checked)` to update settings and refresh views.
  - Update song add/edit form handling (`saveSongFromForm`, `openSongForm`) with `event` and `isArchived`.
- **Self-Check Mic Engine (`MediaRecorder`)**:
  - Implement `renderSelfCheckMicHtml()` inside `renderSelectedSongResource()` under the practice audio player.
  - Implement `startSelfCheckRecording()`:
    - Check browser support (`navigator.mediaDevices.getUserMedia`).
    - Handle permission rejection gracefully with the exact toast prompt: *"Microphone access required to record practice snippets."*
    - Detect iOS Safari vs Chrome MIME types (`audio/webm`, `audio/mp4`, `audio/aac`).
    - 5-minute countdown with auto-stop on expiration.
  - Implement `stopSelfCheckRecording()` and `finishSelfCheckRecording()`:
    - Generate local blob URL.
    - Release microphone stream tracks.
    - Update player UI to allow immediate listening, downloading/exporting, re-recording, or discarding.
  - Implement `downloadSelfCheckRecording()`:
    - Automatically generate formatted filename based on target song title and date/time.
    - Direct export/download of recorded audio directly to user's device.
  - Implement `discardSelfCheckRecording()`:
    - Revoke blob URL, clean up chunks, reset UI back to record button.

---

## Verification Plan

### Automated / Browser Testing
- Use `browser_subagent` to open `kantimes.vercel.app` / local web server:
  1. Open Settings modal (⚙️) -> Preferences & Repertoire tab:
     - Verify "Event Repertoire & Archives" section exists.
     - Verify `Show Past Repertoire (Oct 24–25 Stake Conference)` toggle is present and initially unchecked.
  2. Main View Inspection (Default / Post-Conference mode):
     - Confirm archived songs are hidden from active dropdown and archived card is not shown.
     - Confirm active songs are available.
  3. Toggle Past Repertoire:
     - Enable the toggle in Settings.
     - Verify the "Archived / Past Conferences" collapsible card appears on the main practice hub.
     - Expand the section, confirm the Oct 24–25 Stake Conference songs are visible.
     - Click "Rehearse" on an archived song (e.g. Choose You This Day) and verify it loads in the practice player.
  4. Audio Scratchpad (Self-Check Mic):
     - Verify "Self-Check Mic" appears under the practice player.
     - Test recording flow (or click record and check permission prompt / countdown / stop).
     - Test discard / reset functionality.
