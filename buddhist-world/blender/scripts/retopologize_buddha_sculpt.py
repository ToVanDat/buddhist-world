"""Create an automatic quad-retopology review mesh from the sculpted Buddha.

Run:
  blender projects/hero_buddha_sculpted.blend --python blender/scripts/retopologize_buddha_sculpt.py -- --out projects/hero_buddha_retopo_review.blend --target-faces 18000

The source .blend is never overwritten unless the user explicitly selects the same output
path and passes --overwrite. The generated quad mesh is a starter, not accepted final topology.
"""
import argparse
import os
import sys

import bpy


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--source", default="sculpt_buddha_statue_body")
    parser.add_argument("--target-faces", type=int, default=18000)
    parser.add_argument("--shrinkwrap-offset", type=float, default=0.002)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args(raw)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def main():
    args = arguments()
    if not 4000 <= args.target_faces <= 40000:
        raise SystemExit("--target-faces must be between 4000 and 40000")
    if not 0.0 <= args.shrinkwrap_offset <= 0.02:
        raise SystemExit("--shrinkwrap-offset must be between 0 and 0.02 metres")

    source = bpy.data.objects.get(args.source)
    if source is None or source.type != "MESH":
        raise SystemExit("Source mesh not found: " + args.source)

    out_path = os.path.abspath(args.out)
    if os.path.exists(out_path) and not args.overwrite:
        raise SystemExit("Output already exists; choose another --out or pass --overwrite.")

    collection_name = "RETOPO_REVIEW_hero_buddha_statue"
    if bpy.data.collections.get(collection_name):
        raise SystemExit("Retopology review collection already exists; use a fresh source .blend.")

    op = getattr(bpy.ops.object, "quadriflow_remesh", None)
    if op is None:
        raise SystemExit("This Blender build does not expose object.quadriflow_remesh.")

    # Evaluate Multires and all sculpt modifiers without applying them to the source object.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        mesh_copy = evaluated_mesh.copy()
    finally:
        evaluated.to_mesh_clear()

    review_collection = bpy.data.collections.new(collection_name)
    bpy.context.scene.collection.children.link(review_collection)
    retopo = bpy.data.objects.new("retopo_auto_buddha_statue_body", mesh_copy)
    review_collection.objects.link(retopo)
    retopo.matrix_world = source.matrix_world.copy()
    activate(retopo)

    if not op.poll():
        raise SystemExit("Quadriflow cannot run in the current object context.")
    available = op.get_rna_type().properties.keys()
    candidates = {
        "target_faces": args.target_faces,
        "use_mesh_symmetry": True,
        "use_preserve_sharp": False,
        "use_preserve_mesh_boundary": False,
        "use_mesh_boundary": False,
        "preserve_attributes": False,
    }
    kwargs = {key: value for key, value in candidates.items() if key in available}
    op(**kwargs)

    retopo.name = "retopo_auto_buddha_statue_body"
    retopo.data.name = "retopo_auto_buddha_statue_body_quad_mesh"
    shrinkwrap = retopo.modifiers.new("TEMP_shrinkwrap_to_final_sculpt", "SHRINKWRAP")
    shrinkwrap.target = source
    if hasattr(shrinkwrap, "wrap_method"):
        shrinkwrap.wrap_method = "NEAREST_SURFACEPOINT"
    shrinkwrap.offset = args.shrinkwrap_offset

    quad_faces = sum(1 for polygon in retopo.data.polygons if len(polygon.vertices) == 4)
    non_quad_faces = len(retopo.data.polygons) - quad_faces
    retopo["topology_status"] = "AUTO_QUAD_REQUIRES_MANUAL_EDGE_FLOW_AND_MANIFOLD_REVIEW"
    retopo["source_sculpt"] = source.name
    retopo["target_face_budget"] = args.target_faces
    retopo["quad_faces_before_manual_cleanup"] = quad_faces
    retopo["non_quad_faces_before_manual_cleanup"] = non_quad_faces
    retopo["manual_review_required"] = True

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out_path)
    print("BUDDHA RETOPOLOGY REVIEW FILE:", out_path)
    print("Faces:", len(retopo.data.polygons), "| quads:", quad_faces, "| non-quads:", non_quad_faces)
    print("Source sculpt was evaluated, not modified.")
    print("IMPORTANT: inspect poles, density, symmetry, boundaries, hands, knees, face and robe flow manually.")


if __name__ == "__main__":
    main()
