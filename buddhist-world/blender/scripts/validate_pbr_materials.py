"""Validate PBR image color spaces and Principled BSDF wiring in a Blender scene."""
import bpy

REQUIRED = {
    "BW_PBR_roof_terracotta": "roof_terracotta",
    "BW_PBR_dark_teak": "dark_teak",
    "BW_PBR_red_lacquer": "red_lacquer",
    "BW_PBR_aged_limestone": "aged_limestone",
    "BW_PBR_aged_bronze": "aged_bronze",
    "BW_PBR_moss": "moss",
}
errors = []
warnings = []

for material_name, key in REQUIRED.items():
    material = bpy.data.materials.get(material_name)
    if material is None or not material.use_nodes:
        errors.append("Missing node material: " + material_name)
        continue
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        errors.append("Missing Principled BSDF: " + material_name)
        continue
    expected_nodes = {
        "basecolor": ("BW_PBR_BaseColorMap", "sRGB"),
        "roughness": ("BW_PBR_RoughnessMap", "Non-Color"),
        "normal": ("BW_PBR_NormalMap", "Non-Color"),
        "ao": ("BW_PBR_AOMap_Baked", "Non-Color"),
    }
    for role, (node_name, color_space) in expected_nodes.items():
        node = nodes.get(node_name)
        if node is None or node.type != "TEX_IMAGE" or node.image is None:
            errors.append("%s missing image node %s" % (material_name, node_name))
            continue
        if node.image.colorspace_settings.name != color_space:
            errors.append("%s %s expected %s, got %s" % (
                material_name, role, color_space, node.image.colorspace_settings.name))
        if not node.image.packed_file and not node.image.filepath:
            warnings.append("%s %s image is not packed and has no filepath" % (material_name, role))
    for role, socket_name in (("basecolor", "Base Color"), ("roughness", "Roughness"), ("normal", "Normal")):
        socket = bsdf.inputs.get(socket_name)
        if socket is None or not socket.is_linked:
            errors.append("%s %s is not connected to Principled BSDF" % (material_name, role))
    if nodes.get("BW_PBR_AOMap_Baked") is not None:
        warnings.append("%s AO map is retained as an authoring map; glTF occlusion export still needs exporter-specific verification" % material_name)

for message in warnings:
    print("PBR WARNING:", message)
for message in errors:
    print("PBR ERROR:", message)
if errors:
    raise SystemExit("PBR validation failed with %d error(s)." % len(errors))
print("PBR MATERIAL VALIDATION PASSED")
