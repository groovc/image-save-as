const toggle = document.getElementById('enabled');
const statusText = document.getElementById('status');
const errorBox = document.getElementById('error');

function renderStatus() {
  statusText.textContent = toggle.checked
    ? 'Right-click an image and choose “Save image as format…”.'
    : 'The menu item is hidden until you turn this back on.';
}

const { enabled = true } = await chrome.storage.local.get('enabled');
toggle.checked = enabled;
renderStatus();

toggle.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: toggle.checked });
  renderStatus();
});

const { lastError } = await chrome.storage.session.get('lastError');
if (lastError) {
  errorBox.textContent = `Last save failed: ${lastError.message}`;
  errorBox.hidden = false;
}
