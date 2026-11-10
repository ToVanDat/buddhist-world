"""Export a region navmesh from Blender's explicitly authored NAVMESH_<region> collection.

Run:
  blender -b projects/temple_complex.blend --python scripts/export_navmesh.py -- --region temple_complex --out exports/navmesh/temple_complex.json

Blender native coordinates are Z-up. Exported points use the game's glTF Y-up metres:
  game = (blender.x, blender.z, -blender.y)
Only walkable faces whose upward normal is within --max-slope degrees are exported.
"""
import bpy
import json
import math
import os
from collections import defaultdict, deque
from _common import script_args

args = script_args()
def arg(name, default=None):
    return args[args.index(name) + 1] if name in args else default

region = arg("--region", "temple_complex")
out = arg("--out", f"exports/navmesh/{region}.json")
max_slope = float(arg("--max-slope", "42"))
if not region.replace("_", "").isalnum() or not 0 < max_slope < 80:
    raise SystemExit("Invalid region id or max slope.")
collection = bpy.data.collections.get(f"NAVMESH_{region}")
if collection is None:
    raise SystemExit(f"Missing collection NAVMESH_{region}; tag only final walkable surfaces.")

depsgraph = bpy.context.evaluated_depsgraph_get()
vertices = []
vertex_ids = {}
polygons = []
edge_owners = defaultdict(list)
slope_limit = math.cos(math.radians(max_slope))
quantization = 10000

def game_point(co):
    return (float(co.x), float(co.z), float(-co.y))

def vertex_id(point):
    key = tuple(round(value * quantization) for value in point)
    if key not in vertex_ids:
        vertex_ids[key] = len(vertices)
        vertices.append(list(point))
    return vertex_ids[key]

for obj in sorted(collection.all_objects, key=lambda item: item.name):
    if obj.type != "MESH":
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        for tri in mesh.loop_triangles:
            points = [game_point(evaluated.matrix_world @ mesh.vertices[index].co) for index in tri.vertices]
            a, b, c = points
            ab = (b[0]-a[0], b[1]-a[1], b[2]-a[2])
            ac = (c[0]-a[0], c[1]-a[1], c[2]-a[2])
            normal = (
                ab[1]*ac[2] - ab[2]*ac[1],
                ab[2]*ac[0] - ab[0]*ac[2],
                ab[0]*ac[1] - ab[1]*ac[0],
            )
            length = math.sqrt(sum(value*value for value in normal))
            if length < 1e-7:
                continue
            normal = tuple(value / length for value in normal)
            if normal[1] < 0:
                points[1], points[2] = points[2], points[1]
                normal = tuple(-value for value in normal)
            if normal[1] < slope_limit:
                continue
            ids = [vertex_id(point) for point in points]
            polygon_id = len(polygons)
            polygons.append({"id": polygon_id, "vertices": ids, "neighbors": []})
            for i in range(3):
                edge = tuple(sorted((ids[i], ids[(i + 1) % 3])))
                edge_owners[edge].append(polygon_id)
    finally:
        evaluated.to_mesh_clear()

non_manifold = [(edge, owners) for edge, owners in edge_owners.items() if len(owners) > 2]
if non_manifold:
    raise SystemExit(f"Navmesh has {len(non_manifold)} non-manifold edges (more than two adjacent faces).")
for owners in edge_owners.values():
    if len(owners) == 2:
        a, b = owners
        polygons[a]["neighbors"].append(b)
        polygons[b]["neighbors"].append(a)

if not polygons:
    raise SystemExit("No walkable triangles exported. Check collection transforms and slope limit.")

# Connected components are useful diagnostics: isolated islands may be intentional,
# but must be reviewed before NPC routes are authored.
unvisited = set(range(len(polygons)))
components = []
while unvisited:
    start = unvisited.pop()
    queue = deque([start])
    count = 0
    while queue:
        current = queue.popleft()
        count += 1
        for neighbor in polygons[current]["neighbors"]:
            if neighbor in unvisited:
                unvisited.remove(neighbor)
                queue.append(neighbor)
    components.append(count)

payload = {
    "version": 1,
    "regionId": region,
    "coordinateSystem": "Y_UP_METERS",
    "maxSlopeDegrees": max_slope,
    "vertices": vertices,
    "polygons": polygons,
    "diagnostics": {"connectedComponents": len(components), "componentPolygonCounts": sorted(components, reverse=True)},
}
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
with open(out, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
print(f"NAVMESH PASS: {out} | {len(vertices)} vertices | {len(polygons)} triangles | {len(components)} components")
