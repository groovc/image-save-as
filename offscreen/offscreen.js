// Offscreen document: fetches the image, detects its format, converts it if needed,
// and returns a blob URL for the service worker to download.

import { CONVERTIBLE, FORMAT_INFO, baseName, detectFormat } from '../lib/formats.js';

// Ask for the same formats Chrome requests for <img>, so content negotiation
// returns the file the user is looking at.
const IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
const QUALITY = 0.92;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;
  if (message.type === 'prepare') {
    prepare(message.srcUrl, message.format).then(sendResponse, (err) =>
      sendResponse({ error: err.message || String(err) }),
    );
    return true;
  }
  if (message.type === 'revoke') URL.revokeObjectURL(message.url);
  return false;
});

async function prepare(srcUrl, requested) {
  if (srcUrl.startsWith('blob:')) {
    throw new Error("This image uses a page-only blob: URL, which extensions can't read.");
  }

  let response;
  try {
    response = await fetch(srcUrl, { credentials: 'include', headers: { Accept: IMAGE_ACCEPT } });
  } catch {
    throw new Error("Couldn't download the image.");
  }
  if (!response.ok) throw new Error(`Couldn't download the image (HTTP ${response.status}).`);

  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const source = detectFormat(bytes, blob.type);
  const name = baseName(srcUrl);

  if (requested === 'original' || requested === source) {
    if (!source) throw new Error("Couldn't recognise this image's format.");
    const info = FORMAT_INFO[source];
    return toBlobUrl(new Blob([bytes], { type: info.mime }), `${name}.${info.ext}`);
  }

  const target = CONVERTIBLE[requested];
  if (!target) throw new Error(`Unknown format "${requested}".`);
  const input = new Blob([bytes], { type: source ? FORMAT_INFO[source].mime : blob.type });
  const output = await convert(input, source, target.mime);
  return toBlobUrl(output, `${name}.${target.ext}`);
}

function toBlobUrl(blob, filename) {
  return { url: URL.createObjectURL(blob), filename };
}

async function convert(blob, source, mime) {
  const decoded = await decode(blob, source);
  try {
    const { image, width, height } = decoded;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (mime === 'image/jpeg') {
      // JPEG has no alpha channel; fill transparency with white instead of black.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    const output = await canvas.convertToBlob({ type: mime, quality: QUALITY });
    // convertToBlob silently falls back to PNG for types it can't encode.
    if (output.type !== mime) throw new Error(`Chrome couldn't encode ${mime}.`);
    return output;
  } finally {
    decoded.release();
  }
}

// Animated images decode to their first frame.
async function decode(blob, source) {
  if (source === 'svg') return decodeSvg(blob);
  try {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    throw new Error("Chrome couldn't decode this image.");
  }
}

// createImageBitmap can't rasterise SVG, so go through an <img>.
async function decodeSvg(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Chrome couldn't render this SVG.");
  }
  // SVGs without width/height have no intrinsic size; use the browser's default replaced-element size.
  return {
    image: img,
    width: img.naturalWidth || 300,
    height: img.naturalHeight || 150,
    release: () => URL.revokeObjectURL(url),
  };
}
