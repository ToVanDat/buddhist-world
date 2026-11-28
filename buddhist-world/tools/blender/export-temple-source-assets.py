#!/usr/bin/env python3
"""Export reviewed temple Blender collections as individual GLB files.

Run from the repository root:
  blender --background --python tools/blender/export-temple-source-assets.py -- \
    --source-dir blender/source \
    --output-dir blender/exports/temple-source-review

The script never saves or modifies the source .blend files. Exports are staged
outside apps/web/public so they cannot silently replace live game assets.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy


# Collection names were verified in the three supplied Blender source files.
# Core Tam Quan and Main Hall are exported to a separate review bucket; they
# must not replace the existing main-entrance / main-hall scene assets.
ASSET_GROUPS = {
    "ENV_Temple_Ancillary_v02.blend": [
        ("GRENV_Bell_Pavilion_v02", "architecture-district/bell-pavilion", "district"),
        ("GRENV_Drum_Pavilion_v02", "architecture-district/drum-pavilion", "district"),
        ("GRENV_Monk_Quarters_v02", "architecture-district/monk-quarters", "district"),
        ("GRENV_Stone_Pagoda_v02", "architecture-district/stone-pagoda", "district"),
        ("GRENV_Sutra_Library_v02", "architecture-district/sutra-library", "district"),
        ("GRENV_Main_Hall_v02", "core-variants/main-hall-variant", "core-review"),
        ("GRENV_Tam_Quan_Gate_v02", "core-variants/tam-quan-variant", "core-review"),
    ],
    "ENV_Temple_Details_v01.blend": [
        ("GRENV_Lotus_Pond_Bridge_v01", "props/lotus-pond-bridge", "props"),
        ("GRENV_Stone_Lantern_v01", "props/stone-lantern", "props"),
        ("GRPROP_Dharma_Wheel_Stele_v01", "props/dharma-wheel-stele", "props"),
        ("GRPROP_Guardian_Lion_v01", "props/guardian-lion", "props"),
        ("GRPROP_Hanging_Temple_Bell_v01", "props/hanging-temple-bell", "props"),
        ("GRPROP_Incense_Urn_v01", "props/incense-urn", "props"),
        ("GRPROP_Main_Altar_v01", "props/main-altar", "props"),
        ("GRPROP_Seated_Buddha_v01", "props/seated-buddha", "props"),
    ],
    "ENV_Temple_Groundcover_v01.blend": [
        ("GRENV_Fern_Cluster_v01", "groundcover/fern-cluster", "groundcover"),
        ("GRENV_Flowering_Shrub_v01", "groundcover/flowering-shrub", "groundcover"),
        ("GRENV_Mossy_Garden_Stones_v01", "groundcover/mossy-garden-stones", "groundcover"),
    ],
}


def export_collection(collection_name: str, relative_output: str, category: str,
                      output_root: Path) -> dict:
    collection = bpy.data.collections.get(collection_name)
    if collection is None:
        return {
            "collection": collection_name,
            "category": category,
            "status": "MISSING_COLLECTION",
            "output": None,
            "objectCount": 0,
            "meshCount": 0,
        }

    objects = [
        obj for obj in collection.all_objects
        if obj.type in {"MESH", "EMPTY", "ARMATURE"}
    ]
    mesh_objects = [obj for obj in objects if obj.type == "MESH"]
    if not mesh_objects:
        return {
            "collection": collection_name,
            "category": category,
            "status": "NO_MESH_OBJECTS",
            "output": None,
            "objectCount": len(objects),
            "meshCount": 0,
        }

    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)

    active = next((obj for obj in mesh_objects if obj.name in bpy.context.view_layer.objects), None)
    if active is not None:
        bpy.context.view_layer.objects.active = active
    bpy.context.view_layer.update()

    destination = output_root / (relative_output + ".glb")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise FileExistsError(
            f"Refusing to overwrite existing review export: {destination}. "
            "Choose a fresh --output-dir to preserve the previous export."
        )

    result = bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_animations=False,
        export_yup=True,
    )
    if "FINISHED" not in result or not destination.is_file() or destination.stat().st_size == 0:
        raise RuntimeError(f"GLB export failed for collection {collection_name}: {result}")

    vertices = sum(len(obj.data.vertices) for obj in mesh_objects if obj.data)
    polygons = sum(len(obj.data.polygons) for obj in mesh_objects if obj.data)
    material_names = sorted({
        slot.material.name
        for obj in mesh_objects
        for slot in obj.material_slots
        if slot.material
    })

    bpy.ops.object.select_all(action="DESELECT")
    return {
        "collection": collection_name,
        "category": category,
        "status": "EXPORTED_FOR_REVIEW",
        "output": destination.as_posix(),
        "bytes": destination.stat().st_size,
        "objectCount": len(objects),
        "meshCount": len(mesh_objects),
        "vertexCount": vertices,
        "polygonCount": polygons,
        "materials": material_names,
    }


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", default="blender/source")
    parser.add_argument("--output-dir", default="blender/exports/temple-source-review")
    parser.add_argument("--only", nargs="*", default=None,
                        help="Optional collection names to export")
    args = parser.parse_args(argv)

    source_dir = Path(args.source_dir).expanduser().resolve()
    output_root = Path(args.output_dir).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    selected_names = set(args.only or [])
    known_names = {
        collection_name
        for groups in ASSET_GROUPS.values()
        for collection_name, _output_name, _category in groups
    }
    unknown_names = sorted(selected_names - known_names)
    if unknown_names:
        raise SystemExit("Unknown --only collection name(s): " + ", ".join(unknown_names))

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "sourceDirectory": str(source_dir),
        "outputDirectory": str(output_root),
        "policy": (
            "Exports are staged for technical and visual review only. "
            "No live runtime asset registry or region manifest is changed."
        ),
        "sources": [],
        "exports": [],
    }

    missing_sources = []
    selected_export_count = 0
    for filename, groups in ASSET_GROUPS.items():
        source_path = source_dir / filename
        if not source_path.is_file():
            missing_sources.append(filename)
            report["sources"].append({"file": filename, "status": "MISSING"})
            continue

        bpy.ops.wm.open_mainfile(filepath=str(source_path))
        report["sources"].append({
            "file": filename,
            "status": "OPENED",
            "bytes": source_path.stat().st_size,
        })
        for collection_name, output_name, category in groups:
            if selected_names and collection_name not in selected_names:
                continue
            selected_export_count += 1
            report["exports"].append(
                export_collection(collection_name, output_name, category, output_root)
            )

    report_path = output_root / "temple-source-export-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    failed = [item for item in report["exports"] if item["status"] != "EXPORTED_FOR_REVIEW"]
    if selected_export_count == 0:
        print("No collections selected for export.", file=sys.stderr)
        raise SystemExit(2)
    if missing_sources or failed:
        print("Export finished with missing sources or collections; see report.", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
