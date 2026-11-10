"""Add Vietnamese temple architectural detailing and a memorial stupa to a cinematic scene.

Run from the repository root:
  blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_architecture_details.py -- --out blender/projects/temple_complex_architecture.blend

The pass is additive and visual-only. It does not edit collision or navmesh.
It is a procedural architectural detailing base, not a final hand-authored hero building.
"""
import bpy
import math
import os
from _common import script_args

args = script_args()
out = os.path.abspath(args[args.index("--out") + 1] if "--out" in args else
                      "blender/projects/temple_complex_architecture.blend")
scene = bpy.context.scene
required = ("EXPORT_temple_complex", "EXPORT_cinematic_environment",
            "COLLISION_temple_complex", "NAVMESH_temple_complex")
missing = [name for name in required if bpy.data.collections.get(name) is None]
if missing:
    raise SystemExit("Open temple_complex_cinematic.blend first; missing: " + ", ".join(missing))
if bpy.data.collections.get("EXPORT_architecture_details"):
    raise SystemExit("Architecture details already exist. Start from temple_complex_cinematic.blend.")

def collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col

visual = collection("EXPORT_architecture_details")
MAT_WOOD = bpy.data.materials.get("BW_wood_dark_teak")
MAT_LACQUER = bpy.data.materials.get("BW_wood_red_lacquer")
MAT_STONE = bpy.data.materials.get("BW_stone_warm_limestone")
MAT_STONE_LIGHT = bpy.data.materials.get("BW_stone_cut_edges")
MAT_ROOF = bpy.data.materials.get("BW_roof_aged_terracotta")
MAT_GOLD = bpy.data.materials.get("BW_muted_gold")
if not all((MAT_WOOD, MAT_LACQUER, MAT_STONE, MAT_STONE_LIGHT, MAT_ROOF, MAT_GOLD)):
    raise SystemExit("Required temple materials are missing from the cinematic base scene.")

def game_to_blender(p):
    x, y, z = p
    return (x, -z, y)

def mesh_obj(name, verts, faces, material, smooth=False):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([game_to_blender(v) for v in verts], [], faces)
    mesh.materials.append(material)
    mesh.update()
    if mesh.vertices:
        uv = mesh.uv_layers.new(name="UVMap")
        xs = [v.co.x for v in mesh.vertices]
        ys = [v.co.y for v in mesh.vertices]
        sx = max(max(xs) - min(xs), 1e-5)
        sy = max(max(ys) - min(ys), 1e-5)
        for poly in mesh.polygons:
            for loop_index in poly.loop_indices:
                co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = ((co.x - min(xs)) / sx, (co.y - min(ys)) / sy)
                poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    visual.objects.link(obj)
    obj["asset_role"] = "procedural_architecture_detail_visual"
    return obj

def box(name, center, size, material, target=visual):
    cx, cy, cz = center
    sx, sy, sz = (v / 2 for v in size)
    verts = [
        (cx-sx,cy-sy,cz-sz),(cx+sx,cy-sy,cz-sz),
        (cx+sx,cy+sy,cz-sz),(cx-sx,cy+sy,cz-sz),
        (cx-sx,cy-sy,cz+sz),(cx+sx,cy-sy,cz+sz),
        (cx+sx,cy+sy,cz+sz),(cx-sx,cy+sy,cz+sz),
    ]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),
             (2,3,7,6),(3,0,4,7)]
    return mesh_obj(name, verts, faces, material)

def cylinder(name, center, radius, depth, material, sides=12):
    x, y, z = center
    verts = []
    for yy in (y-depth/2, y+depth/2):
        for i in range(sides):
            a = math.tau * i / sides
            verts.append((x + math.cos(a)*radius, yy, z + math.sin(a)*radius))
    faces = [tuple(range(sides)), tuple(range(sides*2-1, sides-1, -1))]
    for i in range(sides):
        j = (i+1) % sides
        faces.append((i, sides+i, sides+j, j))
    return mesh_obj(name, verts, faces, material)

