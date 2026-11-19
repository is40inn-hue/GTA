#!/usr/bin/env python3
"""Check RC4.4 travel/scene ground against shipped COL1 + IPL, without a GPU.

This is static geometry evidence, not a physics or visual playtest. It checks
floor coverage and a conservative car body against the district's COL meshes,
boxes and spheres. It does not simulate suspension, native steering or traffic.
"""
from __future__ import annotations
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def district_bytes(folder, suffix):
    manifest = json.loads((folder / 'manifest.json').read_text())
    entry = next(e for e in manifest['files'] if e['fsPath'].endswith(suffix))
    return b''.join((folder / part['path']).read_bytes() for part in entry['chunks'])


GROUND_PREFIXES = ('oceanrda', 'od_oceanrdn1', 'miamiland', 'odhighsand', 'odlowsand')
QUATERNION_SOURCE = ('https://git.shihaam.dev/archivemirrors/re3/src/commit/'
                     '50f0c7a1dcad33ac3d38d6e37faca3d16d222aaa/src/core/FileLoader.cpp')
IMPORTER_SOURCE = 'https://github.com/Parik27/DragonFF/blob/master/ops/map_importer.py'


def district_collision(folder):
    raw = district_bytes(folder, '/oceandrv.col')
    models = {}
    offset = 0
    while offset < len(raw):
        assert raw[offset:offset + 4] == b'COLL', 'Expected original COL1'
        length = struct.unpack_from('<I', raw, offset + 4)[0]
        name = raw[offset + 8:offset + 30].split(b'\0')[0].decode().lower()
        cursor = offset + 72
        count = struct.unpack_from('<I', raw, cursor)[0]
        cursor += 4
        spheres = [struct.unpack_from('<4f4B', raw, cursor + i * 20)[:4] for i in range(count)]
        cursor += count * 20
        count = struct.unpack_from('<I', raw, cursor)[0]
        cursor += 4 + count * 24  # lines are suspension probes, not obstacles
        count = struct.unpack_from('<I', raw, cursor)[0]
        cursor += 4
        boxes = [struct.unpack_from('<6f4B', raw, cursor + i * 28)[:6] for i in range(count)]
        cursor += count * 28
        count = struct.unpack_from('<I', raw, cursor)[0]
        cursor += 4
        vertices = [struct.unpack_from('<3f', raw, cursor + i * 12) for i in range(count)]
        cursor += count * 12
        count = struct.unpack_from('<I', raw, cursor)[0]
        cursor += 4
        faces = [struct.unpack_from('<3I4B', raw, cursor + i * 16)[:3] for i in range(count)]
        assert cursor + count * 16 == offset + 8 + length, name
        models[name] = (vertices, faces, boxes, spheres)
        offset += 8 + length
    triangles, spheres_out = [], []
    for line in district_bytes(folder, '/oceandrv.ipl').decode().splitlines():
        parts = [p.strip() for p in line.split(',')]
        if len(parts) != 13 or parts[1].lower() not in models:
            continue
        name = parts[1].lower()
        pos = tuple(map(float, parts[3:6]))
        scale = tuple(map(float, parts[6:9]))
        qx, qy, qz, qw = map(float, parts[9:13])
        # IPL stores the inverse of the active world rotation. Native FileLoader
        # uses angle=-2*acos(qw), so conjugate the vector part here. A positive
        # rotation puts Colony's facade across the road, a false obstruction.
        qx, qy, qz = -qx, -qy, -qz

        def world(vertex):
            x, y, z = (vertex[i] * scale[i] for i in range(3))
            tx, ty, tz = 2 * (qy*z-qz*y), 2 * (qz*x-qx*z), 2 * (qx*y-qy*x)
            return (x+qw*tx+qy*tz-qz*ty+pos[0], y+qw*ty+qz*tx-qx*tz+pos[1], z+qw*tz+qx*ty-qy*tx+pos[2])

        vertices, faces, boxes, spheres = models[name]
        transformed = list(map(world, vertices))
        for face in faces:
            tri = tuple(transformed[i] for i in face)
            triangles.append((name, tri))
        for box in boxes:
            corners = [world((x,y,z)) for z in (box[2],box[5])
                       for y in (box[1],box[4]) for x in (box[0],box[3])]
            for face in ((0,1,3),(0,3,2),(4,6,7),(4,7,5),
                         (0,4,5),(0,5,1),(2,3,7),(2,7,6),
                         (0,2,6),(0,6,4),(1,5,7),(1,7,3)):
                triangles.append((name,tuple(corners[i] for i in face)))
        for radius,x,y,z in spheres:
            spheres_out.append((name,world((x,y,z)),radius*max(scale)))
    return triangles, spheres_out


