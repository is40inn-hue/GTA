#!/usr/bin/env python3
"""CPU checks using the shipped animation channels; never a native GPU run."""
from pathlib import Path
import importlib.util, json, re, struct
import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('pudge_builder', HERE/'build-pudge-native.py')
builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)


def ifp_chunks(raw):
    offset = 0
    while offset + 8 <= len(raw):
        kind, size = struct.unpack_from('<4sI', raw, offset)
        assert offset + 8 + size <= len(raw), 'Truncated IFP chunk'
        yield kind, raw[offset+8:offset+8+size]
        offset += 8 + ((size+3)//4)*4


def animation_tracks(package=None):
    runtime = builder.RUNTIME
    template = builder.parse_native(runtime/'remote/models/gta3.img/male01.dff')
    name_to_bone = {template['names'][frame]:bone for bone,frame in template['ids'].items() if bone >= 0}
    # Reuse exactly the shipped package; no downloads and no extra runtime asset.
    if package is None:
        js = (runtime/'index.js').read_text()
        row = re.search(r'\{"filename":\s*"/vc-assets/local/anim/ped\.ifp",\s*"start":\s*(\d+),\s*"end":\s*(\d+)\}', js)
        assert row, 'The native ped animation source is not in the package'
        start, end = map(int, row.groups())
        manifest = json.loads((runtime/'manifest.json').read_text())
        selected = [c for c in manifest['data']['chunks'] if c['offset'] < end and c['offset'] + c['size'] > start]
        base = selected[0]['offset']
        package = b''.join((runtime/c['path']).read_bytes() for c in selected)[start-base:end-base]
    kind, payload = next(ifp_chunks(package)); assert kind == b'ANPK'
    animations = {}; name = None
    for kind, data in ifp_chunks(payload):
        if kind == b'NAME': name = data.rstrip(b'\0').decode('ascii')
        if kind != b'DGAN': continue
        tracks = {}
        for kind, data in ifp_chunks(data):
            if kind != b'CPAN': continue
            parts = dict(ifp_chunks(data)); header = parts.pop(b'ANIM')
            count, _, _, stored_tag = struct.unpack_from('<4I', header, 28)
            channel_name = header[:28].split(b'\0')[0].decode()
            # Some old VC clips store ordinal indices in the final word. The
            # case-sensitive original frame name remains the unambiguous key.
            bone = name_to_bone.get(channel_name)
            if bone is None: continue
            key_type, keys = next(iter(parts.items()))
            width = {b'KR00':5, b'KRT0':8, b'KRTS':11}[key_type]
            values = np.frombuffer(keys, '<f4').reshape(count, width).copy()
            assert np.isfinite(values).all()
            tracks[bone] = {'type':key_type.decode(), 'keys':values, 'name':channel_name,'storedTag':stored_tag}
        animations[name] = tracks
    return animations


def quaternion_matrix(q):
    # IFP rotation keys are stored inversely to the native frame transform.
    x, y, z, w = q / np.linalg.norm(q); x, y, z = -x, -y, -z
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])


def sampled_pose(native, tracks, phase):
    local = [x.copy() for x in native['local']]
    for bone, track in tracks.items():
        if bone == 0 or bone not in native['ids']: continue
        # Root travel/orientation is normalized for inspection. This deliberately
        # does not model the engine's blends, movement, IK or vehicle seating.
        keys = track['keys']; times = keys[:,-1]
        target = float(times[-1]) * phase
        hi = min(int(np.searchsorted(times, target)), len(keys)-1); lo = max(0, hi-1)
        span = float(times[hi]-times[lo]); alpha = (target-float(times[lo]))/span if span > 1e-8 else 0
        qa, qb = keys[lo,:4].astype(float), keys[hi,:4].astype(float)
        if qa @ qb < 0: qb = -qb
        local[native['ids'][bone]][:3,:3] = quaternion_matrix(qa*(1-alpha) + qb*alpha)
    globals_ = []
    for index, matrix in enumerate(local):
        parent = native['parent'][index]
        globals_.append(matrix if parent < 0 else globals_[parent] @ matrix)
    return np.stack([globals_[native['ids'][bone]] for bone, index, _ in sorted(native['hierarchy'], key=lambda r:r[1])])