def terrain_height(x, z):
    radius = math.sqrt(x*x + z*z)
    t = max(0.0, min(1.0, (radius-34.0)/(118.0-34.0)))
    smooth = t*t*(3.0-2.0*t)
    rise = smooth * 37.0
    ridge = (math.sin(x*0.043 + math.sin(z*0.027)*2.2) +
             math.sin(z*0.061 + x*0.018)*0.55 +
             math.sin((x+z)*0.105)*0.18)
    rt = max(0.0, min(1.0, (radius-42.0)/(88.0-42.0)))
    ridge *= (rt*rt*(3.0-2.0*rt))
    gullies = math.sin(x*0.018-z*0.026)*math.cos(z*0.031)*2.4
    return -0.34 + rise + ridge*4.4 + gullies*(rt*rt*(3.0-2.0*rt))

# Stylized timber bracket sets beneath the main hall and Tam Quan eaves.
def bracket_set(prefix, x, y, z, scale=1.0):
    box(prefix+"_corbel_block",(x,y+0.32*scale,z),(0.30*scale,0.68*scale,0.46*scale),MAT_LACQUER)
    for level, reach in enumerate((0.58,0.86,1.10)):
        yy = y + (0.18 + level*0.25)*scale
        direction = -1 if level % 2 == 0 else 1
        box(prefix+"_dougong_arm_"+str(level),
            (x+direction*reach*0.18*scale, yy, z),
            (reach*scale,0.16*scale,0.32*scale), MAT_WOOD)
        box(prefix+"_dougong_cap_"+str(level),
            (x+direction*reach*0.35*scale, yy+0.10*scale, z),
            (0.24*scale,0.12*scale,0.42*scale), MAT_LACQUER)
    box(prefix+"_upper_sill",(x,y+0.96*scale,z),(0.90*scale,0.15*scale,0.50*scale),MAT_WOOD)

for row_z in (-29.2, -14.8):
    for index, x in enumerate((-9.0,-4.5,0.0,4.5,9.0)):
        bracket_set("arch_main_hall_bracket_%s_%02d" % ("rear" if row_z < -20 else "front", index),
                    x, 6.35, row_z, 1.0)
for index, x in enumerate((-4.5,-1.5,1.5,4.5)):
    bracket_set("arch_tam_quan_bracket_%02d" % index, x, 6.35, 20.0, 0.78)

# Door lattice, raised panels and a central signboard for the main hall.
for leaf_index, leaf_x in enumerate((-2.0, 2.0)):
    z_front = -14.535
    for bar in range(5):
        x = leaf_x - 0.48 + bar*0.24
        box("arch_main_door_lattice_v_%d_%d" % (leaf_index,bar),
            (x,2.45,z_front),(0.055,3.35,0.075),MAT_WOOD)
    for rail, y in enumerate((0.82,1.15,3.75,4.08)):
        box("arch_main_door_lattice_h_%d_%d" % (leaf_index,rail),
            (leaf_x, y, z_front-0.018),(1.12,0.065,0.08),MAT_GOLD)
    box("arch_main_door_panel_%d" % leaf_index,
        (leaf_x,2.42,z_front-0.055),(0.82,1.65,0.045),MAT_LACQUER)
box("arch_main_hall_signboard",(0.0,5.05,-14.62),(3.8,0.72,0.18),MAT_WOOD)
for x in (-1.55,1.55):
    cylinder("arch_signboard_end_cap_"+str(x),(x,5.05,-14.72),0.10,0.30,MAT_GOLD,12)

# Stone stair nosings and side balustrade caps at the main hall approach.
for step in range(5):
    z = -14.15 - step*0.34
    y = 0.78 - step*0.13
    box("arch_main_hall_stair_nosing_%02d" % step,(0.0,y,z),(11.8,0.10,0.16),MAT_STONE_LIGHT)
