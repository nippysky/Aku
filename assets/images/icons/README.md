# Akù Alternate App Icons

Place 1024×1024 PNG files here before running `eas build`.

## Icon variants

| File                 | Background | Accent    | Theme        |
|----------------------|-----------|-----------|--------------|
| `icon-midnight.png`  | `#0F1110` | `#C9A96A` | Pure black   |
| `icon-gold.png`      | `#C9A96A` | `#163A2F` | Rich gold    |
| `icon-linen.png`     | `#FAFAF8` | `#163A2F` | Bright/clean |
| `icon-graphite.png`  | `#2A2D2B` | `#C9A96A` | Dark grey    |
| `icon-coral.png`     | `#E8734A` | `#FAFAF8` | Warm coral   |

## Spec

- **Size:** 1024 × 1024 px
- **Format:** PNG (no transparency — iOS composites the rounded corners)
- **Corner radius:** Do NOT pre-round; iOS applies the squircle mask automatically

## Generating icons

Install the `canvas` package locally (dev only, not in production bundle):

```bash
npm install canvas
node scripts/generate-icons.js
```

Or use any design tool and export at 1024×1024 per the color values above.
