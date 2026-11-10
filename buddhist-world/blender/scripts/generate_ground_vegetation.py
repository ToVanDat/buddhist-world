"""Create deterministic Geometry Nodes ground-cover scatter and three export LODs.

Run from the repository root after generate_cinematic_environment.py:
  blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_ground_vegetation.py -- --out blender/projects/temple_complex_ground_vegetation.blend

The Python pass samples terrain while respecting the main pilgrimage axis, temple
footprints and lotus pond. Geometry Nodes performs the actual source-mesh instancing.
Exports are split into LOD0/1/2 GLBs; this script never edits collision or navmesh.
"""
import bpy
import math
import os
import random
from _common import script_args

SEED = 20261110
MAP_HALF = 125.0
args = script_args()
output_path = os.path.abspath(
    args[args.index("--out") + 1] if "--out" in args
    else "blender/projects/temple_complex_ground_vegetation.blend"
)

if bpy.app.version < (3, 6, 0):
    raise SystemExit("Ground vegetation requires Blender 3.6+ Geometry Nodes.")

scene = bpy.context.scene
if bpy.data.collections.get("EXPORT_ground_vegetation_lod0"):
    raise SystemExit("Ground vegetation already exists. Start from temple_complex_cinematic.blend.")

terrain = bpy.data.objects.get("env_mountain_valley_terrain")
if terrain is None:
    raise SystemExit("Missing env_mountain_valley_terrain; generate the cinematic environment first.")

rng = random.Random(SEED)


def link_collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


def game_to_blender(x, z, height):
    return (x, -z, height)


