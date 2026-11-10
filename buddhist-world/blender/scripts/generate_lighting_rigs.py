"""Create/update a non-export Blender preview light rig for Buddhist World.

Windows CMD (run from repository root):
  blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_lighting_rigs.py -- --preset day --out blender/projects/temple_complex_lighting_day.blend

The rig is authoring-only and is never placed in EXPORT collections.
It updates named preview lights in place to remain safe on repeated runs.
"""
import bpy
import os
from mathutils import Vector
from _common import script_args
from lighting_profiles import LIGHTING_PROFILES

args = script_args()

def arg(name, default):
    return args[args.index(name) + 1] if name in args else default

preset_name = arg("--preset", "day")
if preset_name not in LIGHTING_PROFILES:
    raise SystemExit("Unknown lighting preset: " + preset_name)
out_path = os.path.abspath(arg("--out", "blender/projects/temple_complex_lighting.blend"))
profile = LIGHTING_PROFILES[preset_name]
scene = bpy.context.scene

def get_collection(name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        scene.collection.children.link(collection)
    elif collection.name not in scene.collection.children:
        if collection.name not in [child.name for child in scene.collection.children]:
            scene.collection.children.link(collection)
    return collection

preview = get_collection("PREVIEW_lighting_rig")

def ensure_light(name, light_type):
    obj = bpy.data.objects.get(name)
    if obj is not None and (obj.type != "LIGHT" or obj.data.type != light_type):
        raise SystemExit("Existing object has incompatible type: " + name)
    if obj is None:
        data = bpy.data.lights.new(name=name, type=light_type)
        obj = bpy.data.objects.new(name, data)
        preview.objects.link(obj)
    elif obj.name not in preview.objects:
        # Preserve all existing collection memberships; add the preview link only.
        preview.objects.link(obj)
    return obj

sun = ensure_light("BW_PREVIEW_Sun", "SUN")
sun.data.energy = profile["sun_energy"]
sun.data.color = profile["sun_color"]
sun.data.angle = 0.12
sun.location = profile["sun_position"]
direction = Vector((0.0, 0.0, 0.0)) - sun.location
sun.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
sun.data.use_shadow = True

fill = ensure_light("BW_PREVIEW_Fill", "AREA")
fill.data.energy = profile["fill_energy"]
fill.data.shape = "DISK"
fill.data.size = 18.0
fill.data.color = (0.72, 0.82, 1.0)
fill.location = (28.0, -34.0, 22.0)
fill.rotation_euler = (Vector((0.0, 0.0, 8.0)) - fill.location).to_track_quat("-Z", "Y").to_euler()

rim = ensure_light("BW_PREVIEW_Rim", "AREA")
rim.data.energy = profile["rim_energy"]
rim.data.shape = "DISK"
rim.data.size = 12.0
rim.data.color = (1.0, 0.66, 0.42) if preset_name in ("dawn", "sunset") else (0.62, 0.74, 1.0)
rim.location = (-32.0, 42.0, 18.0)
rim.rotation_euler = (Vector((0.0, 0.0, 7.0)) - rim.location).to_track_quat("-Z", "Y").to_euler()

world = scene.world or bpy.data.worlds.new("BW_Cinematic_World")
scene.world = world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
if background is None:
    background = world.node_tree.nodes.new("ShaderNodeBackground")
output = world.node_tree.nodes.get("World Output")
if output is None:
    output = world.node_tree.nodes.new("ShaderNodeOutputWorld")
if not any(link.from_node == background and link.to_node == output for link in world.node_tree.links):
    world.node_tree.links.new(background.outputs["Background"], output.inputs["Surface"])
background.inputs["Color"].default_value = (*profile["world_color"], 1.0)
background.inputs["Strength"].default_value = profile["world_strength"]

try:
    scene.view_settings.view_transform = "AgX"
except (TypeError, ValueError):
    scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = profile["exposure"]
scene["bw_lighting_preview_profile"] = preset_name
scene["bw_lighting_preview_version"] = 1

os.makedirs(os.path.dirname(out_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=out_path)
print("BLENDER LIGHTING PREVIEW RIG:", preset_name, out_path)
print("Preview-only lights are not registered in any EXPORT collection.")
