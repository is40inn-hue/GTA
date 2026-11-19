#!/usr/bin/env python3
"""Check added RC4.6 street actors against the actual shipped collision meshes.

This audit checks spawn/destination corridors, not native AI or GPU playback.
"""
import json
import math
from pathlib import Path
import runpy

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
GEOMETRY=runpy.run_path(str(HERE/'check-rc44-road.py'))


def walk_clearance(start,end,floor,triangles,spheres):
    half=(.35,.35,.9)
    length=math.hypot(end[0]-start[0],end[1]-start[1])
    count=max(1,math.ceil(length/.5))
    prepared=[(name,tri,tuple(min(p[i] for p in tri) for i in range(3)),
               tuple(max(p[i] for p in tri) for i in range(3))) for name,tri in triangles]
    missing=[];overlaps=[];tested=0
    for n in range(count+1):
        x=start[0]+(end[0]-start[0])*n/count;y=start[1]+(end[1]-start[1])*n/count
        hits=GEOMETRY['floor_hits'](floor,x,y)
        if not hits:missing.append([round(x,3),round(y,3)]);continue
        z=max(h[1] for h in hits)+1.;tested+=1
        centre=(x,y,z);low=tuple(centre[i]-half[i] for i in range(3));high=tuple(centre[i]+half[i] for i in range(3))
        for name,tri,mn,mx in prepared:
            if any(mx[i]<low[i] or mn[i]>high[i] for i in range(3)):continue
            relative=tuple(tuple(p[i]-centre[i] for i in range(3)) for p in tri)
            if GEOMETRY['triangle_box_overlap'](relative,half):
                overlaps.append({'model':name,'x':round(x,3),'y':round(y,3)})
        for name,location,radius in spheres:
            relative=tuple(location[i]-centre[i] for i in range(3))
            if sum(max(abs(relative[i])-half[i],0)**2 for i in range(3))<radius**2:
                overlaps.append({'model':name,'x':round(x,3),'y':round(y,3),'sphere':True})
    return {'checkedPedVolumes':tested,'bodyWidthMetres':.7,'bodyHeightMetres':1.8,
            'sampleStepMetres':.5,'missingFloor':missing,'overlaps':overlaps}


def audit():
    config=json.loads((ROOT/'dist/native-vc/range-config.json').read_text())
    district=ROOT/'dist/native-vc/runtime/vice-district'
    triangles,spheres=GEOMETRY['district_collision'](district)
    floor=GEOMETRY['ground_triangles'](district)
    cars=[];walkers=[]
    for actor in config['street']['traffic']:
        report=GEOMETRY['route_clearance']([actor['position'],actor['destination']],floor,triangles,spheres)
        cars.append({'model':actor['model'],'northbound':actor['destination'][1]>actor['position'][1],
                     'spawn':actor['position'],'destination':actor['destination'],'clearance':report})
    for actor in config['street']['walkers']:
        walkers.append({'model':actor['model'],'spawn':actor['position'],'destination':actor['destination'],
                        'clearance':walk_clearance(actor['position'],actor['destination'],floor,triangles,spheres)})
    valid=all(not a['clearance']['missingFloor'] and not a['clearance']['overlaps'] for a in cars+walkers)
    return {'nativeRuntimeExecuted':False,'method':'Shipped COL1/IPL floor and body-clearance sampling',
            'valid':valid,'traffic':cars,'walkers':walkers,
            'limits':['Native traffic follows restored road nodes and may deviate from a straight audited connector.',
                      'This audit cannot prove native steering, animation, visibility or dynamic vehicle clearance.']}


if __name__=='__main__':
    report=audit();print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if report['valid'] else 1)
