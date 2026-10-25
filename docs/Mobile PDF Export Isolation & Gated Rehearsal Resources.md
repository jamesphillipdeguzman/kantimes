# Implementation Plan: Mobile PDF Export Isolation & Gated Rehearsal Resources

Resolve mobile PDF export clipping/duplication issues using isolated DOM cloning with `html2pdf.js`, and gate the rehearsal resources (sheet music, audio tracks, and video player) behind the practice timer start action.

## User Review Required

> [!IMPORTANT]
> - **PDF Library**: Loads `html2pdf.bundle.min.js` (v0.10.1) from Cloudflare CDN in `index.html` with graceful fallback handling in `script.js`.
> - **Gating Logic**: Rehearsal tracks, sheet links, and video embeds will remain locked behind a clear helper banner ("Select your hymn, then press 'Start Practice' to unlock sheet music and rehearsal audio.") until the user activates the practice timer. When running or paused, resources remain fully accessible. Upon session completion or timer reset, resources return to the locked prompt state.

---

## Proposed Changes

### 1. HTML Markup Updates

#### [MODIFY] [index.html](file:///c:/Users/PC/OneDrive%20-%20Lucky%20mobile/Documents/.WEBSITES/kantimes/index.html)
- Include `html2pdf.bundle.min.js` CDN before `script.js`.
- Add accessibility and structural markup for the gated song resource container in `#activeResourcesCard`.

---

### 2. Styling Updates

#### [MODIFY] [css/style.css](file:///c:/Users/PC/OneDrive%20-%20Lucky%20mobile/Documents/.WEBSITES/kantimes/css/style.css)
- **PDF Export Container Styling**:
  - Off-screen container styles (`#pdfIsolatedContainer` or `.pdf-export-isolated`) with fixed layout width (`700px`), clean background, high-contrast typography, and print-ready card spacing.
  - Pagebreak helper classes to ensure tutorial step cards never get sliced mid-card.
- **Resource Gating Styles**:
  - Gated prompt box (`.resource-gated-box`): styled placeholder with lock icon 🔒, clean typography, subtle border, and encouraging instruction.
  - Smooth unlock animation: `.resource-unlocked` with transition / fade-in / slide-down when timer starts.
  - Active rehearsal indicator: subtle pill or badge indicating "Session Active — Repertoire Unlocked 🔓".

---

### 3. Application Logic Updates

#### [MODIFY] [script.js](file:///c:/Users/PC/OneDrive%20-%20Lucky%20mobile/Documents/.WEBSITES/kantimes/script.js)
- **Mobile PDF Export (`exportTutorialToPdf`)**:
  - Remove buggy modal targeting and popup window logic.
  - Call `window.scrollTo(0, 0)` before capture.
  - Clone only tutorial steps content into a temporary 700px off-screen container.
  - Completely exclude modal headers, close button (`✕`), tab buttons, language toggle pills, and the PDF export button.
  - Prepend clean header:
    - `"Kantimes: Choir Member Quick Guide • Stake Choir Prep"`
    - Subtitle with target date, choir member info, and print date.
  - Append clean footer:
    - `"Developed for Iloilo Stake Choir | Built by James Phillip De Guzman"`
  - Configure `html2pdf` with:
    - `html2canvas: { scale: 2, useCORS: true, scrollY: 0 }`
    - `jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }`
    - `pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }`
  - Remove temporary DOM clone immediately upon `.then()` or `.catch()`.
  - Provide user feedback (loading state on button, toast notifications).
- **Session-Gated Song Resources**:
  - Implement helper `isPracticeSessionActive()` that checks if timer is running (`targetEndTime || timerInterval`) or paused (`kantime_paused_remaining`).
  - Update `renderSelectedSongResource()`:
    - If `!isPracticeSessionActive()`, hide the interactive links, part tracks, and embedded video; display the helper prompt:
      *"Select your hymn, then press 'Start Practice' to unlock sheet music and rehearsal audio."*
    - If `isPracticeSessionActive()`, render the interactive sheet music, external links, and video player with smooth unlock animation.
  - Hook into timer lifecycle:
    - `toggleTimer()`: when starting the session, re-render/unlock resources with smooth animation.
    - `completeTimerSession()`: reset resources back to the locked helper prompt state.
    - `handleTimerDurationChange()`: when session is reset, return resources to prompt state.
    - `restoreTimerState()`: check if active session exists from localStorage to restore appropriate unlocked/locked view.
    - `handleSongSelectionChange()`: preserve active/gated state across hymn selection.

---

## Verification Plan

### Automated / Browser Verification
1. **Resource Gating Verification**:
   - Open app -> Sign in as choir member -> Check `#activeResourcesCard`:
     - Verify links/videos are hidden.
     - Verify prompt message is displayed.
   - Click "Start 15m Session" -> Verify resources smoothly unlock and are interactive (Sheet link, preview, video).
   - Click "Pause Session" -> Verify resources remain accessible while paused.
   - Change song while running/paused -> Verify new song's resources remain unlocked.
   - Let timer complete or reset duration -> Verify resources return to the locked prompt state.
2. **Mobile PDF Export Verification**:
   - Open Settings & Guide -> Switch to "Tutorial & Guide" tab.
   - Switch between languages (EN, HIL, TL, CEB).
   - Click "Export to PDF":
     - Verify 700px temporary container is constructed with only tutorial steps, prepended header, and appended footer.
     - Verify no modal header, close button, language toggle, or export button is included.
     - Verify `html2pdf` executes with `scale: 2`, `scrollY: 0`, A4 portrait format.
     - Verify temporary container is removed from DOM after PDF generation.
