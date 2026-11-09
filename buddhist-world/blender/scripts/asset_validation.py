"""Kiểm tra asset trước khi export: tên, scale, UV, material, số tam giác, n-gon, texture.
   blender -b projects/temple_complex.blend --python scripts/asset_validation.py"""
import bpy
from _common import NAME_RE, TRI_BUDGET, MAX_TEXTURE, report

errors, warnings = [], []
for ob in bpy.context.scene.objects:
    if ob.type != "MESH": continue
    if not NAME_RE.match(ob.name): warnings.append(f"{ob.name}: tên không theo quy ước")
    if any(abs(s - 1.0) > 1e-4 for s in ob.scale): errors.append(f"{ob.name}: scale chưa apply {tuple(round(s,4) for s in ob.scale)}")
    me = ob.data
    if not me.uv_layers: errors.append(f"{ob.name}: thiếu UV")
    if not any(s.material for s in ob.material_slots): errors.append(f"{ob.name}: chưa gán material")
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    prefix = ob.name.split("_")[0]
    if tris > TRI_BUDGET.get(prefix, 50000): errors.append(f"{ob.name}: {tris} tam giác vượt ngân sách {TRI_BUDGET.get(prefix, 50000)}")
    ngons = sum(1 for p in me.polygons if len(p.vertices) > 4)
    if ngons: warnings.append(f"{ob.name}: {ngons} n-gon")
for img in bpy.data.images:
    if img.size[0] > MAX_TEXTURE or img.size[1] > MAX_TEXTURE:
        errors.append(f"texture {img.name}: {tuple(img.size)} > {MAX_TEXTURE}")
    if img.size[0] and (img.size[0] & (img.size[0]-1) or img.size[1] & (img.size[1]-1)):
        warnings.append(f"texture {img.name}: kích thước không phải lũy thừa 2")
report(errors, warnings, "ASSET VALIDATION")
