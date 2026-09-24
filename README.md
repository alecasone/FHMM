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

All **44 supplied 2048², 16-bit heightmaps** are included as optimized 256², 16-bit brush masks. The originals in `Heightmaps` are untouched. Thumbnails are generated separately. Add PNGs to Heightmaps and click Scan in the brush library. New heightmaps are prepared on demand in a local runtime cache.

## Saving and history

**Save world / Ctrl+S** downloads a `.fmm` file with the terrain, world extent, ocean settings, and retained undo/redo history. **Open** restores it. Keep these files as your portable backups. A browser-local IndexedDB recovery copy is also saved shortly after edits and restored on launch; it is tied to the browser profile and local port, and can be lost if browser data is cleared.

**Undo / Ctrl+Z**, **Redo / Ctrl+Y / Ctrl+Shift+Z**, or click a history row to return to that state. The history keeps up to **2,000 edits or 256 MiB**, retiring oldest steps when either budget is reached. One unusually large edit is retained even when it exceeds the budget. Starting a new stroke after undo replaces the redo branch. Ocean and expansion changes are included. The list shows a moving window of history with jumps to the oldest and latest states.

**New ocean world** starts with no allocated terrain. Opening another world first downloads the current world as a backup after confirmation. Resetting a world is undoable. **Export heightmap** writes a 16-bit, big-endian PGM image, with heights from -1 to 2 mapped to 0–65535; its header includes origin and sea level. Whole-world export is limited to 16 million samples. `.fmm` retains full float precision and tiled coordinates.

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

## Biome painting and lighting (v0.2)

Switch the left panel to **Biomes** or press **B**. Choose grassland, forest, rainforest, taiga, savanna, desert, tundra, wetland, rock, or snow. The current brush shape, size, rotation, and strength control painting. Painting affects land above sea level and leaves heights unchanged. **Natural / E**, or **Shift while painting**, removes paint to reveal automatic terrain coloring. The Biomes layer checkbox toggles the painted overlay. Paint strokes use the same undo/redo history as sculpting.

Unpainted terrain is colored by elevation, slope, and deterministic moisture/surface variation. Biomes blend over that base rather than replacing terrain heights. Steep slopes expose rock, snow favors shelves, coasts become sandy, and high elevations transition into alpine terrain and snow. These are procedural visual approximations, not a climate or ecosystem simulation.

The 3D view uses stronger directional sunlight, reduced ambient fill, terrain shadows, and finer two-sample mesh spacing. Open **Sun & shadows** to change sun height and direction or disable shadows on slower hardware. Lighting and relief are view settings; biome paint is saved with the world.

**Reset views** rebuilds both render caches and resets cameras without touching your world. **Reset world** offers empty ocean or starter islands. It resets extent, heights, paint, and sea level while retaining the name, and is recorded as one undoable operation. Its history obeys the same memory budget as other operations. New ocean world opens the same reset dialog.

New saves use FMM version 2 and include biome weights and reset history. Existing version 1 worlds remain readable. Older app versions cannot open the new saves.

## Controlled brush buildup

**Blend** is the default buildup mode for Raise, Lower, and Stamp. Each drag applies one layer over the terrain that existed when the stroke began. Overlapping passes use the strongest brush contribution instead of adding more height, and holding still does not build a spike. Release and start another stroke to deliberately add another layer. This preserves the heightmap brush shape and existing terrain detail.

**Stroke height** sets the layer depth at full strength; the note below shows the actual maximum at your current strength. The default 300 m height and 45% strength allow up to 135 m per stroke. Lower either control for subtle work. **Additive** restores continuous Raise/Lower buildup while dragging or holding; its Stamp behavior places a single heightmap relative to the starting height.

Brush dabs are spaced by travel distance, so a high-frequency mouse no longer piles up extra terrain. Idle buildup stops while dragging. Smooth, Flatten, and biome painting keep their existing behavior. Both modes use the same undo/redo and save format.

## Rivers and view angles (v0.3)

