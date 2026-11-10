"""Generate a detailed procedural Bodhi hero-tree base and a lotus ecosystem.

Run after generate_vegetation_library.py from the repository root:
  blender -b blender/projects/temple_complex_vegetation.blend --python blender/scripts/generate_hero_vegetation.py -- --out blender/projects/temple_complex_hero_vegetation.blend

This is an editable procedural art base, not a finished AAA hero asset. It creates
separate visual export collections and never changes collision or navmesh.
"""
import bpy
import math
import os
import random
from mathutils import Vector
from _common import script_args

SEED = 20261110
random.seed(SEED)
args = script_args()
output_path = os.path.abspath(
    args[args.index("--out") + 1] if "--out" in args
    else "blender/projects/temple_complex_hero_vegetation.blend"
)
scene = bpy.context.scene
required = ("EXPORT_vegetation_temple_complex", "EXPORT_cinematic_environment")
missing = [name for name in required if bpy.data.collections.get(name) is None]
if missing:
    raise SystemExit("Generate cinematic environment and vegetation library first; missing: " + ", ".join(missing))
if bpy.data.collections.get("EXPORT_hero_bodhi_tree") or bpy.data.collections.get("EXPORT_lotus_ecosystem"):
    raise SystemExit("Hero vegetation already exists. Start from temple_complex_vegetation.blend.")

def collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col

def game_to_blender(x, y, z):
    return (x, -z, y)

def mat(name, color, roughness):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return material

BARK = mat("BW_hero_bodhi_bark", (0.16, 0.065, 0.032), 0.92)
BARK_LIGHT = mat("BW_hero_bodhi_bark_highlight", (0.27, 0.12, 0.055), 0.88)
LEAF = mat("BW_hero_bodhi_leaf_deep", (0.045, 0.16, 0.065), 0.78)
LEAF_LIGHT = mat("BW_hero_bodhi_leaf_sunlit", (0.16, 0.30, 0.095), 0.74)
LOTUS_LEAF = mat("BW_lotus_ecosystem_leaf", (0.075, 0.25, 0.12), 0.62)
LOTUS_VEIN = mat("BW_lotus_ecosystem_vein", (0.18, 0.36, 0.16), 0.72)
PETAL = mat("BW_lotus_ecosystem_petal", (0.88, 0.52, 0.55), 0.42)
PETAL_LIGHT = mat("BW_lotus_ecosystem_petal_light", (0.98, 0.76, 0.72), 0.38)
GOLD = mat("BW_lotus_ecosystem_seed", (0.82, 0.53, 0.12), 0.44)
STEM = mat("BW_lotus_ecosystem_stem", (0.08, 0.19, 0.08), 0.82)

hero_col = collection("EXPORT_hero_bodhi_tree")
lotus_col = collection("EXPORT_lotus_ecosystem")
source_col = collection("ASSET_LIBRARY_hero_vegetation")

