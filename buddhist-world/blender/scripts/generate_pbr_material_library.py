"""Create a reusable PBR material library in an existing temple .blend scene.

Windows CMD:
  blender -b blender/projects/temple_complex_architecture.blend --python blender/scripts/generate_pbr_material_library.py -- --out blender/projects/temple_complex_pbr.blend

The script is additive: it does not change geometry, collision or navmesh.
Existing materials with matching BW names are enhanced in place; new named
materials are created for future artist-authored assets.
"""
import bpy
import os
from _common import script_args

args = script_args()
out_arg = args[args.index("--out") + 1] if "--out" in args else "blender/projects/temple_complex_pbr.blend"
output_path = os.path.abspath(out_arg)

MATERIALS = {
    "BW_PBR_roof_terracotta": ((0.24, 0.075, 0.042), 0.82, 0.0, 24.0, 0.22, 0.035),
    "BW_PBR_dark_teak": ((0.105, 0.042, 0.022), 0.62, 0.0, 18.0, 0.18, 0.045),
    "BW_PBR_red_lacquer": ((0.34, 0.055, 0.035), 0.34, 0.0, 11.0, 0.10, 0.018),
    "BW_PBR_aged_limestone": ((0.48, 0.42, 0.31), 0.91, 0.0, 8.0, 0.24, 0.075),
    "BW_PBR_aged_bronze": ((0.31, 0.20, 0.085), 0.38, 0.72, 16.0, 0.12, 0.018),
    "BW_PBR_moss": ((0.075, 0.15, 0.055), 0.97, 0.0, 13.0, 0.28, 0.09),
}

def set_input(bsdf, name, value):
    socket = bsdf.inputs.get(name)
    if socket is not None:
        socket.default_value = value

def make_material(name, color, roughness, metallic, scale, bump_strength, bump_distance):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        output = nodes.get("Material Output") or nodes.new("ShaderNodeOutputMaterial")
        links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    set_input(bsdf, "Base Color", (*color, 1.0))
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "Metallic", metallic)
    set_input(bsdf, "Specular IOR Level", 0.32)
    # Stable node names make reruns idempotent and prevent stacked noise graphs.
    tex = nodes.get("BW_PBR_ObjectNoise") or nodes.new("ShaderNodeTexNoise")
    tex.name = "BW_PBR_ObjectNoise"
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 5.0
    tex.inputs["Roughness"].default_value = 0.72
    coord = nodes.get("BW_PBR_TexCoord") or nodes.new("ShaderNodeTexCoord")
    coord.name = "BW_PBR_TexCoord"
    ramp = nodes.get("BW_PBR_ColorVariation") or nodes.new("ShaderNodeValToRGB")
    ramp.name = "BW_PBR_ColorVariation"
    ramp.color_ramp.elements[0].position = 0.16
    ramp.color_ramp.elements[0].color = (*(v * 0.68 for v in color), 1.0)
    ramp.color_ramp.elements[1].position = 0.84
    ramp.color_ramp.elements[1].color = (*(min(1.0, v * 1.22) for v in color), 1.0)
    bump = nodes.get("BW_PBR_MicroBump") or nodes.new("ShaderNodeBump")
    bump.name = "BW_PBR_MicroBump"
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = bump_distance
    rough = nodes.get("BW_PBR_Roughness") or nodes.new("ShaderNodeMapRange")
    rough.name = "BW_PBR_Roughness"
    rough.inputs["From Min"].default_value = 0.0
    rough.inputs["From Max"].default_value = 1.0
    rough.inputs["To Min"].default_value = max(0.08, roughness - 0.12)
    rough.inputs["To Max"].default_value = min(1.0, roughness + 0.12)
    # Replace only links owned by this library's output sockets.
    for socket in (bsdf.inputs["Base Color"], bsdf.inputs["Roughness"], bsdf.inputs["Normal"]):
        for link in list(socket.links):
            if link.from_node in (tex, ramp, bump, rough):
                links.remove(link)
    links.new(coord.outputs["Generated"], tex.inputs["Vector"])
    links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Fac"], rough.inputs["Value"])
    links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    links.new(tex.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mat["bw_pbr_library_version"] = 1
    mat["bw_pbr_material_role"] = name.removeprefix("BW_PBR_")
    return mat

for material_name, values in MATERIALS.items():
    make_material(material_name, *values)

# Enhance the existing procedural scene materials in place without changing assignments.
ALIASES = {
    "BW_roof_aged_terracotta": "BW_PBR_roof_terracotta",
    "BW_wood_dark_teak": "BW_PBR_dark_teak",
    "BW_wood_red_lacquer": "BW_PBR_red_lacquer",
    "BW_stone_warm_limestone": "BW_PBR_aged_limestone",
    "BW_aged_bronze": "BW_PBR_aged_bronze",
    "BW_moss_and_undergrowth": "BW_PBR_moss",
}
for old_name, library_name in ALIASES.items():
    old = bpy.data.materials.get(old_name)
    source = bpy.data.materials.get(library_name)
    if old is None or source is None:
        continue
    old.use_nodes = True
    old.node_tree = source.node_tree.copy()
    old["bw_pbr_library_version"] = 1
    old["bw_pbr_material_role"] = library_name.removeprefix("BW_PBR_")

scene = bpy.context.scene
scene["bw_pbr_material_library_version"] = 1
scene["bw_pbr_material_count"] = len(MATERIALS)
os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=output_path)
print("PBR MATERIAL LIBRARY GENERATED:", output_path)
print("Materials:", ", ".join(MATERIALS))
print("Geometry, collision and navmesh were not modified.")
