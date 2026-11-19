#!/usr/bin/env python3
"""Static shipped-world checks for C1's pickup and foreground approach area.

Native doors, avoidance and camera playback are deliberately not claimed here.
"""
import json
import math
from pathlib import Path
import runpy

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
STREET=runpy.run_path(str(HERE/'check-rc46-street.py'))
G=STREET['GEOMETRY']


def audit():
    config=json.loads((ROOT/'dist/native-vc/range-config.json').read_text())
    district=ROOT/'dist/native-vc/runtime/vice-district'
    triangles,spheres=G['district_collision'](district);floor=G['ground_triangles'](district)
    spawn=config['scenes'][0]['spawn'];pickup=config['scenes'][0]['pickup']
    landing=config['arrival']['landingPosition']
    # World-space samples around the settled body; exact animated exit paths
    # remain native engine work. Both flanks and both longitudinal sides fit.
    approaches=[]
    for x,y in [(landing[0]-2.5,landing[1]-1.5),(landing[0]+2.5,landing[1]-1.5),
                (landing[0]-2.5,landing[1]+1.5),(landing[0]+2.5,landing[1]+1.5)]:
        check=STREET['walk_clearance']((x,y),spawn,floor,triangles,spheres)
        approaches.append({'sampleStart':[x,y],'destination':spawn[:2],'clearance':check})
    pickupCheck=STREET['walk_clearance'](spawn,pickup,floor,triangles,spheres)
    checks=[pickupCheck]+[x['clearance'] for x in approaches]
    valid=all(not x['missingFloor'] and not x['overlaps'] for x in checks)
    return {'nativeRuntimeExecuted':False,'valid':valid,
            'method':'Shipped COL1/IPL floor and human-body clearance sampling',
            'initialPickup':{'position':pickup,'forwardMetres':3,'distanceFromHelicopterCentre':math.hypot(pickup[0]-landing[0],pickup[1]-landing[1]),'clearance':pickupCheck},
            'foregroundApproaches':approaches,
            'limits':['Door exit trajectories and dynamic helicopter/character collisions require native engine playback.',
                      'The release-time pickup uses the actual player transform; this verifies its initial spawn-facing corridor only.',
                      'Four normal-human clearance corridors are not a collision test for Pudge’s custom silhouette.']}


if __name__=='__main__':
    report=audit();print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report['valid'] else 1)
