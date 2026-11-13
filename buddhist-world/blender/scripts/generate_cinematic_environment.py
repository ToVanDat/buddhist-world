"""Add a cinematic procedural landscape and environment dressing to a generated temple scene.

Windows CMD:
  blender -b blender/projects/temple_complex_generated.blend --python blender/scripts/generate_cinematic_environment.py -- --out blender/projects/temple_complex_cinematic.blend
  blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/asset_validation.py
  blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets
  blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/export_navmesh.py -- --region temple_complex --out apps/web/public/assets/navmesh/temple_complex.json

This is a procedural environment art pass, not a replacement for bespoke hero assets.
It preserves the generated temple and adds landscape, paths, vegetation, rocks, lotus details,
secondary pavilions, PBR shader detail and a Blender preview setup.
"""
import bpy
import math
import os
import random
from mathutils import Vector
from _common import script_args

SEED = 240517
MAP_HALF = 125.0
GRID = 121
random.seed(SEED)
args = script_args()
def arg(name, default):
    return args[args.index(name) + 1] if name in args else default
output_path = os.path.abspath(arg("--out", "blender/projects/temple_complex_cinematic.blend"))

scene = bpy.context.scene
required = ("EXPORT_temple_complex", "COLLISION_temple_complex", "NAVMESH_temple_complex")
missing = [name for name in required if bpy.data.collections.get(name) is None]
if missing:
    raise SystemExit("Open the generated temple scene first; missing collections: " + ", ".join(missing))

def collection(name):
    value = bpy.data.collections.get(name)
    if value is None:
        value = bpy.data.collections.new(name)
        scene.collection.children.link(value)
    return value

if scene.get("cinematic_environment_version"):
    raise SystemExit("This scene already has the cinematic environment. Start from temple_complex_generated.blend to avoid duplicate geometry.")

visual = collection("EXPORT_cinematic_environment")
collision = bpy.data.collections["COLLISION_temple_complex"]
navmesh = bpy.data.collections["NAVMESH_temple_complex"]
preview = collection("PREVIEW_cinematic_lighting")

def game_to_blender(point):
    x, y, z = point
    return (x, -z, y)

