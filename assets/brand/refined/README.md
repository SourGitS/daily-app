# Daily — final PNG asset pack

The approved borderless DA / DAILY identity, with the four-point star integrated into the D.

## PNGs

- `daily-wordmark-light.png`: black lettering on real transparency, 1877 × 412.
- `daily-wordmark-dark.png`: white lettering on real transparency, 1877 × 412.
- `daily-wordmark-mask.png`: the identical transparent silhouette, for system-colour rendering.
- `daily-app-icon-1024.png`: static white DA on uniform #101012, 1024 × 1024.
- `daily-app-icon-512.png`: 512 × 512 manifest icon.
- `daily-app-icon-192.png`: 192 × 192 manifest icon.
- `daily-app-icon-180.png`: 180 × 180 Apple touch icon.
- `preview.png`: light/dark, accent-colour and small-size checks. View at 100% for labelled pixel sizes.

The icon backgrounds intentionally extend into square corners: the platform applies its own outer shape. There is no internal border or weather-specific app-icon variant. The mark is centred at 68% of canvas width to allow space for platform masks.

## Use the system colour for the in-app logo

Use `daily-wordmark-mask.png` with the supplied optional `daily-brand.css`, and accessible markup:

```html
<span class="daily-brand-logo" role="img" aria-label="Daily"></span>
```

The stylesheet uses Daily's existing `--accent-text`, which is adjusted for contrast against the current theme. This follows the app's selected accent, including weather when that appearance mode is selected. It introduces no second palette, weather listener or persisted setting. Black and white PNGs remain available for ordinary image placement.

The stylesheet is not loaded into the application yet. When integrating it, append the stylesheet link after existing styles, replace the paired wordmark image markup at each existing logo location, and preserve each location's dimensions. Update manifest/icon references to the exported files and bump the service-worker cache with that real application change. Check the header at its desktop and mobile heights and onboarding/sidebar locations. No existing app files or deployment were changed by this export.

## Export and checks

Artwork originated in the built-in image generator using the approved reference board. The user authorised local image processing after the generator returned an opaque checkerboard instead of alpha transparency. Local processing removed the pale backdrop, converted letter coverage to alpha, cropped unused space with 12 px padding, and produced identical black/white/mask geometry. The static icon was normalised to flat white on #101012 and resized with high-quality bicubic resampling.

Verified: logo PNGs have RGBA transparency, empty corners have alpha 0, and icon PNG dimensions match filenames with fully opaque backgrounds. The light/dark and small-size preview was visually inspected. At tiny sizes the DA remains dominant; the star's fine detail naturally reduces.

Source images and `export-assets.ps1` are retained in the workspace for reproducibility but omitted from the delivery ZIP. Run the exporter with Windows PowerShell 5.1 (`powershell.exe`), which supplies its System.Drawing reference.
