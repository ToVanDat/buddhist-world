"""Create a simple transform Action on an existing prop.
Run: blender -b scene.blend --python blender/scripts/generate_prop_animation.py -- --object prop_bell_body --kind bell
Kinds: bell, lantern, door, lotus. This script creates an Action; it does not export a GLB.
"""
import argparse
import bpy
import math
import sys

def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--object", required=True, dest="object_name")
    parser.add_argument("--kind", required=True, choices=("bell", "lantern", "door", "lotus"))
    parser.add_argument("--action", dest="action_name")
    parser.add_argument("--frames", type=int, default=36)
    return parser.parse_args(raw)

def key(obj, frame, rotation=None, scale=None):
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert(data_path="rotation_euler", frame=frame, group="Transform")
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert(data_path="scale", frame=frame, group="Transform")

def main():
    args = parse_args()
    if not 12 <= args.frames <= 240:
        raise SystemExit("--frames must be between 12 and 240")
    obj = bpy.data.objects.get(args.object_name)
    if obj is None:
        raise SystemExit("Object not found: " + args.object_name)
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start, scene.frame_end = 1, args.frames
    action_name = args.action_name or "AN_Prop_" + args.kind.title() + "_" + obj.name
    action = bpy.data.actions.new(action_name)
    obj.animation_data_create()
    obj.animation_data.action = action
    base_rot, base_scale = obj.rotation_euler.copy(), obj.scale.copy()
    mid, end = max(2, args.frames // 2), args.frames
    if args.kind == "bell":
        key(obj, 1, rotation=base_rot)
        key(obj, max(2, mid // 2), rotation=(base_rot.x, base_rot.y, base_rot.z + math.radians(9)))
        key(obj, mid, rotation=(base_rot.x, base_rot.y, base_rot.z - math.radians(7)))
        key(obj, end, rotation=base_rot)
    elif args.kind == "lantern":
        key(obj, 1, rotation=base_rot)
        key(obj, max(2, mid // 2), rotation=(base_rot.x + math.radians(4), base_rot.y, base_rot.z))
        key(obj, mid, rotation=(base_rot.x - math.radians(4), base_rot.y, base_rot.z))
        key(obj, end, rotation=base_rot)
    elif args.kind == "door":
        key(obj, 1, rotation=base_rot)
        key(obj, end, rotation=(base_rot.x, base_rot.y, base_rot.z + math.radians(90)))
    else:
        key(obj, 1, scale=base_scale * 0.82)
        key(obj, mid, scale=base_scale * 1.06)
        key(obj, end, scale=base_scale)
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
    obj["bw_animation_kind"] = args.kind
    obj["bw_animation_action"] = action_name
    scene.frame_set(1)
    print("Created Action:", action.name, "on", obj.name, "frames", 1, "-", end)

if __name__ == "__main__":
    main()
