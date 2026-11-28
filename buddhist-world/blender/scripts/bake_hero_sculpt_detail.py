"""Bake reviewed high-poly sculpt detail onto Hero Prop retopology.

Expected source naming:
  SCULPT_hero_buddha_statue / sculpt_buddha_statue_head
  EXPORT_hero_buddha_statue / prop_buddha_statue_head

The suffix after sculpt_/prop_ must match. The low-poly object is the active bake
target; matching high-poly object is selected as the source. Writes a NEW .blend.
"""
import bpy
import os
from _common import script_args

ARGS = script_args()
def value_after(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default

LOW_NAME = value_after("--low-collection")
HIGH_NAME = value_after("--high-collection")
OUT = os.path.abspath(value_after("--out", "blender/textures/hero_sculpt_detail"))
BLEND_OUT = os.path.abspath(value_after("--blend-out"))
RESOLUTION = int(value_after("--resolution", "2048"))
CAGE = float(value_after("--cage-extrusion", "0.08"))
RAY = float(value_after("--max-ray-distance", "0.15"))
if not LOW_NAME or not HIGH_NAME or not BLEND_OUT:
    raise SystemExit("Required: --low-collection, --high-collection and --blend-out")
if RESOLUTION not in (1024, 2048, 4096):
    raise SystemExit("--resolution must be 1024, 2048 or 4096")
low_col = bpy.data.collections.get(LOW_NAME)
high_col = bpy.data.collections.get(HIGH_NAME)
if low_col is None or high_col is None:
    raise SystemExit("Low/high collection not found")
if not bpy.app.build_options.cycles:
    raise SystemExit("This Blender build does not include Cycles baking")

low_objects = [obj for obj in low_col.all_objects if obj.type == "MESH"]
if not low_objects:
    raise SystemExit("No low-poly mesh objects found")
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene
old_engine = scene.render.engine
scene.render.engine = "CYCLES"
scene.cycles.samples = max(32, scene.cycles.samples)
scene.render.bake.use_selected_to_active = True
scene.render.bake.use_clear = True
scene.render.bake.margin = 16
scene.render.bake.cage_extrusion = CAGE
scene.render.bake.max_ray_distance = RAY

def matching_source(low):
    suffix = low.name.removeprefix("prop_")
    expected = "sculpt_" + suffix
    source = high_col.objects.get(expected)
    if source is None or source.type != "MESH":
        raise SystemExit("Missing matching high-poly source object: " + expected)
    return source

def safe(value):
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in value)

for low in low_objects:
    high = matching_source(low)
    if not low.data.uv_layers:
        raise SystemExit("Low-poly UV map missing: " + low.name)
    # Isolate each object/slot's image targets; no unrelated UV islands share a bake image.
    slots = []
    for slot_index, slot in enumerate(low.material_slots):
        if slot.material is None:
            raise SystemExit("Missing low-poly material: " + low.name)
        material = slot.material.copy()
        material.name = "BW_SCULPT_" + safe(low.name) + "_slot" + str(slot_index)
        slot.material = material
        slots.append(material)

    targets = {}
    for material in slots:
        for map_name in ("SCULPT_NORMAL", "SCULPT_AO"):
            image = bpy.data.images.new(
                safe(low.name + "_" + material.name + "_" + map_name),
                width=RESOLUTION, height=RESOLUTION, alpha=False, float_buffer=False,
            )
            image.colorspace_settings.name = "Non-Color"
            node = material.node_tree.nodes.new("ShaderNodeTexImage")
            node.name = "BW_TARGET_" + map_name
            node.label = "High-to-low bake: " + map_name
            node.image = image
            targets[(material.name, map_name)] = (image, node)

    def bake(map_name, bake_type):
        for material in slots:
            for node in material.node_tree.nodes:
                node.select = False
            image, node = targets[(material.name, map_name)]
            node.select = True
            material.node_tree.nodes.active = node
        bpy.ops.object.select_all(action="DESELECT")
        high.select_set(True)
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.bake(
            type=bake_type,
            use_selected_to_active=True,
            cage_extrusion=CAGE,
            max_ray_distance=RAY,
            margin=16,
            use_clear=True,
        )
        for material in slots:
            image, _ = targets[(material.name, map_name)]
            path = os.path.join(OUT, safe(low.name + "_" + material.name + "_" + map_name) + ".png")
            image.filepath_raw = path
            image.file_format = "PNG"
            image.save()
            image.pack()

    bake("SCULPT_NORMAL", "NORMAL")
    bake("SCULPT_AO", "AO")

    # Replace the generic low-mesh normal with the sculpt-derived tangent normal.
    for material in slots:
        bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            raise SystemExit("Principled BSDF missing: " + material.name)
        image, image_node = targets[(material.name, "SCULPT_NORMAL")]
        normal_map = material.node_tree.nodes.new("ShaderNodeNormalMap")
        normal_map.name = "BW_SCULPT_TANGENT_NORMAL"
        material.node_tree.links.new(image_node.outputs["Color"], normal_map.inputs["Color"])
        for link in list(bsdf.inputs["Normal"].links):
            material.node_tree.links.remove(link)
        material.node_tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
        material["bw_sculpt_normal_status"] = "high_to_low_tangent_bake"
        material["bw_sculpt_ao_image"] = targets[(material.name, "SCULPT_AO")][0].name
        material["bw_sculpt_bake_resolution"] = RESOLUTION

    bpy.ops.object.select_all(action="DESELECT")
    print("baked high-to-low detail:", low.name, "<-", high.name)

scene.render.engine = old_engine
os.makedirs(os.path.dirname(BLEND_OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
print("Sculpt detail maps:", OUT)
print("Saved new scene:", BLEND_OUT)
