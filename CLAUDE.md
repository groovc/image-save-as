# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Image Save As is a Manifest V3 Chrome extension that adds a right-click "Save image as format…" menu to images. Plain JavaScript (ES modules), no dependencies and no build step. `README.md` is the user-facing spec. Keep it in sync when behavior, permissions or the file layout change.

## Running

- Load the folder as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked). Click the reload icon on its card after each change.
- Service worker logs: "Inspect views: service worker" on the extension card. The offscreen document shows up there too, while it's open.
- There is no test suite or linter. `lib/formats.js` has no `chrome.*` dependencies, so it can be imported and tested directly in Node. `node --check --input-type=module < file.js` syntax-checks a file.

## Architecture

The work is split three ways because of MV3 API limits:

- **`background.js` (service worker)** owns the context menu, the `enabled` flag (`chrome.storage.local`, default true) and `chrome.downloads`. It can't decode SVG or call `URL.createObjectURL`, so it hands every save to the offscreen document.
- **`offscreen/offscreen.js`** fetches the image, detects its format, converts it if needed, and returns `{ url: blobUrl, filename }`. It has no `downloads` API, so the service worker does the download.
- **Messaging** goes through `chrome.runtime.sendMessage` with `target: 'offscreen'`. Types are `prepare` (returns the result or `{ error }`) and `revoke`. Runtime messages are JSON-serialized, so bytes can't be passed directly. That's why the result travels as a blob URL.
- **Blob URL lifetime:** blob URLs live in the offscreen document. The service worker maps download id → blob URL in `chrome.storage.session` (it may be suspended mid-download). It sends `revoke` when `downloads.onChanged` reports complete or interrupted.
- **Errors** are shown as a red `!` badge. The message is stored in `chrome.storage.session.lastError`, which the popup displays.
- **Menu item ids** are `save-as-format:<format>`, where format is `png`, `jpeg`, `webp` or `original`. These keys match `CONVERTIBLE` and `FORMAT_INFO` in `lib/formats.js`.

## Format rules (key design decisions)

- **Conversion targets are only PNG, JPEG and WEBP.** These are the formats canvas can encode. `convertToBlob` silently falls back to PNG for anything else, so the output type is verified.
- **AVIF, GIF and SVG are covered by "Original format"**, which saves the fetched bytes unchanged. Chrome can't show menu items conditionally based on the clicked image, so there's no per-format AVIF/GIF/SVG item. Showing the detected format in the menu label (for example via hover pre-detection in a content script) was considered and rejected. The save dialog already shows the real extension. Don't add WASM encoders, or fake SVG output by wrapping a bitmap, unless the user asks.
- **Same-format saves skip re-encoding.** If the chosen format equals the detected source format, the original bytes are saved.
- **Detection uses magic bytes first, then `Content-Type`.** Never use the URL extension.
- **The fetch sends Chrome's `<img>` `Accept` header**, so content negotiation returns the same file the user sees.
- **Decoding:** SVG goes through an `<img>`, because `createImageBitmap` can't rasterise it. Animated sources convert to their first frame. JPEG fills transparency with white.

## Constraints

- **`host_permissions: ["<all_urls>"]` is required.** Images are usually on a different origin than the page, so `activeTab` isn't enough.
- **Known unsupported cases:** `blob:` URLs, CSS backgrounds and `<canvas>` elements (no image context menu), signed-in-only images, and Referer-based hotlink protection.
- **Icons** in `icons/` are generated PNGs (a blue rounded square with a white picture glyph). Regenerate all four sizes together if the design changes.
