# OmniViewer

<img src="src/icon.svg" width="96" align="right" alt="">

A Firefox extension (also works in Firefox-based browsers like Zen) that opens `.docx`,
`.pptx` and `.xlsx` files right in the browser, the same way the built-in PDF viewer
works: click a link and the document opens in a tab, with a button to download the
original file.

- Everything runs locally. Documents are never sent to any service.
- It reuses the bytes of the site's own response instead of downloading again, so it
  works on pages behind a login, POST downloads and one-time links (Moodle, webmail…).
- Zoom with Ctrl+scroll, touchpad pinch, or Ctrl `+` / `-` / `0`.
- Local files: click the toolbar button and drop the file on the page.
- UI in English and Brazilian Portuguese.

Rendering is done by [docx-preview](https://github.com/VolodymyrBaydalka/docxjs),
[@aiden0z/pptx-renderer](https://github.com/aiden0z/pptx-renderer) and
[SheetJS](https://sheetjs.com/). Legacy binary formats (`.doc`, `.ppt`, `.xls`) are not
supported.

## How it works

`src/background.ts` watches HTTP responses (`webRequest.onHeadersReceived`). When one is
an OOXML document (by `Content-Type` or file name), `webRequest.filterResponseData`
captures its bytes and the tab is sent to `viewer.html`, which renders the document.
`filterResponseData` only exists in Firefox, which is why there is no Chrome version.

## Build

Requirements: Node.js 22+ and pnpm 11 (pinned in `package.json`; `corepack enable` picks it up).

```sh
pnpm install
pnpm build                                  # writes the unpacked extension to dist/
npx web-ext build -s dist -a artifacts      # packs it into artifacts/
```

`dist/` is produced by esbuild from `src/` (bundled, not minified). See `build.mjs`.

## Tests

```sh
pnpm typecheck
pnpm test           # unit tests (type detection, zoom math, locales)
pnpm test:e2e       # headless Firefox + local server; needs firefox and geckodriver in PATH
```

The end-to-end suite covers: correct MIME type, `Content-Disposition: attachment` with a
UTF-8 file name, gzip, a cookie-protected route (downloaded only once), POST,
`target=_blank`, iframe-triggered downloads, an invalid file, plain HTML pages not being
intercepted, and zoom (scale, anchoring under the cursor, no re-render of the document).

## License

[MIT](LICENSE)
