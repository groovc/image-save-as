# Image Save As

A Chrome extension that lets you right-click any image on the web and save it in the format you choose.

Browsers usually save images in whatever format the site serves, which is often WEBP or AVIF. Image Save As adds a context-menu option so you can pick the format at save time.

## Features

- Right-click any image and choose **Save image as format…** from the context menu
- Convert and save as **PNG**, **JPEG / JPG** or **WEBP**
- Save **AVIF**, **GIF**, **SVG** (or any other image) in its original format, without conversion
- Can be switched on and off, so it stays out of the way when you don't need it
- Optionally save straight to your Downloads folder without a dialog
- Adjustable JPEG / WEBP quality

## Installation

The extension isn't on the Chrome Web Store yet. To load it as an unpacked extension:

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this project folder.
5. Optionally, pin the extension from the puzzle-piece menu in the toolbar.

## Usage

1. Click the extension icon and make sure it is **enabled**.
2. Right-click an image on any web page.
3. Choose **Save image as format…**, then **PNG**, **JPEG**, **WEBP** or **Original format**.
4. Pick a location in the save dialog (unless you've turned it off, see below).

If a save fails, the toolbar icon shows a red **!** and the popup explains what went wrong.

## Settings

Click the toolbar icon to open the popup:

| Setting | Default | What it does |
| ------- | ------- | ------------ |
| Enable right-click menu | On | Shows or hides the menu item. |
| Ask where to save each file | On | When off, files go straight to your Downloads folder. Name clashes get a number added, like `photo (1).png`. |
| JPEG / WEBP quality | 92% | 50–100%. Lower means smaller files. Doesn't affect PNG or files saved in their original format. |

## Supported formats

| Format | Save as | Notes |
| ------ | ------- | ----- |
| PNG | Convert from any image | Lossless, supports transparency. |
| JPEG / JPG | Convert from any image | Lossy, no transparency. Transparent areas are filled with a white background. |
| WEBP | Convert from any image | Supports transparency. |
| AVIF | Original format | Saved unchanged when the source image is AVIF. |
| GIF | Original format | Saved unchanged when the source image is GIF, so animation is kept. |
| SVG | Original format | Saved unchanged when the source image is SVG, so it stays a true vector. |

Chrome can't encode AVIF, GIF or SVG, so these are covered by **Original format**. It saves the file exactly as the site served it, with the correct extension for its real format. The format is detected from the file's contents, not the URL.

If you pick PNG, JPEG or WEBP and the image is already in that format, the original file is saved without re-encoding, so there is no quality loss.

Converting to PNG, JPEG or WEBP:

- Uses the first frame of animated images.
- Can lose quality (JPEG and lossy WEBP) or transparency (JPEG).
- Turns SVG sources into raster images.

## Limitations

- **`blob:` image URLs** belong to the page and can't be read by the extension.
- **CSS background images** and **`<canvas>` elements** don't show the image context menu, so they can't be saved this way.
- **Images that need you to be signed in** may fail to load if the site requires cookies the extension can't send.
- **Hotlink-protected images** may fail if the site checks the `Referer` header, which the extension can't set.

## Permissions

| Permission | Why |
| ---------- | --- |
| `contextMenus` | Adds the right-click menu item. |
| `downloads` | Saves the file and opens the save dialog. |
| `storage` | Remembers whether the extension is enabled. |
| `offscreen` | Runs image conversion in a hidden page with canvas support. |
| `host_permissions: <all_urls>` | Fetches the image you clicked from whatever site hosts it. Images are often served from a different domain than the page, so access can't be limited to the current tab. |

Chrome shows the `<all_urls>` permission as "Read and change all your data on all websites." The extension only fetches the image you right-click, and only when you choose to save it.

## How it works

1. The **service worker** creates the context menu and listens for clicks.
2. It asks an **offscreen document** to fetch the image's original bytes and detect the format.
3. For **Original format**, or when the source already matches the format you picked, the bytes are kept unchanged.
4. Otherwise the offscreen document decodes the image and re-encodes it with `OffscreenCanvas.convertToBlob()` as PNG, JPEG or WEBP.
5. The service worker saves the result through `chrome.downloads.download` with the correct file extension.

## Development

```
image-save-as/
├── manifest.json      # Extension manifest (Manifest V3)
├── background.js      # Service worker: context menu, enabled state, downloads
├── offscreen/         # Offscreen document: fetching, format detection, conversion
├── lib/formats.js     # Format sniffing and filename helpers
├── popup/             # Enable/disable toggle and last error
└── icons/             # Extension icons
```

Edit the source, then click the reload icon on the extension's card at `chrome://extensions` to pick up your changes.

Run the download lifecycle regression tests with `node --test tests/background.test.cjs` (Node.js required). These use mocked Chrome APIs; verify browser behavior with the unpacked extension.

## Contributing

Issues and pull requests are welcome. Please describe the problem or feature clearly and include the page or image URL where you saw it, if relevant.

## License

[MIT](LICENSE)