Select **River**, choose width and channel depth, then sketch from a source toward an outlet in either view. The dashed preview is your guide; release to create the river. The tool smooths the route, optionally follows nearby low ground, chooses the downhill direction, cuts the bed through intervening ridges, and paints rocky beds and wetland banks. Water has animated flow in both views. Each river is one undoable operation, including its terrain and colors.

This is guided channel carving with a downhill water profile, not a rainfall, sediment, or fluid-volume simulation. Sculpting above the stored water surface blocks its visible flow. **Recarve channels** restores the saved paths after later terrain edits; that operation is undoable too. **River water** toggles the water surface independently of Ocean; carved terrain and bank paint remain. Rivers stop at the sea when they reach it. For a long river, draw it in sections; one stroke is limited to roughly 8,192 samples. The current feature budget is 128 rivers and 32,768 path points.

Open **Sun & shadows** and **View rotation** in the right sidebar. **Sun azimuth** (0° north, 90° east) and **Sun height** light both the 2D map and 3D terrain. **2D rotation** turns the map and compass while preserving accurate brush picking, panning, and zooming. **3D rotation** orbits the camera; right-drag orbiting updates its slider. **Reset rotations** restores the default angles. These are view settings, not changes to terrain. Distance fog has been removed from 3D.

New saves use **FMM3** to preserve rivers, layer visibility, and river undo/redo. FMM1 and FMM2 worlds still open. Older versions of the app cannot open FMM3 saves.

## Render distance and collapsible panels

**3D view → Render distance** changes the terrain radius around the camera focus, from 256 to 1,536 samples in 128-sample steps (default 768). Larger settings show farther across expanded worlds and use more graphics memory. Smaller settings suit close-up painting. Terrain loads progressively, nearest first; current edits take priority. Panning or **Focus here** moves the region. The ocean remains world-wide, and distance fog stays disabled. This changes the preview only, with full-resolution terrain preserved.

Click a sidebar section heading to open or close it, or use **Collapse all / Expand all** independently on either sidebar. Brush size and strength stay together; **Buildup & brush rotation** contains the advanced brush controls. Lighting, view rotation, layers, world expansion/export, and history each have their own section. Undo/Redo remain at the top of the right sidebar while you scroll. Switching tools opens the relevant brush settings. Panel choices and render distance are remembered in this browser, separately from world saves and undo history.

## Trees, shrubs, and rocks (v0.4)

Select **Objects** or press **O**, then choose **Pine tree**, **Broadleaf tree**, **Shrub**, or **Rock**. Edit in either the 2D map or 3D terrain view:

- **Scatter** splatters objects across a circular brush as you drag. Brush size sets the area; density sets the spacing. Overlapping passes in one stroke do not keep adding objects to the same spots, and holding still does not build up objects.
- **Detail** places one object at the cursor per click, even if you drag afterward. Zoom in for precise placement.
- **Eraser** removes objects whose anchors fall inside the circle. Choose all types or only the selected type. **E** selects the eraser while in Objects mode; **Shift** temporarily erases. **[ / ]** change the object brush size independently of terrain brushes.
- **Object size** and **Size variation** control scale; rotation and color vary automatically. Set variation to zero for a consistent size.

Objects are separate from heights and biome paint. They are placed above sea level, follow the terrain when you sculpt or change 3D relief, and hide when their anchors become submerged. Raising the ground or lowering the sea reveals them again. The **Objects** layer checkbox hides them in both views; enable it before editing objects. Small top-down symbols mark their positions in 2D; 3D uses shared, low-poly models with shadows.

Every stroke, layer toggle, and reset supports undo/redo. **Save world** and browser recovery preserve objects and their retained history. New saves use **FMM4**; FMM1, FMM2, and FMM3 files still open with an empty object layer. Older app versions cannot open FMM4 saves. Heightmap export still contains heights only.

The current budget is **20,000 objects per world**. 3D objects follow the terrain render distance. Models are instanced by type, and object history stores only additions/removals from each stroke. `npm test` covers placement, scatter spacing, erasing, limits, history, file validation/migration, and terrain anchoring.
