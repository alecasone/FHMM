# Terrain architecture and growth plan

## Implemented foundation

The authoritative terrain is a sparse map of **128 × 128 Float32 tiles**. Integer coordinates can be positive or negative, allowing expansion on any side without copying or resampling old terrain. Missing samples use the ocean-floor baseline, -0.18. Each allocated tile costs 64 KiB. The 1024² starter landscape uses 64 tiles / 4 MiB of height data. Adding empty extent allocates no tiles.

Brush operations address world coordinates, record the first old value of each modified sample in the stroke, and update only touched tiles and dependent border shading. Completed history uses packed Uint16 local indices and Float32 before/after values: 10 bytes per changed sample instead of two full-world copies. Terrain changes use Float32 precision. Ocean level and world boundaries are separate undoable metadata.

The 2D view caches shaded tile rasters, builds at most six missing rasters per frame, clips to the viewport, and evicts offscreen rasters once the cache exceeds 240 tiles. The 3D view uses shared-coordinate tile borders, 2-sample mesh spacing, and an adjustable **4 × 4 to 24 × 24 tile neighborhood** around the camera target (default 12 × 12). Plans are cached until the focus tile, world bounds, or distance changes. Edited meshes refresh first, then missing meshes load nearest-first. Each frame builds at most four meshes, stopping after 8 ms between builds; one individual build can exceed that budget. The largest distance is capped at 576 meshes, approximately 4.7 million terrain triangles before shadow rendering. Geometry outside that neighborhood is disposed. It is a local preview of large worlds; use the map and Focus here to move to another region. The underlying terrain stays at full sample resolution.

The render loop runs on requestAnimationFrame but skips drawing unchanged canvases. The brush radius is capped at 240 samples to keep a single dab bounded. Mesh simplification affects preview only, not saved heights. The original 2048² heightmaps are reduced spatially to 256² masks while preserving 16-bit values.

Binary `.fmm` files contain a versioned JSON directory followed by packed typed-array blocks. Both the current history cursor and the redo branch are saved. File input is validated before replacing a world. Browser recovery stores the same format in IndexedDB. The small Node HTTP server is read-only and local-only.

## Current practical limits

- **Allocated terrain and retained history live in RAM.** Empty bounds can be huge; densely painted worlds still grow memory consumption. 4096² fully allocated terrain is 64 MiB before history/rendering; 16384² is 1 GiB before overhead and is not a supported interactive target yet.
- The 2D overview iterates allocated tile keys and has no mip pyramid yet. Drawing a dense, continent-sized overview will eventually need lower-resolution tile levels.
- Brush calculations, raster shading, file packaging, and recovery serialization run on the main thread. Large brushes and saves can briefly reduce responsiveness.
- 3D meshes use fixed 2-sample spacing and a local neighborhood, rather than a multi-resolution planetary terrain renderer. Very fine brush details are clearer in 2D.
- History is bounded by 2,000 entries and 256 MiB. It is linear undo/redo; editing an earlier state discards its future branch.
- Flat PGM export is capped at 16 million samples. `.fmm` import is bounded at 1 GiB with validation limits. Saving currently assembles a whole-world Blob.
- Recovery is browser-local and is not a replacement for `.fmm` file backups. The app has one active recovery workspace per browser profile and port.

## Next stages for very large worlds

1. **Disk-backed tiles.** Introduce a TileStore interface with async load/save, a bounded LRU working set, dirty-tile flushing, and an IndexedDB or OPFS backend. Preserve the coordinate and tile format. Store world metadata separately so expansion remains constant-cost.
2. **Workers and regional updates.** Move brush jobs and raster shading to workers. Transfer typed-array patches rather than entire worlds. Coalesce strokes into small dirty rectangles and render current local changes immediately.
3. **Hierarchical previews.** Build a disk-backed mip pyramid for 2D. Add quadtree/clipmap level-of-detail meshes with stitched edges for 3D, tied to camera distance and a vertex budget. Keep editing resolution independent of viewing scale.
4. **Disk history and checkpoints.** Append compressed stroke patches to a journal, checkpoint changed tiles periodically, and keep only a hot history window in memory. Recover atomically after interrupted saves. This enables much deeper history without unbounded RAM.
5. **Streaming interchange.** Add a streamed project archive and tiled 16-bit PNG/RAW exports with an origin/scale manifest. Import/export regions without assembling a full world image in memory.

These stages extend the existing tile-based model. They do not require changing the world's coordinate system or replacing a single enormous texture.

## v0.2 rendering and biome layer

Biome paint uses sparse 128-square Uint8 tiles with ten channels per sample (160 KiB per painted tile). Weights sum to at most 255; the remainder belongs to the procedural natural surface. A paint history patch stores a Uint16 index plus ten-byte before and after weights, or 22 bytes per changed sample. Tiles are independent of height storage, so painting cannot deform terrain. FMM2 preserves both channels, layer visibility, and mixed reset/metadata history; FMM1 inputs migrate to an empty paint overlay.

