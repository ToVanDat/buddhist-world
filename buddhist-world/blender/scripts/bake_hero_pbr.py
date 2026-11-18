"""Bake glTF metallic-roughness PBR maps for one Hero collection.

This is a destructive operation on the loaded in-memory scene, so it ALWAYS saves
to a new --blend-out path and never overwrites the input .blend file.

Example:
  blender -b blender/projects/hero_architecture_source.blend --python blender/scripts/bake_hero_pbr.py -- --collection EXPORT_hero_tam_quan --out blender/textures/hero_tam_quan --blend-out blender/projects/hero_tam_quan_pbr.blend --resolution 1024

Requires Blender Cycles baking. Maps: Base Color, Roughness, Metallic, Tangent Normal.
The resulting textures are PNG and are linked to Principled BSDF nodes for glTF export.
"""
import bpy
import os
from _common import script_args

ARGS = script_args()


def value_after(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default


COLLECTION_NAME = value_after("--collection")
OUT_DIR = os.path.abspath(value_after("--out", "blender/textures/hero_asset"))
BLEND_OUT = os.path.abspath(value_after("--blend-out"))
RESOLUTION = int(value_after("--resolution", "1024"))
MARGIN = int(value_after("--margin", "16"))

if not COLLECTION_NAME:
    raise SystemExit("Required: --collection EXPORT_<asset>")
if not BLEND_OUT:
    raise SystemExit("Required: --blend-out; source .blend must never be overwritten")
if RESOLUTION not in (512, 1024, 2048, 4096):
    raise SystemExit("--resolution must be 512, 1024, 2048 or 4096")
if not bpy.app.build_options.cycles:
    raise SystemExit("This Blender build does not include Cycles baking")

collection = bpy.data.collections.get(COLLECTION_NAME)
if collection is None:
    raise SystemExit("Collection not found: " + COLLECTION_NAME)

objects = [obj for obj in collection.all_objects if obj.type == "MESH"]
if not objects:
    raise SystemExit("No mesh objects in collection: " + COLLECTION_NAME)

for obj in objects:
    if not obj.data.uv_layers:
        raise SystemExit("Missing UV map: " + obj.name)
    if any(abs(float(v) - 1.0) > 1e-3 for v in obj.scale):
        raise SystemExit("Apply object scale before baking: " + obj.name)

os.makedirs(OUT_DIR, exist_ok=True)
scene = bpy.context.scene
old_engine = scene.render.engine
old_samples = scene.cycles.samples if hasattr(scene, "cycles") else 32
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.bake.margin = MARGIN
scene.render.bake.use_clear = True
scene.render.bake.use_selected_to_active = False

# Give each object/material slot its own baked material. Hero source meshes are
# independently unwrapped; sharing one baked image across those UV islands would
# cause unrelated objects to overlap and overwrite each other's texels.
material_map = {}
for obj in objects:
    for slot_index, slot in enumerate(obj.material_slots):
        source = slot.material
        if source is None:
            raise SystemExit("Missing material on " + obj.name)
        key = (obj.name, slot_index, source.name)
        if key not in material_map:
            duplicate = source.copy()
            duplicate.name = (
                COLLECTION_NAME.replace("EXPORT_", "BW_PBR_")
                + "_" + obj.name + "_slot" + str(slot_index) + "_" + source.name
            )
            material_map[key] = duplicate
        slot.material = material_map[key]

materials = list(material_map.values())
images = {}
image_nodes = {}


def create_target(material, map_name, colorspace):
    safe_material = "".join(ch.lower() if ch.isalnum() else "_" for ch in material.name)
    image_name = safe_material + "_" + map_name.lower()
    image = bpy.data.images.new(image_name, width=RESOLUTION, height=RESOLUTION, alpha=False, float_buffer=False)
    image.colorspace_settings.name = colorspace
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = "BAKE_TARGET_" + map_name
    node.label = "Bake target: " + map_name
    node.image = image
    images[(material.name, map_name)] = image
    image_nodes[(material.name, map_name)] = node
    return image, node


def activate_targets(map_name):
    for material in materials:
        nodes = material.node_tree.nodes
        for node in nodes:
            node.select = False
        target = image_nodes[(material.name, map_name)]
        target.select = True
        nodes.active = target


def save_map(material, map_name):
    image = images[(material.name, map_name)]
    safe_material = "".join(ch.lower() if ch.isalnum() else "_" for ch in material.name)
    path = os.path.join(OUT_DIR, safe_material + "_" + map_name.lower() + ".png")
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    image.pack()
    return path


# Create all bake targets before starting so every material has an active image node.
for material in materials:
    create_target(material, "BASECOLOR", "sRGB")
    create_target(material, "ROUGHNESS", "Non-Color")
    create_target(material, "METALLIC", "Non-Color")
    create_target(material, "NORMAL", "Non-Color")

# Activate only mesh objects in the requested export collection.
bpy.ops.object.select_all(action="DESELECT")
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[0]


def bake_pass(map_name, bake_type, pass_filter=None, emission_socket=None):
    activate_targets(map_name)
    temporary_links = []
    temporary_nodes = []
    if emission_socket:
        for material in materials:
            output = next((node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"), None)
            if output is None:
                raise RuntimeError("Material output missing: " + material.name)
            emission = material.node_tree.nodes.new("ShaderNodeEmission")
            emission.name = "TEMP_BAKE_EMISSION_" + map_name
            temporary_nodes.append((material, emission))
            principled_source = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
            if principled_source is None:
                raise RuntimeError("Principled BSDF missing: " + material.name)
            source_socket = principled_source.inputs[emission_socket]
            if source_socket.is_linked:
                for link in list(source_socket.links):
                    temporary_links.append((material, link.from_socket, emission.inputs["Color"]))
                    material.node_tree.links.new(link.from_socket, emission.inputs["Color"])
            else:
                emission.inputs["Color"].default_value = source_socket.default_value
            for link in list(output.inputs["Surface"].links):
                temporary_links.append((material, link.from_socket, output.inputs["Surface"]))
                material.node_tree.links.remove(link)
            material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])

    bake_options = {"type": bake_type, "margin": MARGIN, "use_clear": True}
    if pass_filter:
        bake_options["pass_filter"] = set(pass_filter)
    bpy.ops.object.bake(**bake_options)

    for material in materials:
        save_map(material, map_name)

    if emission_socket:
        for material, from_socket, to_socket in temporary_links:
            if to_socket.is_linked:
                for link in list(to_socket.links):
                    material.node_tree.links.remove(link)
            material.node_tree.links.new(from_socket, to_socket)
        for material, node in temporary_nodes:
            material.node_tree.nodes.remove(node)


print("Baking Base Color...")
bake_pass("BASECOLOR", "DIFFUSE", {"COLOR"})
print("Baking Roughness...")
bake_pass("ROUGHNESS", "EMIT", emission_socket="Roughness")
print("Baking Metallic...")
bake_pass("METALLIC", "EMIT", emission_socket="Metallic")
print("Baking Tangent Normal...")
bake_pass("NORMAL", "NORMAL")

# Connect baked textures to the glTF metallic-roughness Principled inputs.
for material in materials:
    nodes, links = material.node_tree.nodes, material.node_tree.links
    principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        raise SystemExit("Principled BSDF missing after bake: " + material.name)
    for socket_name, map_name in (("Base Color", "BASECOLOR"), ("Roughness", "ROUGHNESS"), ("Metallic", "METALLIC")):
        tex = image_nodes[(material.name, map_name)]
        target_socket = principled.inputs[socket_name]
        for link in list(target_socket.links):
            links.remove(link)
        links.new(tex.outputs["Color"], target_socket)
    normal_tex = image_nodes[(material.name, "NORMAL")]
    normal_node = nodes.new("ShaderNodeNormalMap")
    normal_node.name = "BW_BAKED_TANGENT_NORMAL"
    links.new(normal_tex.outputs["Color"], normal_node.inputs["Color"])
    links.new(normal_node.outputs["Normal"], principled.inputs["Normal"])
    material["bw_material_status"] = "baked_gltf_metallic_roughness"
    material["bw_baked_resolution"] = RESOLUTION
    material["bw_bake_collection"] = COLLECTION_NAME

scene.render.engine = old_engine
if hasattr(scene, "cycles"):
    scene.cycles.samples = old_samples

os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
print("PBR bake complete.")
print("Texture directory:", OUT_DIR)
print("Saved new baked scene:", BLEND_OUT)
print("Source .blend was not overwritten.")