def deform(positions, weights, joints, globals_, inverse):
    transform = globals_ @ inverse; points = np.c_[positions, np.ones(len(positions))]
    return sum(np.einsum('nij,nj->ni', transform[joints[:,k]], points)*weights[:,k,None] for k in range(4))[:,:3]


def main():
    native = builder.parse_native(HERE/'output/egepudge.dff')
    template = builder.parse_native(builder.RUNTIME/'remote/models/gta3.img/male01.dff')
    data = np.load(HERE/'output/native-geometry.npz')
    positions, weights, joints, faces = [data[k] for k in ('positions','weights','joints','faces')]
    animations = animation_tracks()
    counts = {str(bone):0 for bone in (22,32)}
    for tracks in animations.values():
        for bone in (22,32):
            if bone not in tracks: continue
            assert tracks[bone]['type'] == 'KR00', 'An animation would overwrite the corrected shoulder translation'
            counts[str(bone)] += 1
    assert min(counts.values()) >= 200
    original_width = template['global_'][template['ids'][32]][0,3] - template['global_'][template['ids'][22]][0,3]
    new_width = native['global_'][native['ids'][32]][0,3] - native['global_'][native['ids'][22]][0,3]
    assert new_width > original_width + .20, 'Shoulders still use the narrow human socket width'
    for chain in ((22,23,24,25),(32,33,34,35)):
        for a,b in zip(chain,chain[1:]):
            old = np.linalg.norm(template['global_'][template['ids'][b]][:3,3]-template['global_'][template['ids'][a]][:3,3])
            new = np.linalg.norm(native['global_'][native['ids'][b]][:3,3]-native['global_'][native['ids'][a]][:3,3])
            assert abs(old-new) < 1e-6, 'Arm length changed while repairing the shoulder socket'
    # A seam at duplicated UV vertices must remain joined under animation.
    groups = {}
    for i, p in enumerate(positions): groups.setdefault(tuple(np.round(p,5)),[]).append(i)
    pairs = [(g[0],i) for g in groups.values() for i in g[1:]]
    assert pairs
    pose_reports = []; seam_max = 0.0
    for clip in ('IDLE_stance','WALK_civi','run_civi','FIGHTIDLE'):
        tracks = animations[clip]
        for phase in (0,.25,.5,.75,1):
            transformed = deform(positions,weights,joints,sampled_pose(native,tracks,phase),data['inverse'])
            assert np.isfinite(transformed).all()
            span = transformed.max(0)-transformed.min(0)
            assert float(span.max()) < 3.5, 'Exploding character bounds in a native animation sample'
            separation = max(float(np.linalg.norm(transformed[a]-transformed[b])) for a,b in pairs)
            seam_max = max(seam_max,separation)
            assert separation < .002, 'Coincident shoulder/body UV vertices detach under animation'
            pose_reports.append({'clip':clip,'phase':phase,'boundsSpan':span.tolist(),'maxCoincidentVertexGap':separation})
    report = {'scope':'CPU samples of shipped native animation rotation channels; root travel normalized; not engine playback, blending, IK, collisions or GPU verification.',
        'nativeGPUExecuted':False,'animationCount':len(animations),'upperArmRotationOnlyTrackCounts':counts,
        'originalShoulderSocketWidth':float(original_width),'correctedShoulderSocketWidth':float(new_width),
        'armSegmentLengthsPreserved':True,'coincidentVertexPairs':len(pairs),'maximumAnimatedSeamGap':seam_max,'samples':pose_reports}
    (HERE/'output/animation-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__ == '__main__': main()
