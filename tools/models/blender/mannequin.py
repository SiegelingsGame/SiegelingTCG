"""Test mannequin: a stand-in for an image-to-3D result, for exercising stage 3+.

  blender -b -P tools/models/blender/mannequin.py -- --plan biped_tail \
      --out tools/models/work/_mannequin/raw.glb [--color ff501e]

Metaballs along the template's bones, converted to one fused, textured mesh.
Like Hunyuan3D/TRELLIS output it is a single surface with no per-limb
topology and arbitrary scale, so it tests the cleanup, bone-heat skinning,
clips and export paths honestly. It is NOT a creature model; never ship it.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from rig_animate import TEMPLATES  # noqa: E402

BBOX = {'biped': (0.8, 0.55, 1.6), 'biped_tail': (0.8, 1.1, 1.6), 'winged_biped': (1.6, 0.6, 1.6),
        'quadruped': (0.7, 1.4, 1.0), 'winged': (1.6, 1.4, 1.0), 'serpent': (0.5, 2.0, 0.6),
        'floater': (1.0, 1.0, 1.0), 'blob': (1.1, 1.0, 1.0)}


def radius(name, s):
    for pat, r in (('hips', .2), ('chest', .2), ('body', .3), ('seg_', .13), ('head', .2), ('neck', .1),
                   ('top', .2), ('tail', .08), ('wing', .07), ('arm', .07), ('leg', .08)):
        if name.startswith(pat):
            return r * s
    return 0


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', default='biped_tail', choices=sorted(BBOX))
    ap.add_argument('--out', required=True)
    ap.add_argument('--color', default='ff501e')
    a = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sx, sy, sz = BBOX[a.plan]
    s = max(sx, sy, sz) * 0.6

    def at(p):
        return Vector((-sx / 2 + p[0] * sx, -sy / 2 + p[1] * sy, p[2] * sz))

    mb = bpy.data.metaballs.new('Mannequin')
    mb.resolution = 0.025
    mb.render_resolution = 0.025
    obj = bpy.data.objects.new('Mannequin', mb)
    bpy.context.scene.collection.objects.link(obj)
    for name, _parent, h, t in TEMPLATES[a.plan]:
        r = radius(name, s)
        if not r:
            continue
        head, tail = at(h), at(t)
        d = tail - head
        el = mb.elements.new(type='CAPSULE')
        el.co = (head + tail) / 2
        el.radius = r
        el.size_x = max(d.length / 2, 0.001)
        # Capsules lie along local X; turn X onto the bone.
        el.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
        if name.startswith('wing'):
            el.type = 'ELLIPSOID'
            el.size_x, el.size_y, el.size_z = d.length / 2, 0.25 * s, 0.03 * s
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    mesh = bpy.context.view_layer.objects.active
    # Generators emit arbitrary scale and an offset origin; mimic that so the
    # rig script's normalisation is exercised.
    mesh.scale = (3.7, 3.7, 3.7)
    mesh.location = (0.4, -0.2, 1.3)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66))
    bpy.ops.object.mode_set(mode='OBJECT')

    img = bpy.data.images.new('skin', 256, 256)
    c = [int(a.color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    px = []
    for y in range(256):
        for x in range(256):
            k = 0.75 + 0.25 * ((x // 32 + y // 32) % 2)
            px += [c[0] * k, c[1] * k, c[2] * k, 1.0]
    img.pixels = px
    img.pack()
    mat = bpy.data.materials.new('skin')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    mesh.data.materials.append(mat)

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=a.out, export_format='GLB')
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    print('mannequin %s: %d tris -> %s' % (a.plan, tris, a.out))


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
