# FMM Terrain Studio

A local, web-based fantasy terrain painter. Double-click **Launch FMM.cmd** to open it in a standalone Edge or Chrome window with no address bar. Node.js 20+ is required. The launcher installs the two locked dependencies on its first run if needed; subsequent launches work offline.

## Painting

- Paint directly in the **2D map or 3D terrain view**. Use Split view to see both update.
- **Raise (R), Lower (L), Flatten (F), Smooth (S), Stamp (T), Pan (H)**.
- Flatten samples the terrain height where the stroke begins. Stamp places one heightmap imprint per click; select a downloaded brush for mountain shapes.
- **Shift** temporarily smooths; **Alt** reverses raise/lower; **[ / ]** resize the brush.
- **Space + drag** pans, **wheel** zooms, **right-drag in 3D** orbits, and **Home** fits the world.
- **Focus here** centers the 3D view on the 2D map's center.
- The separate **Ocean** layer has adjustable sea level and visibility. Water never overwrites terrain heights.
- **Expand** adds 256 samples to any border or every border, with undo support.

All **44 supplied 2048², 16-bit heightmaps** are included as optimized 256², 16-bit brush masks. The originals in `Heightmaps` are untouched. Thumbnails are generated separately. Run `npm run prepare-brushes` after adding PNG brushes to that folder.

## Saving and history

**Save world / Ctrl+S** downloads a `.fmm` file with the terrain, world extent, ocean settings, and retained undo/redo history. **Open** restores it. Keep these files as your portable backups. A browser-local IndexedDB recovery copy is also saved shortly after edits and restored on launch; it is tied to the browser profile and local port, and can be lost if browser data is cleared.

**Undo / Ctrl+Z**, **Redo / Ctrl+Y / Ctrl+Shift+Z**, or click a history row to return to that state. The history keeps up to **2,000 edits or 256 MiB**, retiring oldest steps when either budget is reached. One unusually large edit is retained even when it exceeds the budget. Starting a new stroke after undo replaces the redo branch. Ocean and expansion changes are included. The list shows a moving window of history with jumps to the oldest and latest states.

**New ocean world** starts with no allocated terrain. Opening another world or starting a new one first downloads the current world as a backup after confirmation. **Export heightmap** writes a 16-bit, big-endian PGM image, with heights from -1 to 2 mapped to 0–65535; its header includes origin and sea level. Whole-world export is limited to 16 million samples. `.fmm` retains full float precision and tiled coordinates.

## Running manually

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173. Set `FMM_PORT` to use another port. The server binds only to loopback, serves only the application and Three.js, and has no remote services or accounts.

The launcher uses a dedicated browser profile in `.runtime/browser-profile`, checks server readiness, and reuses a running FMM server. Closing the window leaves the small local server running so relaunching is quick. **Stop FMM.cmd** stops the server started by the launcher. A server started manually with `npm start` is stopped with Ctrl+C in its terminal.

## Large-world design

See [ARCHITECTURE.md](ARCHITECTURE.md) for the storage model, current limits, and the next stages for continent-scale editing. This is a working foundation; it does not yet stream an unlimited edited world from disk.

## Verification

`npm test` exercises brushes across tile boundaries, undo/redo branching and budgets, expansion, sea-level history, lossless file round trips, corrupt input, and all supplied brush masks.

The interface uses Canvas 2D and [Three.js](https://threejs.org/docs/). A WebGL 2 browser is required for the 3D view; 2D editing remains available if WebGL initialization fails.
