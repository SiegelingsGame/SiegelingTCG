"""Stage 3 of the Siegeling 3D model pipeline: raw generated mesh -> rigged, animated GLB.

Run headless (Blender 4.2+):

  blender -b -P tools/models/blender/rig_animate.py -- \
      --in tools/models/work/draco/raw.glb \
      --out tools/models/work/draco/rigged.glb \
      --plan quadruped [--front -Y] [--tris 6000]

The same functions can be called through Blender MCP from a live Blender
session, which is the intended way to fix a model by hand after the
automatic pass (move a bone, repaint a weight, re-key a clip, re-export).

Why a template rig instead of an AI auto-rigger: image-to-3D output has no
consistent topology or limb count. A bone layout placed from the mesh's
bounding box (body plan picked per creature in registry.json) plus
bone-heat weights gets every Siegeling moving, and gives the hand pass a
known skeleton. Swap `build_armature` for UniRig or similar later without
touching the clip or export code.

Clips match the 2D Siege sprite poses (idle, walk, attack, hurt, cheer,
fainted). Swarm only needs `idle` and `walk` (it matches /idle|stand|breath/
and /walk|run|move/); the rest are for the Battle Table and the Siege mode.
"""
import argparse
import math
import sys

import bpy
from mathutils import Vector

FPS = 30


# ---------------------------------------------------------------- mesh prep

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def import_mesh(path):
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise SystemExit('no mesh in ' + path)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    # Generators wrap the mesh in empties with odd transforms; bake them in.
    obj.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o is not obj:
            bpy.data.objects.remove(o, do_unlink=True)
    obj.name = 'Siegeling'
    return obj


def face_front(obj, front):
    """Rotate so the creature faces -Y (glTF +Z, what three.js treats as forward)."""
    turn = {'-Y': 0, '+X': 90, '+Y': 180, '-X': -90}[front]
    if turn:
        obj.rotation_euler[2] = math.radians(turn)
        bpy.ops.object.transform_apply(rotation=True)


def clean_and_decimate(obj, target_tris):
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    # Marching-cubes output is full of coincident verts; they break bone heat.
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.delete_loose()
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > target_tris:
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = target_tris / tris
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Feet on the origin, centred: the game recentres too, but bones are placed
    # from these bounds.
    lo, hi = bounds(obj)
    obj.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    bpy.ops.object.transform_apply(location=True)
    bpy.ops.object.shade_smooth()


def bounds(obj):
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi


# ---------------------------------------------------------------- rig templates
# Points are fractions of the bounding box: x 0..1 left->right, y 0..1
# front(head)->back(tail), z 0..1 ground->top. Each bone is (name, parent, head, tail).

def _legs(front_y, back_y, top_z):
    out = []
    for side, x in (('L', 0.28), ('R', 0.72)):
        for end, y in (('F', front_y), ('B', back_y)):
            out.append(('leg_%s%s_upper' % (end, side), 'hips' if end == 'B' else 'chest',
                        (x, y, top_z), (x, y, top_z * 0.45)))
            out.append(('leg_%s%s_lower' % (end, side), 'leg_%s%s_upper' % (end, side),
                        (x, y, top_z * 0.45), (x, y, 0.0)))
    return out


TEMPLATES = {
    'quadruped': [
        ('root', None, (0.5, 0.5, 0.0), (0.5, 0.5, 0.12)),
        ('hips', 'root', (0.5, 0.68, 0.45), (0.5, 0.52, 0.48)),
        ('chest', 'hips', (0.5, 0.52, 0.48), (0.5, 0.32, 0.52)),
        ('neck', 'chest', (0.5, 0.32, 0.52), (0.5, 0.2, 0.7)),
        ('head', 'neck', (0.5, 0.2, 0.7), (0.5, 0.02, 0.8)),
        ('tail_1', 'hips', (0.5, 0.68, 0.45), (0.5, 0.84, 0.42)),
        ('tail_2', 'tail_1', (0.5, 0.84, 0.42), (0.5, 1.0, 0.4)),
    ] + _legs(0.32, 0.66, 0.42),
    'biped': [
        ('root', None, (0.5, 0.5, 0.0), (0.5, 0.5, 0.1)),
        ('hips', 'root', (0.5, 0.5, 0.45), (0.5, 0.5, 0.6)),
        ('chest', 'hips', (0.5, 0.5, 0.6), (0.5, 0.5, 0.78)),
        ('head', 'chest', (0.5, 0.5, 0.78), (0.5, 0.45, 1.0)),
        ('arm_L', 'chest', (0.3, 0.5, 0.74), (0.05, 0.5, 0.55)),
        ('arm_R', 'chest', (0.7, 0.5, 0.74), (0.95, 0.5, 0.55)),
        ('leg_L_upper', 'hips', (0.38, 0.5, 0.45), (0.38, 0.5, 0.22)),
        ('leg_L_lower', 'leg_L_upper', (0.38, 0.5, 0.22), (0.38, 0.5, 0.0)),
        ('leg_R_upper', 'hips', (0.62, 0.5, 0.45), (0.62, 0.5, 0.22)),
        ('leg_R_lower', 'leg_R_upper', (0.62, 0.5, 0.22), (0.62, 0.5, 0.0)),
    ],
    'serpent': [('root', None, (0.5, 0.5, 0.0), (0.5, 0.5, 0.1))] + [
        ('seg_%d' % i, 'root' if i == 0 else 'seg_%d' % (i - 1),
         (0.5, i / 6.0, 0.35), (0.5, (i + 1) / 6.0, 0.3))
        for i in range(6)
    ],
    'floater': [
        ('root', None, (0.5, 0.5, 0.0), (0.5, 0.5, 0.1)),
        ('body', 'root', (0.5, 0.5, 0.2), (0.5, 0.5, 0.65)),
        ('top', 'body', (0.5, 0.5, 0.65), (0.5, 0.5, 1.0)),
    ],
}
TEMPLATES['winged'] = TEMPLATES['quadruped'] + [
    ('wing_L', 'chest', (0.4, 0.45, 0.6), (0.0, 0.5, 0.85)),
    ('wing_R', 'chest', (0.6, 0.45, 0.6), (1.0, 0.5, 0.85)),
]
TEMPLATES['blob'] = TEMPLATES['floater']


