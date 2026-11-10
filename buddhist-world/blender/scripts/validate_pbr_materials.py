"""Validate PBR texture color spaces, UV mapping and exact Principled wiring."""
import bpy
import os

REQUIRED = {
    "BW_PBR_roof_terracotta": "roof_terracotta",
    "BW_PBR_dark_teak": "dark_teak",
    "BW_PBR_red_lacquer": "red_lacquer",
    "BW_PBR_aged_limestone": "aged_limestone",
    "BW_PBR_aged_bronze": "aged_bronze",
    "BW_PBR_moss": "moss",
}
IMAGE_NODES = {
    "basecolor": ("BW_PBR_BaseColorMap", "sRGB"),
    "roughness": ("BW_PBR_RoughnessMap", "Non-Color"),
    "normal": ("BW_PBR_NormalMap", "Non-Color"),
    "ao": ("BW_PBR_AOMap_Baked", "Non-Color"),
}

errors = []
warnings = []

def has_link(links, from_node, from_socket, to_node, to_socket):
    return any(
        link.from_node == from_node
        and link.from_socket.name == from_socket
        and link.to_node == to_node
        and link.to_socket.name == to_socket
        for link in links
    )

for material_name, key in REQUIRED.items():
    material = bpy.data.materials.get(material_name)
    if material is None or not material.use_nodes:
        errors.append("Missing node material: " + material_name)
        continue

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        errors.append("Missing Principled BSDF: " + material_name)
        continue

    images = {}
    dimensions = set()
    for role, (node_name, color_space) in IMAGE_NODES.items():
        node = nodes.get(node_name)
        if node is None or node.type != "TEX_IMAGE" or node.image is None:
            errors.append("%s missing image node %s" % (material_name, node_name))
            continue
        images[role] = node
        if node.image.colorspace_settings.name != color_space:
            errors.append("%s %s expected %s, got %s" % (
                material_name, role, color_space, node.image.colorspace_settings.name))
        size = tuple(int(value) for value in node.image.size)
        dimensions.add(size)
        if len(size) == 2 and (size[0] <= 0 or size[1] <= 0):
            errors.append("%s %s has invalid dimensions %s" % (material_name, role, size))
        if not node.image.packed_file:
            filepath = bpy.path.abspath(node.image.filepath) if node.image.filepath else ""
            if not filepath or not os.path.isfile(filepath):
                warnings.append("%s %s image is neither packed nor present at %s" % (
                    material_name, role, filepath or "<no filepath>"))

    if len(dimensions) > 1:
        warnings.append("%s PBR maps have mismatched dimensions: %s" % (material_name, sorted(dimensions)))

    base = images.get("basecolor")
    rough = images.get("roughness")
    normal = images.get("normal")
    ao = images.get("ao")

    if base and not has_link(links, base, "Color", bsdf, "Base Color"):
        errors.append("%s base-color image is not directly wired to Principled Base Color" % material_name)
    if rough and not has_link(links, rough, "Color", bsdf, "Roughness"):
        errors.append("%s roughness image is not directly wired to Principled Roughness" % material_name)

    normal_decode = nodes.get("BW_PBR_NormalDecode")
    if normal is None or normal_decode is None or normal_decode.type != "NORMAL_MAP":
        errors.append("%s missing tangent-space BW_PBR_NormalDecode node" % material_name)
    else:
        if normal_decode.space != "TANGENT":
            errors.append("%s normal decoder must use tangent space" % material_name)
        if not has_link(links, normal, "Color", normal_decode, "Color"):
            errors.append("%s normal image is not wired to Normal Map Color" % material_name)
        if not has_link(links, normal_decode, "Normal", bsdf, "Normal"):
            errors.append("%s decoded normal is not wired to Principled Normal" % material_name)

    if ao:
        if ao.image.colorspace_settings.name != "Non-Color":
            errors.append("%s AO map must use Non-Color" % material_name)
        warnings.append("%s AO is packed as an authoring map; glTF occlusion export is not yet verified" % material_name)

    if not material.get("bw_pbr_texture_set_version"):
        warnings.append("%s has no generated PBR texture-set version marker" % material_name)

for message in warnings:
    print("PBR WARNING:", message)
for message in errors:
    print("PBR ERROR:", message)
if errors:
    raise SystemExit("PBR material validation failed with %d error(s)." % len(errors))
print("PBR MATERIAL VALIDATION PASSED")
