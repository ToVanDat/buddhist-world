"""Add a visual-only waterfall and wet-rock environment to the cinematic terrain.

Run from the Buddhist World workspace:
  blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_waterfall_environment.py -- --out blender/projects/temple_complex_waterfall.blend
  blender -b blender/projects/temple_complex_waterfall.blend --python blender/scripts/asset_validation.py
  blender -b blender/projects/temple_complex_waterfall.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets

The waterfall is placed near the north-west side of the mountain retreat (game
coordinates x=-24, z=-105). It is visual-only and does not modify collision or
navmesh. The R3F water shader supplies runtime flow, foam and mist animation.
"""
import bpy
import math
import os
from _common import script_args

args = script_args()
out = args[args.index("--out") + 1] if "--out" in args else "blender/projects/temple_complex_waterfall.blend"
out = os.path.abspath(out)
scene = bpy.context.scene

if not scene.get("cinematic_environment_version"):
    raise SystemExit("Open temple_complex_cinematic.blend first; cinematic terrain is required.")
if bpy.data.collections.get("EXPORT_waterfall_environment"):
    raise SystemExit("Waterfall collection already exists. Start from temple_complex_cinematic.blend to avoid duplicate geometry.")

def game_to_blender(point):
    x, y, z = point
    return (x, -z, y)

def smoothstep(a, b, value):
    t = max(0.0, min(1.0, (value-a)/(b-a)))
    return t*t*(3.0-2.0*t)

def terrain_height(x, z):
    radius = math.sqrt(x*x+z*z)
    rise = smoothstep(34.0, 118.0, radius)*37.0
    ridge = (math.sin(x*0.043+math.sin(z*0.027)*2.2) +
             math.sin(z*0.061+x*0.018)*0.55 +
             math.sin((x+z)*0.105)*0.18)
    ridge *= smoothstep(42.0, 88.0, radius)
    gullies = math.sin(x*0.018-z*0.026)*math.cos(z*0.031)*2.4
    return -0.34+rise+ridge*4.4+gullies*smoothstep(45.0,90.0,radius)

collection = bpy.data.collections.new("EXPORT_waterfall_environment")
scene.collection.children.link(collection)

def make_material(name, color, roughness, metallic=0.0, wet=False):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if wet and bsdf.inputs.get("Coat Weight"):
        bsdf.inputs["Coat Weight"].default_value = 0.38
        bsdf.inputs["Coat Roughness"].default_value = 0.2
    mat["bw_surface_role"] = "wet_rock" if wet else "waterfall"
    return mat

rock_mat = make_material("BW_waterfall_wet_limestone", (0.105, 0.125, 0.115), 0.28, 0.02, True)
dry_mat = make_material("BW_waterfall_limestone", (0.27, 0.29, 0.26), 0.78)
moss_mat = make_material("BW_waterfall_moss", (0.045, 0.105, 0.052), 0.94)
water_mat = make_material("BW_waterfall_sheet", (0.16, 0.36, 0.39), 0.16, 0.04)
foam_mat = make_material("BW_waterfall_foam", (0.68, 0.82, 0.82), 0.24)

def add_uv_rock(name, game_position, scale, mat, seed):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=game_to_blender(game_position))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.scale = scale
    obj.rotation_euler[2] = (seed * 0.61803398875) % math.tau
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.materials.append(mat)
    for user_collection in list(obj.users_collection):
        user_collection.objects.unlink(obj)
    collection.objects.link(obj)
    obj["asset_role"] = "waterfall_wet_rock"
    return obj

# A broken limestone lip and side walls frame the fall without blocking the flow.
base_z = -105.0
base_y = terrain_height(-24.0, base_z)
top_y = base_y + 7.8
for i, (x, y, z, sx, sy, sz) in enumerate((
    (-29.4, base_y+3.1, base_z-0.8, 4.0, 3.7, 2.7),
    (-19.0, base_y+3.3, base_z-0.7, 3.8, 4.0, 2.5),
    (-24.0, top_y+0.7, base_z-1.0, 5.6, 1.7, 3.1),
    (-31.2, base_y+0.6, base_z+0.8, 2.0, 1.1, 1.6),
    (-17.0, base_y+0.7, base_z+0.7, 2.1, 1.2, 1.7),
)):
    add_uv_rock("env_waterfall_cliff_rock_" + str(i+1).zfill(2), (x,y,z), (sx,sz,sy), rock_mat if i < 3 else dry_mat, i+3)

