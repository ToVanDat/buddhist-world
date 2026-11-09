"""Kiểm tra texture của file .blend: tồn tại trên đĩa, kích thước, packed hay không.
   blender -b projects/x.blend --python scripts/texture_validation.py"""
import bpy, os
from _common import MAX_TEXTURE, report

errors, warnings = [], []
for img in bpy.data.images:
    if img.source != "FILE": continue
    path = bpy.path.abspath(img.filepath)
    if not img.packed_file and not os.path.exists(path): errors.append(f"{img.name}: thiếu file {path}")
    if max(img.size) > MAX_TEXTURE: errors.append(f"{img.name}: {tuple(img.size)} > {MAX_TEXTURE}")
    if img.colorspace_settings.name not in ("sRGB", "Non-Color"): warnings.append(f"{img.name}: colorspace '{img.colorspace_settings.name}' bất thường")
report(errors, warnings, "TEXTURE VALIDATION")
