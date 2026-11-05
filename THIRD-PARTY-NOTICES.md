# Third-party components

The root MIT license applies to original application code, not to every third-party component.

- The bundled browser ZIP module is JSZip 3.10.1, including pako. Its original copyright comments remain in `static/reports/zip-library.mjs`. Full licenses are retained in `LICENSES/JSZip.txt` and `LICENSES/pako.txt`. JSZip offers MIT or GPLv3; this distribution uses its MIT option. Pako uses MIT and zlib terms as stated in its license.
- English and Khmer OCR model files are from `tesseract-ocr/tessdata_fast` under Apache-2.0. Their license, source URLs and checksums are retained in `backend/reports/assets/ocr/LICENSE` and `SOURCES.json`. The model files are unmodified.
- npm packages are installed separately using the exact `package-lock.json` dependency graph. Their licenses remain in the installed packages. They include the Netlify database adapter, docx, JSZip, xml-js, Sharp, PDF.js, napi-rs canvas and Tesseract.js; test packages include pdf-lib and PGlite. Native libraries and transitive dependencies have additional license notices.

Repackaging native dependencies or redistributing a built hosting bundle requires retaining all applicable third-party notices. Do not relabel those dependencies as solely authored by this project's author.
