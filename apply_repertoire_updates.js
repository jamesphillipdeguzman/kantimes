const fs = require('fs');

let content = fs.readFileSync('script.js', 'utf8');

// 1. Ensure DEFAULT_SHEET_ID is defined near REPERTOIRE_CONFIG
if (!content.includes('const DEFAULT_SHEET_ID = "";')) {
  content = content.replace(
    'const REPERTOIRE_CONFIG = {',
    'const REPERTOIRE_CONFIG = {\n  // Clones the clean \'Template\' tab (gid=0) into the user\'s personal Google Drive\n  TEMPLATE_COPY_URL: "https://docs.google.com/spreadsheets/d/1WhGzAbKOc5TTuCi3UbLImZ2Kh82buf2rC1tCDX3hRL8/copy"\n};\nconst DEFAULT_SHEET_ID = "";'
  );
  // If TEMPLATE_COPY_URL was duplicated or already inside REPERTOIRE_CONFIG, let's normalize REPERTOIRE_CONFIG block:
}

// Let's inspect REPERTOIRE_CONFIG block carefully
const configRegex = /const REPERTOIRE_CONFIG = \{[\s\S]*?\};(\r?\n)?(const DEFAULT_SHEET_ID = "";)?/;
const standardConfig = `const REPERTOIRE_CONFIG = {
  // Clones the clean 'Template' tab (gid=0) into the user's personal Google Drive
  TEMPLATE_COPY_URL: "https://docs.google.com/spreadsheets/d/1WhGzAbKOc5TTuCi3UbLImZ2Kh82buf2rC1tCDX3hRL8/copy"
};
const DEFAULT_SHEET_ID = "";`;

content = content.replace(configRegex, standardConfig);

// 2. Fix the syntax error at line 2560 (the double closing brace around getUserSettings)
const getUserSettingsOldBlock = `    const fallback = JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
    fallback.songs = (cachedSongs && cachedSongs.length > 0) ? cachedSongs : [];
    return fallback;
  }
}
}`;

const getUserSettingsFixedBlock = `    const fallback = JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
    fallback.songs = (cachedSongs && cachedSongs.length > 0) ? cachedSongs : [];
    return fallback;
  }
}`;

if (content.includes(getUserSettingsOldBlock)) {
  content = content.replace(getUserSettingsOldBlock, getUserSettingsFixedBlock);
} else {
  // Fallback pattern if line endings differ
  content = content.replace(
    /return fallback;\s*\}\s*\}\s*\}/,
    'return fallback;\n  }\n}'
  );
}

// 3. Update populateSongDropdown and populateSongSelectDropdown
const populateDropdownRegex = /function populateSongDropdown\(songList\) \{[\s\S]*?function populateSongSelectDropdown\(\) \{[\s\S]*?renderSelectedSongResource\(visibleSongs\[0\]\.title\);\s*\}\s*\}/;

const newPopulateCode = `function populateSongDropdown(songList) {
  const songSelect = document.getElementById('songSelect') || document.querySelector('.rehearsal-song-select') || document.getElementById('targetSong');
  if (!songSelect) return;

  // Wipe existing options completely
  songSelect.innerHTML = '';

  // If empty, show fallback and render empty onboarding state if unconfigured
  if (!songList || songList.length === 0) {
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    const hasConfiguredSheet = Boolean(localStorage.getItem('kantimes_active_sheet_id'));
    emptyOpt.textContent = hasConfiguredSheet ? 'No songs found in connected sheet' : 'No sheet connected (Connect sheet or copy template)';
    songSelect.appendChild(emptyOpt);
    if (!hasConfiguredSheet && typeof renderRepertoireEmptyState === 'function') {
      renderRepertoireEmptyState();
    }
    return;
  }

  const savedSong = localStorage.getItem("kantime_target_song") || localStorage.getItem("kantimes_target_song");
  let matched = false;

  // Populate strictly the synced repertoire
  songList.forEach((song, idx) => {
    const opt = document.createElement('option');
    opt.value = song.title;
    const voicePart = song.voicePart || (song.part && song.part !== 'All' ? song.part : '');
    const partSuffix = voicePart ? \` (\${voicePart})\` : '';
    opt.textContent = \`\${song.title}\${partSuffix}\`;
    if (savedSong && (savedSong === song.title || savedSong === song.id)) {
      opt.selected = true;
      matched = true;
    }
    songSelect.appendChild(opt);
  });

  if (!matched && songSelect.options.length > 0) {
    songSelect.options[0].selected = true;
  }

  // Trigger change event to update active timer/resource links for the selected song
  songSelect.dispatchEvent(new Event('change'));
}

function populateSongSelectDropdown() {
  const select = document.getElementById('songSelect') || document.querySelector('.rehearsal-song-select') || document.getElementById('targetSong');
  if (!select) return;
  const settings = getUserSettings();
  populateSongDropdown(settings.songs || []);
}`;

