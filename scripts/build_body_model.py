import bpy, re, json, sys, bmesh
TARGET_TRIS = int(sys.argv[sys.argv.index("--")+1]) if "--" in sys.argv else 140000

# NB: Z-Anatomy labels the trapezius parts opposite to where they sit on this model
# (its "ascending part" is the neck/upper fibres, its "descending part" the mid/lower back),
# so those two names are mapped by position, not by label.
RULES = [  # (group, regex on lowercase base name) first match wins
 ("chest", r"pectoralis (major|minor)|of pectoralis major"),
 ("front_delts", r"clavicular part of deltoid"),
 ("side_delts", r"acromial part of deltoid"),
 ("rear_delts", r"scapular spinal part of deltoid"),
 ("traps", r"ascending part of trapezius|sternocleidomastoid|levator scapulae|splenius"),
 ("upper_back", r"transverse part of trapezius|descending part of trapezius|rhomboid|infraspinatus|teres (major|minor)|supraspinatus"),
 ("lats", r"latissimus dorsi"),
 ("lower_back", r"iliocostalis (lumborum|thoracis)|longissimus thoracis|spinalis thoracis|quadratus lumborum|multifidus lumborum"),
 ("biceps", r"biceps brachii|brachialis|coracobrachialis"),
 ("triceps", r"triceps brachii|anconeus"),
 ("forearms", r"brachioradialis|flexor carpi|extensor carpi|palmaris longus|pronator|supinator|flexor digitorum (profundus|superficialis)|flexor digitorum superficialis|extensor digitorum$|extensor digiti minimi|extensor indicis|extensor pollicis|abductor pollicis longus|flexor pollicis longus|head of flexor digitorum"),
 ("abs", r"rectus abdominis|pyramidalis"),
 ("obliques", r"external abdominal oblique|serratus anterior"),
 ("glutes", r"gluteus (maximus|medius|minimus)|tensor fasciae latae"),
 ("quads", r"rectus femoris|vastus|sartorius"),
 ("hamstrings", r"biceps femoris|semimembranosus muscle|semitendinosus"),
 ("adductors", r"adductor (magnus|longus|brevis|minimus)|gracilis|pectineus"),
 ("calves", r"gastrocnemius|soleus|plantaris|tibialis|fibularis|extensor digitorum longus$|extensor hallucis longus|flexor digitorum longus|flexor hallucis longus|popliteus"),
 ("base", r"calcaneal tendon|palmar aponeurosis|plantar aponeurosis|inguinal ligament|epicranial aponeurosis|frontalis|occipitalis|temporalis|masseter|orbicularis|zygomaticus|nasalis|mentalis|depressor|levator labii|levator anguli|risorius|procerus|bucinator|corrugator"),
]
SKIP_BURSA = re.compile(r"bursa|sheath|septum|retinaculum|fascia(?!e latae)$|tarsus|trochlea|tendinous ring")

def classify(name):
    m = re.match(r"(.*)\.(l|r)(\.\d+)?$", name)
    if not m: return None
    base = m.group(1).lower()
    if SKIP_BURSA.search(base): return None
    for g, rx in RULES:
        if re.search(rx, base): return g
    return None

col = bpy.data.collections["4: Muscular system"]
def allobjs(c):
    for o in c.objects: yield o
    for ch in c.children: yield from allobjs(ch)

dg = bpy.context.evaluated_depsgraph_get()
items = []
for o in allobjs(col):
    if o.type != "MESH": continue
    g = classify(o.name)
    if g: items.append((o, g))
print("KEPT", len(items), "of mesh objects")

# evaluated copies in world space
work = bpy.data.collections.new("work"); bpy.context.scene.collection.children.link(work)
copies = {}
total = 0
for o, g in items:
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    me.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0:
        me.flip_normals()
    me.update()
    n = bpy.data.objects.new(o.name, me); work.objects.link(n)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    copies[g] = copies.get(g, []) + [n]
    total += len(me.polygons)
print("TOTAL TRIS before", total)

# smooth skull fill under the face muscles so the head reads as a head
import mathutils
hb = [n for n in copies.get("base", []) if n.matrix_world.translation.z >= 0 or True]
pts = [v.co for n in copies.get("base", []) for v in n.data.vertices if v.co.z > 1.52]
if pts:
    lo = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=c)
    sk = bpy.context.active_object
    sk.scale = ((hi.x - lo.x) * 0.44, (hi.y - lo.y) * 0.44, (hi.z - lo.z) * 0.47)
    bpy.ops.object.transform_apply(scale=True)
    sk.name = "skullfill"
    for col2 in list(sk.users_collection): col2.objects.unlink(sk)
    work.objects.link(sk)
    copies["base"].append(sk)
    print("SKULLFILL", [round(x,3) for x in c])

ratio = min(1.0, TARGET_TRIS / max(1, total))
bpy.context.view_layer.update()
for g, objs in copies.items():
    for n in objs:
        tris = len(n.data.polygons)
        if tris <= 220: continue
        r = max(ratio, 220 / tris)
        mod = n.modifiers.new("dec", "DECIMATE"); mod.ratio = r
bpy.context.view_layer.update()

# join per group, smooth, centre feet at origin
out = bpy.data.collections.new("out"); bpy.context.scene.collection.children.link(out)
final = 0
for g, objs in copies.items():
    for n in objs:
        for mod in list(n.modifiers):
            bpy.context.view_layer.objects.active = n
            n.select_set(True)
            bpy.ops.object.modifier_apply(modifier=mod.name)
            n.select_set(False)
    bpy.ops.object.select_all(action="DESELECT")
    for n in objs: n.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = g
    bpy.ops.object.shade_smooth()
    final += len(j.data.polygons)
    print("GROUP", g, len(j.data.polygons))
print("FINAL TRIS", final)

# remove everything except the joined groups, then export
keep = set(copies_g for copies_g in copies)
for o in list(bpy.data.objects):
    if o.name not in keep: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(
    filepath=bpy.path.abspath("//../body.glb"), export_format="GLB", export_yup=True,
    export_apply=False, export_materials="NONE", export_normals=True, export_texcoords=False,
    export_cameras=False, export_lights=False,
    # Draco keeps the full triangle count at roughly a fifth of the file size; the
    # decoder ships in public/draco/ so nothing is fetched from a CDN.
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
    export_draco_position_quantization=13,
    export_draco_normal_quantization=9,
)
print("EXPORTED")
