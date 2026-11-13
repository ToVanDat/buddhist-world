"""Build a reusable, region-aware vegetation library for the cinematic temple scene.

Run from the repository root after generate_cinematic_environment.py:
  blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_vegetation_library.py -- --out blender/projects/temple_complex_vegetation.blend

The generator creates 15 reusable mesh variants (5 species x 3 silhouettes) and scatters
linked instances into six landscape zones. It does not overwrite the source scene, edit
collision/navmesh, or pretend procedural trees are final hero assets.
"""
import bpy
import math
import os
import random
from _common import script_args

SEED = 20261110
MAP_HALF = 125.0
args = script_args()


def arg(name, default):
    return args[args.index(name) + 1] if name in args else default


output_path = os.path.abspath(arg("--out", "blender/projects/temple_complex_vegetation.blend"))
scene = bpy.context.scene
if bpy.data.collections.get("EXPORT_vegetation_temple_complex"):
    raise SystemExit("Vegetation export already exists. Start from temple_complex_cinematic.blend to avoid duplicate instances.")

required = ("EXPORT_cinematic_environment", "COLLISION_temple_complex", "NAVMESH_temple_complex")
missing = [name for name in required if bpy.data.collections.get(name) is None]
if missing:
    raise SystemExit("Open the cinematic environment scene first; missing: " + ", ".join(missing))

rng = random.Random(SEED)
visual = bpy.data.collections.new("EXPORT_vegetation_temple_complex")
scene.collection.children.link(visual)
library = bpy.data.collections.new("ASSET_LIBRARY_vegetation_sources")
scene.collection.children.link(library)


def game_to_blender(point):
    x, y, z = point
    return (x, -z, y)


def make_material(name, color, roughness):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    noise = mat.node_tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 7.5
    noise.inputs["Detail"].default_value = 3.0
    ramp = mat.node_tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*(c * 0.68 for c in color), 1.0)
    ramp.color_ramp.elements[1].color = (*(min(1.0, c * 1.22) for c in color), 1.0)
    bump = mat.node_tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.035
    links = mat.node_tree.links
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


BARK = make_material("BW_veg_bark_pbr", (0.19, 0.075, 0.035), 0.9)
LEAF_DARK = make_material("BW_veg_leaf_deep_pbr", (0.055, 0.16, 0.075), 0.86)
LEAF_LIGHT = make_material("BW_veg_leaf_sunlit_pbr", (0.19, 0.31, 0.11), 0.82)
LEAF_PINE = make_material("BW_veg_pine_needles_pbr", (0.075, 0.19, 0.12), 0.88)
BAMBOO = make_material("BW_veg_bamboo_pbr", (0.24, 0.31, 0.12), 0.72)


def append_cone(vertices, faces, material_ids, base, tip, radius, sides, mat_id):
    bx, by, bz = base
    tx, ty, tz = tip
    dx, dy, dz = tx - bx, ty - by, tz - bz
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    if length < 1e-5:
        return
    ux, uy, uz = dx / length, dy / length, dz / length
    ref = (0.0, 0.0, 1.0) if abs(uz) < 0.9 else (1.0, 0.0, 0.0)
    vx, vy, vz = uy * ref[2] - uz * ref[1], uz * ref[0] - ux * ref[2], ux * ref[1] - uy * ref[0]
    vl = max(math.sqrt(vx * vx + vy * vy + vz * vz), 1e-6)
    vx, vy, vz = vx / vl, vy / vl, vz / vl
    wx, wy, wz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    start = len(vertices)
    for point, rr in ((base, radius), (tip, max(0.018, radius * 0.08))):
        px, py, pz = point
        for i in range(sides):
            angle = math.tau * i / sides
            vertices.append((px + rr * (vx * math.cos(angle) + wx * math.sin(angle)),
                             py + rr * (vy * math.cos(angle) + wy * math.sin(angle)),
                             pz + rr * (vz * math.cos(angle) + wz * math.sin(angle))))
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((start + i, start + j, start + sides + j, start + sides + i))
        material_ids.append(mat_id)


def append_ellipsoid(vertices, faces, material_ids, center, radii, mat_id, segments=12, rings=8):
    cx, cy, cz = center
    rx, ry, rz = radii
    start = len(vertices)
    for j in range(rings + 1):
        phi = math.pi * j / rings
        for i in range(segments):
            theta = math.tau * i / segments
            vertices.append((cx + rx * math.sin(phi) * math.cos(theta),
                             cy + ry * math.cos(phi),
                             cz + rz * math.sin(phi) * math.sin(theta)))
    for j in range(rings):
        for i in range(segments):
            ni = (i + 1) % segments
            faces.append((start + j * segments + i, start + j * segments + ni,
                          start + (j + 1) * segments + ni, start + (j + 1) * segments + i))
            material_ids.append(mat_id)


