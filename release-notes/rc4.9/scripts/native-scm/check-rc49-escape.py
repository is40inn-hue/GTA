#!/usr/bin/env python3
"""Static packaged COL/IPL clearance for the bike parking bay and road connector."""
import runpy,json
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def audit():
    m=runpy.run_path(str(HERE/'check-rc46-street.py'));g=m['GEOMETRY']
    c=json.loads((ROOT/'dist/native-vc/range-config.json').read_text())
    d=ROOT/'dist/native-vc/runtime/vice-district'
    tri,spheres=g['district_collision'](d);floor=g['ground_triangles'](d)
    ride=g['route_clearance']([c['escape']['position'],c['escape']['destination']],floor,tri,spheres)
    walk=m['walk_clearance'](c['scenes'][0]['spawn'],c['escape']['position'],floor,tri,spheres)
    return {'nativeRuntimeExecuted':False,'staticOnly':True,
        'valid':not any(x['missingFloor'] or x['overlaps'] for x in [ride,walk]),
        'vehicleCorridor':ride,'humanApproach':walk,
        'limits':['Native AI can deviate from the straight audited connector.',
                  'Dynamic collisions and the oversized rider silhouette require runtime playback.']}
if __name__=='__main__':
    report=audit();print(json.dumps(report,indent=2));raise SystemExit(0 if report['valid'] else 1)
