# ZXing browser decoder

- Browser layer: `@zxing/browser` 0.2.1, MIT license.
- Bundled core: `@zxing/library`, Apache-2.0 license.
- Upstream: https://github.com/zxing-js/browser
- Browser bundle SHA-256: `066BC34EDFCDD4A33F0964AEEC967752A0DEA1CCAF36E58E319AC9FCB5070F6A`.

The checked-in UMD distribution is loaded locally by `public/index.html`. It is
used only when the native `BarcodeDetector` API does not advertise every
required EAN/UPC and QR format, or when native decoding cannot read an uploaded
image. The accompanying license files must remain with the bundle.