for side in (-1,1):
    x = side*6.25
    box("arch_main_hall_ramp_balustrade_base_"+str(side),(x,0.50,-15.0),(0.42,0.85,2.8),MAT_STONE)
    box("arch_main_hall_ramp_balustrade_cap_"+str(side),(x,0.98,-15.0),(0.58,0.18,3.0),MAT_STONE_LIGHT)
    for z in (-16.0,-15.3,-14.6):
        cylinder("arch_ramp_balustrade_post_%s_%s" % (side,str(z)),(x,1.20,z),0.15,0.42,MAT_STONE_LIGHT,10)

# Memorial stupa blockout in the stupa-garden hillside, aligned to procedural terrain.
stupa_x, stupa_z = -24.0, -72.0
ground = terrain_height(stupa_x, stupa_z) + 0.18
cylinder("arch_stupa_octagonal_base",(stupa_x,ground+0.35,stupa_z),4.8,0.70,MAT_STONE,8)
cylinder("arch_stupa_upper_plinth",(stupa_x,ground+0.86,stupa_z),3.9,0.34,MAT_STONE_LIGHT,8)
cylinder("arch_stupa_lotus_pedestal",(stupa_x,ground+1.22,stupa_z),3.2,0.38,MAT_GOLD,12)
# Bell-shaped dome profile, revolved around the game Y axis.
profile = [(0.0,1.35),(1.0,1.42),(1.8,1.72),(2.25,2.25),(2.30,2.95),
           (2.05,3.65),(1.55,4.20),(0.92,4.48),(0.0,4.55)]
verts, faces = [], []
segments = 32
for radius, height in profile:
    for index in range(segments):
        angle = math.tau*index/segments
        verts.append((stupa_x+math.cos(angle)*radius, ground+height,
                      stupa_z+math.sin(angle)*radius))
for ring in range(len(profile)-1):
    for index in range(segments):
        a = ring*segments+index
        b = ring*segments+(index+1)%segments
        c = (ring+1)*segments+(index+1)%segments
        d = (ring+1)*segments+index
        faces.append((a,b,c,d))
mesh_obj("arch_stupa_bell_dome",verts,faces,MAT_STONE,True)
for tier, (radius,height) in enumerate(((1.15,4.65),(0.88,5.05),(0.62,5.42),(0.40,5.78))):
    cylinder("arch_stupa_spire_tier_%02d" % tier,
             (stupa_x,ground+height,stupa_z),radius,0.28,MAT_STONE_LIGHT,12)
cylinder("arch_stupa_finial_neck",(stupa_x,ground+6.12,stupa_z),0.22,0.52,MAT_GOLD,12)
# Lotus bud finial, a tapered stack of bronze rings.
for tier in range(5):
    cylinder("arch_stupa_finial_ring_%02d" % tier,
             (stupa_x,ground+6.45+tier*0.22,stupa_z),
             0.20-tier*0.025,0.13,MAT_GOLD,12)
cylinder("arch_stupa_finial_tip",(stupa_x,ground+7.65,stupa_z),0.055,0.42,MAT_GOLD,10)
# Small directional stone markers around the stupa platform.
for index in range(8):
    angle = math.tau*index/8
    x = stupa_x+math.cos(angle)*5.7
    z = stupa_z+math.sin(angle)*5.7
    cylinder("arch_stupa_garden_marker_%02d" % index,
             (x,ground+0.55,z),0.22,1.1,MAT_STONE_LIGHT,8)

visual["asset_role"] = "procedural_vietnamese_architecture_detail_set"
visual["status"] = "procedural detailing base; final carvings, roof ornament sculpt and textures require artist pass"
scene["architecture_details_version"] = "1.0"
scene["architecture_details_status"] = "visual_only_procedural_base"
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=out)
print("ARCHITECTURE DETAILS GENERATED:", out)
print("Collections: EXPORT_architecture_details")
print("Collision and navmesh unchanged")
