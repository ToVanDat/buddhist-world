"""Generate two independently exportable Vietnamese Buddhist hero buildings.

Run from the repository root with a clean Blender startup scene:
  blender -b --python blender/scripts/generate_hero_architecture.py -- --out blender/projects/hero_architecture_source.blend

Optional preview render:
  blender -b --python blender/scripts/generate_hero_architecture.py -- --out blender/projects/hero_architecture_source.blend --render blender/reports/hero_architecture_overview.png

Outputs:
  EXPORT_hero_tam_quan
  EXPORT_hero_main_hall

This creates a detailed procedural authoring base, not an accepted AAA asset.
Materials are preview-grade procedural Blender materials; bake/author glTF PBR maps
and perform visual/runtime review before production integration. No collision,
navmesh, region manifest, existing scene or source asset is modified.
"""
import bpy
import math
import os
import random
from _common import script_args

SEED = 20261112
random.seed(SEED)
args = script_args()


def arg(name, default):
    return args[args.index(name) + 1] if name in args else default


OUTPUT = os.path.abspath(arg("--out", "blender/projects/hero_architecture_source.blend"))
RENDER = os.path.abspath(arg("--render", "")) if "--render" in args else ""
scene = bpy.context.scene

# Refuse to clear or reuse an authored scene. The generator is intentionally standalone.
startup_names = {"Camera", "Cube", "Light"}
custom = [obj.name for obj in scene.objects if obj.name not in startup_names]
if custom:
    raise SystemExit("Refusing to modify a non-empty scene. Run Blender without an input .blend file.")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.users == 0:
        bpy.data.collections.remove(col)

scene.unit_settings.system = "METRIC"
scene.render.engine = "BLENDER_EEVEE_NEXT" if hasattr(bpy.types, "SceneEEVEE") else "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.fps = 30

def new_collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col

gate_col = new_collection("EXPORT_hero_tam_quan")
hall_col = new_collection("EXPORT_hero_main_hall")
preview_col = new_collection("QA_preview_rig")
source_col = new_collection("ASSET_LIBRARY_architecture_sources")


def game_to_blender(p):
    x, y, z = p
    return (x, -z, y)


