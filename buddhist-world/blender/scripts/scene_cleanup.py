"""Dọn dữ liệu mồ côi (orphan) và báo cáo. KHÔNG xoá object. Lưu file nếu truyền --save.
   blender -b projects/x.blend --python scripts/scene_cleanup.py -- --save"""
import bpy
from _common import script_args

before = {k: len(getattr(bpy.data, k)) for k in ("meshes", "materials", "images", "actions")}
bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
after = {k: len(getattr(bpy.data, k)) for k in before}
for k in before: print(f"{k}: {before[k]} -> {after[k]}")
if "--save" in script_args(): bpy.ops.wm.save_mainfile(); print("Đã lưu.")