def ground_triangles(folder):
    return [(name,tri) for name,tri in district_collision(folder)[0]
            if name.startswith(GROUND_PREFIXES)
            and min(p[2] for p in tri)>7 and max(p[2] for p in tri)<12]


def triangle_box_overlap(triangle, half):
    """Separating-axis test; triangle is already in the car box's local frame."""
    def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    edges = [tuple(triangle[(i+1)%3][j]-triangle[i][j] for j in range(3)) for i in range(3)]
    axes = [(1,0,0),(0,1,0),(0,0,1),cross(edges[0],edges[1])]
    axes.extend(cross(edge,axis) for edge in edges for axis in [(1,0,0),(0,1,0),(0,0,1)])
    for axis in axes:
        if sum(v*v for v in axis)<1e-16: continue
        projected = [sum(a*b for a,b in zip(point,axis)) for point in triangle]
        radius = sum(abs(a)*h for a,h in zip(axis,half))
        if min(projected)>radius+1e-7 or max(projected)<-radius-1e-7: return False
    return True


def route_clearance(route, floor, triangles, spheres):
    # Width 2.4m, length 5.0m, body between 0.2 and 2.4m over road. At 0.5m
    # intervals these boxes overlap along the path rather than missing a thin wall.
    half = (1.2,2.5,1.1)
    bounded = [(name,tri,tuple(min(p[i] for p in tri) for i in range(3)),
                tuple(max(p[i] for p in tri) for i in range(3))) for name,tri in triangles]
    overlaps, missing, tested = [], [], 0
    for segment,(a,b) in enumerate(zip(route,route[1:])):
        length=math.hypot(b[0]-a[0],b[1]-a[1]); forward=((b[0]-a[0])/length,(b[1]-a[1])/length)
        right=(forward[1],-forward[0]); steps=max(1,math.ceil(length/0.5))
        extent=(abs(right[0])*half[0]+abs(forward[0])*half[1],abs(right[1])*half[0]+abs(forward[1])*half[1])
        for step in range(steps+1):
            x=a[0]+(b[0]-a[0])*step/steps; y=a[1]+(b[1]-a[1])*step/steps
            hits=floor_hits(floor,x,y)
            if not hits:
                missing.append({'segment':segment,'x':round(x,3),'y':round(y,3)})
                continue
            ground=max(z for _,z in hits); z=ground+1.3; tested+=1
            lower=(x-extent[0],y-extent[1],z-half[2]); upper=(x+extent[0],y+extent[1],z+half[2])
            def local(p): return ((p[0]-x)*right[0]+(p[1]-y)*right[1],(p[0]-x)*forward[0]+(p[1]-y)*forward[1],p[2]-z)
            for name,tri,mn,mx in bounded:
                if any(mx[i]<lower[i] or mn[i]>upper[i] for i in range(3)): continue
                if triangle_box_overlap(tuple(map(local,tri)),half):
                    overlaps.append({'model':name,'segment':segment,'x':round(x,3),'y':round(y,3),'groundZ':round(ground,4),'collisionZ':[round(mn[2],4),round(mx[2],4)]})
            for name,centre,radius in spheres:
                p=local(centre)
                if sum(max(abs(p[i])-half[i],0)**2 for i in range(3))<radius**2:
                    overlaps.append({'model':name,'segment':segment,'x':round(x,3),'y':round(y,3),'sphere':True})
    return {'checkedCarVolumes':tested,'sampleStepMetres':0.5,'bodyWidthMetres':2.4,
            'bodyLengthMetres':5,'heightAboveRoadMetres':[0.2,2.4],'missingFloor':missing,'overlaps':overlaps}


