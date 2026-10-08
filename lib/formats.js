// Image format detection and filename helpers. Pure functions, no chrome.* APIs.

// Formats Chrome's canvas can encode. Keys match the context menu's format ids.
export const CONVERTIBLE = {
  png: { mime: 'image/png', ext: 'png' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  webp: { mime: 'image/webp', ext: 'webp' },
};

// Every format we can recognise, for saving originals with the right extension.
export const FORMAT_INFO = {
  ...CONVERTIBLE,
  gif: { mime: 'image/gif', ext: 'gif' },
  avif: { mime: 'image/avif', ext: 'avif' },
  svg: { mime: 'image/svg+xml', ext: 'svg' },
  bmp: { mime: 'image/bmp', ext: 'bmp' },
  ico: { mime: 'image/x-icon', ext: 'ico' },
  tiff: { mime: 'image/tiff', ext: 'tif' },
};

const MIME_TO_FORMAT = {
  'image/png': 'png',
  'image/apng': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
};

// Magic bytes win over Content-Type, since servers often mislabel images.
export function detectFormat(bytes, contentType = '') {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return sniffFormat(bytes) ?? MIME_TO_FORMAT[mime] ?? null;
}

export function sniffFormat(bytes) {
  const at = (start, end) => ascii(bytes, start, end);
  if (bytes[0] === 0x89 && at(1, 4) === 'PNG') return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (at(0, 4) === 'GIF8') return 'gif';
  if (at(0, 4) === 'RIFF' && at(8, 12) === 'WEBP') return 'webp';
  if (at(4, 8) === 'ftyp' && hasAvifBrand(bytes)) return 'avif';
  if (at(0, 2) === 'BM') return 'bmp';
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'ico';
  if (at(0, 4) === 'II*\0' || at(0, 4) === 'MM\0*') return 'tiff';
  if (looksLikeSvg(bytes)) return 'svg';
  return null;
}

// Filename without extension, taken from the URL path. data: and other URLs fall back to "image".
export function baseName(srcUrl) {
  let name = '';
  try {
    const url = new URL(srcUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      name = url.pathname.split('/').pop() ?? '';
      name = decodeURIComponent(name);
    }
  } catch {
    // Malformed URL or escape sequence; use whatever we have so far.
  }
  name = name
    .replace(/\.[^.]*$/, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 100);
  return name || 'image';
}

function ascii(bytes, start, end) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

// AVIF is an ISO-BMFF file whose ftyp box lists the "avif" or "avis" brand.
function hasAvifBrand(bytes) {
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(boxSize, bytes.length);
  for (let i = 8; i + 4 <= end; i += 4) {
    if (i === 12) continue; // minor_version, not a brand
    const brand = ascii(bytes, i, i + 4);
    if (brand === 'avif' || brand === 'avis') return true;
  }
  return false;
}

function looksLikeSvg(bytes) {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).trimStart();
  return head.startsWith('<') && /<svg[\s>]/i.test(head);
}
