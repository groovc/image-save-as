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
const OFFSCREEN_PATH = 'offscreen/offscreen.html';
const ERROR_BADGE_MS = 8000;

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
    await chrome.storage.session.remove('lastError');
  } catch (err) {
    await showError(err.message || String(err));
  }
});

// Release the blob URL once Chrome has finished writing the file.
chrome.downloads.onChanged.addListener(async (delta) => {
  const state = delta.state?.current;
  if (state !== 'complete' && state !== 'interrupted') return;
  const key = `download:${delta.id}`;
  const { [key]: blobUrl } = await chrome.storage.session.get(key);
  if (!blobUrl) return;
  await chrome.storage.session.remove(key);
  revokeBlobUrl(blobUrl);
});

async function isEnabled() {
  const { enabled = true } = await chrome.storage.local.get('enabled');
  return enabled;
}

async function applyEnabled() {
  const enabled = await isEnabled();
  chrome.contextMenus.update(MENU_ID, { visible: enabled }, () => void chrome.runtime.lastError);
  await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await chrome.action.setTitle({ title: enabled ? 'Image Save As' : 'Image Save As (off)' });
}

async function saveImage(srcUrl, format) {
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'prepare', srcUrl, format });
  if (!result) throw new Error('The image converter did not respond.');
  if (result.error) throw new Error(result.error);

  let downloadId;
  try {
    downloadId = await chrome.downloads.download({ url: result.url, filename: result.filename, saveAs: true });
  } catch (err) {
    revokeBlobUrl(result.url);
    // Closing the save dialog isn't an error worth reporting.
    if (/cancel/i.test(err.message)) return;
    throw err;
  }
  await chrome.storage.session.set({ [`download:${downloadId}`]: result.url });
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
  setTimeout(applyEnabled, ERROR_BADGE_MS);
}
