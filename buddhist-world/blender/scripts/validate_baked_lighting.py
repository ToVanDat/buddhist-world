"""Validate lightmap UVs and baked-lighting metadata in an authored .blend.

Run after the artist bake step:
  blender -b projects/temple_complex.blend --python scripts/validate_baked_lighting.py
The validator is read-only and never triggers or modifies a bake.
"""
import bpy
from _common import script_args

args = script_args()
require_baked = "--require-baked" in args
errors = []
warnings = []
export_objects = {
    obj
    for collection in bpy.data.collections
    if collection.name.startswith("EXPORT_")
    for obj in collection.all_objects
    if obj.type == "MESH"
}

if not export_objects:
    warnings.append("No EXPORT_* mesh collection exists; lightmap readiness is not yet measurable.")

for obj in sorted(export_objects, key=lambda item: item.name):
    lightmap_uv = obj.data.uv_layers.get("UV_Lightmap")
    if lightmap_uv is None:
        message = obj.name + ": missing UV_Lightmap"
        (errors if require_baked else warnings).append(message)
        continue
    if len(lightmap_uv.data) != len(obj.data.loops):
        errors.append(obj.name + ": UV_Lightmap loop count does not match mesh loops")
    if not lightmap_uv.active_render:
        warnings.append(obj.name + ": UV_Lightmap is not the active render UV layer")

baked = bool(bpy.context.scene.get("bw_bake_completed", False))
if require_baked and not baked:
    errors.append("Scene is not marked bw_bake_completed=true.")
elif not baked:
    warnings.append("No completed bake marker; scene is lightmap-UV-ready only.")

if baked:
    resolution = bpy.context.scene.get("bw_bake_resolution")
    profile = bpy.context.scene.get("bw_bake_profile")
    if not isinstance(resolution, int) or resolution < 64:
        errors.append("Baked scene has no valid bw_bake_resolution metadata.")
    if profile not in ("LOW", "MEDIUM", "HIGH", "ULTRA"):
        errors.append("Baked scene has no recognized bw_bake_profile metadata.")

for image in bpy.data.images:
    if image.get("bw_lightmap", False):
        if image.size[0] <= 0 or image.size[1] <= 0:
            errors.append(image.name + ": lightmap image has invalid dimensions")
        if not image.packed_file and not image.filepath:
            errors.append(image.name + ": lightmap image is neither packed nor assigned a path")

for message in warnings:
    print("BAKED LIGHTING WARNING:", message)
for message in errors:
    print("BAKED LIGHTING ERROR:", message)
if errors:
    raise SystemExit("Baked-lighting validation failed with %d error(s)." % len(errors))
print("BAKED LIGHTING VALIDATION PASSED")
print("Export meshes:", len(export_objects), "| baked:", baked, "| strict:", require_baked)