def material(name, color, roughness=0.8, metallic=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        output = mat.node_tree.nodes.get("Material Output") or mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

def add_surface_detail(mat, low, high, scale, bump_strength=0.12, bump_distance=0.08):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    texcoord = nodes.get("Texture Coordinate") or nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.72
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.18
    ramp.color_ramp.elements[0].color = (*low, 1.0)
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = (*high, 1.0)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = bump_distance
    links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

MAT_TERRAIN = material("BW_cinematic_terrain", (0.16, 0.22, 0.13), 0.96)
MAT_MOSS = material("BW_moss_and_undergrowth", (0.11, 0.19, 0.10), 0.98)
MAT_BARK = material("BW_cinematic_bark", (0.17, 0.075, 0.035), 0.9)
MAT_LEAF = material("BW_cinematic_foliage", (0.10, 0.23, 0.12), 0.88)
MAT_LEAF_LIGHT = material("BW_foliage_sunlit", (0.24, 0.34, 0.15), 0.82)
MAT_ROCK = material("BW_mountain_rock", (0.31, 0.31, 0.27), 0.92)
MAT_PATH = material("BW_weathered_path_stone", (0.38, 0.36, 0.31), 0.9)
MAT_LOTUS = material("BW_lotus_leaf", (0.12, 0.29, 0.14), 0.76)
MAT_LOTUS_PETAL = material("BW_lotus_petal", (0.86, 0.56, 0.52), 0.52)
MAT_LOTUS_CORE = material("BW_lotus_core", (0.92, 0.68, 0.20), 0.48)
MAT_WOOD = material("BW_secondary_temple_wood", (0.19, 0.075, 0.035), 0.64)
MAT_LACQUER = material("BW_secondary_temple_lacquer", (0.34, 0.09, 0.045), 0.4)
MAT_ROOF = material("BW_secondary_roof_tile", (0.22, 0.075, 0.045), 0.76)
MAT_BRONZE = material("BW_aged_bronze", (0.34, 0.23, 0.10), 0.32, 0.72)
MAT_STONE = material("BW_cut_stone", (0.48, 0.44, 0.36), 0.86)
add_surface_detail(MAT_TERRAIN, (0.075, 0.12, 0.07), (0.31, 0.34, 0.20), 3.8, 0.22, 0.16)
add_surface_detail(MAT_MOSS, (0.045, 0.10, 0.045), (0.20, 0.30, 0.12), 8.0, 0.24, 0.08)
add_surface_detail(MAT_BARK, (0.055, 0.022, 0.012), (0.29, 0.13, 0.055), 16.0, 0.3, 0.12)
add_surface_detail(MAT_LEAF, (0.035, 0.12, 0.055), (0.18, 0.36, 0.13), 7.0, 0.16, 0.035)
add_surface_detail(MAT_ROCK, (0.18, 0.18, 0.16), (0.48, 0.46, 0.39), 11.0, 0.28, 0.11)
add_surface_detail(MAT_PATH, (0.24, 0.22, 0.18), (0.55, 0.51, 0.42), 22.0, 0.18, 0.035)

add_surface_detail(MAT_ROOF, (0.12, 0.035, 0.022), (0.34, 0.13, 0.065), 28.0, 0.16, 0.025)

# Upgrade the existing main hall and Tam Quan materials with procedural surface detail.
for old_name, low, high, scale, strength, distance in (
    ("BW_roof_aged_terracotta",(0.10,0.025,0.015),(0.34,0.13,0.065),26.0,0.18,0.035),
    ("BW_wood_dark_teak",(0.045,0.018,0.009),(0.25,0.10,0.045),18.0,0.22,0.045),
    ("BW_wood_red_lacquer",(0.12,0.025,0.012),(0.42,0.13,0.055),12.0,0.12,0.025),
    ("BW_stone_warm_limestone",(0.25,0.21,0.15),(0.62,0.56,0.43),9.0,0.20,0.09),
    ("BW_stone_cut_edges",(0.35,0.29,0.19),(0.72,0.65,0.50),12.0,0.16,0.06),
):
    old_mat=bpy.data.materials.get(old_name)
    if old_mat and not old_mat.get("BW_cinematic_detail"):
        add_surface_detail(old_mat,low,high,scale,strength,distance)
        old_mat["BW_cinematic_detail"]=True


def make_mesh(name, vertices, faces, target, materials=(), material_ids=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([game_to_blender(v) for v in vertices], [], faces)
    mesh.materials.clear()
    for mat in materials:
        mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    if material_ids:
        for poly, index in zip(mesh.polygons, material_ids):
            poly.material_index = index
    if mesh.vertices:
        uv = mesh.uv_layers.new(name="UVMap")
        xs = [v.co.x for v in mesh.vertices]
        ys = [v.co.y for v in mesh.vertices]
        sx, sy = max(max(xs)-min(xs), 1e-5), max(max(ys)-min(ys), 1e-5)
        for poly in mesh.polygons:
            for loop_index in poly.loop_indices:
                co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = ((co.x-min(xs))/sx, (co.y-min(ys))/sy)
    return obj

def add_existing_roof_tiles(name,cx,cz,half_width,half_depth,ridge_y,eave_y,columns,rows):
    vertices,faces=[],[]
    for side in (-1,1):
        for row in range(rows):
            t0=row/rows+0.025
            t1=(row+1)/rows-0.025
            for col in range(columns):
                x0=-1+2*col/columns+0.035
                x1=-1+2*(col+1)/columns-0.035
                base=len(vertices)
                for xr,t in ((x0,t0),(x1,t0),(x1,t1),(x0,t1)):
                    x=cx+xr*half_width
                    z=cz+side*half_depth*t
                    y=ridge_y+(eave_y-ridge_y)*t+0.72*(abs(xr)**4)*(t*t)+0.10
                    vertices.append((x,y,z))
                face=(base,base+1,base+2,base+3) if side<0 else (base+3,base+2,base+1,base)
                faces.append(face)
    tiles=make_mesh(name,vertices,faces,visual,(MAT_ROOF,))
    solid=tiles.modifiers.new("individual_tile_thickness","SOLIDIFY")
    solid.thickness=0.065
    bevel=tiles.modifiers.new("tile_worn_edges","BEVEL")
    bevel.width=0.018
    bevel.segments=2
    tiles["asset_role"]="procedural_roof_tile_detail"
    return tiles

# Real geometry tile courses are added over the original curved roof shells.
add_existing_roof_tiles("arch_main_hall_roof_tiles",0.0,-22.0,12.0,8.8,10.0,7.0,30,12)
add_existing_roof_tiles("arch_tam_quan_roof_tiles",0.0,20.0,6.1,3.8,8.0,6.7,18,8)

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

# Continuous mountain-valley terrain with a deliberately low temple basin.
terrain_vertices, terrain_faces = [], []
for iz in range(GRID):
    z = -MAP_HALF+(2.0*MAP_HALF*iz/(GRID-1))
    for ix in range(GRID):
        x = -MAP_HALF+(2.0*MAP_HALF*ix/(GRID-1))
        terrain_vertices.append((x,terrain_height(x,z),z))
for iz in range(GRID-1):
    for ix in range(GRID-1):
        a=iz*GRID+ix
        terrain_faces.append((a,a+GRID,a+GRID+1,a+1))
terrain_obj=make_mesh("env_mountain_valley_terrain",terrain_vertices,terrain_faces,visual,(MAT_TERRAIN,))
for poly in terrain_obj.data.polygons: poly.use_smooth=True
terrain_obj["asset_role"]="cinematic_landscape"
terrain_obj["dimensions_m"]="250 x 250"

# Coarse terrain collision mesh for Rapier; visual terrain remains high resolution.
collision_vertices, collision_faces = [], []
collision_grid = 41
for iz in range(collision_grid):
    z=-MAP_HALF+(2.0*MAP_HALF*iz/(collision_grid-1))
    for ix in range(collision_grid):
        x=-MAP_HALF+(2.0*MAP_HALF*ix/(collision_grid-1))
        collision_vertices.append((x,terrain_height(x,z),z))
for iz in range(collision_grid-1):
    for ix in range(collision_grid-1):
        a=iz*collision_grid+ix
        collision_faces.append((a,a+collision_grid,a+collision_grid+1,a+1))
make_mesh("col_mountain_terrain",collision_vertices,collision_faces,collision)

# Stone ribbons. The southern approach snaps to the existing gate navmesh.
def build_path(name,samples,width_fn,target,add_navmesh=False):
    verts,faces=[],[]
    nav_verts,nav_faces=[],[]
    for index,(x,z) in enumerate(samples):
        t=index/max(1,len(samples)-1)
        width=width_fn(t)
        before=samples[max(0,index-1)]
        after=samples[min(len(samples)-1,index+1)]
        dx,dz=after[0]-before[0],after[1]-before[1]
        length=max(math.hypot(dx,dz),1e-5)
        nx,nz=-dz/length,dx/length
        ground=terrain_height(x,z)+0.16
        if name=="env_mountain_retreat_path":
            y=0.76-0.70*smoothstep(0.0,0.14,t) if t<0.14 else max(0.06,ground)
        else:
            y=max(0.06,ground)
        left=(x+nx*width/2,y,z+nz*width/2)
        right=(x-nx*width/2,y,z-nz*width/2)
        verts.extend((left,right))
        nav_verts.extend((left,right))
    for i in range(len(samples)-1):
        a=i*2
        face=(a,a+2,a+3,a+1)
        faces.append(face)
        nav_faces.append(face)
    obj=make_mesh(name,verts,faces,target,(MAT_PATH,))
    solid=obj.modifiers.new("stone_path_thickness","SOLIDIFY")
    solid.thickness=0.16
    bevel=obj.modifiers.new("worn_path_edges","BEVEL")
    bevel.width=0.035
    bevel.segments=2
    if add_navmesh:
        make_mesh("nav_"+name,nav_verts,nav_faces,navmesh)
    return obj

south_samples=[]
for i in range(101):
    t=i/100
    z=120.0-100.0*t
    x=2.2*math.sin((z-20.0)*0.035)
    south_samples.append((x,z))
build_path("env_southern_pilgrimage_path",south_samples,lambda t:5.5-3.3*t,visual,True)
north_samples=[]
for i in range(91):
    t=i/90
    z=-29.0-83.0*t
    x=2.4*math.sin(t*math.pi*1.35)+1.2*math.sin(t*math.pi*3.0)
    north_samples.append((x,z))
build_path("env_mountain_retreat_path",north_samples,lambda t:7.6-1.4*t,visual,True)

def box_mesh(name,center,size,target,mat=None,bevel=0.0):
    cx,cy,cz=center
    sx,sy,sz=(v/2 for v in size)
    vertices=[(cx-sx,cy-sy,cz-sz),(cx+sx,cy-sy,cz-sz),(cx+sx,cy+sy,cz-sz),(cx-sx,cy+sy,cz-sz),
              (cx-sx,cy-sy,cz+sz),(cx+sx,cy-sy,cz+sz),(cx+sx,cy+sy,cz+sz),(cx-sx,cy+sy,cz+sz)]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    obj=make_mesh(name,vertices,faces,target,(mat,) if mat else ())
    if bevel:
        mod=obj.modifiers.new("hand_worn_edges","BEVEL")
        mod.width=bevel
        mod.segments=2
    return obj

def cylinder_mesh(name,center,radius,depth,target,mat,sides=20):
    x,y,z=center
    vertices=[]
    for yy in (y-depth/2,y+depth/2):
        for i in range(sides):
            angle=math.tau*i/sides
            vertices.append((x+math.cos(angle)*radius,yy,z+math.sin(angle)*radius))
    faces=[tuple(range(sides)),tuple(range(sides*2-1,sides-1,-1))]
    for i in range(sides):
        j=(i+1)%sides
        faces.append((i,sides+i,sides+j,j))
    return make_mesh(name,vertices,faces,target,(mat,))

# Secondary architecture: bell/drum towers, ancestor hall and mountain retreat.
def pavilion(name,x,z,width,depth,height):
    base_y=max(0.06,terrain_height(x,z)+0.16)
    box_mesh("arch_"+name+"_plinth",(x,base_y+0.22,z),(width+1.2,0.44,depth+1.2),visual,MAT_STONE,0.06)
    for sx in (-1,1):
        for sz in (-1,1):
            px=x+sx*(width/2-0.35)
            pz=z+sz*(depth/2-0.35)
            cylinder_mesh("arch_"+name+"_column_base",(px,base_y+0.58,pz),0.48,0.28,visual,MAT_STONE,16)
            cylinder_mesh("arch_"+name+"_column",(px,base_y+height/2+0.72,pz),0.25,height,visual,MAT_LACQUER,20)
            box_mesh("arch_"+name+"_capital",(px,base_y+height+0.82,pz),(0.85,0.25,0.85),visual,MAT_WOOD,0.04)
    box_mesh("arch_"+name+"_front_beam",(x,base_y+height+1.0,z-depth/2),(width+0.7,0.42,0.45),visual,MAT_WOOD,0.04)
    box_mesh("arch_"+name+"_rear_beam",(x,base_y+height+1.0,z+depth/2),(width+0.7,0.42,0.45),visual,MAT_WOOD,0.04)
    roof_y=base_y+height+2.0
    for side in (-1,1):
        v=[]
        for ix in range(17):
            u=-1+2*ix/16
            xx=x+u*(width/2+1.1)
            lift=0.34*abs(u)**4
            for iz in range(9):
                t=iz/8
                zz=z+side*(depth/2+0.8)*t
                yy=roof_y-0.9*t+lift*t*t
                v.append((xx,yy,zz))
        f=[]
        for ix in range(16):
            for iz in range(8):
                a=ix*9+iz
                f.append((a,a+9,a+10,a+1) if side<0 else (a+1,a+10,a+9,a))
        roof_obj=make_mesh("arch_"+name+"_roof_"+str(side),v,f,visual,(MAT_ROOF,))
        solid=roof_obj.modifiers.new("roof_shell","SOLIDIFY")
        solid.thickness=0.16
        bevel=roof_obj.modifiers.new("tile_edge_softness","BEVEL")
        bevel.width=0.025
        bevel.segments=2
    box_mesh("arch_"+name+"_ridge",(x,roof_y+0.08,z),(width+2.4,0.22,0.34),visual,MAT_BRONZE,0.035)
    for step in range(4):
        box_mesh("env_"+name+"_step_"+str(step),(x,base_y+0.12+step*0.12,z-depth/2-1.15-step*0.32),(width*0.42,0.24,0.38),visual,MAT_STONE,0.025)
    box_mesh("col_"+name+"_plinth",(x,base_y+0.22,z),(width+1.2,0.44,depth+1.2),collision)
    for sx in (-1,1):
        for sz in (-1,1):
            px=x+sx*(width/2-0.35)
            pz=z+sz*(depth/2-0.35)
            box_mesh("col_"+name+"_pillar",(px,base_y+height/2+0.72,pz),(0.52,height,0.52),collision)

pavilion("bell_tower",23.0,-21.0,8.0,8.0,4.4)
pavilion("drum_tower",-23.0,-21.0,8.0,8.0,4.4)
pavilion("ancestor_hall",24.0,-52.0,15.0,11.0,5.0)
pavilion("mountain_retreat",0.0,-115.0,12.0,9.0,4.6)

PAVILION_KEEPOUTS=((23.0,-21.0,11.0),(-23.0,-21.0,11.0),(24.0,-52.0,17.0),(0.0,-115.0,15.0))

# Procedural tree meshes, instanced as linked meshes with scale baked into each instance.
def append_cone(vertices,faces,material_ids,base,tip,radius,sides,mat_id):
    bx,by,bz=base
    tx,ty,tz=tip
    dx,dy,dz=tx-bx,ty-by,tz-bz
    length=math.sqrt(dx*dx+dy*dy+dz*dz)
    if length<1e-5:return
    ux,uy,uz=dx/length,dy/length,dz/length
    ref=(0.0,0.0,1.0) if abs(uz)<0.9 else (1.0,0.0,0.0)
    vx=uy*ref[2]-uz*ref[1]; vy=uz*ref[0]-ux*ref[2]; vz=ux*ref[1]-uy*ref[0]
    vl=max(math.sqrt(vx*vx+vy*vy+vz*vz),1e-6)
    vx,vy,vz=vx/vl,vy/vl,vz/vl
    wx=uy*vz-uz*vy; wy=uz*vx-ux*vz; wz=ux*vy-uy*vx
    start=len(vertices)
    for point,rr in ((base,radius),(tip,max(0.025,radius*0.08))):
        px,py,pz=point
        for i in range(sides):
            a=math.tau*i/sides
            vertices.append((px+rr*(vx*math.cos(a)+wx*math.sin(a)),
                             py+rr*(vy*math.cos(a)+wy*math.sin(a)),
                             pz+rr*(vz*math.cos(a)+wz*math.sin(a))))
    for i in range(sides):
        j=(i+1)%sides
        faces.append((start+i,start+j,start+sides+j,start+sides+i))
        material_ids.append(mat_id)

def append_sphere(vertices,faces,material_ids,center,radii,mat_id,segments=10,rings=7):
    cx,cy,cz=center
    rx,ry,rz=radii
    start=len(vertices)
    for j in range(rings+1):
        phi=math.pi*j/rings
        for i in range(segments):
            theta=math.tau*i/segments
            vertices.append((cx+rx*math.sin(phi)*math.cos(theta),
                             cy+ry*math.cos(phi),
                             cz+rz*math.sin(phi)*math.sin(theta)))
    for j in range(rings):
        for i in range(segments):
            ni=(i+1)%segments
            a=start+j*segments+i
            b=start+j*segments+ni
            c=start+(j+1)*segments+ni
            d=start+(j+1)*segments+i
            faces.append((a,b,c,d))
            material_ids.append(mat_id)

def tree_template(name,crown_shape):
    verts,faces,mids=[],[],[]
    append_cone(verts,faces,mids,(0,0.0,0),(0,6.0,0),0.32,12,0)
    for angle in (0.0,2.1,4.2):
        append_cone(verts,faces,mids,(0,2.4,0),(math.cos(angle)*1.4,4.5,math.sin(angle)*1.4),0.12,8,0)
    if crown_shape=="spreading":
        clusters=[((0,6.0,0),(2.6,2.1,2.6)),((-1.1,5.3,0.3),(1.8,1.7,1.9)),((1.2,5.5,-0.4),(1.9,1.8,1.8)),((0,7.0,0),(1.8,1.7,1.8))]
    elif crown_shape=="column":
        clusters=[((0,y,0),(r,1.35,r)) for y,r in ((4.8,1.5),(6.2,1.25),(7.5,0.8))]
    else:
        clusters=[((0,6.0,0),(2.1,1.8,2.1)),((-1.0,6.8,0.2),(1.35,1.4,1.4)),((1.0,6.8,-0.2),(1.35,1.4,1.4))]
    for center,radii in clusters:
        append_sphere(verts,faces,mids,center,radii,1 if crown_shape!="column" else 2,12,8)
    mesh=bpy.data.meshes.new(name+"_mesh")
    mesh.from_pydata([game_to_blender(v) for v in verts],[],faces)
    mesh.materials.append(MAT_BARK)
    mesh.materials.append(MAT_LEAF)
    mesh.materials.append(MAT_LEAF_LIGHT)
    mesh.update()
    for poly,mid in zip(mesh.polygons,mids): poly.material_index=mid
    add_uv(mesh)
    return mesh

def add_uv(mesh):
    if mesh.uv_layers:
        return
    uv=mesh.uv_layers.new(name="UVMap")
    if not mesh.vertices:
        return
    xs=[v.co.x for v in mesh.vertices]
    ys=[v.co.y for v in mesh.vertices]
    sx=max(max(xs)-min(xs),1e-5)
    sy=max(max(ys)-min(ys),1e-5)
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            co=mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv=((co.x-min(xs))/sx,(co.y-min(ys))/sy)

tree_meshes={
    "broadleaf":tree_template("veg_broadleaf_template","spreading"),
    "pine":tree_template("veg_pine_template","column"),
    "bodhi":tree_template("veg_bodhi_template","broadleaf"),
}
tree_count=0
for i in range(235):
    x=random.uniform(-119,119)
    z=random.uniform(-119,119)
    radius=math.hypot(x,z)
    if radius<47 or (abs(x)<7.5 and -115<z<120) or math.hypot(x+18,z-4)<16 or any(math.hypot(x-px,z-pz)<pr for px,pz,pr in PAVILION_KEEPOUTS):
        continue
    h=terrain_height(x,z)
    if h>42: continue
    species=random.choices(("broadleaf","pine","bodhi"),weights=(0.48,0.38,0.14))[0]
    scale=random.uniform(0.72,1.42)
    mesh=tree_meshes[species].copy()
    for vertex in mesh.vertices: vertex.co*=scale
    obj=bpy.data.objects.new("veg_"+species+"_instance_"+str(tree_count).zfill(3),mesh)
    visual.objects.link(obj)
    obj.location=game_to_blender((x,h,z))
    obj.rotation_euler[2]=random.uniform(0,math.tau)
    obj["asset_role"]="procedural_tree_instance"
    tree_count+=1

# Irregular rock templates and scattered boulders.
def rock_template(name,seed):
    rng=random.Random(seed)
    verts,faces=[],[]
    rings,segments=6,10
    for j in range(rings+1):
        phi=math.pi*j/rings
        for i in range(segments):
            theta=math.tau*i/segments
            noise=rng.uniform(0.82,1.18)
            verts.append((math.sin(phi)*math.cos(theta)*noise,
                          math.cos(phi)*noise,
                          math.sin(phi)*math.sin(theta)*noise))
    for j in range(rings):
        for i in range(segments):
            ni=(i+1)%segments
            a=j*segments+i
            b=j*segments+ni
            c=(j+1)*segments+ni
            d=(j+1)*segments+i
            faces.append((a,b,c,d))
    mesh=bpy.data.meshes.new(name+"_mesh")
    mesh.from_pydata([game_to_blender(v) for v in verts],[],faces)
    mesh.materials.append(MAT_ROCK)
    mesh.update()
    add_uv(mesh)
    return mesh
rock_meshes=[rock_template("env_rock_variant_"+str(i),SEED+i) for i in range(5)]
rock_count=0
for i in range(115):
    x=random.uniform(-120,120)
    z=random.uniform(-120,120)
    if math.hypot(x,z)<42 or (abs(x)<8 and -118<z<120) or any(math.hypot(x-px,z-pz)<pr for px,pz,pr in PAVILION_KEEPOUTS):
        continue
    h=terrain_height(x,z)
    source=random.choice(rock_meshes)
    mesh=source.copy()
    sx,sy,sz=random.uniform(1.0,3.6),random.uniform(0.65,1.8),random.uniform(1.0,3.2)
    for vertex in mesh.vertices:
        vertex.co.x*=sx
        vertex.co.y*=sz
        vertex.co.z*=sy
    obj=bpy.data.objects.new("env_mountain_boulder_"+str(rock_count).zfill(3),mesh)
    visual.objects.link(obj)
    obj.location=game_to_blender((x,h+0.15,z))
    obj.rotation_euler[2]=random.uniform(0,math.tau)
    rock_count+=1

# Lotus leaves and blossoms around the existing pond.
for i in range(24):
    angle=random.uniform(0,math.tau)
    radius=random.uniform(1.0,5.0)
    x=-18+math.cos(angle)*radius
    z=4+math.sin(angle)*radius
    size=random.uniform(0.65,1.25)
    verts=[(x,0.13,z)]
    for j in range(16):
        a=math.tau*j/16
        verts.append((x+math.cos(a)*size,0.13+0.035*math.sin(a*3),z+math.sin(a)*size*0.78))
    faces=[(0,(j+1)%16+1,j+1) for j in range(16)]
    make_mesh("veg_lotus_leaf_"+str(i).zfill(2),verts,faces,visual,(MAT_LOTUS,))
for i in range(7):
    angle=i*math.tau/7
    x=-18+math.cos(angle)*random.uniform(1.0,3.8)
    z=4+math.sin(angle)*random.uniform(1.0,3.8)
    verts,faces=[],[]
    for p in range(8):
        a=math.tau*p/8
        base=len(verts)
        verts.extend([(x,0.24,z),(x+math.cos(a)*0.22,0.30,z+math.sin(a)*0.22),
                      (x+math.cos(a)*0.58,0.38,z+math.sin(a)*0.58),
                      (x+math.cos(a+0.24)*0.42,0.31,z+math.sin(a+0.24)*0.42)])
        faces.append((base,base+1,base+2,base+3))
    make_mesh("veg_lotus_blossom_"+str(i).zfill(2),verts,faces,visual,(MAT_LOTUS_PETAL,))
    cylinder_mesh("veg_lotus_seedpod_"+str(i).zfill(2),(x,0.32,z),0.13,0.16,visual,MAT_LOTUS_CORE,12)

# Stone markers along the pilgrimage path and low courtyard retaining stones.
for side in (-1,1):
    for i in range(9):
        z=112-i*10.5
        x=side*(4.2+0.2*math.sin(i))
        box_mesh("prop_path_marker_"+str(side)+"_"+str(i),(x,terrain_height(x,z)+0.45,z),(0.42,0.9,0.42),visual,MAT_STONE,0.05)
for side in (-1,1):
    for i in range(18):
        z=10-i*3.4
        x=side*15.5
        box_mesh("env_courtyard_retaining_stone_"+str(side)+"_"+str(i),(x,0.45,z),(0.8,0.9,3.2),visual,MAT_STONE,0.06)

# Low-poly grass tufts with valid triangular blades.
for i in range(90):
    x=random.uniform(-112,112)
    z=random.uniform(-112,112)
    if math.hypot(x,z)<48 or abs(x)<8 or any(math.hypot(x-px,z-pz)<pr for px,pz,pr in PAVILION_KEEPOUTS): continue
    y=terrain_height(x,z)
    verts,faces=[],[]
    for blade in range(5):
        a=math.tau*blade/5+random.uniform(-0.2,0.2)
        h=random.uniform(0.35,0.85)
        base=len(verts)
        verts.extend([
            (x+math.cos(a)*0.07,y,z+math.sin(a)*0.07),
            (x-math.cos(a)*0.07,y,z-math.sin(a)*0.07),
            (x+math.cos(a+0.16)*0.20,y+h,z+math.sin(a+0.16)*0.20),
        ])
        faces.append((base,base+1,base+2))
    make_mesh("veg_grass_clump_"+str(i).zfill(3),verts,faces,visual,(MAT_MOSS,))

# Preview-only cinematic lighting and camera, intentionally outside export collections.
world=scene.world or bpy.data.worlds.new("BW_cinematic_world")
scene.world=world
world.use_nodes=True
background=world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value=(0.19,0.25,0.31,1.0)
background.inputs["Strength"].default_value=0.35
scene.render.engine="BLENDER_EEVEE_NEXT"
scene.render.resolution_x=1920
scene.render.resolution_y=1080
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.view_settings.view_transform="AgX"
scene.view_settings.look="AgX - Medium High Contrast"
scene.render.film_transparent=False
scene.render.fps=30
def aim(obj,point):
    direction=Vector(point)-obj.location
    obj.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()
camera_data=bpy.data.cameras.new("CAM_cinematic_overview_data")
camera=bpy.data.objects.new("CAM_cinematic_overview",camera_data)
preview.objects.link(camera)
camera.location=game_to_blender((115,92,145))
aim(camera,game_to_blender((0,10,-15)))
camera.data.lens=42
scene.camera=camera
sun_data=bpy.data.lights.new("LIGHT_cinematic_sun_data","SUN")
sun=bpy.data.objects.new("LIGHT_cinematic_sun",sun_data)
preview.objects.link(sun)
sun.location=game_to_blender((65,95,55))
sun.data.energy=2.2
sun.data.angle=math.radians(18)
aim(sun,game_to_blender((0,0,0)))
fill_data=bpy.data.lights.new("LIGHT_cinematic_fill_data","AREA")
fill=bpy.data.objects.new("LIGHT_cinematic_fill",fill_data)
preview.objects.link(fill)
fill.location=game_to_blender((-35,48,-15))
fill.data.energy=1800
fill.data.shape="DISK"
fill.data.size=32
aim(fill,game_to_blender((0,8,-25)))
scene["cinematic_environment_version"]="1.0"
scene["cinematic_environment_seed"]=SEED
scene["cinematic_environment_status"]="Procedural environment dressing; hero assets remain artist-authored"
scene["export_visual_collection"]="EXPORT_cinematic_environment"
scene["export_collision_collection"]="COLLISION_temple_complex"
scene["export_navmesh_collection"]="NAVMESH_temple_complex"

os.makedirs(os.path.dirname(output_path),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=output_path)
print("CINEMATIC ENVIRONMENT GENERATED")
print("Output:",output_path)
print("Trees:",tree_count,"| Rocks:",rock_count,"| Terrain grid:",GRID,"x",GRID)
print("Collections: EXPORT_cinematic_environment, COLLISION_temple_complex, NAVMESH_temple_complex")
print("Next: inspect in Blender, run asset_validation.py, batch_export.py and validate GLB/navmesh.")
