"""Generate first-pass Vietnamese temple interaction props for Buddhist World.

Run from repository root:
  blender -b blender/projects/temple_complex.blend --python blender/scripts/generate_interaction_assets.py
  blender -b blender/projects/temple_complex.blend --python blender/scripts/asset_validation.py
  blender -b blender/projects/temple_complex.blend --python blender/scripts/batch_export.py -- --out blender/exports/models

This is a procedural art pass, not a substitute for final sculpted/retopologized assets,
hand-authored PBR texture sets, rigging, animation, or in-game visual QA.
"""
import bpy
import math
from mathutils import Vector

def get_collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col

def move_to_collection(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)

def material(name, color, roughness=0.7, metallic=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

WOOD = material("mat_temple_wood_dark", (0.19, 0.085, 0.035), 0.62)
WOOD_LACQUER = material("mat_temple_wood_lacquer", (0.31, 0.12, 0.045), 0.34)
BRONZE = material("mat_temple_bronze", (0.34, 0.22, 0.085), 0.28, 0.78)
BRONZE_LIGHT = material("mat_temple_bronze_highlight", (0.62, 0.43, 0.17), 0.24, 0.72)
STONE = material("mat_temple_stone", (0.34, 0.34, 0.31), 0.88)
STONE_LIGHT = material("mat_temple_stone_light", (0.53, 0.51, 0.45), 0.82)
GOLD = material("mat_temple_gold", (0.68, 0.47, 0.16), 0.3, 0.58)
ROBE = material("mat_npc_saffron_robe", (0.42, 0.19, 0.055), 0.86)
SKIN = material("mat_npc_warm_skin", (0.53, 0.34, 0.23), 0.9)
DARK = material("mat_dark_detail", (0.075, 0.06, 0.045), 0.78)

def finish(obj, name, mat, col, bevel=0.0):
    obj.name = name
    move_to_collection(obj, col)
    if mat:
        obj.data.materials.append(mat)
    if obj.type == "MESH":
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if bevel > 0:
            mod = obj.modifiers.new("soft_edges", "BEVEL")
            mod.width = bevel
            mod.segments = 2
            bpy.ops.object.modifier_apply(modifier=mod.name)
        for poly in obj.data.polygons:
            poly.use_smooth = len(poly.vertices) <= 4 and obj.name.endswith("_round")
        if not obj.data.uv_layers:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(island_margin=0.02)
            bpy.ops.object.mode_set(mode="OBJECT")
    return obj

def cube(name, loc, scale, mat, col, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = scale
    return finish(obj, name, mat, col, bevel)

def cylinder(name, loc, radius, depth, mat, col, vertices=32, bevel=0.018):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return finish(bpy.context.object, name, mat, col, bevel)

def sphere(name, loc, scale, mat, col, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, name, mat, col)

def torus(name, loc, major, minor, mat, col):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=10, location=loc)
    return finish(bpy.context.object, name, mat, col)

def new_export(name):
    return get_collection("EXPORT_" + name)

# Bell: bronze body, raised lip, suspension ring and timber stand.
col = new_export("bell_main")
x, y, z = 5.0, 0.0, -19.0
cube("prop_bell_stand_base", (x, 0.18, z), (2.0, 0.36, 1.7), STONE, col, 0.08)
for dx in (-0.72, 0.72):
    cube("prop_bell_stand_post", (x + dx, 1.8, z), (0.18, 3.2, 0.18), WOOD, col, 0.035)
cube("prop_bell_stand_beam", (x, 3.38, z), (1.9, 0.2, 0.25), WOOD_LACQUER, col, 0.04)
torus("prop_bell_hanger", (x, 3.0, z), 0.22, 0.055, BRONZE_LIGHT, col)
cylinder("prop_bell_body", (x, 2.15, z), 0.68, 1.15, BRONZE, col, 48, 0.035)
torus("prop_bell_rim", (x, 1.58, z), 0.67, 0.075, BRONZE_LIGHT, col)
torus("prop_bell_neck_ring", (x, 2.72, z), 0.38, 0.045, BRONZE_LIGHT, col)
cylinder("prop_bell_clapper", (x, 1.2, z), 0.07, 0.7, DARK, col, 12, 0.01)
sphere("prop_bell_clapper_tip", (x, 0.83, z), (0.14, 0.14, 0.14), BRONZE_LIGHT, col)

# Incense burner: stone pedestal and bronze bowl with handles and incense sticks.
col = new_export("incense_burner")
x, y, z = 0.0, 0.0, -24.0
cube("prop_incense_pedestal_foot", (x, 0.16, z), (1.35, 0.32, 1.15), STONE, col, 0.07)
cylinder("prop_incense_pedestal_shaft", (x, 0.68, z), 0.34, 0.78, STONE_LIGHT, col, 24, 0.04)
cylinder("prop_incense_bowl", (x, 1.18, z), 0.66, 0.55, BRONZE, col, 40, 0.04)
torus("prop_incense_bowl_rim", (x, 1.48, z), 0.61, 0.065, BRONZE_LIGHT, col)
for side in (-1, 1):
    torus("prop_incense_handle", (x + side * 0.72, 1.35, z), 0.18, 0.045, BRONZE_LIGHT, col)
for i, (dx, dz) in enumerate(((-0.16, 0.02), (0.12, 0.08), (0.02, -0.16))):
    stick = cylinder("prop_incense_stick_" + str(i+1), (x + dx, 1.92, z + dz), 0.018, 0.88, WOOD, col, 8, 0.003)
    stick.rotation_euler[2] = (i - 1) * 0.08

# Buddha statue: seated silhouette on a stepped stone lotus plinth.
col = new_export("buddha_statue")
x, y, z = 0.0, 0.0, -29.0
cube("prop_buddha_pedestal_lower", (x, 0.22, z), (2.5, 0.44, 1.9), STONE, col, 0.08)
cube("prop_buddha_pedestal_upper", (x, 0.52, z), (2.1, 0.2, 1.55), STONE_LIGHT, col, 0.06)
sphere("prop_buddha_lotus_seat", (x, 0.82, z), (1.0, 0.34, 0.72), GOLD, col)
sphere("prop_buddha_body", (x, 1.55, z), (0.72, 0.82, 0.52), GOLD, col)
sphere("prop_buddha_head", (x, 2.42, z), (0.39, 0.48, 0.38), GOLD, col)
sphere("prop_buddha_ushnisha", (x, 2.84, z), (0.14, 0.18, 0.14), GOLD, col)
for side in (-1, 1):
    arm = sphere("prop_buddha_arm", (x + side * 0.58, 1.35, z + 0.02), (0.22, 0.52, 0.25), GOLD, col)
    arm.rotation_euler[2] = side * -0.45
sphere("prop_buddha_hands", (x, 1.02, z + 0.32), (0.35, 0.13, 0.24), GOLD, col)
cube("prop_buddha_robe_fold", (x, 1.25, z - 0.08), (1.25, 0.16, 0.68), BRONZE_LIGHT, col, 0.05)

# Main altar: lacquered timber table, carved apron and four legs.
col = new_export("altar_main")
x, y, z = 3.0, 0.0, -26.5
cube("prop_altar_top", (x, 1.05, z), (2.3, 0.2, 1.05), WOOD_LACQUER, col, 0.055)
cube("prop_altar_apron", (x, 0.82, z), (1.9, 0.25, 0.8), WOOD, col, 0.04)
for dx in (-0.92, 0.92):
    for dz in (-0.34, 0.34):
        cube("prop_altar_leg", (x + dx, 0.43, z + dz), (0.16, 0.78, 0.16), WOOD_LACQUER, col, 0.025)
cube("prop_altar_front_panel", (x, 0.8, z + 0.43), (0.95, 0.16, 0.035), GOLD, col, 0.015)
for dx in (-0.62, 0.62):
    cylinder("prop_altar_candle", (x + dx, 1.32, z), 0.075, 0.42, STONE_LIGHT, col, 16, 0.012)
    sphere("prop_altar_flame", (x + dx, 1.57, z), (0.055, 0.12, 0.055), GOLD, col, 12, 8)

# Novice monk guide: stylized static character proxy; rig and animation are a later character-art task.
col = new_export("npc_monk_guide")
x, y, z = 8.0, 0.0, -17.0
sphere("char_monk_robe_body", (x, 0.92, z), (0.48, 0.78, 0.36), ROBE, col)
sphere("char_monk_robe_lower", (x, 0.48, z), (0.53, 0.42, 0.39), ROBE, col)
sphere("char_monk_head", (x, 1.82, z), (0.29, 0.34, 0.28), SKIN, col)
sphere("char_monk_ear_left", (x - 0.29, 1.82, z), (0.07, 0.11, 0.07), SKIN, col, 12, 8)
sphere("char_monk_ear_right", (x + 0.29, 1.82, z), (0.07, 0.11, 0.07), SKIN, col, 12, 8)
sphere("char_monk_arm_left", (x - 0.43, 1.0, z + 0.04), (0.17, 0.48, 0.18), ROBE, col)
sphere("char_monk_arm_right", (x + 0.43, 1.0, z + 0.04), (0.17, 0.48, 0.18), ROBE, col)
sphere("char_monk_hands", (x, 0.98, z + 0.33), (0.16, 0.18, 0.1), SKIN, col)
sphere("char_monk_eyes_left", (x - 0.1, 1.88, z + 0.245), (0.025, 0.025, 0.015), DARK, col, 12, 8)
sphere("char_monk_eyes_right", (x + 0.1, 1.88, z + 0.245), (0.025, 0.025, 0.015), DARK, col, 12, 8)

print("Created EXPORT_bell_main, EXPORT_incense_burner, EXPORT_buddha_statue, EXPORT_altar_main, EXPORT_npc_monk_guide")
print("Next: run asset_validation.py, then batch_export.py. Inspect every GLB in Blender and the web runtime.")