def make_material(name, color, roughness, metallic=0.0, noise_scale=7.0, bump_strength=0.12):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.72
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.18
    ramp.color_ramp.elements[0].color = (*(c * 0.72 for c in color), 1.0)
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = (*(min(1.0, c * 1.18) for c in color), 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.035
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mat["bw_material_status"] = "procedural_preview_not_glb_baked"
    return mat


STONE = make_material("BW_HERO_weathered_limestone", (0.43, 0.38, 0.29), 0.9, noise_scale=18, bump_strength=0.18)
STONE_TRIM = make_material("BW_HERO_cut_limestone", (0.62, 0.54, 0.40), 0.82, noise_scale=24, bump_strength=0.1)
WOOD = make_material("BW_HERO_aged_dark_teak", (0.14, 0.055, 0.026), 0.72, noise_scale=5, bump_strength=0.22)
LACQUER = make_material("BW_HERO_muted_red_lacquer", (0.29, 0.055, 0.035), 0.4, noise_scale=9, bump_strength=0.08)
ROOF_A = make_material("BW_HERO_terracotta_tile_a", (0.25, 0.075, 0.043), 0.84, noise_scale=13, bump_strength=0.16)
ROOF_B = make_material("BW_HERO_terracotta_tile_b", (0.31, 0.105, 0.062), 0.82, noise_scale=13, bump_strength=0.16)
ROOF_C = make_material("BW_HERO_terracotta_tile_c", (0.20, 0.055, 0.034), 0.88, noise_scale=13, bump_strength=0.16)
BRONZE = make_material("BW_HERO_aged_bronze", (0.32, 0.22, 0.095), 0.42, metallic=0.68, noise_scale=11, bump_strength=0.1)
DARK = make_material("BW_HERO_opening_shadow", (0.025, 0.018, 0.014), 0.95)


def mesh_object(name, game_vertices, faces, target, materials=(), material_ids=None, bevel=0.0, solidify=0.0):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([game_to_blender(v) for v in game_vertices], [], faces)
    for material in materials:
        mesh.materials.append(material)
    mesh.update()
    if material_ids:
        for poly, material_id in zip(mesh.polygons, material_ids):
            poly.material_index = material_id
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    if bevel:
        mod = obj.modifiers.new("crafted_edge_bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("weighted_corner_normals", "WEIGHTED_NORMAL")
    if solidify:
        mod = obj.modifiers.new("solid_roof_or_panel_thickness", "SOLIDIFY")
        mod.thickness = solidify
        mod.offset = -1.0
    obj["asset_role"] = "hero_architecture_visual"
    return obj


def box(name, center, size, target, material, bevel=0.04):
    x, y, z = center
    sx, sy, sz = (v / 2 for v in size)
    verts = [(x-sx,y-sy,z-sz),(x+sx,y-sy,z-sz),(x+sx,y+sy,z-sz),(x-sx,y+sy,z-sz),
             (x-sx,y-sy,z+sz),(x+sx,y-sy,z+sz),(x+sx,y+sy,z+sz),(x-sx,y+sy,z+sz)]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    return mesh_object(name, verts, faces, target, (material,), bevel=bevel)


def cylinder(name, center, radius, depth, target, material, sides=24, bevel=0.018):
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
    return mesh_object(name, verts, faces, target, (material,), bevel=bevel)


def beam_between(name, start, end, width, depth, target, material):
    # A beam with its long axis following the line between two game-space points.
    a, b = game_to_blender(start), game_to_blender(end)
    mid = tuple((a[i] + b[i]) * 0.5 for i in range(3))
    delta = tuple(b[i] - a[i] for i in range(3))
    length = math.sqrt(sum(v*v for v in delta))
    obj = box(name, (mid[0], -mid[1], mid[2]), (width, depth, length), target, material, 0.025)
    direction = (delta[0], delta[1], delta[2])
    obj.rotation_mode = "QUATERNION"
    from mathutils import Vector
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    return obj


def uv_unwrap(obj):
    if obj.type != "MESH" or len(obj.data.polygons) == 0:
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=0.015)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.data.uv_layers.active.name = "UVMap"
    except Exception as exc:
        if obj.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        obj["uv_unwrap_warning"] = str(exc)


def column(prefix, x, z, height, radius, target):
    cylinder(prefix+"_foot", (x, 0.24, z), radius*1.55, 0.48, target, STONE_TRIM, 28)
    cylinder(prefix+"_base_ring", (x, 0.55, z), radius*1.22, 0.16, target, BRONZE, 28)
    cylinder(prefix+"_shaft", (x, 0.58+height/2, z), radius, height, target, LACQUER, 32)
    cylinder(prefix+"_neck", (x, height+0.72, z), radius*1.18, 0.18, target, WOOD, 28)
    box(prefix+"_capital", (x, height+0.91, z), (radius*3.1, 0.34, radius*2.5), target, WOOD)


def bracket_set(prefix, x, y, z, scale, target):
    box(prefix+"_corbel", (x,y+0.24*scale,z), (0.42*scale,0.5*scale,0.5*scale), target, LACQUER)
    for level, reach in enumerate((0.62, 0.88, 1.16)):
        direction = -1 if level % 2 == 0 else 1
        yy = y + (0.18 + level*0.23)*scale
        box(prefix+"_arm_"+str(level), (x+direction*reach*0.22*scale,yy,z),
            (reach*scale,0.15*scale,0.34*scale), target, WOOD, 0.025)
        box(prefix+"_cap_"+str(level), (x+direction*reach*0.42*scale,yy+0.1*scale,z),
            (0.22*scale,0.13*scale,0.4*scale), target, LACQUER, 0.02)


def roof_mesh(prefix, cx, cz, half_width, half_depth, ridge_y, eave_y, target):
    # Continuous roof substrate with raised corners and a separate overlapping tile field.
    verts, faces = [], []
    nx, nt = 36, 18
    for side in (-1, 1):
        base = len(verts)
        for ix in range(nx+1):
            u = -1.0 + 2.0*ix/nx
            for it in range(nt+1):
                t = it/nt
                lift = 0.78 * (abs(u)**4) * (t**2)
                verts.append((cx+u*half_width, ridge_y+(eave_y-ridge_y)*t+lift, cz+side*half_depth*t))
        for ix in range(nx):
            for it in range(nt):
                a = base + ix*(nt+1)+it
                b, c, d = a+nt+1, a+nt+2, a+1
                faces.append((a,b,c,d) if side < 0 else (d,c,b,a))
    mesh_object(prefix+"_continuous_roof_substrate", verts, faces, target, (WOOD,), solidify=0.24)

    tile_verts, tile_faces, tile_ids = [], [], []
    columns, rows, sub = 22, 11, 2
    for side in (-1, 1):
        for col in range(columns):
            u0, u1 = -1.0 + 2.0*col/columns, -1.0 + 2.0*(col+1)/columns
            for row in range(rows):
                t0 = max(0.0, row/rows - 0.018)
                t1 = min(1.0, (row+1)/rows + 0.018)
                base = len(tile_verts)
                for iu in range(sub+1):
                    u = u0 + (u1-u0)*iu/sub
                    for it in range(sub+1):
                        t = t0 + (t1-t0)*it/sub
                        y = ridge_y+(eave_y-ridge_y)*t+0.78*(abs(u)**4)*(t**2)+0.035
                        tile_verts.append((cx+u*half_width, y, cz+side*half_depth*t))
                for iu in range(sub):
                    for it in range(sub):
                        a = base+iu*(sub+1)+it
                        b, c, d = a+sub+1, a+sub+2, a+1
                        tile_faces.append((a,b,c,d) if side < 0 else (d,c,b,a))
                        tile_ids.append(random.choices((0,1,2),(0.62,0.25,0.13))[0])
    mesh_object(prefix+"_individual_terracotta_tile_field", tile_verts, tile_faces, target,
                (ROOF_A, ROOF_B, ROOF_C), tile_ids, solidify=0.075)
    box(prefix+"_ridge_cap", (cx,ridge_y+0.16,cz), (half_width*2+0.9,0.34,0.56), target, ROOF_A, 0.08)
    for side in (-1,1):
        for sign in (-1,1):
            cylinder(prefix+"_ridge_end_ornament", (cx+sign*half_width,eave_y+0.45,cz+side*half_depth),
                     0.18,0.82,target,BRONZE,16)


def make_gate():
    target = gate_col
    # Existing anchor remains (0, 0, 20); central opening stays clear.
    box("arch_tam_quan_stone_plinth", (0,0.26,20), (13.8,0.52,8.2), target, STONE, 0.12)
    for index, x in enumerate((-5.4,-1.85,1.85,5.4)):
        h = 6.1 if abs(x) < 2 else 5.35
        column("arch_tam_quan_column_%02d"%index, x, 20, h, 0.34, target)
    # Three passage bays, with the middle opening intentionally wider and unobstructed.
    for z in (16.1,23.9):
        box("arch_tam_quan_crossbeam_"+str(z), (0,6.8,z), (13.1,0.58,0.62), target, WOOD, 0.07)
    box("arch_tam_quan_upper_frieze", (0,7.35,20), (12.8,0.72,1.35), target, LACQUER, 0.08)
    box("arch_tam_quan_signboard_frame", (0,7.42,19.27), (3.5,0.22,0.88), target, WOOD, 0.06)
    box("arch_tam_quan_signboard_blank", (0,7.43,19.25), (3.12,0.08,0.56), target, STONE_TRIM, 0.025)
    # No generated pseudo-calligraphy: sign face remains blank for reviewed Vietnamese lettering.
    for x in (-4.9,-1.85,1.85,4.9):
        bracket_set("arch_tam_quan_dougong_"+str(x), x, 6.45, 20, 0.78, target)
    roof_mesh("arch_tam_quan_roof", 0, 20, 7.5, 5.0, 9.15, 7.0, target)
    for x in (-5.35,-1.85,1.85,5.35):
        for z in (17.0,23.0):
            cylinder("arch_tam_quan_base_bronze_boss", (x,0.82,z), 0.12, 0.08, target, BRONZE, 16)
    target["asset_id"] = "hero_tam_quan"
    target["anchor_game_xyz"] = [0,0,20]
    target["status"] = "PROCEDURAL_BASE"
    target["visual_only"] = True
    target["signage"] = "blank_review_required"
    target["collision"] = False


def make_main_hall():
    target = hall_col
    # Existing anchor remains (0, 0, -22); preserve front approach and central doorway.
    box("arch_main_hall_stone_plinth", (0,0.42,-22.8), (23.0,0.84,15.2), target, STONE, 0.16)
    box("arch_main_hall_upper_stone_course", (0,0.93,-22.8), (22.2,0.18,14.5), target, STONE_TRIM, 0.055)
    for z in (-29.1,-16.5):
        for x in (-9.4,-4.7,0,4.7,9.4):
            column("arch_main_hall_column_%s_%s"%(str(x),str(z)),x,z,6.1,0.34,target)
    # Rear and side walls sit behind the colonnade; front remains open at the central entry.
    box("arch_main_hall_rear_wall",(0,3.7,-29.05),(19.2,5.6,0.42),target,LACQUER,0.05)
    for x in (-9.75,9.75):
        box("arch_main_hall_side_wall_"+str(x),(x,3.7,-22.6),(0.42,5.6,12.2),target,LACQUER,0.05)
    box("arch_main_hall_door_shadow",(0,3.05,-16.38),(5.0,4.7,0.12),target,DARK,0.01)
    for x in (-2.1,2.1):
        box("arch_main_hall_door_leaf_"+str(x),(x,2.95,-16.22),(1.9,4.25,0.18),target,LACQUER,0.04)
        for y in (1.35,2.25,3.25,4.15):
            box("arch_main_hall_door_rail_%s_%s"%(x,y),(x,y,-16.1),(1.55,0.075,0.06),target,WOOD,0.015)
        for dx in (-0.58,-0.2,0.2,0.58):
            box("arch_main_hall_door_lattice_%s_%s"%(x,dx),(x+dx,2.95,-16.1),(0.055,3.0,0.055),target,WOOD,0.012)
    # Structural beams, visible purlins and bracket sets.
    for z in (-29.2,-26.0,-22.8,-19.6,-16.4):
        box("arch_main_hall_longitudinal_beam_"+str(z),(0,6.55,z),(21.2,0.42,0.46),target,WOOD,0.05)
    for z in (-29.0,-16.5):
        for x in (-9.4,-4.7,0,4.7,9.4):
            bracket_set("arch_main_hall_dougong_%s_%s"%(x,z),x,6.2,z,0.92,target)
    # Roof framing is represented by exposed rafters beneath the tiled roof.
    for side in (-1,1):
        for i in range(19):
            x = -10.6 + i*1.18
            beam_between("arch_main_hall_rafter_%s_%02d"%(side,i),
                         (x,7.0,-22.8),(x,10.2,-22.8+side*9.3),0.14,0.16,target,WOOD)
    roof_mesh("arch_main_hall_roof",0,-22.8,12.3,9.5,10.45,7.05,target)
    # Entry stair and side balustrade; center remains clear.
    for step in range(4):
        y = 0.15 + step*0.18
        z = -15.0 - step*0.55
        box("arch_main_hall_entry_step_%02d"%step,(0,y,z),(8.0,0.3,0.72),target,STONE_TRIM,0.035)
    for x in (-4.45,4.45):
        for i in range(5):
            z = -15.2-i*0.52
            cylinder("arch_main_hall_baluster_%s_%02d"%(x,i),(x,0.92,z),0.095,0.92,target,STONE_TRIM,12)
        box("arch_main_hall_balustrade_rail_"+str(x),(x,1.42,-16.2),(0.22,0.18,3.2),target,STONE,0.04)
    target["asset_id"] = "hero_main_hall"
    target["anchor_game_xyz"] = [0,0,-22]
    target["status"] = "PROCEDURAL_BASE"
    target["visual_only"] = True
    target["collision"] = False


make_gate()
make_main_hall()

# UV unwrap all export meshes; this is a technical starting unwrap, not a texel-density sign-off.
for col in (gate_col, hall_col):
    for obj in list(col.objects):
        uv_unwrap(obj)
    col["uv_status"] = "smart_project_initial_review_required"
    col["material_status"] = "procedural_preview_only"
    col["export_status"] = "not_yet_exported_or_validated"

# Preview camera and neutral material-review lighting are kept out of export collections.
from mathutils import Vector
bpy.ops.object.camera_add(location=(38,34,45))
camera = bpy.context.object
camera.name = "QA_architecture_overview_camera"
camera.rotation_euler = (Vector((0,4,0))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.lens = 42
for owner in list(camera.users_collection):
    owner.objects.unlink(camera)
preview_col.objects.link(camera)
scene.camera = camera

bpy.ops.object.light_add(type="AREA", location=(4,28,18))
key = bpy.context.object
key.name = "QA_large_softbox_key"
key.data.energy = 5200
key.data.shape = "DISK"
key.data.size = 18
for owner in list(key.users_collection):
    owner.objects.unlink(key)
preview_col.objects.link(key)

bpy.ops.object.light_add(type="AREA", location=(-24,15,-8))
fill = bpy.context.object
fill.name = "QA_soft_fill"
fill.data.energy = 2600
fill.data.shape = "DISK"
fill.data.size = 16
for owner in list(fill.users_collection):
    owner.objects.unlink(fill)
preview_col.objects.link(fill)

world = bpy.data.worlds.get("World") or bpy.data.worlds.new("BW_QA_neutral_world")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.22,0.25,0.30,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
scene.view_settings.view_transform = "AgX"
scene["bw_architecture_generator_version"] = "1.0"
scene["bw_architecture_seed"] = SEED
scene["bw_architecture_status"] = "PROCEDURAL_BASE"
scene["bw_art_direction"] = "docs/CINEMATIC_ART_BIBLE.md"

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT)
print("Saved standalone hero architecture source:", OUTPUT)
print("Export collections: EXPORT_hero_tam_quan, EXPORT_hero_main_hall")
print("No collision/navmesh/runtime manifest changes were made.")

if RENDER:
    os.makedirs(os.path.dirname(RENDER), exist_ok=True)
    scene.render.filepath = RENDER
    bpy.ops.render.render(write_still=True)
    print("Saved QA overview render:", RENDER)
