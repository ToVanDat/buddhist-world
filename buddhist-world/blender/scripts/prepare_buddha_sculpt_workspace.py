"""Prepare a non-destructive Blender sculpt workspace for the Buddha Hero Prop.

This does NOT pretend to generate a finished sculpt or automatic retopology.
It duplicates the procedural silhouette into:
  SCULPT_hero_buddha_statue       editable Multires sculpt sources
  RETOPO_GUIDES_hero_buddha_statue low-density guides with Shrinkwrap targets

The original EXPORT_hero_buddha_statue collection is preserved unchanged as a
proportion/scale reference. Sculpt manually in Blender, then build a clean quad
retopology as a separate collection before promoting it for baking/export.
"""
import bpy
import os
from _common import script_args

ARGS = script_args()
def value_after(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default

OUT = os.path.abspath(value_after("--out", "blender/projects/hero_buddha_sculpt_workspace.blend"))
LEVELS = int(value_after("--levels", "3"))
if LEVELS not in (2, 3, 4):
    raise SystemExit("--levels must be 2, 3 or 4")

source = bpy.data.collections.get("EXPORT_hero_buddha_statue")
if source is None:
    raise SystemExit("Missing EXPORT_hero_buddha_statue. Generate hero_props_source.blend first.")
if bpy.data.collections.get("SCULPT_hero_buddha_statue") or bpy.data.collections.get("RETOPO_GUIDES_hero_buddha_statue"):
    raise SystemExit("Sculpt workspace collections already exist; refusing to overwrite them.")

scene = bpy.context.scene
sculpt = bpy.data.collections.new("SCULPT_hero_buddha_statue")
guides = bpy.data.collections.new("RETOPO_GUIDES_hero_buddha_statue")
scene.collection.children.link(sculpt)
scene.collection.children.link(guides)
sculpt["asset_id"] = "hero_buddha_statue"
sculpt["workflow_stage"] = "SCULPT_BASE_PENDING_MANUAL_ARTIST_SCULPT"
sculpt["source_collection"] = source.name
sculpt["cultural_review"] = "PENDING_APPROVED_REFERENCE_AND_HUMAN_REVIEW"
guides["asset_id"] = "hero_buddha_statue"
guides["workflow_stage"] = "RETOPO_GUIDES_ONLY_NOT_ACCEPTED_RETOPOLOGY"
guides["target_collection"] = sculpt.name

# Only organic statue forms receive Multires. Architectural pedestal remains a
# reference and is not needlessly multiplied into millions of polygons.
organic_tokens = (
    "left_leg", "right_leg", "torso", "shoulder_robe", "head", "usnisa",
    "ear_", "forearm_", "robe_fold_", "lotus_petal_",
)
created = []
for original in sorted((o for o in source.all_objects if o.type == "MESH"), key=lambda o: o.name):
    suffix = original.name.removeprefix("prop_")
    if not original.name.startswith("prop_buddha_statue_"):
        continue
    guide = original.copy()
    guide.data = original.data.copy()
    guide.name = "retopo_guide_" + suffix
    guides.objects.link(guide)
    guide["bw_role"] = "low_density_retopology_guide"
    guide["bw_status"] = "GUIDE_ONLY_REBUILD_QUADS_MANUALLY"
    guide.hide_render = True

    if any(token in original.name for token in organic_tokens):
        high = original.copy()
        high.data = original.data.copy()
        high.name = "sculpt_" + suffix
        sculpt.objects.link(high)
        high["bw_role"] = "high_poly_sculpt_source"
        high["bw_status"] = "MULTIRES_BASE_PENDING_MANUAL_SCULPT"
        high["bw_reference_source"] = original.name
        high["bw_cultural_details"] = "DO_NOT_INVENT_MUDRA_FACE_ROBE_ORNAMENT"
        # Keep source topology and object separation. Multires creates sculptable
        # subdivision levels without destroying the low-density reference.
        modifier = high.modifiers.new("BW_SCULPT_MULTRES", "MULTIRES")
        bpy.context.view_layer.objects.active = high
        high.select_set(True)
        for _ in range(LEVELS):
            bpy.ops.object.multires_subdivide(modifier=modifier.name, mode="CATMULL_CLARK")
        high.select_set(False)
        modifier.levels = min(2, LEVELS)
        modifier.sculpt_levels = LEVELS
        modifier.render_levels = LEVELS
        high["bw_multires_levels"] = LEVELS
        high["bw_high_poly_source"] = True
        # Each guide follows its corresponding sculpt source as a temporary
        # surface reference. Artist must replace this proxy with clean quad flow.
        shrink = guide.modifiers.new("BW_RET0PO_GUIDE_SHRINKWRAP", "SHRINKWRAP")
        shrink.target = high
        shrink.wrap_method = "NEAREST_SURFACEPOINT"
        shrink.offset = 0.001
        guide["bw_shrinkwrap_target"] = high.name
        guide.display_type = "WIRE"
        created.append(high.name)

# The original EXPORT collection is intentionally not modified: it remains a
# separate, untouched proportion/scale reference and can still be exported.

bpy.ops.object.select_all(action="DESELECT")
first = bpy.data.objects.get("sculpt_buddha_statue_torso")
if first:
    first.select_set(True)
    bpy.context.view_layer.objects.active = first

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("BUDDHA SCULPT WORKSPACE PREPARED")
print("Multires sources:", len(created))
print("Multires levels:", LEVELS)
print("Original EXPORT collection preserved as a reference; it is not retopology.")
print("Manual sculpt, cultural review and clean quad retopology remain required.")
print("Saved:", OUT)