def build_armature(obj, plan):
    lo, hi = bounds(obj)
    size = hi - lo

    def at(p):
        return Vector((lo.x + p[0] * size.x, lo.y + p[1] * size.y, lo.z + p[2] * size.z))

    arm_data = bpy.data.armatures.new('Rig')
    arm = bpy.data.objects.new('Rig', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name, parent, head, tail in TEMPLATES[plan]:
        b = arm_data.edit_bones.new(name)
        b.head, b.tail = at(head), at(tail)
        if parent:
            b.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    # Bone heat silently gives up on non-manifold meshes, leaving verts with no
    # weight (they stay frozen in place). Fall back to envelopes in that case.
    unweighted = sum(1 for v in obj.data.vertices if not v.groups)
    if unweighted > len(obj.data.vertices) * 0.02:
        print('bone heat left %d verts unweighted; using envelope weights' % unweighted)
        for vg in list(obj.vertex_groups):
            obj.vertex_groups.remove(vg)
        bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')
    return arm


# ---------------------------------------------------------------- clips
# Rotations are in each bone's local axes: X swings a limb forward/back (or
# flaps a sideways wing), Z sways a horizontal tail or spine. Wing L/R share a
# sign because their local X axes mirror.
# Each clip is {bone: [(frame, (rx, ry, rz) degrees)]} plus optional root
# location keys. Bones missing from a plan are skipped, so one clip table
# serves every template.

def clip_table(height):
    up = height * 0.06
    return {
        'idle': (60, {
            'chest': [(0, (0, 0, 0)), (30, (3, 0, 0)), (60, (0, 0, 0))],
            'head': [(0, (0, 0, 0)), (30, (-4, 0, 2)), (60, (0, 0, 0))],
            'tail_1': [(0, (0, 0, -8)), (30, (0, 0, 8)), (60, (0, 0, -8))],
            'wing_L': [(0, (0, 0, 0)), (30, (8, 0, 0)), (60, (0, 0, 0))],
            'wing_R': [(0, (0, 0, 0)), (30, (8, 0, 0)), (60, (0, 0, 0))],
            'body': [(0, (0, 0, 0)), (30, (2, 0, 0)), (60, (0, 0, 0))],
            'seg_2': [(0, (0, 0, -6)), (30, (0, 0, 6)), (60, (0, 0, -6))],
        }, {'root': [(0, 0), (30, up * 0.3), (60, 0)]}),
        'walk': (30, {
            'leg_FL_upper': [(0, (25, 0, 0)), (15, (-25, 0, 0)), (30, (25, 0, 0))],
            'leg_BR_upper': [(0, (25, 0, 0)), (15, (-25, 0, 0)), (30, (25, 0, 0))],
            'leg_FR_upper': [(0, (-25, 0, 0)), (15, (25, 0, 0)), (30, (-25, 0, 0))],
            'leg_BL_upper': [(0, (-25, 0, 0)), (15, (25, 0, 0)), (30, (-25, 0, 0))],
            'leg_L_upper': [(0, (25, 0, 0)), (15, (-25, 0, 0)), (30, (25, 0, 0))],
            'leg_R_upper': [(0, (-25, 0, 0)), (15, (25, 0, 0)), (30, (-25, 0, 0))],
            'arm_L': [(0, (-20, 0, 0)), (15, (20, 0, 0)), (30, (-20, 0, 0))],
            'arm_R': [(0, (20, 0, 0)), (15, (-20, 0, 0)), (30, (20, 0, 0))],
            'wing_L': [(0, (25, 0, 0)), (8, (-20, 0, 0)), (15, (25, 0, 0)), (23, (-20, 0, 0)), (30, (25, 0, 0))],
            'wing_R': [(0, (25, 0, 0)), (8, (-20, 0, 0)), (15, (25, 0, 0)), (23, (-20, 0, 0)), (30, (25, 0, 0))],
            'tail_1': [(0, (0, 0, -12)), (15, (0, 0, 12)), (30, (0, 0, -12))],
            'seg_1': [(0, (0, 0, -15)), (15, (0, 0, 15)), (30, (0, 0, -15))],
            'seg_3': [(0, (0, 0, 15)), (15, (0, 0, -15)), (30, (0, 0, 15))],
            'seg_5': [(0, (0, 0, -15)), (15, (0, 0, 15)), (30, (0, 0, -15))],
        }, {'root': [(0, 0), (8, up), (15, 0), (23, up), (30, 0)]}),
        'attack': (18, {
            'chest': [(0, (0, 0, 0)), (6, (-12, 0, 0)), (10, (14, 0, 0)), (18, (0, 0, 0))],
            'head': [(0, (0, 0, 0)), (6, (-15, 0, 0)), (10, (20, 0, 0)), (18, (0, 0, 0))],
            'body': [(0, (0, 0, 0)), (6, (-15, 0, 0)), (10, (18, 0, 0)), (18, (0, 0, 0))],
            'arm_R': [(0, (0, 0, 0)), (6, (-70, 0, 0)), (10, (40, 0, 0)), (18, (0, 0, 0))],
            'seg_0': [(0, (0, 0, 0)), (6, (-20, 0, 0)), (10, (15, 0, 0)), (18, (0, 0, 0))],
        }, {}),
        'hurt': (12, {
            'chest': [(0, (0, 0, 0)), (3, (10, 0, 6)), (12, (0, 0, 0))],
            'head': [(0, (0, 0, 0)), (3, (-18, 0, -10)), (12, (0, 0, 0))],
            'body': [(0, (0, 0, 0)), (3, (12, 0, 8)), (12, (0, 0, 0))],
        }, {}),
        'cheer': (24, {
            'head': [(0, (0, 0, 0)), (8, (-20, 0, 0)), (16, (-20, 0, 0)), (24, (0, 0, 0))],
            'arm_L': [(0, (0, 0, 0)), (8, (0, -60, 0)), (16, (0, -60, 0)), (24, (0, 0, 0))],
            'arm_R': [(0, (0, 0, 0)), (8, (0, 60, 0)), (16, (0, 60, 0)), (24, (0, 0, 0))],
            'wing_L': [(0, (0, 0, 0)), (8, (35, 0, 0)), (16, (-15, 0, 0)), (24, (0, 0, 0))],
            'wing_R': [(0, (0, 0, 0)), (8, (35, 0, 0)), (16, (-15, 0, 0)), (24, (0, 0, 0))],
        }, {'root': [(0, 0), (8, up * 2.5), (16, 0), (20, up), (24, 0)]}),
        # Ends lying on its side and holds: the game freezes the last frame.
        'fainted': (30, {
            'root': [(0, (0, 0, 0)), (20, (0, 0, 85)), (30, (0, 0, 90))],
            'head': [(0, (0, 0, 0)), (30, (25, 0, 0))],
        }, {'root': [(0, 0), (8, up), (20, 0)]}),
    }


def bake_clips(arm, height):
    arm.animation_data_create()
    names = set(b.name for b in arm.pose.bones)
    for clip, (length, rots, locs) in clip_table(height).items():
        action = bpy.data.actions.new(clip)
        arm.animation_data.action = action
        for pb in arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        for bone, keys in rots.items():
            if bone not in names:
                continue
            pb = arm.pose.bones[bone]
            for frame, deg in keys:
                pb.rotation_euler = [math.radians(d) for d in deg]
                pb.keyframe_insert('rotation_euler', frame=frame)
        for bone, keys in locs.items():
            if bone not in names:
                continue
            pb = arm.pose.bones[bone]
            for frame, z in keys:
                # Root bone points up, so its local Y is world up.
                pb.location = (0, z, 0)
                pb.keyframe_insert('location', frame=frame)
        if not action.fcurves:
            # Template has none of this clip's bones; keep a still pose so the
            # clip name still exists for the game to look up.
            arm.pose.bones['root'].keyframe_insert('rotation_euler', frame=0)
            arm.pose.bones['root'].keyframe_insert('rotation_euler', frame=length)
        action.frame_range = (0, length)
        action.use_fake_user = True
        track = arm.animation_data.nla_tracks.new()
        track.name = clip
        track.strips.new(clip, 0, action)
        track.mute = True
    arm.animation_data.action = None


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_skins=True,
        export_morph=False,
        export_yup=True,
    )


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--plan', default='quadruped', choices=sorted(TEMPLATES))
    ap.add_argument('--front', default='-Y', choices=['-Y', '+Y', '+X', '-X'])
    ap.add_argument('--tris', type=int, default=6000)
    a = ap.parse_args(argv)

    reset_scene()
    obj = import_mesh(a.src)
    face_front(obj, a.front)
    clean_and_decimate(obj, a.tris)
    lo, hi = bounds(obj)
    arm = build_armature(obj, a.plan)
    bake_clips(arm, hi.z - lo.z)
    export(a.out)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print('wrote %s: %d tris, %d bones, plan %s' % (a.out, tris, len(arm.data.bones), a.plan))


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
