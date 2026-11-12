"""Create a neutral seated-meditation Buddha sculpt workspace.

Run from repository root:
  blender -b --python blender/scripts/generate_buddha_sculpt_workspace.py -- --out blender/projects/hero_buddha_neutral_workspace.blend

This creates a neutral, unadorned blockout and an AUTO quad-remesh starter.
It does NOT claim to create a finished sculpt or production-ready retopology.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--levels", type=int, default=2)
    parser.add_argument("--voxel-size", type=float, default=0.035)
    parser.add_argument("--target-faces", type=int, default=14000)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args(raw)


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def move_to_collection(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj, modifier):
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def make_ellipsoid(name, center, radii, col, direction=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = radii
    if direction is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for face in obj.data.polygons:
        face.use_smooth = True
    move_to_collection(obj, col)
    return obj


def make_limb(name, start, end, radius, col):
    a, b = Vector(start), Vector(end)
    delta = b - a
    return make_ellipsoid(name, (a + b) * 0.5, (radius, radius, delta.length * 0.5 + radius), col, delta)


def join_meshes(objects, name):
    activate(objects[0])
    for obj in objects:
        obj.select_set(True)
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = name
    body.data.name = name + "_mesh"
    return body


def make_plinth(col):
    parts = []
    for name, radius, depth, z in (
        ("plinth_lower", 0.78, 0.16, 0.08),
        ("plinth_upper", 0.68, 0.12, 0.22),
        ("seat_cushion", 0.54, 0.18, 0.37),
    ):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=(0, 0, z))
        obj = bpy.context.object
        obj.name = name
        bevel = obj.modifiers.new("small_edge_softening", "BEVEL")
        bevel.width = 0.025
        bevel.segments = 3
        apply_modifier(obj, bevel)
        for face in obj.data.polygons:
            face.use_smooth = True
        move_to_collection(obj, col)
        parts.append(obj)
    return parts


def create_body(col, voxel_size):
    pieces = []
    # Neutral seated silhouette: no canonical hair, urna, crown, ornaments or inscriptions.
    # Blender front is -Y. The body is intentionally symmetrical and unadorned.
    pieces.append(make_ellipsoid("pelvis_mass", (0, 0.00, 0.93), (0.48, 0.38, 0.36), col))
    pieces.append(make_ellipsoid("torso_mass", (0, 0.02, 1.55), (0.53, 0.36, 0.73), col))
    pieces.append(make_ellipsoid("shoulder_mass", (0, 0.00, 1.98), (0.68, 0.34, 0.28), col))
    pieces.append(make_ellipsoid("neck_mass", (0, 0.02, 2.27), (0.19, 0.19, 0.22), col))
    pieces.append(make_ellipsoid("head_mass", (0, 0.01, 2.69), (0.34, 0.31, 0.40), col))
    # Generic ears only; no elongated/canonical proportions at this stage.
    pieces.append(make_ellipsoid("ear_left_mass", (-0.36, 0.01, 2.68), (0.075, 0.11, 0.17), col))
    pieces.append(make_ellipsoid("ear_right_mass", (0.36, 0.01, 2.68), (0.075, 0.11, 0.17), col))

    # Cross-legged seated base. These overlapping volumes are fused by voxel remesh.
    pieces.append(make_limb("thigh_left", (-0.18, 0.00, 0.91), (-0.67, -0.31, 0.54), 0.23, col))
    pieces.append(make_limb("shin_left", (-0.67, -0.31, 0.54), (-0.02, -0.55, 0.48), 0.19, col))
    pieces.append(make_limb("thigh_right", (0.18, 0.00, 0.91), (0.67, -0.31, 0.54), 0.23, col))
    pieces.append(make_limb("shin_right", (0.67, -0.31, 0.54), (0.02, -0.55, 0.48), 0.19, col))

    # Arms descend beside the torso, then rest on the lap. Hands are deliberately mitten-like:
    # no finger gesture or named mudra is encoded.
    for side, sign in (("left", -1), ("right", 1)):
        pieces.append(make_limb("upper_arm_" + side, (sign * 0.51, 0.00, 1.92),
                                 (sign * 0.64, -0.13, 1.34), 0.145, col))
        pieces.append(make_limb("forearm_" + side, (sign * 0.64, -0.13, 1.34),
                                 (sign * 0.27, -0.43, 1.02), 0.12, col))
        pieces.append(make_ellipsoid("hand_" + side, (sign * 0.15, -0.49, 0.94),
                                     (0.19, 0.12, 0.075), col))

    body = join_meshes(pieces, "prop_buddha_statue_body_base")
    body.data.remesh_voxel_size = voxel_size
    activate(body)
    bpy.ops.object.voxel_remesh()
    smooth = body.modifiers.new("blockout_relax", "SMOOTH")
    smooth.factor = 0.8
    smooth.iterations = 4
    apply_modifier(body, smooth)
    for face in body.data.polygons:
        face.use_smooth = True
    return body


def duplicate_to_collection(source, name, col):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    obj.data.name = name + "_mesh"
    col.objects.link(obj)
    return obj


def add_multires(obj, levels):
    modifier = obj.modifiers.new("SCULPT_multires", "MULTIRES")
    activate(obj)
    op = bpy.ops.object.multires_subdivide
    props = op.get_rna_type().properties.keys()
    kwargs = {"modifier": modifier.name}
    if "mode" in props:
        kwargs["mode"] = "CATMULL_CLARK"
    for _ in range(levels):
        op(**kwargs)
    modifier.levels = levels
    modifier.sculpt_levels = levels
    modifier.render_levels = min(levels, 2)
    return modifier


def auto_quad_remesh(source, sculpt, col, target_faces):
    obj = duplicate_to_collection(source, "retopo_auto_buddha_statue_body", col)
    activate(obj)
    op = getattr(bpy.ops.object, "quadriflow_remesh", None)
    if op is None or not op.poll():
        obj.name = "retopo_guide_buddha_statue_body"
        obj["topology_status"] = "GUIDE_ONLY: Quadriflow operator unavailable in this Blender build"
        return obj, False

    available = op.get_rna_type().properties.keys()
    kwargs = {}
    candidates = {
        "target_faces": target_faces,
        "use_mesh_symmetry": True,
        "use_preserve_sharp": False,
        "use_preserve_mesh_boundary": False,
        "use_mesh_boundary": False,
        "preserve_attributes": False,
    }
    for key, value in candidates.items():
        if key in available:
            kwargs[key] = value
    try:
        op(**kwargs)
    except Exception as exc:
        obj.name = "retopo_guide_buddha_statue_body"
        obj["topology_status"] = "GUIDE_ONLY: Quadriflow failed: " + str(exc)[:240]
        return obj, False

    obj.name = "retopo_auto_buddha_statue_body"
    obj.data.name = obj.name + "_quad_mesh"
    wrap = obj.modifiers.new("TEMP_shrinkwrap_to_sculpt", "SHRINKWRAP")
    wrap.target = sculpt
    if hasattr(wrap, "wrap_method"):
        wrap.wrap_method = "NEAREST_SURFACEPOINT"
    wrap.offset = 0.002
    obj["topology_status"] = "AUTO_QUAD_STARTER_REQUIRES_MANUAL_EDGE_FLOW_REVIEW"
    obj["target_face_budget"] = target_faces
    return obj, True


def main():
    args = arguments()
    if args.levels < 1 or args.levels > 4:
        raise SystemExit("--levels must be between 1 and 4")
    if args.voxel_size < 0.01 or args.voxel_size > 0.08:
        raise SystemExit("--voxel-size must be between 0.01 and 0.08 metres")
    if args.target_faces < 4000 or args.target_faces > 40000:
        raise SystemExit("--target-faces must be between 4000 and 40000")

    out_path = os.path.abspath(args.out)
    if os.path.exists(out_path) and not args.overwrite:
        raise SystemExit("Output already exists; choose another --out or pass --overwrite.")

    # Safety: never destroy or repurpose an existing user scene.
    if bpy.data.objects:
        raise SystemExit("Scene is not empty. Run with: blender -b --python ... (no input .blend).")

    source_col = collection("SOURCE_neutral_buddha_statue")
    sculpt_col = collection("SCULPT_hero_buddha_statue")
    retopo_col = collection("RETOPO_AUTO_hero_buddha_statue")
    plinth_col = collection("BLOCKOUT_plinth_hero_buddha_statue")

    body = create_body(source_col, args.voxel_size)
    plinth_parts = make_plinth(source_col)

    sculpt = duplicate_to_collection(body, "sculpt_buddha_statue_body", sculpt_col)
    add_multires(sculpt, args.levels)
    sculpt["sculpt_stage"] = "NEUTRAL_BLOCKOUT_READY_FOR_MANUAL_PRIMARY_SCULPT"
    sculpt["iconography_status"] = "UNAPPROVED: no canonical features or named mudra"

    retopo, quad_ok = auto_quad_remesh(body, sculpt, retopo_col, args.target_faces)
    # Keep the plain, non-symbolic plinth as a separate low-density component.
    for part in plinth_parts:
        duplicate = duplicate_to_collection(part, "blockout_buddha_statue_" + part.name, plinth_col)
        duplicate["asset_stage"] = "PLAIN_BLOCKOUT_NOT_FINAL"

    body["asset_stage"] = "NEUTRAL_BLOCKOUT_SOURCE"
    body["pose"] = "SEATED_MEDITATION"
    body["reference_status"] = "NO_REFERENCE_IMAGE"
    retopo["manual_review_required"] = True

    # Hide source and auto-retopo overlay in the viewport; sculpt remains visible.
    source_col.hide_viewport = True
    retopo_col.hide_viewport = True
    retopo_col.hide_render = True

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out_path)
    print("BUDDHA WORKSPACE CREATED:", out_path)
    print("Multires levels:", args.levels)
    print("Quadriflow auto-remesh:", "CREATED" if quad_ok else "GUIDE ONLY")
    print("IMPORTANT: no final sculpt, approved iconography, manual retopology, UV, bake, PBR or LOD has been completed.")


if __name__ == "__main__":
    main()
