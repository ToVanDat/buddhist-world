"""Export visual and collision collections to separate GLBs (glTF Y-up).

Collection conventions:
  EXPORT_<asset_id>       visual geometry
  COLLISION_<region_id>   simplified collision geometry only
"""
import bpy
import os
from _common import script_args

args = script_args()
out = args[args.index("--out") + 1] if "--out" in args else "exports"
collection_filter = (
    args[args.index("--collection") + 1]
    if "--collection" in args and args.index("--collection") + 1 < len(args)
    else None
)
visual_out = os.path.join(out, "models")
collision_out = os.path.join(out, "collision")
character_out = os.path.join(out, "characters")
os.makedirs(visual_out, exist_ok=True)
os.makedirs(collision_out, exist_ok=True)
os.makedirs(character_out, exist_ok=True)


def export_collection(collection, path, include_animation):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    if not collection.all_objects:
        print("skip empty collection", collection.name)
        return
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=include_animation,
        export_skins=include_animation,
        export_morph=include_animation,
        export_nla_strips=include_animation,
    )
    print("exported", path)


if collection_filter:
    selected_collection = bpy.data.collections.get(collection_filter)
    if selected_collection is None or not selected_collection.name.startswith(("EXPORT_", "COLLISION_")):
        raise SystemExit(
            "Requested export collection not found (expected EXPORT_ or COLLISION_): "
            + collection_filter
        )
    export_collections = [selected_collection]
else:
    # Include both collection roles; collision collections must not be silently skipped.
    export_collections = [
        collection
        for collection in bpy.data.collections
        if collection.name.startswith(("EXPORT_", "COLLISION_"))
    ]

for collection in export_collections:
    if collection.name.startswith("EXPORT_"):
        asset_id = collection.name[len("EXPORT_"):]
        destination = (
            character_out
            if asset_id.startswith(("npc_", "char_"))
            else visual_out
        )
        export_collection(
            collection,
            os.path.join(destination, asset_id + ".glb"),
            True,
        )
    elif collection.name.startswith("COLLISION_"):
        region_id = collection.name[len("COLLISION_"):]
        export_collection(
            collection,
            os.path.join(collision_out, region_id + "_collision.glb"),
            False,
        )
