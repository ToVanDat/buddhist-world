"""Generate tileable PBR texture sets and wire them into named Blender materials.

Run against a scene containing the BW_PBR_* material library:
  blender -b blender/projects/temple_complex_pbr.blend --python blender/scripts/generate_pbr_texture_maps.py -- --out apps/web/public/assets/textures/pbr --size 512 --blend-out blender/projects/temple_complex_pbr_textured.blend

Outputs base-color, roughness, tangent-space normal and AO maps for each
material. Images are packed into the saved .blend and remain available to the
glTF exporter. Existing geometry, collision and navmesh are not modified.
"""
import bpy
import math
import os
from _common import script_args

args = script_args()

def arg(name, default):
    return args[args.index(name) + 1] if name in args else default

out_dir = os.path.abspath(arg("--out", "apps/web/public/assets/textures/pbr"))
blend_out = arg("--blend-out", "")
size = max(128, min(1024, int(arg("--size", "512"))))
os.makedirs(out_dir, exist_ok=True)

MATERIALS = {
    "roof_terracotta": ("BW_PBR_roof_terracotta", ("BW_roof_aged_terracotta",), (0.24, 0.075, 0.042), 0.82, 0.0, 0.75, 3),
    "dark_teak": ("BW_PBR_dark_teak", ("BW_wood_dark_teak",), (0.105, 0.042, 0.022), 0.62, 0.0, 0.55, 7),
    "red_lacquer": ("BW_PBR_red_lacquer", ("BW_wood_red_lacquer",), (0.34, 0.055, 0.035), 0.34, 0.0, 0.22, 11),
    "aged_limestone": ("BW_PBR_aged_limestone", ("BW_stone_warm_limestone",), (0.48, 0.42, 0.31), 0.91, 0.0, 0.9, 17),
    "aged_bronze": ("BW_PBR_aged_bronze", ("BW_aged_bronze",), (0.31, 0.20, 0.085), 0.38, 0.72, 0.34, 23),
    "moss": ("BW_PBR_moss", ("BW_moss_and_undergrowth",), (0.075, 0.15, 0.055), 0.97, 0.0, 1.0, 29),
}

def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))

def linear_to_srgb(value):
    value = clamp(value)
    return 12.92*value if value <= 0.0031308 else 1.055*(value**(1.0/2.4))-0.055

def height_field(u, v, phase):
    tau = math.tau
    a = math.sin(tau * (3*u + phase*0.013)) * math.cos(tau * (2*v + phase*0.017))
    b = math.sin(tau * (7*u + 5*v + phase*0.021))
    c = math.cos(tau * (11*u - 9*v + phase*0.031))
    grain = math.sin(tau * (17*u + phase*0.01)) * math.sin(tau * (2*v))
    return 0.5 + 0.19*a + 0.085*b + 0.045*c + 0.025*grain

def create_image(name, pixels, color_space):
    image = bpy.data.images.get(name)
    if image is not None:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = color_space
    image.pixels.foreach_set(pixels)
    image.file_format = "PNG"
    image.filepath_raw = os.path.join(out_dir, name + ".png")
    image.save()
    image.pack()
    return image

def make_maps(key, base_color, base_roughness, metallic, strength, phase):
    base_pixels = []
    rough_pixels = []
    normal_pixels = []
    ao_pixels = []
    du = 1.0 / size
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            h = height_field(u, v, phase)
            variation = 0.78 + h * 0.42
            for channel in range(3):
                base_pixels.append(linear_to_srgb(base_color[channel] * variation))
            base_pixels.append(1.0)
            rough = clamp(base_roughness + (h - 0.5) * 0.24, 0.08, 1.0)
            rough_pixels.extend((rough, rough, rough, 1.0))
            dx = (height_field(u+du, v, phase) - height_field(u-du, v, phase)) * strength
            dy = (height_field(u, v+du, phase) - height_field(u, v-du, phase)) * strength
            nx, ny, nz = -dx, -dy, 1.0
            length = math.sqrt(nx*nx + ny*ny + nz*nz)
            normal_pixels.extend((nx/length*0.5+0.5, ny/length*0.5+0.5, nz/length*0.5+0.5, 1.0))
            ao = clamp(0.91 - max(0.0, 0.5-h) * 0.42, 0.62, 1.0)
            ao_pixels.extend((ao, ao, ao, 1.0))

    images = {
        "basecolor": create_image("BW_TEX_" + key + "_basecolor", base_pixels, "sRGB"),
        "roughness": create_image("BW_TEX_" + key + "_roughness", rough_pixels, "Non-Color"),
        "normal": create_image("BW_TEX_" + key + "_normal", normal_pixels, "Non-Color"),
        "ao": create_image("BW_TEX_" + key + "_ao", ao_pixels, "Non-Color"),
    }
    return images

def wire_material(material_name, images, metallic):
    mat = bpy.data.materials.get(material_name)
    if mat is None:
        raise SystemExit("Missing material: " + material_name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        raise SystemExit("Missing Principled BSDF on " + material_name)
    bsdf.inputs["Metallic"].default_value = metallic
    uv = nodes.get("BW_PBR_UV") or nodes.new("ShaderNodeTexCoord")
    uv.name = "BW_PBR_UV"

    def image_node(node_name, image):
        node = nodes.get(node_name) or nodes.new("ShaderNodeTexImage")
        node.name = node_name
        node.image = image
        node.interpolation = "Linear"
        node.extension = "REPEAT"
        links.new(uv.outputs["UV"], node.inputs["Vector"])
        return node

    base = image_node("BW_PBR_BaseColorMap", images["basecolor"])
    rough = image_node("BW_PBR_RoughnessMap", images["roughness"])
    normal = image_node("BW_PBR_NormalMap", images["normal"])
    image_node("BW_PBR_AOMap_Baked", images["ao"])
    normal_map = nodes.get("BW_PBR_NormalDecode") or nodes.new("ShaderNodeNormalMap")
    normal_map.name = "BW_PBR_NormalDecode"
    normal_map.space = "TANGENT"
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])

    for socket in (bsdf.inputs["Base Color"], bsdf.inputs["Roughness"], bsdf.inputs["Normal"]):
        for link in list(socket.links):
            links.remove(link)
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    mat["bw_pbr_texture_set_version"] = 1
    mat["bw_pbr_texture_resolution"] = size
    mat["bw_pbr_ao_map"] = images["ao"].name

for key, (material_name, aliases, base, roughness, metallic, strength, phase) in MATERIALS.items():
    maps = make_maps(key, base, roughness, metallic, strength, phase)
    wire_material(material_name, maps, metallic)
    for alias in aliases:
        if bpy.data.materials.get(alias) is not None:
            wire_material(alias, maps, metallic)
    print("PBR texture set:", key, "=>", material_name, "+", ", ".join(aliases))

scene = bpy.context.scene
scene["bw_pbr_texture_set_version"] = 1
scene["bw_pbr_texture_resolution"] = size
if blend_out:
    blend_out = os.path.abspath(blend_out)
    os.makedirs(os.path.dirname(blend_out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_out)
    print("Saved textured Blender scene:", blend_out)
print("PBR texture maps saved and packed:", out_dir)
print("Base color / roughness / normal are wired to Principled BSDF; AO maps are packed for the authoring/export pipeline.")
