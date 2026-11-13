"""Read-only technical gate for the Tam Quan hero architecture collection.

Run:
  blender -b path/to/hero_architecture_source.blend --python blender/scripts/hero_tam_quan_quality_gate.py -- --strict
  blender -b path/to/hero_architecture_source.blend --python blender/scripts/hero_tam_quan_quality_gate.py -- --out blender/reports/tam_quan_quality.json

This validates measurable scene structure only. It does not approve cultural accuracy,
visual quality, baked PBR materials, GLB appearance or runtime performance.
"""
import bpy
import json
import os
from mathutils import Vector
from _common import script_args

ARGS = script_args()


def value_after(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default


OUT = os.path.abspath(value_after("--out", "blender/reports/tam_quan_quality.json"))
STRICT = "--strict" in ARGS
COLLECTION_NAME = value_after("--collection", "EXPORT_hero_tam_quan")
EPS = 1e-5

collection = bpy.data.collections.get(COLLECTION_NAME)
if collection is None:
    raise SystemExit("Required Tam Quan collection not found: " + COLLECTION_NAME)

objects = sorted(collection.all_objects, key=lambda item: item.name)
meshes = [obj for obj in objects if obj.type == "MESH"]
errors, warnings, object_reports = [], [], []

if not objects:
    errors.append("empty_export_collection")
if len(meshes) != len(objects):
    errors.append("non_mesh_objects_in_visual_export_collection")
if collection.get("asset_id") != "hero_tam_quan":
    errors.append("asset_id_metadata_missing_or_invalid")
if collection.get("asset_tier") != "HERO":
    errors.append("asset_tier_must_be_HERO")
if collection.get("passage_bays") != 3:
    errors.append("three_passage_bay_metadata_missing")
if collection.get("structural_column_rows") != 2:
    errors.append("two_structural_column_rows_metadata_missing")

column_objects = [obj for obj in meshes if obj.name.startswith("arch_tam_quan_column_")]
if len(column_objects) != 8:
    errors.append("expected_8_structural_columns_found_%d" % len(column_objects))

# Each of the eight bracket stations must contain three authored profiled cantilevers.
profiled_arms = [
    obj for obj in meshes
    if obj.get("bw_component_type") == "profiled_bracket_cantilever"
]
if len(profiled_arms) != 24:
    errors.append("expected_24_profiled_bracket_arms_found_%d" % len(profiled_arms))

for obj in meshes:
    mesh = obj.data
    mesh.calc_loop_triangles()
    tri_count = len(mesh.loop_triangles)
    obj_errors = []
    if not mesh.vertices or not mesh.polygons:
        obj_errors.append("empty_mesh")
    if not mesh.uv_layers:
        obj_errors.append("missing_uv")
    if not any(slot.material for slot in obj.material_slots):
        obj_errors.append("missing_material")
    if any(abs(float(axis) - 1.0) > 1e-3 for axis in obj.scale):
        obj_errors.append("unapplied_object_scale")
    if any(poly.area <= EPS for poly in mesh.polygons):
        obj_errors.append("zero_area_polygon")
    if tri_count == 0:
        obj_errors.append("no_triangles")
    for issue in obj_errors:
        errors.append(obj.name + ":" + issue)
    if obj.modifiers:
        warnings.append(obj.name + ":modifiers_rely_on_export_apply")
    object_reports.append({
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "triangles": tri_count,
        "uv_layers": len(mesh.uv_layers),
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "modifiers": [modifier.type for modifier in obj.modifiers],
        "issues": obj_errors,
    })

# Verify a conservative human-sized center passage prism above the stone threshold.
# The threshold/plinth is intentionally excluded from the clearance volume.
clearance_min = Vector((-1.10, 0.70, 17.10))
clearance_max = Vector((1.10, 4.50, 22.90))
blocked = []
for obj in meshes:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    obj_min = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    obj_max = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    overlaps = all(obj_min[i] <= clearance_max[i] and obj_max[i] >= clearance_min[i] for i in range(3))
    if overlaps:
        blocked.append(obj.name)
if blocked:
    errors.append("central_passage_clearance_obstructed:" + ",".join(blocked))

material_names = sorted({
    slot.material.name
    for obj in meshes for slot in obj.material_slots if slot.material
})
preview_materials = [
    name for name in material_names
    if bpy.data.materials.get(name) and
       bpy.data.materials[name].get("bw_material_status") == "procedural_preview_not_glb_baked"
]
if preview_materials:
    warnings.append("preview_only_materials_require_glTF_bake_or_replacement")

total_triangles = sum(item["triangles"] for item in object_reports)
status = "TECHNICALLY_READY_FOR_EXPORT_REVIEW" if meshes and not errors else "REVIEW_REQUIRED"
payload = {
    "schemaVersion": 1,
    "assetId": collection.get("asset_id"),
    "collection": COLLECTION_NAME,
    "status": status,
    "summary": {
        "meshObjects": len(meshes),
        "structuralColumns": len(column_objects),
        "profiledBracketArms": len(profiled_arms),
        "triangles": total_triangles,
        "centralPassageClear": not blocked,
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "visualReviewRequired": True,
        "glbExportVerified": False,
        "pbrBakeVerified": False,
        "culturalReviewVerified": False,
        "runtimeReviewVerified": False,
    },
    "errors": errors,
    "warnings": warnings,
    "previewOnlyMaterials": preview_materials,
    "objects": object_reports,
    "limitations": [
        "Does not inspect silhouette, architectural authenticity or cultural correctness.",
        "Bracket-arm count proves component presence only; it does not prove joinery, load path or visual quality.",
        "Does not measure texel density or UV overlap.",
        "Does not prove modifier evaluation or GLB exporter behavior.",
        "Does not validate collision, navmesh, browser rendering or target-device performance.",
    ],
}

os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
with open(OUT, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)

print("TAM QUAN QUALITY REPORT:", OUT)
print("Status:", status, "| Meshes:", len(meshes), "| Triangles:", total_triangles,
      "| Errors:", len(errors), "| Warnings:", len(warnings))
for item in errors:
    print("ERROR:", item)
for item in warnings:
    print("WARNING:", item)

if STRICT and errors:
    raise SystemExit(2)
