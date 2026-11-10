"""Export visual and collision collections to separate GLBs (glTF Y-up).

Collection conventions:
  EXPORT_<asset_id>       visual geometry
  COLLISION_<region_id>   simplified collision geometry only

Collision meshes should be low-poly, closed where possible, and never contain
decorative details. They are loaded with render=false and Rapier trimesh colliders.
"""
import bpy
import os
from _common import script_args

args = script_args()
out = args[args.index("--out") + 1] if "--out" in args else "exports"
visual_out = os.path.join(out, "models")
collision_out = os.path.join(out, "collision")
os.makedirs(visual_out, exist_ok=True)
os.makedirs(collision_out, exist_ok=True)

def export_collection(collection, path, include_animation):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    if not collection.all_objects:
        print("skip empty collection", collection.name)
        return
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_texcoords=True,
        export_normals=True, export_materials="EXPORT",
        export_animations=include_animation, export_skins=include_animation,
        export_morph=include_animation, export_nla_strips=include_animation,
    )
    print("exported", path)

for col in bpy.data.collections:
    if col.name.startswith("EXPORT_"):
        export_collection(col, os.path.join(visual_out, col.name[len("EXPORT_"):] + ".glb"), True)
    elif col.name.startswith("COLLISION_"):
        export_collection(col, os.path.join(collision_out, col.name[len("COLLISION_"):] + "_collision.glb"), False)
