"""Render a still image from a prepared lighting-preview .blend file.

Run after generate_lighting_rigs.py. This script requires an authored active
camera and never saves changes back into the input .blend file.

Windows CMD (from buddhist-world):
  blender -b blender/projects/temple_complex_lighting_day.blend --python blender/scripts/render_lighting_acceptance.py -- --out artifacts/lighting/day.png
"""
import bpy
import os
from _common import script_args

args = script_args()
out_path = args[args.index("--out") + 1] if "--out" in args else "artifacts/lighting/lighting-preview.png"
out_path = os.path.abspath(out_path)
scene = bpy.context.scene

if scene.camera is None:
    raise SystemExit("Lighting render acceptance requires an active camera in the source .blend.")
if scene.world is None or not scene.world.use_nodes:
    raise SystemExit("Lighting render acceptance requires a node-based World shader.")
if scene.get("bw_lighting_preview_profile") not in ("dawn", "day", "sunset", "night"):
    raise SystemExit("Source scene has no recognized Buddhist World lighting preview profile.")

os.makedirs(os.path.dirname(out_path), exist_ok=True)
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out_path

if scene.render.engine == "CYCLES":
    scene.cycles.samples = max(32, scene.cycles.samples)
elif scene.render.engine == "BLENDER_EEVEE_NEXT":
    scene.render.resolution_percentage = 100

bpy.ops.render.render(write_still=True)
print("LIGHTING ACCEPTANCE RENDER:", out_path)
print("PROFILE:", scene.get("bw_lighting_preview_profile"))
print("ENGINE:", scene.render.engine)
print("The source .blend was not saved or modified on disk.")
