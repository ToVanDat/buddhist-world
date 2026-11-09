"""Kiểm tra animation nhân vật: tên Action chuẩn, armature, root bone.
   blender -b projects/character_main.blend --python scripts/animation_validation.py"""
import bpy
from _common import report

REQUIRED = ["Idle", "Walk", "Run", "Jump"]
errors, warnings = [], []
arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
if len(arms) != 1: errors.append(f"cần đúng 1 armature, tìm thấy {len(arms)}")
else:
    bones = arms[0].data.bones
    if "root" not in bones: errors.append("thiếu bone 'root'")
    for b in bones:
        if b.name != b.name.strip() or " " in b.name: warnings.append(f"bone '{b.name}' chứa khoảng trắng")
names = {a.name for a in bpy.data.actions}
for r in REQUIRED:
    if r not in names: errors.append(f"thiếu Action '{r}'")
for a in bpy.data.actions:
    if a.name not in REQUIRED and not a.name[0].isupper(): warnings.append(f"Action '{a.name}' nên viết hoa chữ đầu (PascalCase)")
report(errors, warnings, "ANIMATION VALIDATION")
