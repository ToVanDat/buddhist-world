"""Add controlled procedural surface variation before the Hero PBR bake.

Run against a copy of the source scene; bake_hero_pbr.py already writes to a new
.blend and never overwrites its input. This pass is intentionally conservative:
painted masks and human material review remain required for final hero assets.
"""
import bpy
from _common import script_args

ARGS = script_args()
def value_after(flag, default=None):
    return ARGS[ARGS.index(flag) + 1] if flag in ARGS and ARGS.index(flag) + 1 < len(ARGS) else default

COLLECTION_NAME = value_after("--collection")
if not COLLECTION_NAME:
    raise SystemExit("Required: --collection EXPORT_<hero>")
collection = bpy.data.collections.get(COLLECTION_NAME)
if collection is None:
    raise SystemExit("Collection not found: " + COLLECTION_NAME)
materials = {slot.material for obj in collection.all_objects if obj.type == "MESH"
             for slot in obj.material_slots if slot.material}
if not materials:
    raise SystemExit("No materials found in " + COLLECTION_NAME)

for material in sorted(materials, key=lambda item: item.name):
    if not material.use_nodes or not material.node_tree:
        raise SystemExit("Material nodes are disabled: " + material.name)
    tree = material.node_tree
    nodes, links = tree.nodes, tree.links
    bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        raise SystemExit("Principled BSDF missing: " + material.name)

    # Remove only nodes created by this script so the pass is safe to rerun.
    for node in list(nodes):
        if node.get("bw_surface_layer_node"):
            nodes.remove(node)

    tex = nodes.new("ShaderNodeTexCoord")
    tex.name = "BW_SURFACE_COORDS"
    tex["bw_surface_layer_node"] = True
    rough_noise = nodes.new("ShaderNodeTexNoise")
    rough_noise.name = "BW_ROUGHNESS_VARIATION"
    rough_noise.inputs["Scale"].default_value = 42.0
    rough_noise.inputs["Detail"].default_value = 4.0
    rough_noise["bw_surface_layer_node"] = True
    links.new(tex.outputs["Generated"], rough_noise.inputs["Vector"])
    rough_map = nodes.new("ShaderNodeMapRange")
    rough_map.name = "BW_ROUGHNESS_RANGE"
    rough_map.clamp = True
    rough_map.inputs["From Min"].default_value = 0.12
    rough_map.inputs["From Max"].default_value = 0.88
    rough_map.inputs["To Min"].default_value = 0.32
    rough_map.inputs["To Max"].default_value = 0.86
    rough_map["bw_surface_layer_node"] = True
    links.new(rough_noise.outputs["Fac"], rough_map.inputs["Value"])
    for link in list(bsdf.inputs["Roughness"].links):
        links.remove(link)
    links.new(rough_map.outputs["Result"], bsdf.inputs["Roughness"])

    micro_noise = nodes.new("ShaderNodeTexNoise")
    micro_noise.name = "BW_MICRO_NORMAL_NOISE"
    micro_noise.inputs["Scale"].default_value = 185.0
    micro_noise.inputs["Detail"].default_value = 2.0
    micro_noise.inputs["Roughness"].default_value = 0.72
    micro_noise["bw_surface_layer_node"] = True
    links.new(tex.outputs["Generated"], micro_noise.inputs["Vector"])
    micro_bump = nodes.new("ShaderNodeBump")
    micro_bump.name = "BW_MICRO_NORMAL_BUMP"
    micro_bump.inputs["Strength"].default_value = 0.12
    micro_bump.inputs["Distance"].default_value = 0.0025
    micro_bump["bw_surface_layer_node"] = True
    links.new(micro_noise.outputs["Fac"], micro_bump.inputs["Height"])

    # Preserve the original broad-form bump chain and layer micro-normal beneath it.
    existing_bump = next((node for node in nodes if node.type == "BUMP" and node.name != micro_bump.name
                          and node.inputs["Normal"].is_linked is False), None)
    if existing_bump:
        links.new(micro_bump.outputs["Normal"], existing_bump.inputs["Normal"])
    else:
        for link in list(bsdf.inputs["Normal"].links):
            links.remove(link)
        links.new(micro_bump.outputs["Normal"], bsdf.inputs["Normal"])

    # Bronze only: controlled cavity patina and convex-edge wear variation.
    if "bronze" in material.name.lower() or "patina" in material.name.lower():
        original_color = list(bsdf.inputs["Base Color"].links)
        source_socket = original_color[0].from_socket if original_color else None
        source_value = bsdf.inputs["Base Color"].default_value[:]
        for link in original_color:
            links.remove(link)
        geometry = nodes.new("ShaderNodeNewGeometry")
        geometry.name = "BW_BRONZE_CURVATURE"
        geometry["bw_surface_layer_node"] = True
        cavity = nodes.new("ShaderNodeValToRGB")
        cavity.name = "BW_BRONZE_CAVITY_PATINA_MASK"
        cavity.color_ramp.elements[0].position = 0.12
        cavity.color_ramp.elements[0].color = (0.72, 0.72, 0.72, 1)
        cavity.color_ramp.elements[1].position = 0.48
        cavity.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 1)
        cavity["bw_surface_layer_node"] = True
        links.new(geometry.outputs["Pointiness"], cavity.inputs["Fac"])
        noise_mask = nodes.new("ShaderNodeTexNoise")
        noise_mask.name = "BW_BRONZE_PATINA_BREAKUP"
        noise_mask.inputs["Scale"].default_value = 7.5
        noise_mask.inputs["Detail"].default_value = 3.0
        noise_mask["bw_surface_layer_node"] = True
        links.new(tex.outputs["Generated"], noise_mask.inputs["Vector"])
        multiply = nodes.new("ShaderNodeMath")
        multiply.name = "BW_BRONZE_PATINA_CONTROL"
        multiply.operation = "MULTIPLY"
        multiply["bw_surface_layer_node"] = True
        links.new(cavity.outputs["Color"], multiply.inputs[0])
        links.new(noise_mask.outputs["Fac"], multiply.inputs[1])
        mix = nodes.new("ShaderNodeMixRGB")
        mix.name = "BW_BRONZE_PATINA_LAYER"
        mix.blend_type = "MIX"
        mix.inputs["Color2"].default_value = (0.035, 0.16, 0.125, 1)
        mix["bw_surface_layer_node"] = True
        if source_socket:
            links.new(source_socket, mix.inputs["Color1"])
        else:
            mix.inputs["Color1"].default_value = source_value
        links.new(multiply.outputs[0], mix.inputs["Fac"])

        # Restrained convex-edge reveal, modulated by curvature rather than a
        # uniform outline. Human review must still reject overly bright results.
        edge = nodes.new("ShaderNodeValToRGB")
        edge.name = "BW_BRONZE_EDGE_WEAR_MASK"
        edge.color_ramp.elements[0].position = 0.42
        edge.color_ramp.elements[1].position = 0.76
        edge["bw_surface_layer_node"] = True
        links.new(geometry.outputs["Pointiness"], edge.inputs["Fac"])
        edge_mix = nodes.new("ShaderNodeMixRGB")
        edge_mix.name = "BW_BRONZE_EDGE_WEAR_LAYER"
        edge_mix.blend_type = "MIX"
        edge_mix.inputs["Color2"].default_value = (0.46, 0.32, 0.14, 1)
        edge_mix["bw_surface_layer_node"] = True
        links.new(mix.outputs["Color"], edge_mix.inputs["Color1"])
        links.new(edge.outputs["Color"], edge_mix.inputs["Fac"])
        links.new(edge_mix.outputs["Color"], bsdf.inputs["Base Color"])
        material["bw_patina_mode"] = "procedural_cavity_mask_requires_visual_review"
        material["bw_edge_wear_mode"] = "curvature_mask_requires_visual_review"

    material["bw_surface_layers"] = "roughness_variation_micro_normal_bronze_patina_curvature_edge_wear"
    material["bw_surface_layers_status"] = "LOOKDEV_ONLY_REQUIRES_CYCLES_BAKE_AND_REVIEW"

print("Configured surface variation for", len(materials), "materials in", COLLECTION_NAME)
print("Bake in Cycles next. Curvature/patina and micro detail must be visually reviewed.")
