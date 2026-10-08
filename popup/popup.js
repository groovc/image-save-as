// Defaults for settings in chrome.storage.local. Keep in sync with background.js.
const DEFAULT_SETTINGS = { enabled: true, askWhereToSave: true, quality: 92 };

const enabledToggle = document.getElementById('enabled');
const askToggle = document.getElementById('askWhereToSave');
const qualitySlider = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const settings = document.getElementById('settings');
const statusText = document.getElementById('status');
const errorBox = document.getElementById('error');

function renderStatus() {
  statusText.textContent = enabledToggle.checked
    ? 'Right-click an image and choose “Save image as format…”.'
    : 'The menu item is hidden until you turn this back on.';
  settings.disabled = !enabledToggle.checked;
}

function renderQuality() {
  qualityValue.textContent = `${qualitySlider.value}%`;
}

const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
enabledToggle.checked = stored.enabled;
askToggle.checked = stored.askWhereToSave;
qualitySlider.value = stored.quality;
renderStatus();
renderQuality();

enabledToggle.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabledToggle.checked });
  renderStatus();
});

askToggle.addEventListener('change', () => {
  chrome.storage.local.set({ askWhereToSave: askToggle.checked });
});

qualitySlider.addEventListener('input', renderQuality);
// Save on release rather than on every step of the drag.
qualitySlider.addEventListener('change', () => {
  chrome.storage.local.set({ quality: Number(qualitySlider.value) });
});

const { lastError } = await chrome.storage.session.get('lastError');
if (lastError) {
  errorBox.textContent = `Last save failed: ${lastError.message}`;
  errorBox.hidden = false;
}
