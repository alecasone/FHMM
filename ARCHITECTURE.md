# Terrain architecture and growth plan

## Implemented foundation

The authoritative terrain is a sparse map of **128 × 128 Float32 tiles**. Integer coordinates can be positive or negative, allowing expansion on any side without copying or resampling old terrain. Missing samples use the ocean-floor baseline, -0.18. Each allocated tile costs 64 KiB. The 1024² starter landscape uses 64 tiles / 4 MiB of height data. Adding empty extent allocates no tiles.

Brush operations address world coordinates, record the first old value of each modified sample in the stroke, and update only touched tiles and dependent border shading. Completed history uses packed Uint16 local indices and Float32 before/after values: 10 bytes per changed sample instead of two full-world copies. Terrain changes use Float32 precision. Ocean level and world boundaries are separate undoable metadata.

The 2D view caches shaded tile rasters, builds at most six missing rasters per frame, clips to the viewport, and evicts offscreen rasters once the cache exceeds 240 tiles. The 3D view uses shared-coordinate tile borders, 2-sample mesh spacing, and a bounded **12 × 12 tile neighborhood** around the camera target. At most four meshes are refreshed per frame. Geometry outside that neighborhood is disposed. It is a local preview of large worlds; use the map and Focus here to move to another region. The underlying terrain stays at full sample resolution.

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