def curve_object(name, points, bevel, material, target, resolution=3):
    curve = bpy.data.curves.new(name + "_curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = bevel
    curve.bevel_resolution = resolution
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    target.objects.link(obj)
    obj.data.materials.append(material)
    return obj

def uv_sphere(name, location, scale, material, target, segments=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    # Move out of the active scene collection into the intended export collection.
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)
    return obj

def make_leaf_mesh(name, length, width, material):
    verts, faces = [], []
    rows, cols = 7, 7
    for row in range(rows):
        t = row / (rows - 1)
        for col in range(cols):
            u = (col / (cols - 1)) * 2.0 - 1.0
            half = math.sin(math.pi * t) ** 0.72 * width * 0.5
            x = u * half
            y = length * t
            z = 0.13 * math.sin(math.pi * t) * (1.0 - u * u) + 0.035 * abs(u)
            verts.append((x, z, y))  # Convert the Y-up leaf profile to Blender's Z-up coordinates.
    for row in range(rows - 1):
        for col in range(cols - 1):
            a = row * cols + col
            faces.append((a, a + 1, a + 1 + cols, a + cols))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    mesh.update()
    return mesh

# Bodhi hero tree: flared trunk, visible buttress roots, branching limbs and layered leaf cards.
trunk_base = game_to_blender(0, 0, 0)
trunk_top = game_to_blender(0, 0, 9.2)
curve_object("hero_bodhi_main_trunk", [trunk_base, game_to_blender(0.15, 0, 2.4),
    game_to_blender(-0.18, 0, 5.4), trunk_top], 0.62, BARK, hero_col, 5)
for index in range(9):
    angle = math.tau * index / 9
    dx, dz = math.cos(angle), math.sin(angle)
    curve_object("hero_bodhi_buttress_root_%02d" % index, [
        game_to_blender(dx * 2.2, 0, dz * 1.9),
        game_to_blender(dx * 1.1, 0.35, dz * 0.95),
        game_to_blender(dx * 0.42, 1.6, dz * 0.38),
    ], 0.16 + (index % 3) * 0.035, BARK_LIGHT if index % 3 == 0 else BARK, hero_col, 3)
for branch in range(13):
    angle = math.tau * branch / 13 + random.uniform(-0.12, 0.12)
    height = random.uniform(5.1, 8.5)
    reach = random.uniform(2.4, 4.8)
    dx, dz = math.cos(angle), math.sin(angle)
    points = [
        game_to_blender(dx * 0.12, height - 1.4, dz * 0.12),
        game_to_blender(dx * reach * 0.42, height - 0.35, dz * reach * 0.42),
        game_to_blender(dx * reach, height + random.uniform(0.2, 1.1), dz * reach),
    ]
    curve_object("hero_bodhi_branch_%02d" % branch, points, random.uniform(0.10, 0.18), BARK, hero_col, 3)
    # Leaf clusters are composed from varied smooth ellipsoids and authored leaf cards.
    center = game_to_blender(dx * reach, height + 0.8, dz * reach)
    for cluster in range(4):
        offset = game_to_blender(dx * random.uniform(-0.9, 0.9), random.uniform(-0.45, 0.8),
                                 dz * random.uniform(-0.9, 0.9))
        loc = (center[0] + offset[0], center[1] + offset[1], center[2] + offset[2])
        uv_sphere("hero_bodhi_foliage_cluster_%02d_%02d" % (branch, cluster), loc,
                  (random.uniform(0.8, 1.35), random.uniform(0.45, 0.8), random.uniform(0.75, 1.2)),
                  LEAF_LIGHT if (branch + cluster) % 4 == 0 else LEAF, hero_col, 18, 12)

# Reuse one detailed leaf mesh for a modest number of leaf cards around the crown.
leaf_mesh = make_leaf_mesh("hero_bodhi_leaf_card", 0.52, 0.30, LEAF_LIGHT)
for index in range(180):
    angle = random.uniform(0, math.tau)
    radius = random.uniform(1.6, 5.0)
    height = random.uniform(6.2, 10.4)
    obj = bpy.data.objects.new("hero_bodhi_leaf_%03d" % index, leaf_mesh)
    hero_col.objects.link(obj)
    obj.location = game_to_blender(math.cos(angle) * radius, height, math.sin(angle) * radius)
    obj.rotation_euler[2] = random.uniform(0, math.tau)
    scale = random.uniform(0.65, 1.2)
    obj.scale = (scale, scale, scale)
hero_col["asset_role"] = "hero_tree_visual_only"
hero_col["species"] = "bodhi"
hero_col["status"] = "procedural hero base; artist sculpt and authored leaf textures still required"
hero_col["collision"] = False

# Remove the earlier simple lotus proxies from the cinematic export collection.
base_visual = bpy.data.collections["EXPORT_cinematic_environment"]
for obj in list(base_visual.objects):
    if obj.name.startswith(("veg_lotus_leaf_", "veg_lotus_blossom_", "veg_lotus_seedpod_")):
        bpy.data.objects.remove(obj, do_unlink=True)

# Lotus leaf: cupped radial mesh with a small open wedge and raised center.
def lotus_pad(name, x, z, radius, water_y):
    verts, faces = [], []
    segments, rings = 32, 5
    for ring in range(rings + 1):
        r = radius * ring / rings
        for seg in range(segments):
            angle = math.tau * seg / segments
            # A narrow wedge gives the characteristic lotus leaf notch.
            wrapped = min(angle, math.tau - angle)
            notch = 0.42 if wrapped < 0.16 else 1.0
            rr = r * notch
            lift = 0.06 + 0.18 * (r / max(radius, 1e-4)) ** 2
            verts.append((x + math.cos(angle) * rr, water_y + lift,
                          z + math.sin(angle) * rr * 0.84))
    for ring in range(rings):
        for seg in range(segments):
            a = ring * segments + seg
            b = ring * segments + (seg + 1) % segments
            c = (ring + 1) * segments + (seg + 1) % segments
            d = (ring + 1) * segments + seg
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([game_to_blender(v) for v in verts], [], faces)
    mesh.materials.append(LOTUS_LEAF)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    lotus_col.objects.link(obj)
    obj["asset_role"] = "lotus_leaf_visual"
    return obj

def lotus_flower(name, x, z, water_y, size, phase):
    # Layered curved petals, tapered toward their base and lifted toward the tip.
    for layer, count in ((0, 10), (1, 8), (2, 6)):
        for petal in range(count):
            angle = math.tau * petal / count + phase + layer * 0.22
            length = size * (1.0 - layer * 0.16)
            width = size * 0.22
            verts = []
            for row in range(6):
                t = row / 5
                for side in (-1, 0, 1):
                    lateral = side * width * math.sin(math.pi * t)
                    radial = length * t
                    px = x + math.cos(angle) * radial - math.sin(angle) * lateral
                    pz = z + math.sin(angle) * radial + math.cos(angle) * lateral
                    py = water_y + 0.42 + math.sin(math.pi * t) * 0.16 + t * 0.22 + layer * 0.045
                    verts.append(game_to_blender(px, py, pz))
            faces = []
            for row in range(5):
                for side in range(2):
                    a = row * 3 + side
                    faces.append((a, a + 1, a + 4, a + 3))
            mesh = bpy.data.meshes.new(name + "_petal_mesh")
            mesh.from_pydata(verts, [], faces)
            mesh.materials.append(PETAL_LIGHT if (petal + layer) % 3 == 0 else PETAL)
            mesh.update()
            obj = bpy.data.objects.new("%s_layer%d_petal%02d" % (name, layer, petal), mesh)
            lotus_col.objects.link(obj)
    # Central receptacle.
    center = game_to_blender(x, water_y + 0.58, z)
    uv_sphere(name + "_seed_head", center, (size * 0.16, size * 0.12, size * 0.16), GOLD, lotus_col, 16, 10)

# The pond center and radius match the cinematic landscape generator.
pond_x, pond_z, water_y = -18.0, 4.0, 0.10
for index in range(34):
    angle = random.uniform(0, math.tau)
    radius = random.uniform(1.2, 7.2)
    x = pond_x + math.cos(angle) * radius
    z = pond_z + math.sin(angle) * radius
    size = random.uniform(0.48, 1.05)
    lotus_pad("lotus_pad_%02d" % index, x, z, size, water_y)
    if index % 8 == 0:
        curve_object("lotus_stem_%02d" % index,
            [game_to_blender(x, water_y - 0.45, z), game_to_blender(x, water_y - 0.05, z)],
            0.025, STEM, lotus_col, 2)
for index in range(11):
    angle = index * math.tau / 11
    radius = 1.2 + (index % 4) * 1.15
    x = pond_x + math.cos(angle) * radius
    z = pond_z + math.sin(angle) * radius
    lotus_flower("lotus_flower_%02d" % index, x, z, water_y, random.uniform(0.42, 0.68), angle)
for index in range(8):
    angle = index * math.tau / 8 + 0.2
    radius = 5.8 + random.uniform(0.2, 1.0)
    x, z = pond_x + math.cos(angle) * radius, pond_z + math.sin(angle) * radius
    curve_object("lotus_reed_%02d" % index,
        [game_to_blender(x, water_y - 0.25, z), game_to_blender(x + 0.12, water_y + 0.4, z + 0.08),
         game_to_blender(x - 0.05, water_y + 0.85, z + 0.16)],
        0.018, STEM, lotus_col, 2)
lotus_col["asset_role"] = "lotus_ecosystem_visual_only"
lotus_col["species"] = "nelumbo_nucifera"
lotus_col["pond_center_game_xz"] = [pond_x, pond_z]
lotus_col["status"] = "procedural ecosystem base; water shader, simulation and authored hero flower remain separate"
lotus_col["collision"] = False

# Source collection keeps reusable source geometry separate from exports.
source_col["asset_role"] = "hero_vegetation_source_library"
scene["hero_vegetation_pipeline_version"] = "1.0"
scene["hero_bodhi_tree_status"] = "procedural_base"
scene["lotus_ecosystem_status"] = "procedural_base"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=output_path)
print("HERO VEGETATION GENERATED")
print("Output:", output_path)
print("Collections: EXPORT_hero_bodhi_tree, EXPORT_lotus_ecosystem")
print("Visual only: collision/navmesh unchanged")