# Vertical sheet: a lightly irregular grid gives the runtime shader a stable UV field.
verts, faces = [], []
columns, rows = 16, 24
for row in range(rows+1):
    v = row/rows
    y = top_y - v*7.9
    for col in range(columns+1):
        u = col/columns
        x = -27.2 + u*6.4 + math.sin(v*8.0+u*4.0)*0.10
        z = base_z - 0.12 + math.sin(u*math.pi*2.0+v*3.0)*0.045
        verts.append(game_to_blender((x,y,z)))
for row in range(rows):
    for col in range(columns):
        a = row*(columns+1)+col
        faces.append((a,a+1,a+columns+2,a+columns+1))
mesh = bpy.data.meshes.new("env_waterfall_curtain_mesh")
mesh.from_pydata(verts, [], faces)
mesh.materials.append(water_mat)
uv = mesh.uv_layers.new(name="UVMap")
for poly in mesh.polygons:
    for loop_index in poly.loop_indices:
        vertex_index = mesh.loops[loop_index].vertex_index
        row, col = divmod(vertex_index, columns+1)
        uv.data[loop_index].uv = (col/columns, row/rows)
mesh.update()
sheet = bpy.data.objects.new("env_waterfall_curtain", mesh)
collection.objects.link(sheet)
sheet["asset_role"] = "visual_waterfall_sheet"
sheet["runtime_shader"] = "WaterfallSheet"

# Shallow plunge basin and irregular foam shoreline.
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=5.2, fill_type="NGON", location=game_to_blender((-24.0, base_y+0.10, -101.2)))
pool = bpy.context.object
pool.name = "env_waterfall_plunge_pool"
pool.data.name = "env_waterfall_plunge_pool_mesh"
pool.data.materials.append(water_mat)
uv = pool.data.uv_layers.new(name="UVMap")
for poly in pool.data.polygons:
    for loop_index in poly.loop_indices:
        co = pool.data.vertices[mesh.loops[loop_index].vertex_index].co if False else None
        uv.data[loop_index].uv = (0.5, 0.5)
for user_collection in list(pool.users_collection):
    user_collection.objects.unlink(pool)
collection.objects.link(pool)
pool["asset_role"] = "visual_water_pool"

# Moss patches cling to wet ledges; small stones soften the waterline.
for i, (x,y,z,sx,sy,sz) in enumerate((
    (-30.8,base_y+2.2,-104.2,1.4,0.28,0.8),
    (-18.2,base_y+2.7,-104.1,1.3,0.25,0.7),
    (-27.6,base_y+0.45,-100.4,1.2,0.22,0.65),
    (-20.2,base_y+0.38,-100.0,1.1,0.2,0.6),
)):
    add_uv_rock("env_waterfall_moss_patch_" + str(i+1).zfill(2), (x,y,z), (sx,sz,sy), moss_mat, i+11)

for i, (x,z,s) in enumerate(((-29.0,-100.0,0.9),(-19.3,-99.7,1.0),(-27.2,-97.8,0.7),(-21.0,-97.5,0.8))):
    add_uv_rock("env_waterfall_shore_stone_" + str(i+1).zfill(2),
                (x,base_y+0.18,z), (s*1.2,s*0.7,s), rock_mat, i+21)

scene["waterfall_environment_version"] = 1
scene["waterfall_game_position"] = "x=-24, z=-105; mountain_retreat"
scene["waterfall_base_elevation"] = base_y
scene["waterfall_top_elevation"] = top_y
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=out)
print("WATERFALL ENVIRONMENT GENERATED:", out)
print("Game position:", scene["waterfall_game_position"], "| terrain base:", round(base_y, 2), "| lip:", round(top_y, 2))
print("Visual only: collision and navmesh were not changed.")
