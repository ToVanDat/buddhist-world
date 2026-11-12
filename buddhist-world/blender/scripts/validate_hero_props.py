"""Read-only, prop-specific acceptance gate for the three Buddhist World Hero Props.

Run after PBR baking:
  blender -b blender/projects/hero_buddha_statue_pbr.blend --python blender/scripts/validate_hero_props.py -- --collection EXPORT_hero_buddha_statue --require-baked --strict --out blender/reports/hero_buddha_statue_acceptance.json

This validates technical contracts only. It cannot approve iconography, sculpt quality,
UV overlap, texel density, lighting, exported GLB appearance or runtime performance.
"""
import bpy
import json
import os
import re
from _common import script_args, TRI_BUDGET

ARGS = script_args()


def value_after(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default


OUT = os.path.abspath(value_after("--out", "blender/reports/hero_props_acceptance.json"))
COLLECTION_FILTER = value_after("--collection")
REQUIRE_BAKED = "--require-baked" in ARGS
STRICT = "--strict" in ARGS

CONTRACTS = {
    "EXPORT_hero_buddha_statue": {
        "asset_id": "hero_buddha_statue",
        "required_objects": ("prop_buddha_statue_head", "prop_buddha_statue_torso",
                             "prop_buddha_statue_usnisa", "prop_buddha_statue_pedestal_lower"),
        "review_key": "cultural_review",
    },
    "EXPORT_hero_dai_hong_chung": {
        "asset_id": "hero_dai_hong_chung",
        "required_objects": ("prop_dai_hong_chung_bell_shell",
                             "prop_dai_hong_chung_clapper",
                             "prop_dai_hong_chung_suspension_loop"),
        "review_key": "cultural_review",
    },
    "EXPORT_hero_incense_burner": {
        "asset_id": "hero_incense_burner",
        "required_objects": ("prop_incense_burner_bowl",
                             "prop_incense_burner_stone_foot",
                             "prop_incense_burner_stick_00"),
        "review_key": "cultural_review",
    },
}
MAPS = {
    "BASECOLOR": "sRGB",
    "ROUGHNESS": "Non-Color",
    "METALLIC": "Non-Color",
    "NORMAL": "Non-Color",
}
NAME_PATTERN = re.compile(r"^prop_[a-z0-9]+(?:_[a-z0-9]+)*$")
EPSILON = 1e-5


def issue(target, code, detail=None):
    issues.append({"target": target, "code": code, "detail": detail})


def image_path_status(image):
    if image.source == "GENERATED":
        return "generated"
    if image.packed_file:
        return "packed"
    path = bpy.path.abspath(image.filepath) if image.filepath else ""
    return "present" if path and os.path.isfile(path) else "missing"


def inspect_baked_material(material, target):
    if not material.use_nodes or material.node_tree is None:
        issue(target, "material_nodes_disabled", material.name)
        return []
    principled = [node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"]
    if not principled:
        issue(target, "principled_bsdf_missing", material.name)
    found = {}
    for node in material.node_tree.nodes:
        if node.type != "TEX_IMAGE" or node.image is None:
            continue
        key = next((name for name in MAPS if name in node.name.upper()), None)
        if key is None:
            continue
        image = node.image
        found[key] = {
            "node": node.name,
            "image": image.name,
            "width": int(image.size[0]),
            "height": int(image.size[1]),
            "colorspace": image.colorspace_settings.name,
            "status": image_path_status(image),
        }
    if REQUIRE_BAKED:
        for map_name, expected_space in MAPS.items():
            if map_name not in found:
                issue(target, "pbr_map_missing", material.name + ":" + map_name)
                continue
            info = found[map_name]
            if info["colorspace"] != expected_space:
                issue(target, "pbr_map_colorspace_mismatch",
                      material.name + ":" + map_name + ":" + info["colorspace"])
            if info["width"] != info["height"] or info["width"] not in (512, 1024, 2048, 4096):
                issue(target, "pbr_map_resolution_invalid",
                      material.name + ":" + map_name)
            if info["status"] == "missing":
                issue(target, "pbr_map_file_missing", material.name + ":" + map_name)
    if REQUIRE_BAKED and material.get("bw_material_status") != "baked_gltf_metallic_roughness":
        issue(target, "material_not_marked_baked", material.name)
    return [{"material": material.name, "maps": found}]


def inspect_collection(collection, contract):
    target = collection.name
    result = {
        "collection": target,
        "asset_id": collection.get("asset_id"),
        "status": collection.get("status"),
        "asset_tier": collection.get("asset_tier"),
        "objects": [],
        "materials": [],
        "issues": [],
    }
    if collection.get("asset_id") != contract["asset_id"]:
        issue(target, "asset_id_mismatch", collection.get("asset_id"))
    if collection.get("asset_tier") != "HERO":
        issue(target, "asset_tier_not_hero", collection.get("asset_tier"))
    if not collection.get(contract["review_key"]):
        issue(target, "human_review_metadata_missing")

    mesh_objects = [obj for obj in collection.all_objects if obj.type == "MESH"]
    names = {obj.name for obj in mesh_objects}
    for required in contract["required_objects"]:
        if required not in names:
            issue(target, "required_object_missing", required)
    if not mesh_objects:
        issue(target, "mesh_collection_empty")

    triangles = 0
    for obj in sorted(mesh_objects, key=lambda item: item.name):
        obj.data.calc_loop_triangles()
        tri_count = len(obj.data.loop_triangles)
        triangles += tri_count
        obj_issues = []
        if not NAME_PATTERN.fullmatch(obj.name):
            obj_issues.append("object_name_invalid")
            issue(obj.name, "object_name_invalid")
        if not obj.data.uv_layers:
            obj_issues.append("uv_missing")
            issue(obj.name, "uv_missing")
        else:
            layer = obj.data.uv_layers.active
            if layer.name != "UVMap":
                obj_issues.append("uvmap_name_invalid")
                issue(obj.name, "uvmap_name_invalid", layer.name)
            outside = sum(1 for item in layer.data
                          if item.uv.x < -EPSILON or item.uv.x > 1 + EPSILON
                          or item.uv.y < -EPSILON or item.uv.y > 1 + EPSILON)
            if outside:
                obj_issues.append("uv_out_of_0_1")
                issue(obj.name, "uv_out_of_0_1", outside)
        if any(abs(float(axis) - 1.0) > 1e-3 for axis in obj.scale):
            obj_issues.append("object_scale_not_applied")
            issue(obj.name, "object_scale_not_applied")
        if not obj.material_slots or any(slot.material is None for slot in obj.material_slots):
            obj_issues.append("material_slot_missing")
            issue(obj.name, "material_slot_missing")
        for slot in obj.material_slots:
            if slot.material:
                result["materials"].extend(inspect_baked_material(slot.material, obj.name))
        result["objects"].append({
            "name": obj.name,
            "vertices": len(obj.data.vertices),
            "triangles": tri_count,
            "uv_layers": len(obj.data.uv_layers),
            "issues": obj_issues,
        })

    budget = TRI_BUDGET.get("prop", 6000)
    if triangles > budget:
        issue(target, "triangle_budget_exceeded", {"actual": triangles, "budget": budget})
    result["triangle_count"] = triangles
    result["triangle_budget"] = budget
    return result


collections = []
if COLLECTION_FILTER:
    selected = bpy.data.collections.get(COLLECTION_FILTER)
    if selected is None:
        raise SystemExit("Collection not found: " + COLLECTION_FILTER)
    if selected.name not in CONTRACTS:
        raise SystemExit("Unsupported Hero Props collection: " + COLLECTION_FILTER)
    collections = [selected]
else:
    collections = [bpy.data.collections.get(name) for name in CONTRACTS]
    missing = [name for name, collection in zip(CONTRACTS, collections) if collection is None]
    for name in missing:
        issue(name, "collection_missing")

issues = []
reports = []
for collection in collections:
    if collection is not None:
        reports.append(inspect_collection(collection, CONTRACTS[collection.name]))

status = "TECHNICALLY_READY" if reports and not issues else "REVIEW_REQUIRED"
payload = {
    "schemaVersion": 1,
    "scene": bpy.context.scene.name,
    "blendFile": bpy.data.filepath,
    "requireBaked": REQUIRE_BAKED,
    "status": status,
    "summary": {
        "collectionsChecked": len(reports),
        "meshObjects": sum(len(item["objects"]) for item in reports),
        "triangles": sum(item["triangle_count"] for item in reports),
        "issueCount": len(issues),
        "manualVisualReviewRequired": True,
        "uvOverlapChecked": False,
        "texelDensityChecked": False,
        "culturalReviewCompleted": False,
        "glbRuntimeChecked": False,
    },
    "collections": reports,
    "issues": issues,
    "limitations": [
        "Technical checks do not assess sculpt quality, silhouette, facial expression or iconographic correctness.",
        "UV overlap and texel density are not calculated; inspect UVs in Blender.",
        "A texture set can be present and correctly tagged but still look poor; inspect all maps and renders.",
        "This gate does not inspect the exported GLB or its appearance in the R3F runtime.",
        "The Buddha statue requires human cultural and art-direction approval.",
    ],
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)

print("HERO PROPS ACCEPTANCE REPORT:", OUT)
print("Status:", status, "| Collections:", len(reports), "| Issues:", len(issues))
for item in issues:
    print("ISSUE:", item)
if STRICT and status != "TECHNICALLY_READY":
    raise SystemExit(2)