def append_leaf(vertices, faces, material_ids, base, tip, width, mat_id):
    bx, by, bz = base
    tx, ty, tz = tip
    dx, dy, dz = tx - bx, ty - by, tz - bz
    length = max(math.sqrt(dx * dx + dy * dy + dz * dz), 1e-5)
    px, py, pz = -dz / length, 0.0, dx / length
    start = len(vertices)
    vertices.extend([
        (bx, by, bz),
        (bx + px * width, by + 0.12 * length, bz + pz * width),
        (tx, ty, tz),
        (bx - px * width, by + 0.12 * length, bz - pz * width),
    ])
    faces.append((start, start + 1, start + 2, start + 3))
    material_ids.append(mat_id)


def build_tree_mesh(name, species, variant):
    verts, faces, mids = [], [], []
    height_scale = (0.92, 1.0, 1.12)[variant]
    crown_scale = (0.88, 1.0, 1.12)[(variant + 1) % 3]
    if species in ("broadleaf", "bodhi"):
        height = 6.0 * height_scale
        append_cone(verts, faces, mids, (0, 0, 0), (0, height, 0), 0.28 * height_scale, 12, 0)
        for angle in (0.0, 1.25, 2.5, 3.75, 5.0):
            reach = (1.55 if species == "bodhi" else 1.15) * crown_scale
            append_cone(verts, faces, mids, (0, height * 0.43, 0),
                        (math.cos(angle) * reach, height * 0.78, math.sin(angle) * reach),
                        0.105, 8, 0)
        if species == "bodhi":
            clusters = [((0, height * 0.78, 0), (2.8, 1.45, 2.8)),
                        ((-1.35, height * 0.72, 0.35), (1.65, 1.2, 1.8)),
                        ((1.25, height * 0.76, -0.45), (1.7, 1.25, 1.75)),
                        ((0.15, height * 0.98, 0.1), (1.9, 1.05, 1.9))]
        else:
            clusters = [((0, height * 0.8, 0), (2.0, 1.55, 2.0)),
                        ((-0.9, height * 0.72, 0.2), (1.45, 1.2, 1.55)),
                        ((0.95, height * 0.73, -0.2), (1.5, 1.25, 1.5))]
        for center, radii in clusters:
            append_ellipsoid(verts, faces, mids, center,
                             (radii[0] * crown_scale, radii[1] * crown_scale, radii[2] * crown_scale),
                             1 if variant != 2 else 2)
    elif species == "pine":
        height = 8.0 * height_scale
        append_cone(verts, faces, mids, (0, 0, 0), (0, height, 0), 0.24, 10, 0)
        for level, radius in ((0.28, 1.75), (0.44, 1.48), (0.60, 1.18), (0.76, 0.88), (0.91, 0.48)):
            append_cone(verts, faces, mids, (0, height * level, 0),
                        (0, height * min(1.0, level + 0.27), 0),
                        radius * crown_scale, 10, 1)
    elif species == "bamboo":
        height = 7.0 * height_scale
        for stalk in range(7):
            angle = math.tau * stalk / 7
            x, z = math.cos(angle) * 0.34, math.sin(angle) * 0.34
            append_cone(verts, faces, mids, (x, 0, z), (x * 1.18, height, z * 1.18), 0.055, 8, 3)
            for node in (0.25, 0.48, 0.71, 0.9):
                y = height * node
                append_cone(verts, faces, mids, (x, y, z), (x + 0.08, y + 0.025, z), 0.075, 8, 3)
                for side in (-1, 1):
                    append_leaf(verts, faces, mids, (x, y, z),
                                (x + side * 0.75, y + 0.52, z + side * 0.22), 0.18, 1)
    else:  # low ornamental shrub
        for i, center in enumerate(((-0.35, 0.75, 0), (0.35, 0.82, 0.1), (0, 0.95, -0.3), (0.05, 0.65, 0.34))):
            append_ellipsoid(verts, faces, mids, center,
                             (0.72 * crown_scale, 0.7 * crown_scale, 0.72 * crown_scale), 1 if i % 2 else 2)
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([game_to_blender(v) for v in verts], [], faces)
    for mat in (BARK, LEAF_DARK, LEAF_LIGHT, BAMBOO):
        mesh.materials.append(mat)
    mesh.update()
    for polygon, mat_id in zip(mesh.polygons, mids):
        polygon.material_index = mat_id
        polygon.use_smooth = True
    uv = mesh.uv_layers.new(name="UVMap")
    if mesh.vertices:
        xs = [v.co.x for v in mesh.vertices]
        ys = [v.co.y for v in mesh.vertices]
        sx, sy = max(max(xs) - min(xs), 1e-5), max(max(ys) - min(ys), 1e-5)
        for polygon in mesh.polygons:
            for loop_index in polygon.loop_indices:
                co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = ((co.x - min(xs)) / sx, (co.y - min(ys)) / sy)
    return mesh


def terrain_height(x, z):
    radius = math.sqrt(x * x + z * z)
    rise = max(0.0, min(1.0, (radius - 34.0) / 84.0))
    rise = rise * rise * (3.0 - 2.0 * rise) * 37.0
    ridge = (math.sin(x * 0.043 + math.sin(z * 0.027) * 2.2)
             + math.sin(z * 0.061 + x * 0.018) * 0.55
             + math.sin((x + z) * 0.105) * 0.18)
    ridge *= max(0.0, min(1.0, (radius - 42.0) / 46.0))
    gullies = math.sin(x * 0.018 - z * 0.026) * math.cos(z * 0.031) * 2.4
    return -0.34 + rise + ridge * 4.4 + gullies * max(0.0, min(1.0, (radius - 45.0) / 45.0))


