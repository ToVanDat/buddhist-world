"""Generate three standalone Vietnamese Buddhist Hero Props.

Run from repository root in Windows CMD:
  blender -b --python blender/scripts/generate_hero_props.py -- --out blender/projects/hero_props_source.blend
  blender -b --python blender/scripts/generate_hero_props.py -- --out blender/projects/hero_props_source.blend --render blender/reports/hero_props_overview.png

Creates:
  EXPORT_hero_buddha_statue
  EXPORT_hero_dai_hong_chung
  EXPORT_hero_incense_burner

This is an editable procedural base. It is not a final sculpt or a claim of
cultural/artistic acceptance. Each collection is isolated for PBR baking and GLB
export. No existing scene, map, collision, navmesh, spawn or runtime manifest is edited.
"""
import bpy
import math
import os
import re
from mathutils import Vector
from _common import script_args

ARGS = script_args()

def arg(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default

OUT = os.path.abspath(arg("--out", "blender/projects/hero_props_source.blend"))
RENDER = os.path.abspath(arg("--render")) if arg("--render") else None
scene = bpy.context.scene

# Refuse to erase authored scenes. This generator must be launched without an input .blend.
startup = {"Camera", "Cube", "Light"}
custom = [obj.name for obj in scene.objects if obj.name not in startup]
if custom:
    raise SystemExit("Refusing to modify a non-empty scene. Start Blender without an input .blend.")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.users == 0:
        bpy.data.collections.remove(col)

scene.unit_settings.system = "METRIC"
scene.render.engine = "BLENDER_EEVEE_NEXT" if bpy.app.version >= (4, 2, 0) else "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1800, 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.fps = 30

def collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col

statue_col = collection("EXPORT_hero_buddha_statue")
bell_col = collection("EXPORT_hero_dai_hong_chung")
burner_col = collection("EXPORT_hero_incense_burner")
qa_col = collection("QA_preview_rig")

def safe_name(value):
    value = value.lower().replace("-", "m").replace(".", "p")
    value = re.sub(r"[^a-z0-9_]+", "_", value)
    return re.sub(r"_+", "_", value).strip("_")

def game_to_blender(p):
    x, y, z = p
    return (x, -z, y)

def mat(name, color, roughness, metallic=0.0, noise_scale=18.0, bump=0.08):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.72
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.2
    ramp.color_ramp.elements[0].color = (*(c * 0.78 for c in color), 1)
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = (*(min(1.0, c * 1.16) for c in color), 1)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if bump:
        bump_node = nodes.new("ShaderNodeBump")
        bump_node.inputs["Strength"].default_value = bump
        bump_node.inputs["Distance"].default_value = 0.018
        links.new(noise.outputs["Fac"], bump_node.inputs["Height"])
        links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])
    material["bw_material_status"] = "procedural_preview_requires_pbr_bake"
    return material

STONE = mat("BW_HERO_prop_weathered_limestone", (0.40,0.36,0.29), 0.88, noise_scale=22, bump=0.14)
STONE_HI = mat("BW_HERO_prop_cut_limestone", (0.59,0.52,0.40), 0.82, noise_scale=28, bump=0.08)
BRONZE = mat("BW_HERO_prop_aged_bronze", (0.28,0.19,0.085), 0.43, 0.78, 12, 0.12)
BRONZE_HI = mat("BW_HERO_prop_worn_bronze_edges", (0.43,0.30,0.13), 0.34, 0.72, 20, 0.06)
PATINA = mat("BW_HERO_prop_bronze_patina", (0.075,0.16,0.13), 0.78, 0.28, 30, 0.12)
GOLD = mat("BW_HERO_prop_muted_gilt", (0.48,0.34,0.15), 0.42, 0.62, 16, 0.05)
ROBE = mat("BW_HERO_prop_muted_saffron_lacquer", (0.31,0.12,0.045), 0.72, 0.05, 9, 0.12)
DARK = mat("BW_HERO_prop_recess_shadow", (0.025,0.022,0.017), 0.92, 0.0, 8, 0.0)

def link_mesh(name, vertices_game, faces, target, materials, smooth=True):
    name = safe_name(name)
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([game_to_blender(v) for v in vertices_game], [], faces)
    for material in materials:
        mesh.materials.append(material)
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    unwrap(obj)
    for poly in mesh.polygons:
        poly.use_smooth = smooth and len(poly.vertices) <= 4
    return obj

def unwrap(obj):
    if obj.type != "MESH" or not obj.data.polygons:
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.018)
    bpy.ops.object.mode_set(mode="OBJECT")
    if obj.data.uv_layers:
        obj.data.uv_layers.active.name = "UVMap"

