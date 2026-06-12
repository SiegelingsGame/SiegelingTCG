# Loading screen art

Drop loading-screen images into this folder and they automatically appear in:

- the loading screen shown while the hub boots and when heading into a match
- the Art Gallery (Home → Settings → Art Gallery)
- the custom page background and profile card art pickers

## Naming convention

Each piece pairs a landscape and a portrait file by name:

```
fire-fox-ridge-landscape.png
fire-fox-ridge-portrait.png
```

- The part before `-landscape` / `-portrait` is the piece id; it becomes the
  display title (`fire-fox-ridge` → "Fire Fox Ridge").
- Either orientation may be omitted — the other is used as a fallback.
- Supported extensions: png, jpg, jpeg, webp, gif.

No manifest needed — `/api/art/loading` scans this folder at request time.
