# Anatomy assets

Builds `public/anatomy/*.glb` and `public/anatomy/manifest.json` for the 3D anatomy explorer (`/anatomy`).
This folder has its own `package.json`; nothing here ships in the app bundle.

Source data: [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html),
© The Database Center for Life Science, licensed under CC BY 4.0. The explorer shows this credit.

1. From `https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/` download into one folder:
   `isa_BP3D_4.0_obj_99.zip` (unzip it there), `isa_inclusion_relation_list.txt`, `partof_element_parts.txt`.
2. `python classify.py <that folder> <work folder>` writes `parts.json`: one row per mesh with its body system.
   Reproductive organs, ligaments, membranes, hair and fluid spaces are left out.
3. `npm install && node build.mjs <that folder> <work folder>/parts.json ../../public/anatomy`

What `build.mjs` does:

- converts millimetres to metres and reorients to +Y up, +Z anterior, +X the body's left, feet at y = 0;
- welds seam vertices, simplifies each mesh with meshoptimizer (per-system budgets in `SYSTEMS`), and drops
  vessels shorter than 40 mm;
- generates `LUNG_R` / `LUNG_L`, smooth outer lung shapes around each side's segmental airway and vessel trees,
  because BodyParts3D models the lungs only as those trees;
- writes one quantized, meshopt-compressed GLB per system, with one node per structure named by its file id.
