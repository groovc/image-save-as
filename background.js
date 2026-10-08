// Service worker: owns the context menu, the enabled flag and downloads.
// Fetching and conversion happen in the offscreen document (see offscreen/offscreen.js),
// because the service worker can't decode SVG or create blob URLs.

const MENU_ID = 'save-as-format';
const MENU_ITEMS = [
  { format: 'png', title: 'PNG' },
  { format: 'jpeg', title: 'JPEG' },
  { format: 'webp', title: 'WEBP' },
  { type: 'separator' },
  { format: 'original', title: 'Original format (AVIF, GIF, SVG…)' },
];
// Defaults for settings in chrome.storage.local. Keep in sync with popup/popup.js.
const DEFAULT_SETTINGS = { enabled: true, askWhereToSave: true, quality: 92 };
const OFFSCREEN_PATH = 'offscreen/offscreen.html';
const ERROR_BADGE_MS = 8000;
const DOWNLOAD_ERRORS = {
  FILE_NO_SPACE: 'Not enough disk space',
  FILE_ACCESS_DENIED: 'No permission to save there',
  FILE_NAME_TOO_LONG: 'File name too long',
};
let errorBadgeTimer;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  const enabled = await isEnabled();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Save image as format…',
    contexts: ['image'],
    visible: enabled,
  });
  MENU_ITEMS.forEach((item, index) => {
    chrome.contextMenus.create({
      id: `${MENU_ID}:${item.format ?? `separator-${index}`}`,
      parentId: MENU_ID,
      type: item.type ?? 'normal',
      title: item.title,
      contexts: ['image'],
    });
  });
  await applyEnabled();
});

chrome.runtime.onStartup.addListener(applyEnabled);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'enabled' in changes) applyEnabled();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const [parent, format] = String(info.menuItemId).split(':');
  if (parent !== MENU_ID || !format || !info.srcUrl) return;
  try {
    await saveImage(info.srcUrl, format);
  } catch (err) {
    await showError(err.message || String(err));
  }
});

// Release the blob URL once Chrome has finished writing the file.
chrome.downloads.onChanged.addListener(async (delta) => {
  await finishDownload(delta.id, delta.state?.current, delta.error?.current);
});

// Events and the post-registration check can observe the same terminal state.
const finishingDownloads = new Map();
function finishDownload(id, state, error) {
  if (state !== 'complete' && state !== 'interrupted') return;
  if (finishingDownloads.has(id)) return finishingDownloads.get(id);
  const task = (async () => {
    const key = `download:${id}`;
    const { [key]: blobUrl } = await chrome.storage.session.get(key);
    // Download events include files started elsewhere in the browser.
    if (!blobUrl) return;
    await chrome.storage.session.remove(key);
    revokeBlobUrl(blobUrl);
    if (state === 'interrupted' && error !== 'USER_CANCELED') {
      const reason = DOWNLOAD_ERRORS[error] || error || 'Download interrupted';
      await showError(`Couldn't save the image (${reason}).`);
    }
  })().finally(() => finishingDownloads.delete(id));
  finishingDownloads.set(id, task);
  return task;
}

async function getSettings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}

async function isEnabled() {
  return (await getSettings()).enabled;
}

async function applyEnabled() {
  const enabled = await isEnabled();
  chrome.contextMenus.update(MENU_ID, { visible: enabled }, () => void chrome.runtime.lastError);
  await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await chrome.action.setTitle({ title: enabled ? 'Image Save As' : 'Image Save As (off)' });
}

async function saveImage(srcUrl, format) {
  const { askWhereToSave, quality } = await getSettings();
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'prepare', srcUrl, format, quality });
  if (!result) throw new Error('The image converter did not respond.');
  if (result.error) throw new Error(result.error);

  let downloadId;
  try {
    // Clear the previous error before download events can report a new one.
    await chrome.storage.session.remove('lastError');
    clearTimeout(errorBadgeTimer);
    await applyEnabled();
    downloadId = await chrome.downloads.download({
      url: result.url,
      filename: result.filename,
      saveAs: askWhereToSave,
      conflictAction: 'uniquify',
    });
  } catch (err) {
    revokeBlobUrl(result.url);
    // Closing the save dialog isn't an error worth reporting.
    if (/cancel/i.test(err.message)) return;
    throw err;
  }
  await chrome.storage.session.set({ [`download:${downloadId}`]: result.url });
  // Small downloads can finish before their blob URL is registered above.
  const [download] = await chrome.downloads.search({ id: downloadId });
  // An earlier handler may still be finishing after reading an empty record.
  // Wait for it so the following call retries cleanup with the registered URL.
  await finishingDownloads.get(downloadId);
  if (download) await finishDownload(downloadId, download.state, download.error);
}

let creatingOffscreen;
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  if (contexts.length) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['BLOBS'],
      justification: 'Decode and re-encode images, and hold the result as a blob URL for download.',
    })
    .finally(() => {
      creatingOffscreen = undefined;
    });
  await creatingOffscreen;
}

function revokeBlobUrl(url) {
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'revoke', url }).catch(() => {
    // The offscreen document is gone, and its blob URLs with it.
  });
}

async function showError(message) {
  console.error('[Image Save As]', message);
  await chrome.storage.session.set({ lastError: { message, time: Date.now() } });
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setTitle({ title: `Image Save As: ${message}` });
  clearTimeout(errorBadgeTimer);
  errorBadgeTimer = setTimeout(applyEnabled, ERROR_BADGE_MS);
}
