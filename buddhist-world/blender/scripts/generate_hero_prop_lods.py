"""Generate separate decimated LOD collections from reviewed Hero Prop meshes.

Run on a reviewed high/low-poly source .blend, never on an unreviewed blockout:
  blender -b blender/projects/hero_props_retopo.blend --python blender/scripts/generate_hero_prop_lods.py -- --props all

Creates *_lod1 and *_lod2 export collections. Source collections are not modified.
The output is a starting point: inspect silhouettes, normals, UVs and material seams.
"""
import bpy
from _common import script_args

ARGS = script_args()
def value_after(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default

PROP_NAMES = (
    "hero_buddha_statue",
    "hero_dai_hong_chung",
    "hero_incense_burner",
)
requested = value_after("--props", "all")
if requested != "all" and requested not in PROP_NAMES:
    raise SystemExit("--props must be all or one of: " + ", ".join(PROP_NAMES))
selected = PROP_NAMES if requested == "all" else (requested,)
RATIOS = (("lod1", 0.50), ("lod2", 0.18))

def make_collection(name, source):
    if bpy.data.collections.get(name):
        raise SystemExit("Refusing to overwrite existing collection: " + name)
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    result["asset_id"] = source.get("asset_id", "")
    result["asset_tier"] = "HERO"
    result["status"] = "GENERATED_LOD_REQUIRES_VISUAL_REVIEW"
    result["lod_parent"] = source.name
    result["lod_ratio"] = 0.0
    return result

for asset_id in selected:
    source_name = "EXPORT_" + asset_id
    source = bpy.data.collections.get(source_name)
    if source is None:
        raise SystemExit("Missing source collection: " + source_name)
    source_objects = [obj for obj in source.all_objects if obj.type == "MESH"]
    if not source_objects:
        raise SystemExit("No mesh objects in " + source_name)
    for lod_name, ratio in RATIOS:
        target = make_collection(source_name + "_" + lod_name, source)
        target["lod_ratio"] = ratio
        for original in source_objects:
            duplicate = original.copy()
            duplicate.data = original.data.copy()
            duplicate.name = original.name + "_" + lod_name
            target.objects.link(duplicate)
            modifier = duplicate.modifiers.new("BW_LOD_DECIMATE", "DECIMATE")
            modifier.decimate_type = "COLLAPSE"
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = duplicate
            duplicate.select_set(True)
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            finally:
                duplicate.select_set(False)
            duplicate["lod_level"] = lod_name
            duplicate["lod_source_object"] = original.name
            duplicate["lod_review_required"] = True
        print("generated", target.name, "objects=", len(source_objects), "ratio=", ratio)

print("LOD generation complete. No source collection or runtime manifest was changed.")
