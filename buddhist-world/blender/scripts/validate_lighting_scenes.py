"""Validate required Blender lighting preview rig state in the current scene."""
import bpy

scene = bpy.context.scene
errors = []
warnings = []
preview = bpy.data.collections.get("PREVIEW_lighting_rig")
if preview is None:
    errors.append("Missing PREVIEW_lighting_rig collection.")
else:
    expected = {"BW_PREVIEW_Sun": "SUN", "BW_PREVIEW_Fill": "AREA", "BW_PREVIEW_Rim": "AREA"}
    for name, light_type in expected.items():
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "LIGHT":
            errors.append("Missing preview light: " + name)
        elif obj.data.type != light_type:
            errors.append("Incorrect light type for " + name)
        elif obj not in preview.objects.values():
            warnings.append(name + " is not linked to PREVIEW_lighting_rig.")

if scene.camera is None:
    warnings.append("No active camera; render framing cannot be validated.")
if scene.world is None or not scene.world.use_nodes:
    errors.append("World shader nodes are not enabled.")
if scene.view_settings.view_transform not in ("AgX", "Standard", "Filmic"):
    warnings.append("Unrecognized view transform: " + scene.view_settings.view_transform)
if scene.get("bw_lighting_preview_profile") not in ("dawn", "day", "sunset", "night"):
    warnings.append("No known BW lighting preview profile marker.")

for message in warnings:
    print("LIGHTING WARNING:", message)
for message in errors:
    print("LIGHTING ERROR:", message)
if errors:
    raise SystemExit("Lighting scene validation failed with %d error(s)." % len(errors))
print("LIGHTING SCENE VALIDATION PASSED")
