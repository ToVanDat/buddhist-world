"""Generate a separate procedural Vietnamese temple-complex environment base.

Run from the repository root:
  blender -b --python blender/scripts/generate_temple_complex.py -- --out blender/projects/temple_complex_generated.blend

The script only accepts Blender's default startup scene. It never clears a user-authored
.blend file. Geometry is authored in game coordinates (Y-up metres), then converted
to Blender Z-up. Output collections:
  EXPORT_temple_complex       visible architectural geometry
  COLLISION_temple_complex    simplified invisible static collision
  NAVMESH_temple_complex      deliberately walkable surfaces only
This is an editable procedural base, not a final sculpted/texture-baked hero environment.
"""
import bpy
import math
import os
from _common import script_args

args = script_args()
out = args[args.index("--out") + 1] if "--out" in args else "blender/projects/temple_complex_generated.blend"

custom_objects = [obj.name for obj in bpy.context.scene.objects if obj.name not in {"Camera", "Cube", "Light"}]
if custom_objects:
    raise SystemExit("Refusing to modify a non-empty user scene. Run this generator with 'blender -b --python ...' without an input .blend.")

# Remove only Blender's untouched startup cube/camera/light.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.users == 0:
        bpy.data.collections.remove(collection)

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.render.fps = 30

def make_collection(name):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    return collection

visual = make_collection("EXPORT_temple_complex")
collision = make_collection("COLLISION_temple_complex")
navmesh = make_collection("NAVMESH_temple_complex")

def game_to_blender(point):
    x, y, z = point
    return (x, -z, y)

