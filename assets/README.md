# App icon & splash sources

Drop your source images here, then run `npm run assets` to generate every
Android (and later iOS) icon + splash size automatically via `@capacitor/assets`.

## Files to provide

| File | Size | Notes |
|------|------|-------|
| `icon.png` | **1024×1024** | The app logo on a solid background. No transparency needed. |
| `splash.png` | **2732×2732** | Logo centered with lots of padding, on `#0F172A`. |
| `splash-dark.png` | 2732×2732 | *(optional)* dark-mode splash; falls back to `splash.png`. |

Optional, for Android **adaptive** icons (nicer, but `icon.png` alone is fine):
- `icon-foreground.png` (1024×1024, transparent — just the logo mark)
- `icon-background.png` (1024×1024, the solid/brand background)

## Generate

```bash
npm run assets          # writes icons + splashes into android/ (and ios/ once added)
npm run cap:sync        # copy into the native project
```

The `assets` script pins the brand background `#0F172A` for icon + splash
(light and dark). Adjust the colors in package.json if the logo needs a
different backdrop.