if (populateDropdownRegex.test(content)) {
  content = content.replace(populateDropdownRegex, newPopulateCode);
  console.log('Successfully replaced populateSongDropdown and populateSongSelectDropdown');
} else {
  console.warn('Could not match populateDropdownRegex, inspecting around populateSongDropdown');
}

// 4. Add renderRepertoireEmptyState and update renderSelectedSongResource
const renderRepertoireEmptyStateDef = `function renderRepertoireEmptyState() {
  const container = document.getElementById("dynamicResourceContainer");
  if (container) {
    container.innerHTML = \`
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
          <a href="\${REPERTOIRE_CONFIG.TEMPLATE_COPY_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-copy-template" id="btnCopyTemplate" style="font-size: 0.85rem; padding: 9px 18px; text-decoration: none;">
            📑 Copy Repertoire Template ↗
          </a>
        </div>
      </div>
    \`;
    wireCopyTemplateButton();
  }
}

`;

if (!content.includes('function renderRepertoireEmptyState()')) {
  content = content.replace('function renderSelectedSongResource(songKey) {', renderRepertoireEmptyStateDef + 'function renderSelectedSongResource(songKey) {');
}

// 5. Update renderSelectedSongResource if(!song) handling
const oldSongCheck = `  const song = getSongResource(songKey);
  if (!song) {
    container.innerHTML = \`<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.85rem;">No piece selected.</div>\`;
    return;
  }`;

const newSongCheck = `  const song = getSongResource(songKey);
  if (!song) {
    const hasConfiguredSheet = Boolean(localStorage.getItem("kantimes_active_sheet_id"));
    if (!hasConfiguredSheet) {
      renderRepertoireEmptyState();
    } else {
      container.innerHTML = \`<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.85rem;">No piece selected.</div>\`;
    }
    return;
  }`;

if (content.includes(oldSongCheck)) {
  content = content.replace(oldSongCheck, newSongCheck);
  console.log('Successfully updated renderSelectedSongResource empty state check');
} else {
  console.warn('Could not find exact oldSongCheck in content');
}

// 6. Ensure wireCopyTemplateButton() is called inside DOMContentLoaded
if (content.includes('initStakeRepertoireSync();') && !content.includes('wireCopyTemplateButton();\n  initStakeRepertoireSync();')) {
  content = content.replace('initStakeRepertoireSync();', 'wireCopyTemplateButton();\n  initStakeRepertoireSync();');
}

// 7. Ensure window exports at the bottom
if (!content.includes('window.REPERTOIRE_CONFIG = REPERTOIRE_CONFIG;')) {
  content += '\nwindow.REPERTOIRE_CONFIG = REPERTOIRE_CONFIG;\nwindow.wireCopyTemplateButton = wireCopyTemplateButton;\nwindow.renderRepertoireEmptyState = renderRepertoireEmptyState;\n';
}

fs.writeFileSync('script.js', content, 'utf8');
console.log('Finished updating script.js');

