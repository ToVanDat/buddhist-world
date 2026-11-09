"""Tiện ích dùng chung cho script Blender. Chạy bằng:
   blender -b file.blend --python scripts/<script>.py -- [tham số]"""
import sys, re

# Quy ước tên (xem docs/CONVENTIONS.md):  <loại>_<tên>_<biến thể>   vd: arch_tamquan_gate_01
NAME_RE = re.compile(r"^(arch|env|veg|prop|char|col|lod[0-9])_[a-z0-9]+(_[a-z0-9]+)*$")
TRI_BUDGET = {"arch": 40000, "env": 60000, "veg": 8000, "prop": 6000, "char": 30000}
MAX_TEXTURE = 2048

def script_args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

def report(errors, warnings, title):
    print(f"\n===== {title} =====")
    for w in warnings: print("  [WARN] ", w)
    for e in errors:   print("  [ERROR]", e)
    print("  KẾT QUẢ:", "FAIL" if errors else "PASS", f"({len(errors)} lỗi, {len(warnings)} cảnh báo)")
    if errors: sys.exit(1)
