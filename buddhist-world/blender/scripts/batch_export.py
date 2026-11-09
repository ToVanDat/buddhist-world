"""Export mọi Collection có tiền tố EXPORT_ sang GLB (Y-up, đã áp modifier, không nén).
   Nén (meshopt/KTX2) thực hiện riêng bằng gltf-transform – xem docs/BLENDER_PIPELINE.md.
   blender -b projects/temple_complex.blend --python scripts/batch_export.py -- --out exports/environments"""
import bpy, os
from _common import script_args

args = script_args()
out = args[args.index("--out") + 1] if "--out" in args else "exports/models"
os.makedirs(out, exist_ok=True)
for col in bpy.data.collections:
    if not col.name.startswith("EXPORT_"): continue
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in col.all_objects: o.select_set(True)
    path = os.path.join(out, col.name[len("EXPORT_"):] + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
        export_materials="EXPORT", export_animations=True, export_skins=True, export_morph=True)
    print("exported", path)