def floor_hits(triangles, x, y):
    hits = []
    for name, ((ax,ay,az),(bx,by,bz),(cx,cy,cz)) in triangles:
        den = (by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(den) < 1e-8:
            continue
        u = ((by-cy)*(x-cx)+(cx-bx)*(y-cy))/den
        v = ((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/den
        w = 1-u-v
        if min(u,v,w) >= -1e-5:
            hits.append((name, u*az+v*bz+w*cz))
    return hits


def audit():
    config = json.loads((ROOT / 'dist/native-vc/range-config.json').read_text())
    all_triangles, spheres = district_collision(ROOT / 'dist/native-vc/runtime/vice-district')
    triangles = [(name,tri) for name,tri in all_triangles if name.startswith(GROUND_PREFIXES)
                 and min(p[2] for p in tri)>7 and max(p[2] for p in tri)<12]
    car = config['scenes'][1]
    route = [car['positions'][0], *car['route']]
    queries = []
    distance = 0
    for segment, (a,b) in enumerate(zip(route, route[1:])):
        length = math.hypot(b[0]-a[0],b[1]-a[1])
        distance += length
        steps = max(1, math.ceil(length / 8))
        for i in range(steps + 1):
            x, y = a[0]+(b[0]-a[0])*i/steps, a[1]+(b[1]-a[1])*i/steps
            # A narrow car-sized ground footprint, not only a centre dot.
            for dx,dy in [(0,0),(-1,0),(1,0),(0,-1),(0,1)]:
                queries.append((f'route-{segment}-{i}',x+dx,y+dy))
    anchors = []
    for scene in (config['scenes'][0], config['scenes'][2]):
        anchors.extend([(f"C{scene['scene']}-spawn",scene['spawn']), (f"C{scene['scene']}-pickup",scene['pickup'])])
    anchors.append(('C1-landing',config['arrival']['landingPosition']))
    anchors.extend((f'C1-crew-{i}',p) for i,p in enumerate(config['arrival']['foreground']))
    anchors.extend((f'C3-car-{i}',p) for i,p in enumerate(config['scenes'][2]['positions'][:2]))
    queries.extend((name,point[0],point[1]) for name,point in anchors)
    evidence, missing = [], []
    for name,x,y in queries:
        hits = floor_hits(triangles,x,y)
        if not hits:
            missing.append({'name':name,'x':x,'y':y})
        else:
            model,z = max(hits,key=lambda value:value[1])
            evidence.append({'name':name,'x':round(x,3),'y':round(y,3),'z':round(z,4),'model':model})
    clearance = route_clearance(route,triangles,all_triangles,spheres)
    colony_step = [point for name,tri in all_triangles if name=='od_colony_dy'
                   and min(p[2] for p in tri)>7 and max(p[2] for p in tri)<12 for point in tri]
    return {
        'runtimeExecuted':False,
        'method':'COL1 floor intersection and static triangle/box/sphere car-body overlap; native physics/traffic not simulated',
        'iplRotation':'conjugate quaternion, matching native negative axis-angle and DragonFF negative rotW',
        'rotationSources':[QUATERNION_SOURCE,IMPORTER_SOURCE],
        'routeMetres':round(distance,2),
        'routeOneDirection':all(b[1]<a[1] for a,b in zip(route,route[1:])),
        'checkedPoints':len(queries), 'coveredPoints':len(evidence), 'missing':missing,
        'floorModels':sorted({row['model'] for row in evidence}),
        'minFloorZ':min(row['z'] for row in evidence),
        'maxFloorZ':max(row['z'] for row in evidence),
        'anchors':[row for row in evidence if not row['name'].startswith('route-')],
        'clearance':clearance,
        'colonyStep':{
            'bounds':[[round(min(p[i] for p in colony_step),4),round(max(p[i] for p in colony_step),4)] for i in range(3)],
            'heightAboveStreetMetres':round(max(p[2] for p in colony_step)-9.86154556,4),
            'explanation':'The 1.17m step is west of the road with the correct IPL rotation; it is included in the clearance check.'
        },
        'limits':['Shipped Ocean Drive district collision only; additional scripted props and dynamic vehicles are not part of this audit.',
                  'Straight waypoint connectors sampled every 0.5m with overlapping car volumes; free player steering can leave that corridor.',
                  'No WebGL/native physics or visual landing/door animation was executed.']
    }


if __name__ == '__main__':
    result = audit()
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(1 if result['missing'] or result['clearance']['overlaps'] or result['clearance']['missingFloor'] else 0)
