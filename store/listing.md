# Chrome Web Store listing

Copy for the Chrome Web Store developer dashboard. Keep this in sync with the live listing.

The dashboard's text fields are plain text: no Markdown, bold or links (URLs are shown as text). Line breaks are kept. Paste the contents of each `text` block as-is.

## Store listing tab

**Summary** (shown under the name, max 132 characters):

```text
Right-click any image and save it as PNG, JPEG or WEBP, or keep its original format (AVIF, GIF, SVG).
```

**Description:**

```text
Websites often serve images as WEBP or AVIF, which many apps still can't open. Image Save As adds a "Save image as format…" option to the right-click menu so you choose the format when you save.

• Convert any image to PNG, JPEG or WEBP
• Save AVIF, GIF, SVG or any other image in its original format, unchanged
• If the image is already in the format you pick, the original file is saved with no quality loss
• Adjustable JPEG / WEBP quality
• Optionally skip the save dialog and save straight to your Downloads folder
• Turn the menu on or off from the toolbar popup

How to use: right-click an image, choose "Save image as format…", then pick PNG, JPEG, WEBP or Original format.

Good to know:
• Converting an animated GIF or WEBP saves its first frame.
• JPEG doesn't support transparency, so transparent areas become white.
• Some images can't be saved: images drawn on a canvas, CSS background images, and images that the site only serves to its own pages.

Private by design: no data collection, no analytics, no ads. Images are processed entirely on your computer.

Open source (MIT): https://github.com/groovc/image-save-as
```

**Category:** Tools (or the closest "Tools / Productivity" category offered)

**Language:** English

**Graphics:**
- Store icon: `icons/icon128.png`
- Small promo tile (440×280): `store/promo-small.png`
- Screenshots (1280×800, upload in this order): `store/screenshot-menu.jpg` (right-click submenu), `store/screenshot-popup.jpg` (popup settings)

**Homepage URL:** https://github.com/groovc/image-save-as
**Support URL:** https://github.com/groovc/image-save-as/issues

## Privacy practices tab

**Single purpose:**

```text
Save an image from a web page in a format the user chooses (PNG, JPEG or WEBP), or in its original format.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `contextMenus` | Adds the "Save image as format…" item to the right-click menu on images. This is the extension's only entry point. |
| `downloads` | Saves the converted or original image to the user's computer, with or without the Save As dialog depending on the user's setting. |
| `storage` | Stores the user's three settings (menu on/off, ask where to save, JPEG/WEBP quality) locally, and the last error message in session storage so the popup can show it. |
| `offscreen` | Image decoding and canvas encoding need a DOM, which the service worker doesn't have. The offscreen document converts the image and holds it as a blob URL for the download. |
| Host permission `<all_urls>` | When the user chooses to save an image, the extension downloads that image's bytes to detect its real format and convert it. Images are usually hosted on a different domain (CDN) than the page, so access can't be limited to the current tab. Requests are only made for the image the user right-clicked. Page content is never read or modified. |

**Remote code:** No, I am not using remote code. All code is included in the package.

**Data usage:** Collects none of the listed data types. Tick all three certifications (no selling or transferring data to third parties, no use unrelated to the single purpose, no use for creditworthiness or lending).

**Privacy policy URL:** https://github.com/groovc/image-save-as/blob/main/PRIVACY.md

## Distribution tab

- Visibility: Public
- Regions: All regions