def smoothstep(a, b, value):
    t = max(0.0, min(1.0, (value - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def terrain_height(x, z):
    radius = math.sqrt(x * x + z * z)
    rise = smoothstep(34.0, 118.0, radius) * 37.0
    ridge = (
        math.sin(x * 0.043 + math.sin(z * 0.027) * 2.2)
        + math.sin(z * 0.061 + x * 0.018) * 0.55
        + math.sin((x + z) * 0.105) * 0.18
    )
    ridge *= smoothstep(42.0, 88.0, radius)
    gullies = math.sin(x * 0.018 - z * 0.026) * math.cos(z * 0.031) * 2.4
    return -0.34 + rise + ridge * 4.4 + gullies * smoothstep(45.0, 90.0, radius)


def keepout(x, z):
    # Keep the central pilgrimage axis, buildings, pond water and major pavilions clear.
    if abs(x) < 8.2:
        return True
    circles = (
        (0, -22, 18), (0, 20, 11), (-18, 4, 10),
        (23, -21, 11), (-23, -21, 11), (24, -52, 13), (0, -115, 16),
    )
    if any(math.hypot(x - cx, z - cz) < radius for cx, cz, radius in circles):
        return True
    if math.hypot(x + 18.0, z - 4.0) < 10.5:
        return True
    return False


def material(name, color, roughness):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


MAT_GRASS = material("BW_ground_grass_pbr", (0.12, 0.23, 0.075), 0.92)
MAT_FERN = material("BW_ground_fern_pbr", (0.075, 0.19, 0.09), 0.88)
MAT_FLOWER = material("BW_ground_wildflower_pbr", (0.72, 0.42, 0.34), 0.62)
MAT_MOSS = material("BW_ground_moss_pbr", (0.10, 0.18, 0.065), 0.98)


def make_mesh(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    if mesh.vertices:
        uv = mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            for loop_index in poly.loop_indices:
                co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = (co.x + 0.5, co.z + 0.5)
    return mesh


def build_grass():
    verts, faces = [], []
    for blade in range(7):
        angle = math.tau * blade / 7
        dx, dz = math.cos(angle), math.sin(angle)
        width = 0.035 + (blade % 3) * 0.009
        height = 0.24 + (blade % 4) * 0.075
        base = len(verts)
        verts.extend([
            (-dz * width, 0, dx * width),
            (dz * width, 0, -dx * width),
            (dx * 0.10, height, dz * 0.10),
        ])
        faces.append((base, base + 1, base + 2))
    return make_mesh("veg_ground_grass_source", verts, faces, MAT_GRASS)


def build_fern():
    verts, faces = [(0, 0.02, 0)], []
    for side in (-1, 1):
        for index in range(5):
            t = (index + 1) / 6
            x = side * (0.12 + 0.10 * t)
            y = 0.05 + 0.30 * t
            z = 0.015 * math.sin(index)
            width = 0.075 * (1.0 - 0.35 * t)
            base = len(verts)
            verts.extend([
                (0, y, z),
                (x - width, y + 0.035, z + 0.025),
                (x, y + 0.055, z + 0.07),
                (x + width, y + 0.035, z + 0.025),
            ])
            faces.append((base, base + 1, base + 2, base + 3))
    return make_mesh("veg_ground_fern_source", verts, faces, MAT_FERN)


def build_flower():
    verts = [(0, 0, 0), (0, 0.20, 0)]
    faces = [(0, 1)]
    # Five small petals around a compact flower head.
    for i in range(5):
        angle = math.tau * i / 5
        cx, cz = math.cos(angle) * 0.075, math.sin(angle) * 0.075
        base = len(verts)
        verts.extend([
            (0, 0.20, 0),
            (cx - 0.035, 0.22, cz),
            (cx, 0.235, cz + 0.035),
            (cx + 0.035, 0.22, cz),
        ])
        faces.append((base, base + 1, base + 2, base + 3))
    return make_mesh("veg_ground_wildflower_source", verts, faces, MAT_FLOWER)


def build_moss():
    verts, faces = [], []
    for index in range(5):
        angle = math.tau * index / 5
        cx, cz = math.cos(angle) * 0.09, math.sin(angle) * 0.09
        base = len(verts)
        # Low tetrahedral clumps keep the silhouette inexpensive at distance.
        verts.extend([
            (cx - 0.10, 0, cz), (cx + 0.10, 0, cz),
            (cx, 0.10 + (index % 2) * 0.035, cz + 0.09),
            (cx, 0, cz - 0.10),
        ])
        faces.extend([
            (base, base + 1, base + 2),
            (base + 1, base + 3, base + 2),
            (base + 3, base, base + 2),
        ])
    return make_mesh("veg_ground_moss_source", verts, faces, MAT_MOSS)


source_builders = {
    "grass": (build_grass, MAT_GRASS, 0.42),
    "fern": (build_fern, MAT_FERN, 0.24),
    "wildflower": (build_flower, MAT_FLOWER, 0.12),
    "moss": (build_moss, MAT_MOSS, 0.28),
}
lod_ratios = {0: 1.0, 1: 0.55, 2: 0.22}
lod_density = {0: 1.0, 1: 0.42, 2: 0.14}


def make_lod_mesh(name, source_mesh, ratio):
    mesh = source_mesh.copy()
    mesh.name = name + "_mesh"
    if ratio < 0.999:
        temp = bpy.data.objects.new(name + "_decimator", mesh)
        scene.collection.objects.link(temp)
        mod = temp.modifiers.new("ground_cover_lod_reduction", "DECIMATE")
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = temp
        temp.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        temp.select_set(False)
        mesh = temp.data
        bpy.data.objects.remove(temp, do_unlink=True)
    return mesh


def scatter_points(kind, count):
    points = []
    attempts = max(count * 8, 100)
    for _ in range(attempts):
        if len(points) >= count:
            break
        x = rng.uniform(-MAP_HALF + 3.0, MAP_HALF - 3.0)
        z = rng.uniform(-MAP_HALF + 3.0, MAP_HALF - 3.0)
        if keepout(x, z):
            continue
        height = terrain_height(x, z)
        if height > 48.0:
            continue
        # Avoid the steepest ridges for low ground cover; fern/moss favor shaded slopes.
        if kind in ("grass", "wildflower") and height > 30.0:
            continue
        if kind in ("fern", "moss") and height < 1.0 and rng.random() < 0.45:
            continue
        points.append(game_to_blender(x, z, height + 0.025))
    return points


def make_gn_group(kind, source_obj):
    group = bpy.data.node_groups.new("GN_ground_" + kind, "GeometryNodeTree")
    group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nodes, links = group.nodes, group.links
    inp = nodes.new("NodeGroupInput")
    out = nodes.new("NodeGroupOutput")
    obj_info = nodes.new("GeometryNodeObjectInfo")
    obj_info.inputs["Object"].default_value = source_obj
    obj_info.inputs["As Instance"].default_value = True
    points = nodes.new("GeometryNodeInputIndex")
    random_rotation = nodes.new("FunctionNodeRandomValue")
    random_rotation.data_type = "FLOAT"
    random_rotation.inputs["Min"].default_value = 0.0
    random_rotation.inputs["Max"].default_value = math.tau
    links.new(points.outputs["Index"], random_rotation.inputs["ID"])
    rotation = nodes.new("ShaderNodeCombineXYZ")
    links.new(random_rotation.outputs["Value"], rotation.inputs["Z"])
    random_scale = nodes.new("FunctionNodeRandomValue")
    random_scale.data_type = "FLOAT"
    random_scale.inputs["Min"].default_value = 0.72
    random_scale.inputs["Max"].default_value = 1.34
    links.new(points.outputs["Index"], random_scale.inputs["ID"])
    scale = nodes.new("ShaderNodeCombineXYZ")
    for axis in ("X", "Y", "Z"):
        links.new(random_scale.outputs["Value"], scale.inputs[axis])
    instance = nodes.new("GeometryNodeInstanceOnPoints")
    links.new(inp.outputs["Geometry"], instance.inputs["Points"])
    links.new(obj_info.outputs["Geometry"], instance.inputs["Instance"])
    links.new(rotation.outputs["Vector"], instance.inputs["Rotation"])
    links.new(scale.outputs["Vector"], instance.inputs["Scale"])
    realize = nodes.new("GeometryNodeRealizeInstances")
    links.new(instance.outputs["Instances"], realize.inputs["Geometry"])
    links.new(realize.outputs["Geometry"], out.inputs["Geometry"])
    return group


def make_emitter(kind, lod, count, source_obj, export_col):
    points = scatter_points(kind, count)
    mesh = bpy.data.meshes.new("veg_ground_%s_lod%d_points_mesh" % (kind, lod))
    mesh.from_pydata(points, [], [])
    mesh.materials.append(source_obj.data.materials[0])
    mesh.uv_layers.new(name="UVMap")
    mesh.update()
    obj = bpy.data.objects.new("veg_ground_%s_lod%d" % (kind, lod), mesh)
    export_col.objects.link(obj)
    modifier = obj.modifiers.new("GeometryNodes_ground_scatter", "NODES")
    modifier.node_group = make_gn_group(kind, source_obj)
    obj["asset_role"] = "procedural_ground_scatter"
    obj["vegetation_kind"] = kind
    obj["lod_level"] = lod
    obj["point_count"] = len(points)
    obj["collision"] = False
    return obj


# Source meshes remain outside EXPORT collections; each LOD receives a simplified source.
source_library = link_collection("ASSET_LIBRARY_ground_vegetation")
base_sources = {}
for kind, (builder, _mat, _density) in source_builders.items():
    base = bpy.data.objects.new("src_ground_" + kind, builder())
    source_library.objects.link(base)
    base.hide_set(True)
    base_sources[kind] = base

lod_stats = {}
for lod, ratio in lod_ratios.items():
    export_col = link_collection("EXPORT_ground_vegetation_lod%d" % lod)
    count_scale = lod_density[lod]
    for kind, (_builder, _mat, density) in source_builders.items():
        source_mesh = make_lod_mesh("src_ground_%s_lod%d" % (kind, lod), base_sources[kind].data, ratio)
        source = bpy.data.objects.new("src_ground_%s_lod%d" % (kind, lod), source_mesh)
        source_library.objects.link(source)
        source.hide_set(True)
        # A fixed per-kind seed keeps LOD point layouts deterministic and spatially comparable.
        rng.seed(SEED + lod * 1000 + sum(ord(ch) for ch in kind))
        target_count = int(900 * density * count_scale)
        emitter = make_emitter(kind, lod, target_count, source, export_col)
        lod_stats[(lod, kind)] = emitter.get("point_count", 0)
    export_col["asset_role"] = "ground_vegetation_lod_visual_only"
    export_col["lod_level"] = lod
    export_col["density_scale"] = count_scale
    export_col["collision"] = False

scene["ground_vegetation_pipeline_version"] = "1.0"
scene["ground_vegetation_seed"] = SEED
scene["ground_vegetation_lod_count"] = 3
os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=output_path)

print("GROUND VEGETATION / GEOMETRY NODES GENERATED")
print("Output:", output_path)
for (lod, kind), count in sorted(lod_stats.items()):
    print("  LOD%d %-12s %d points" % (lod, kind, count))
print("Exports: ground_vegetation_lod0.glb, ground_vegetation_lod1.glb, ground_vegetation_lod2.glb")
print("Inspect evaluated Geometry Nodes and GLB exports before registering runtime assets.")