def finish(obj, target, bevel=0.0):
    obj.name = safe_name(obj.name)
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel and obj.type == "MESH":
        mod = obj.modifiers.new("crafted_edge_bevel", "BEVEL")
        mod.width, mod.segments = bevel, 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    unwrap(obj)
    obj.select_set(False)
    obj["asset_role"] = "hero_prop_visual"
    return obj

def cube(name, center, size, target, material, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=game_to_blender(center))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    obj.data.materials.append(material)
    return finish(obj, target, bevel)

def sphere(name, center, scale, target, material, segments=48, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=game_to_blender(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    obj.data.materials.append(material)
    for p in obj.data.polygons: p.use_smooth = True
    return finish(obj, target)

def torus(name, center, major, minor, target, material, major_segments=64, minor_segments=12):
    bpy.ops.mesh.primitive_torus_add(major_segments=major_segments, minor_segments=minor_segments,
        location=game_to_blender(center), major_radius=major, minor_radius=minor)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    for p in obj.data.polygons: p.use_smooth = True
    return finish(obj, target)

def lathe(name, profile, target, material, segments=96, inner_profile=None):
    # profile = [(height, radius)] in game Y-up. Inner profile closes the shell wall.
    # Outer profile runs bottom-to-top; inner profile is authored top-to-bottom.
    rings = list(profile) + (list(inner_profile) if inner_profile else [])
    verts, faces = [], []
    for height, radius in rings:
        for i in range(segments):
            angle = math.tau * i / segments
            verts.append((radius * math.cos(angle), height, radius * math.sin(angle)))
    ring_count = len(rings)
    # The game-space profile is revolved around +Y. Keep outward-facing normals
    # on the outer shell and reverse the winding on the cavity wall.
    outer_ring_count = len(profile)
    for r in range(ring_count - 1):
        is_inner_wall = bool(inner_profile) and r >= outer_ring_count
        for i in range(segments):
            a = r*segments+i
            b = r*segments+(i+1)%segments
            if is_inner_wall:
                faces.append((a,b,b+segments,a+segments))
            else:
                faces.append((a,a+segments,b+segments,b))

    # Close hollow shells with correctly oriented annular top and bottom faces.
    if inner_profile:
        outer_top = (len(profile)-1)*segments
        inner_top = len(profile)*segments
        inner_bottom = (ring_count-1)*segments
        for i in range(segments):
            j = (i+1)%segments
            # Top cap normal points +Y; bottom cap normal points -Y.
            faces.append((outer_top+i, inner_top+i, inner_top+j, outer_top+j))
            faces.append((inner_bottom+i, i, j, inner_bottom+j))
    else:
        # A solid lathe has a bottom cap (-Y) and top cap (+Y).
        faces.append(tuple(range(segments)))
        last = (ring_count-1)*segments
        faces.append(tuple(last+i for i in range(segments-1,-1,-1)))
    return link_mesh(name, verts, faces, target, [material])

def petal(name, center, length, width, height, target, material, angle):
    # Curved pointed lotus petal, local long axis radial in the XZ plane.
    verts = []
    for row in range(7):
        t = row / 6
        radius = length * t
        half = width * math.sin(math.pi * (t * 0.92 + 0.04)) * 0.5
        for side in (-1, 0, 1):
            lateral = side * half
            x = center[0] + math.cos(angle)*radius - math.sin(angle)*lateral
            z = center[2] + math.sin(angle)*radius + math.cos(angle)*lateral
            y = center[1] + height * math.sin(math.pi*t) + 0.08*t
            verts.append((x,y,z))
    faces=[]
    for r in range(6):
        for c in range(2):
            a=r*3+c
            faces.append((a,a+1,a+4,a+3))
    obj=link_mesh(name,verts,faces,target,[material],False)
    solid=obj.modifiers.new("petal_thickness","SOLIDIFY"); solid.thickness=0.035
    return obj

def mark_collection(col, asset_id, role, review):
    col["asset_id"] = asset_id
    col["status"] = "PROCEDURAL_BASE"
    col["asset_tier"] = "HERO"
    col["visual_only"] = True
    col["collision"] = False
    col["cultural_review"] = review
    col["interaction_contract"] = role

# ---------------------------------------------------------------------------
# Buddha statue: calm seated silhouette, robe masses and lotus pedestal.
# Iconographic pose/detail intentionally remains a reviewed blockout, not canon.
# ---------------------------------------------------------------------------
cube("prop_buddha_statue_pedestal_lower", (0,0.22,0), (3.25,0.44,2.65), statue_col, STONE, 0.12)
cube("prop_buddha_statue_pedestal_upper", (0,0.52,0), (2.95,0.20,2.38), statue_col, STONE_HI, 0.07)
lathe("prop_buddha_statue_lotus_base", [(0.62,1.18),(0.72,1.38),(0.84,1.32),(0.94,1.10)], statue_col, GOLD, 96)
for i in range(16):
    a=math.tau*i/16
    petal("prop_buddha_statue_lotus_petal_%02d"%i,(0,0.72,0),0.78,0.34,0.22,statue_col,GOLD,a)
# Cross-legged seat and torso are separate sculptable masses.
sphere("prop_buddha_statue_left_leg",(-0.48,1.02,0.06),(0.86,0.34,0.72),statue_col,GOLD)
sphere("prop_buddha_statue_right_leg",(0.48,1.02,0.06),(0.86,0.34,0.72),statue_col,GOLD)
sphere("prop_buddha_statue_torso",(0,1.86,0),(0.67,0.93,0.49),statue_col,GOLD)
sphere("prop_buddha_statue_shoulder_robe",(0,2.14,0),(0.78,0.48,0.52),statue_col,ROBE)
sphere("prop_buddha_statue_head",(0,2.88,0),(0.39,0.51,0.36),statue_col,GOLD)
sphere("prop_buddha_statue_usnisa",(0,3.34,0),(0.17,0.20,0.17),statue_col,GOLD,32,20)
for side in (-1,1):
    sphere("prop_buddha_statue_ear_"+("left" if side<0 else "right"),(side*0.39,2.88,0),(0.105,0.20,0.09),statue_col,GOLD,24,16)
    sphere("prop_buddha_statue_forearm_"+("left" if side<0 else "right"),(side*0.57,1.58,0.16),(0.19,0.58,0.20),statue_col,ROBE)
# Restrained robe folds as shallow curved raised strips across the front.
for i in range(5):
    y=1.30+i*0.16
    width=0.48+0.055*i
    verts=[]
    for j in range(13):
        t=-1+2*j/12
        verts.append((t*width,y+0.035*(1-t*t),0.465-0.10*(t*t)))
    faces=[tuple(range(13))]
    obj=link_mesh("prop_buddha_statue_robe_fold_%02d"%i,verts,faces,statue_col,[GOLD],False)
    solid=obj.modifiers.new("robe_fold_depth","SOLIDIFY"); solid.thickness=0.025
mark_collection(statue_col,"hero_buddha_statue",
    "static devotional focal prop; future optional inspection/orbit only",
    "MANDATORY: review regional Buddhist iconography, mudra, robe treatment, proportions and facial style with a qualified human reviewer")

# ---------------------------------------------------------------------------
# Dai Hong Chung: hollow cast bell profile, reinforced mouth, crown and bosses.
# The separate hanging point is reserved for a later physics/audio controller.
# ---------------------------------------------------------------------------
bell_profile=[(0.42,0.42),(0.55,0.48),(0.82,0.58),(1.15,0.70),(1.55,0.84),
              (2.05,0.96),(2.50,1.00),(2.72,0.94),(2.82,0.72),(2.90,0.48)]
bell_inner=[(2.84,0.42),(2.74,0.56),(2.58,0.72),(2.40,0.78),(2.00,0.74),
            (1.55,0.63),(1.12,0.51),(0.78,0.39),(0.55,0.30),(0.42,0.29)]
lathe("prop_dai_hong_chung_bell_shell",bell_profile,bell_col,BRONZE,128,bell_inner)
lathe("prop_dai_hong_chung_crown",[(2.84,0.40),(2.98,0.32),(3.16,0.22),(3.28,0.16)],bell_col,BRONZE_HI,64)
torus("prop_dai_hong_chung_mouth_rim",(0,0.47,0),0.445,0.075,bell_col,BRONZE_HI,96,16)
for y,radius,minor in ((0.72,0.51,0.035),(1.02,0.63,0.035),(2.48,0.94,0.045),(2.66,0.88,0.035)):
    torus("prop_dai_hong_chung_raised_band_"+str(y),(0,y,0),radius,minor,bell_col,BRONZE_HI,96,12)
# Eight restrained raised bosses, not pseudo-script or fabricated sacred inscriptions.
for i in range(8):
    a=math.tau*i/8
    sphere("prop_dai_hong_chung_boss_%02d"%i,(0.82*math.cos(a),1.78,0.82*math.sin(a)),(0.095,0.095,0.095),bell_col,PATINA if i % 2 else BRONZE_HI,20,12)
# Suspension loop sits above the crown; clapper is separate and visually inspectable.
torus("prop_dai_hong_chung_suspension_loop",(0,3.40,0),0.24,0.065,bell_col,BRONZE_HI,64,12)
cylinder_name="prop_dai_hong_chung_clapper"
lathe(cylinder_name,[(1.08,0.055),(1.16,0.09),(1.30,0.06)],bell_col,DARK,24)
sphere("prop_dai_hong_chung_clapper_tip",(0,1.03,0),(0.13,0.13,0.13),bell_col,BRONZE_HI,24,16)
mark_collection(bell_col,"hero_dai_hong_chung",
    "static visual bell; future hanging pivot, swing physics, impact audio and cooldown are runtime systems",
    "Review regional bell silhouette, inscriptions and ornament vocabulary; no generated lettering is included")

# ---------------------------------------------------------------------------
# Incense burner: stone foot + bronze body, open bowl, handles and incense.
# Smoke is deliberately not baked into geometry; runtime Particle Engine owns it.
# ---------------------------------------------------------------------------
cube("prop_incense_burner_stone_foot",(0,0.18,0),(1.65,0.36,1.45),burner_col,STONE,0.09)
lathe("prop_incense_burner_pedestal",[(0.34,0.55),(0.48,0.42),(0.98,0.34),(1.08,0.48)],burner_col,STONE_HI,64)
bowl_outer=[(1.02,0.43),(1.14,0.55),(1.34,0.70),(1.58,0.78),(1.76,0.73),(1.83,0.66)]
bowl_inner=[(1.79,0.59),(1.68,0.61),(1.48,0.60),(1.29,0.48),(1.16,0.34),(1.08,0.24)]
lathe("prop_incense_burner_bowl",bowl_outer,burner_col,BRONZE,96,bowl_inner)
torus("prop_incense_burner_lip",(0,1.81,0),0.65,0.075,burner_col,BRONZE_HI,96,16)
torus("prop_incense_burner_foot_ring",(0,1.10,0),0.48,0.055,burner_col,BRONZE_HI,72,12)
for side in (-1,1):
    torus("prop_incense_burner_handle_"+("left" if side<0 else "right"),(side*0.76,1.53,0),0.20,0.055,burner_col,BRONZE_HI,48,12)
# Three incense sticks, vertical and deliberately separate for runtime smoke emitters.
for i,(x,z) in enumerate(((-0.16,0.04),(0.0,-0.08),(0.16,0.04))):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.018,depth=0.72,location=game_to_blender((x,2.10,z)))
    stick=bpy.context.object; stick.name="prop_incense_burner_stick_%02d"%i
    stick.data.materials.append(ROBE); finish(stick,burner_col,0.004)
    stick["interaction_anchor"]="smoke_emitter_candidate"
# Metadata records a local emitter anchor but no particles are baked into the prop.
burner_col["smoke_emitter_game_xyz"]=[0.0,2.46,0.0]
mark_collection(burner_col,"hero_incense_burner",
    "static visual prop; smoke emitter anchor is metadata for runtime Particle Engine",
    "Review vessel form and ornament vocabulary against Vietnamese temple references")

# QA camera and lights are excluded from export collections.
bpy.ops.object.camera_add(location=(8.8,-12.5,8.0))
camera=bpy.context.object; camera.name="QA_hero_props_camera"; camera.rotation_euler=(math.radians(62),0,math.radians(35))
camera.data.lens=48; move=lambda obj: [owner.objects.unlink(obj) for owner in list(obj.users_collection)]
move(camera); qa_col.objects.link(camera); scene.camera=camera
for name,loc,power,size in (("QA_key",(4,-7,10),1800,8),("QA_fill",(-7,-4,5),950,7),("QA_rim",(2,6,7),1400,6)):
    bpy.ops.object.light_add(type="AREA",location=loc)
    light=bpy.context.object; light.name=name; light.data.energy=power; light.data.shape="DISK"; light.data.size=size
    light.rotation_euler=(math.radians(25),0,math.radians(25))
    move(light); qa_col.objects.link(light)

# Each prop is authored at its own local origin. Render isolated views rather
# than translating export collections into a shared preview lineup.
camera.location=(7.2,-10.5,6.0)
camera.rotation_euler=(Vector((0,0,1.55))-camera.location).to_track_quat("-Z","Y").to_euler()
scene.world.color=(0.12,0.12,0.12)
if RENDER:
    os.makedirs(os.path.dirname(RENDER),exist_ok=True)
    for active in (statue_col,bell_col,burner_col):
        for other in (statue_col,bell_col,burner_col):
            other.hide_render = other != active
        scene.render.filepath=os.path.splitext(RENDER)[0]+"_"+active["asset_id"]+".png"
        bpy.ops.render.render(write_still=True)
    for col in (statue_col,bell_col,burner_col):
        col.hide_render=False

os.makedirs(os.path.dirname(OUT),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("HERO PROPS SOURCE GENERATED")
for col in (statue_col,bell_col,burner_col):
    meshes=sum(1 for obj in col.all_objects if obj.type=="MESH")
    print(col.name, "objects=",meshes,"status=PROCEDURAL_BASE")
print("Saved:",OUT)
print("No runtime manifest, collision, navmesh or spawn data changed.")