def make_material(name, color, roughness=0.75, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material

MAT_STONE = make_material("BW_stone_warm_limestone", (0.48, 0.43, 0.34), 0.9)
MAT_STONE_LIGHT = make_material("BW_stone_cut_edges", (0.64, 0.58, 0.46), 0.82)
MAT_WOOD = make_material("BW_wood_dark_teak", (0.18, 0.075, 0.035), 0.62)
MAT_LACQUER = make_material("BW_wood_red_lacquer", (0.32, 0.085, 0.045), 0.38)
MAT_ROOF = make_material("BW_roof_aged_terracotta", (0.22, 0.075, 0.045), 0.82)
MAT_ROOF_EDGE = make_material("BW_roof_edge_ochre", (0.48, 0.27, 0.10), 0.62)
MAT_GOLD = make_material("BW_muted_gold", (0.55, 0.36, 0.12), 0.34, 0.55)
MAT_WATER = make_material("BW_lotus_pond_water", (0.045, 0.20, 0.18), 0.18, 0.18)
MAT_DARK = make_material("BW_door_shadow", (0.055, 0.035, 0.025), 0.9)

def mesh_object(name, game_vertices, faces, collection, material=None, bevel=0.0):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([game_to_blender(v) for v in game_vertices], [], faces)
    mesh.validate()
    mesh.update()
    # Procedural base UVs satisfy export validation; hero texture work should
    # replace these with artist-authored seams and texel-density checks.
    if len(mesh.vertices):
        xs = [vertex.co.x for vertex in mesh.vertices]
        ys = [vertex.co.y for vertex in mesh.vertices]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        span_x = max(max_x - min_x, 1e-5)
        span_y = max(max_y - min_y, 1e-5)
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for polygon in mesh.polygons:
            for loop_index in polygon.loop_indices:
                vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv_layer.data[loop_index].uv = ((vertex.x - min_x) / span_x, (vertex.y - min_y) / span_y)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material:
        mesh.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new("soft_cut_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier = obj.modifiers.new("weighted_corner_normals", "WEIGHTED_NORMAL")
    return obj

def box(name, center, size, collection, material=None, bevel=0.0):
    cx, cy, cz = center
    sx, sy, sz = (value / 2 for value in size)
    vertices = [
        (cx-sx, cy-sy, cz-sz), (cx+sx, cy-sy, cz-sz),
        (cx+sx, cy+sy, cz-sz), (cx-sx, cy+sy, cz-sz),
        (cx-sx, cy-sy, cz+sz), (cx+sx, cy-sy, cz+sz),
        (cx+sx, cy+sy, cz+sz), (cx-sx, cy+sy, cz+sz),
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
        (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    return mesh_object(name, vertices, faces, collection, material, bevel)

def cylinder(name, center, radius, depth, collection, material, vertices=20):
    cx, cy, cz = center
    points = []
    for y in (cy-depth/2, cy+depth/2):
        for index in range(vertices):
            angle = math.tau * index / vertices
            points.append((cx + math.cos(angle)*radius, y, cz + math.sin(angle)*radius))
    faces = []
    faces.append(tuple(range(vertices-1, -1, -1)))
    faces.append(tuple(range(vertices, vertices*2)))
    for index in range(vertices):
        nxt = (index + 1) % vertices
        faces.append((index, nxt, vertices+nxt, vertices+index))
    return mesh_object(name, points, faces, collection, material)

def roof(name, center_x, center_z, half_width, half_depth, ridge_y, eave_y, material):
    # Two roof planes with subtly lifted Vietnamese upturned corners.
    for side in (-1, 1):
        vertices = []
        faces = []
        x_steps, depth_steps = 16, 8
        for ix in range(x_steps + 1):
            x_ratio = -1.0 + 2.0 * ix / x_steps
            x = center_x + x_ratio * half_width
            corner_lift = 0.72 * (abs(x_ratio) ** 4)
            for iz in range(depth_steps + 1):
                t = iz / depth_steps
                z = center_z + side * half_depth * t
                y = ridge_y + (eave_y - ridge_y) * t + corner_lift * (t ** 2)
                vertices.append((x, y, z))
        for ix in range(x_steps):
            for iz in range(depth_steps):
                a = ix * (depth_steps + 1) + iz
                b = (ix + 1) * (depth_steps + 1) + iz
                faces.append((a, b, b+1, a+1))
        obj = mesh_object(name + ("_north" if side > 0 else "_south"), vertices, faces, visual, material)
        solidify = obj.modifiers.new("roof_tile_thickness", "SOLIDIFY")
        solidify.thickness = 0.22
        bevel_mod = obj.modifiers.new("roof_edge_softness", "BEVEL")
        bevel_mod.width = 0.045
        bevel_mod.segments = 2
    # Raised ridge cap and decorative end caps.
    box(name + "_ridge_cap", (center_x, ridge_y+0.12, center_z), (half_width*2+0.6, 0.28, 0.38), visual, MAT_ROOF_EDGE, 0.06)
    for x_sign in (-1, 1):
        for z_sign in (-1, 1):
            cylinder(name + "_corner_finial", (center_x+x_sign*half_width, eave_y+0.42, center_z+z_sign*half_depth), 0.16, 0.9, visual, MAT_GOLD, 12)

def column(name, x, z, height, radius=0.28):
    cylinder(name + "_stone_base", (x, 0.22, z), radius*1.55, 0.44, visual, MAT_STONE_LIGHT)
    cylinder(name + "_shaft", (x, 0.44+height/2, z), radius, height, visual, MAT_LACQUER, 24)
    cylinder(name + "_capital", (x, height+0.58, z), radius*1.38, 0.28, visual, MAT_WOOD)

# Main hall: raised stone plinth, timber frame, side walls, central door and roof.
box("arch_main_hall_plinth", (0, 0.38, -22.8), (21.5, 0.76, 14.0), visual, MAT_STONE, 0.16)
box("arch_main_hall_floor_collision", (0, 0.38, -22.8), (21.5, 0.76, 14.0), collision)
for z in (-28.0, -16.0):
    column_x_positions = (-9.0, -4.5, 4.5, 9.0)
    for x in column_x_positions:
        column("arch_hall_column_%s_%s" % (str(x).replace("-", "m"), str(z).replace("-", "m")), x, z, 5.8, 0.32)
        box("hall_column_collision_%s_%s" % (str(x), str(z)), (x, 3.34, z), (0.68, 5.8, 0.68), collision)
for z in (-28.0, -16.0):
    box("arch_hall_beam_" + str(z), (0, 6.45, z), (20.0, 0.55, 0.55), visual, MAT_WOOD, 0.06)
    box("hall_beam_collision_" + str(z), (0, 6.45, z), (20.0, 0.65, 0.65), collision)
for x in (-9.8, 9.8):
    box("arch_hall_side_wall_" + str(x), (x, 3.15, -22), (0.45, 5.8, 11.5), visual, MAT_LACQUER, 0.04)
    box("hall_side_wall_collision_" + str(x), (x, 3.15, -22), (0.5, 5.8, 11.5), collision)
box("arch_hall_rear_wall", (0, 3.15, -29.15), (19.2, 5.8, 0.45), visual, MAT_LACQUER, 0.04)
box("hall_rear_wall_collision", (0, 3.15, -29.15), (19.2, 5.8, 0.5), collision)
box("arch_hall_door_frame", (0, 3.0, -15.0), (5.0, 5.3, 0.42), visual, MAT_WOOD, 0.08)
box("arch_hall_door_shadow", (0, 2.55, -14.76), (3.8, 4.2, 0.12), visual, MAT_DARK, 0.02)
for x in (-1.8, 1.8):
    box("arch_hall_door_leaf_" + str(x), (x * 1.11, 2.45, -14.65), (1.3, 4.0, 0.18), visual, MAT_LACQUER, 0.035)
    box("hall_door_leaf_collision_" + str(x), (x * 1.11, 2.45, -14.65), (1.3, 4.0, 0.2), collision)
    for y in (1.1, 2.2, 3.25):
        box("arch_door_panel_%s_%s" % (str(x), str(y)), (x * 1.11, y, -14.53), (1.05, 0.055, 0.035), visual, MAT_GOLD, 0.012)
roof("arch_main_hall_roof", 0, -22, 12.0, 8.8, 10.0, 7.0, MAT_ROOF)
ramp_top = [(-6.0, 0.06, -14.0), (6.0, 0.06, -14.0), (6.0, 0.76, -16.0), (-6.0, 0.76, -16.0)]
ramp_bottom = [(-6.0, 0.0, -14.0), (6.0, 0.0, -14.0), (6.0, 0.0, -16.0), (-6.0, 0.0, -16.0)]
mesh_object("arch_hall_access_ramp", ramp_top + ramp_bottom,
            [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
            visual, MAT_STONE_LIGHT, 0.035)
mesh_object("hall_access_ramp_collision", ramp_top + ramp_bottom,
            [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
            collision)

# Tam Quan gate: four red timber pillars, stone bases, cross beam and curved roof.
for index, x in enumerate((-4.5, -1.5, 1.5, 4.5)):
    height = 5.8 if abs(x) == 1.5 else 5.0
    cylinder("arch_gate_pillar_base_" + str(index), (x, 0.22, 20), 0.55, 0.44, visual, MAT_STONE_LIGHT)
    cylinder("arch_gate_pillar_" + str(index), (x, height/2+0.44, 20), 0.34, height, visual, MAT_LACQUER, 24)
    box("gate_pillar_collision_" + str(index), (x, height/2+0.44, 20), (0.72, height, 0.72), collision)
box("arch_gate_crossbeam", (0, 6.75, 20), (11.0, 0.55, 1.2), visual, MAT_WOOD, 0.08)
box("gate_crossbeam_collision", (0, 6.75, 20), (11.0, 0.65, 1.3), collision)
roof("arch_tam_quan_roof", 0, 20, 6.1, 3.8, 8.0, 6.7, MAT_ROOF)

# Courtyard paving, approach path, side lanterns and lotus pond.
box("env_courtyard_paving", (0, -0.08, -2), (24.0, 0.16, 24.0), visual, MAT_STONE_LIGHT, 0.04)
box("courtyard_collision", (0, -0.08, -2), (24.0, 0.16, 24.0), collision)
box("env_entrance_walkway", (0, 0.0, 15.0), (5.2, 0.12, 10.0), visual, MAT_STONE, 0.03)
box("entrance_walkway_collision", (0, 0.0, 15.0), (5.2, 0.12, 10.0), collision)
box("env_pond_water", (-18, 0.03, 4), (12.5, 0.08, 12.5), visual, MAT_WATER)
for x in (-13.0, 13.0):
    for z in (-10.0, 7.0):
        cylinder("prop_courtyard_lantern_base", (x, 0.32, z), 0.36, 0.64, visual, MAT_STONE_LIGHT)
        cylinder("prop_courtyard_lantern_body", (x, 1.15, z), 0.22, 1.0, visual, MAT_GOLD, 16)
        box("prop_courtyard_lantern_cap", (x, 1.72, z), (0.7, 0.16, 0.7), visual, MAT_STONE, 0.05)

# Navmesh surfaces use shared coordinates at region transitions. The ramp connects
# courtyard height to the raised hall floor; pond and roof surfaces are excluded.
nav_vertices = []
nav_faces = []
def nav_quad(x0, z0, y0, x1, z1, y1):
    base = len(nav_vertices)
    nav_vertices.extend([
        (x0, y0, z0), (x1, y0, z0),
        (x1, y1, z1), (x0, y1, z1),
    ])
    nav_faces.append((base, base+1, base+2, base+3))

nav_quad(-1.1, 20.0, 0.06, 1.1, 10.0, 0.06)  # clear central gate opening
x_edges = (-11.2, -3.8, -1.1, 1.1, 3.8, 11.2)
for left, right in zip(x_edges[:-1], x_edges[1:]):
    nav_quad(left, 10.0, 0.06, right, -14.0, 0.06)  # courtyard split to avoid T-junctions
for left, right in ((-3.8, -1.1), (-1.1, 1.1), (1.1, 3.8)):
    nav_quad(left, -14.0, 0.06, right, -16.0, 0.76)  # continuous accessible hall ramp
    nav_quad(left, -16.0, 0.76, right, -29.0, 0.76)  # unobstructed central hall aisle
mesh_object("navmesh_temple_complex_walkable", nav_vertices, nav_faces, navmesh)

# A separate, simplified collision volume for the pond edge prevents walking into water.
box("pond_west_collision", (-24.2, 0.55, 4), (0.5, 1.1, 13.0), collision)
box("pond_east_collision", (-11.8, 0.55, 4), (0.5, 1.1, 13.0), collision)
box("pond_north_collision", (-18, 0.55, 10.2), (12.0, 1.1, 0.5), collision)
box("pond_south_collision", (-18, 0.55, -2.2), (12.0, 1.1, 0.5), collision)

# Keep export collections easy to identify in Blender's Outliner.
visual["asset_role"] = "render_environment"
collision["asset_role"] = "static_collision_only"
navmesh["asset_role"] = "npc_walkable_surface"
scene["coordinate_system"] = "Game Y-up metres; Blender Z-up native"
scene["asset_status"] = "Procedural architectural base; requires artist review and polish"

os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
print("Saved procedural temple base:", os.path.abspath(out))
print("Collections: EXPORT_temple_complex, COLLISION_temple_complex, NAVMESH_temple_complex")
print("Next: batch_export.py, export_navmesh.py, validate GLB/navmesh, then inspect in Blender and R3F.")