Reset uses one bulk patch entry with bounds/layer metadata. Applying it prunes empty reset tiles. Full resets and imports dispose old 3D meshes and clear raster caches; ordinary strokes keep incremental updates. The 3D preview now samples every two height samples, builds at most four meshes per frame, and computes shared-edge normals from the authoritative height field. Bounded 2048-square directional shadow maps cover the local camera neighborhood.

The map defers fitting when its panel is hidden, retains a positive zoom, sizes from its container, and repairs invalid transforms. Canvas elements are taken out of intrinsic layout sizing to avoid resize feedback. Render errors are isolated per viewport; the animation frame is scheduled before drawing so a 2D exception cannot halt 3D or recovery. Reset views clears the paused state. WebGL context restoration rebuilds meshes.

## Controlled brush buildup

Blend reads original sample heights from the active stroke's existing undo map. Raise/Stamp take the maximum of the current height and original height plus masked depth; Lower takes the minimum with original height minus masked depth. Depth is stroke height times strength times falloff/mask weight. Repeated dabs therefore form a maximum envelope within one stroke instead of summing. No extra whole-world snapshot or persistent channel is needed; a new stroke deliberately starts a new layer. Blend changes are ordinary height patches, so undo, redo, and FMM2 files need no migration.

`StrokePath` carries residual distance across pointer events, decoupling dab spacing from mouse report frequency. Extreme jumps are capped at 160 dabs. Pointer movement resets the idle buildup timer; Blend Raise/Lower and all Stamps skip idle dabs. Smoothing, flattening, and biome brushes still support holding in place. Brush mode and height are editing controls, not stored world data.

## Guided rivers and orientation

Rivers store compact vector paths with world coordinates, a monotonically descending water elevation, variable width, and channel depth. Planning smooths the user's guide and searches a narrow lateral corridor for lower ground; it does not solve global drainage. Carving rasterizes an envelope over the path before applying height and biome patches, avoiding repeated cuts at overlapping segments. Only the local channel area is allocated. The river list shares the same undo transaction as the patches; metadata size is included in the history budget. Reset clears rivers, and Undo restores them. FMM3 validates and stores paths plus history, with migrations from FMM1/2.

Visible water cross sections are trimmed against the current height field. Raised terrain dries/blocks those sections; Recarve restores the stored channel profile. Water animation is visual and does not consume terrain or invent new history every frame. The 2D view caches river sections by terrain revision and draws flow at up to 20 fps; 3D uses local ribbon geometry and a procedural moving surface at up to 30 fps. Rivers outside the existing 3D terrain neighborhood are omitted. Current limits: 128 rivers, 32,768 total path points, 4,096 points per path, and 8,192 samples of guide length per stroke. Huge maps still need the streaming and worker work described above.

Map rendering applies a camera rotation and inverse-transform picking/panning. Fit accounts for the rotated world rectangle; visible-tile culling uses conservative rotated bounds. Shared compass-based sun vectors drive raster hill shading and the 3D directional light. 3D bearing controls orbit around the current target and stay synchronized with mouse orbiting. View angles are transient. The scene has no distance fog.


Sidebar expansion and render-distance preferences are stored in a separate versioned localStorage record, with graceful fallback when storage is disabled. They never enter terrain history or world files. Changing distance disposes off-region geometry before rebuilding, refreshes the cached shadow map, and supplies the same bounds to river rendering. The ocean plane continues to cover the world. No distance fog is added.

## Terrain objects (v0.4)

`objects.js` stores up to 20,000 immutable object records: UUID, type, horizontal position, scale, yaw, and color variation. Elevation is derived, so sculpting and relief changes cannot leave objects floating at an obsolete stored height. Placement uses the full height field; 3D anchoring interpolates the actual two triangles of the preview mesh. Objects below sea level are hidden, not deleted. Their visibility and presence are independent of biome paint.

Scatter samples a jittered world-space grid with a seed and visited-cell set per stroke. Grid spacing depends on density and object footprint; a 32-sample spatial hash rejects close neighbors across strokes and tile boundaries. Distance-spaced brush dabs keep placement independent of pointer event frequency. Detail emits once per click; erasing filters anchors within a circular area and optionally by type. None of these tools accumulates while held.

History stores per-stroke added/removed records, including cancellation of objects added and erased in the same stroke. It never copies the full object layer for an ordinary edit. Reset records the removed objects in its existing combined transaction. JSON metadata byte estimates participate in the same history budget as terrain and rivers. FMM4 validates object fields, unique IDs, limits, layer visibility, and both replay branches; FMM1–3 migrate to an empty layer. Recovery uses the same format.

`object-view.js` builds four shared colored low-poly geometries and one `InstancedMesh` per visible type, with capacity reused as strokes grow. Instance matrices and colors refresh on world changes, relief changes, or a new render window; invisible batches release their instance buffers. The existing terrain neighborhood bounds limit visible objects, and shadow maps invalidate on object changes. `object-map.js` draws matching top-down symbols with rotated-map culling. Objects do not allocate height or biome tiles and never enter the heightmap export.