def keepout(x, z):
    if abs(x) < 7.8:  # pilgrimage axis
        return True
    circles = ((0, -22, 17), (0, 20, 10), (-18, 4, 8.5),
               (23, -21, 10), (-23, -21, 10), (24, -52, 12), (0, -115, 12))
    if any(math.hypot(x - cx, z - cz) < radius for cx, cz, radius in circles):
        return True
    return False


templates = {}
for species in ("pine", "broadleaf", "bodhi", "bamboo", "shrub"):
    for variant in range(3):
        mesh_name = "veg_%s_v%02d_source" % (species, variant + 1)
        templates[(species, variant)] = build_tree_mesh(mesh_name, species, variant)
        source = bpy.data.objects.new("src_" + mesh_name, templates[(species, variant)])
        library.objects.link(source)
        source.hide_render = True
        source.hide_set(True)
        source["asset_role"] = "reusable_source_mesh"

zones = [
    {"id": "outer_mountain", "bounds": (-118, 118, 52, 120), "count": 135,
     "species": (("pine", 0.55), ("broadleaf", 0.30), ("bamboo", 0.15))},
    {"id": "tam_quan", "bounds": (-42, 42, 4, 39), "count": 24,
     "species": (("broadleaf", 0.50), ("shrub", 0.35), ("bodhi", 0.15))},
    {"id": "lotus_garden", "bounds": (-38, 38, -12, 17), "count": 42,
     "species": (("broadleaf", 0.25), ("bamboo", 0.15), ("shrub", 0.60))},
    {"id": "main_temple", "bounds": (-43, 43, -53, -8), "count": 34,
     "species": (("bodhi", 0.35), ("broadleaf", 0.35), ("shrub", 0.30))},
    {"id": "stupa_garden", "bounds": (-95, 95, -96, -55), "count": 82,
     "species": (("pine", 0.42), ("broadleaf", 0.30), ("shrub", 0.28))},
    {"id": "mountain_retreat", "bounds": (-82, 82, -122, -96), "count": 70,
     "species": (("pine", 0.35), ("bodhi", 0.25), ("broadleaf", 0.25), ("bamboo", 0.15))},
]


def weighted_species(weights):
    roll = rng.random()
    total = 0.0
    for species, weight in weights:
        total += weight
        if roll <= total:
            return species
    return weights[-1][0]


def zone_position(zone):
    x0, x1, z0, z1 = zone["bounds"]
    for _ in range(80):
        x, z = rng.uniform(x0, x1), rng.uniform(z0, z1)
        if keepout(x, z):
            continue
        # Avoid the pond water surface while allowing planting on its banks.
        if math.hypot(x + 18.0, z - 4.0) < 9.5:
            continue
        # Trees must not occupy the central basin floor or steep upper ridges.
        height = terrain_height(x, z)
        if height > 43.0:
            continue
        if zone["id"] in ("tam_quan", "lotus_garden", "main_temple") and height > 5.0:
            continue
        return x, z, height
    return None


counts = {zone["id"]: 0 for zone in zones}
total = 0
for zone in zones:
    for index in range(zone["count"]):
        position = zone_position(zone)
        if position is None:
            continue
        x, z, height = position
        species = weighted_species(zone["species"])
        variant = rng.randrange(3)
        mesh = templates[(species, variant)]
        obj = bpy.data.objects.new("veg_%s_%s_%03d" % (species, zone["id"], index), mesh)
        visual.objects.link(obj)
        obj.location = game_to_blender((x, height, z))
        obj.rotation_euler[2] = rng.uniform(0.0, math.tau)
        obj["asset_role"] = "linked_procedural_vegetation_instance"
        obj["species"] = species
        obj["zone_id"] = zone["id"]
        obj["source_variant"] = variant + 1
        obj["collision"] = False
        counts[zone["id"]] += 1
        total += 1

visual["asset_role"] = "region_vegetation_visual_only"
visual["source_variant_count"] = len(templates)
visual["instance_count"] = total
visual["seed"] = SEED
library["asset_role"] = "source_mesh_library_not_exported"
scene["vegetation_pipeline_version"] = "1.0"
scene["vegetation_seed"] = SEED
scene["vegetation_instance_count"] = total

os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=output_path)
print("VEGETATION LIBRARY GENERATED")
print("Output:", output_path)
print("Reusable source variants:", len(templates))
print("Linked instances:", total)
for zone_id, count in counts.items():
    print("  %s: %d" % (zone_id, count))
print("Export visual collection: EXPORT_vegetation_temple_complex")
print("Source mesh collection: ASSET_LIBRARY_vegetation_sources")
print("Next: inspect in Blender, export GLB, validate, then benchmark in R3F.")
