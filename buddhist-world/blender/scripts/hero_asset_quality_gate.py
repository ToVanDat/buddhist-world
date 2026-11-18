"""Read-only Blender quality report for cinematic / hero asset candidates.

Run from repository root:
  blender -b path/to/scene.blend --python blender/scripts/hero_asset_quality_gate.py -- --out blender/reports/hero_asset_quality.json
  blender -b path/to/scene.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_main_hall --strict

This script does not modify the .blend scene. It reports technical evidence only;
it cannot certify visual quality, cultural accuracy, good topology by itself, or
runtime performance. Those require rendered and in-game review.
"""
import bpy
import bmesh
import json
import math
import os
from _common import script_args

ARGS = script_args()


def value_after(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default


OUT = os.path.abspath(value_after("--out", "blender/reports/hero_asset_quality.json"))
COLLECTION_NAME = value_after("--collection")
STRICT = "--strict" in ARGS
EPSILON = 1e-5


def near_one(value):
    return abs(float(value) - 1.0) <= 1e-3


def image_status(image):
    if image.source == "GENERATED":
        return "generated"
    if image.packed_file:
        return "packed"
    path = bpy.path.abspath(image.filepath) if image.filepath else ""
    return "present" if path and os.path.isfile(path) else "missing"


def inspect_material(material):
    result = {
        "name": material.name,
        "uses_nodes": bool(material.use_nodes),
        "principled_nodes": 0,
        "images": [],
        "issues": [],
    }
    if not material.use_nodes or material.node_tree is None:
        result["issues"].append("material_nodes_disabled")
        return result

    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            result["principled_nodes"] += 1
        if node.type == "TEX_IMAGE" and node.image:
            image = node.image
            status = image_status(image)
            result["images"].append({
                "name": image.name,
                "status": status,
                "width": int(image.size[0]),
                "height": int(image.size[1]),
                "colorspace": image.colorspace_settings.name,
            })
            if status == "missing":
                result["issues"].append("missing_image:" + image.name)
    if result["principled_nodes"] == 0:
        result["issues"].append("no_principled_bsdf")
    if not result["images"]:
        result["issues"].append("no_image_texture_nodes")
    return result


def inspect_mesh(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    triangle_count = len(mesh.loop_triangles)
    uv_layer_count = len(mesh.uv_layers)
    uv_degenerate = 0
    uv_loop_count = 0

    if uv_layer_count:
        uv_data = mesh.uv_layers.active.data
        uv_loop_count = len(uv_data)
        for tri in mesh.loop_triangles:
            loops = tri.loops
            a = uv_data[loops[0]].uv
            b = uv_data[loops[1]].uv
            c = uv_data[loops[2]].uv
            area2 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
            if abs(area2) <= EPSILON:
                uv_degenerate += 1

    bm = bmesh.new()
    bm.from_mesh(mesh)
    non_manifold_edges = sum(1 for edge in bm.edges if not edge.is_manifold)
    wire_edges = sum(1 for edge in bm.edges if edge.is_wire)
    loose_vertices = sum(1 for vert in bm.verts if not vert.link_edges)
    bm.free()

    material_reports = [inspect_material(mat) for mat in mesh.materials if mat]
    material_issues = [issue for report in material_reports for issue in report["issues"]]
    scale_applied = all(near_one(axis) for axis in obj.scale)

    issues = []
    if uv_layer_count == 0:
        issues.append("missing_uv")
    elif uv_degenerate:
        issues.append("degenerate_uv_triangles")
    if not material_reports:
        issues.append("missing_material")
    if any(report["principled_nodes"] == 0 for report in material_reports):
        issues.append("non_pbr_material")
    if any("missing_image:" in issue for issue in material_issues):
        issues.append("missing_texture_file")
    if not scale_applied:
        issues.append("unapplied_object_scale")
    if wire_edges or loose_vertices:
        issues.append("loose_geometry")

    return {
        "object": obj.name,
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "faces": len(mesh.polygons),
        "triangles": triangle_count,
        "uv_layers": uv_layer_count,
        "uv_loop_count": uv_loop_count,
        "degenerate_uv_triangles": uv_degenerate,
        "non_manifold_edges": non_manifold_edges,
        "wire_edges": wire_edges,
        "loose_vertices": loose_vertices,
        "scale": [round(float(axis), 6) for axis in obj.scale],
        "scale_applied": scale_applied,
        "materials": material_reports,
        "issues": issues,
        "visual_review_required": True,
    }


if COLLECTION_NAME:
    target = bpy.data.collections.get(COLLECTION_NAME)
    if target is None:
        raise SystemExit("Collection not found: " + COLLECTION_NAME)
    collections = [target]
else:
    collections = [col for col in bpy.data.collections if col.name.startswith("EXPORT_")]

objects = {}
for collection in collections:
    for obj in sorted(collection.all_objects, key=lambda item: item.name):
        if obj.type == "MESH":
            objects[obj.name] = inspect_mesh(obj)

issues = []
for report in objects.values():
    for issue in report["issues"]:
        issues.append({"object": report["object"], "issue": issue})

triangles = sum(report["triangles"] for report in objects.values())
mesh_count = len(objects)
status = "TECHNICALLY_READY" if mesh_count and not issues else "REVIEW_REQUIRED"
if not mesh_count:
    status = "NO_MESHES_FOUND"

payload = {
    "schemaVersion": 1,
    "scene": bpy.context.scene.name,
    "blendFile": bpy.data.filepath,
    "collectionFilter": COLLECTION_NAME,
    "status": status,
    "summary": {
        "meshObjects": mesh_count,
        "triangles": triangles,
        "issueCount": len(issues),
        "manualVisualReviewRequired": True,
        "uvOverlapChecked": False,
        "texelDensityChecked": False,
        "silhouetteChecked": False,
        "culturalAccuracyChecked": False,
        "runtimePerformanceChecked": False,
    },
    "issues": issues,
    "objects": list(objects.values()),
    "limitations": [
        "This is a technical report, not a cinematic or artistic quality certification.",
        "UV overlap and texel density require dedicated inspection or additional tooling.",
        "Non-manifold edges are reported as metrics; open surfaces such as foliage cards may be intentional.",
        "Procedural Blender node graphs may not export to glTF as authored; inspect exported GLB materials.",
        "A successful report does not validate collision, navmesh, wind deformation, lighting or target-device performance.",
    ],
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)

print("HERO ASSET QUALITY REPORT:", OUT)
print("Status:", status, "| Meshes:", mesh_count, "| Triangles:", triangles, "| Issues:", len(issues))
for issue in issues:
    print("ISSUE:", issue["object"], issue["issue"])

if STRICT and status != "TECHNICALLY_READY":
    raise SystemExit(2)
