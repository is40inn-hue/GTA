from pathlib import Path
p=Path(__file__).with_name('build-native-exam-scm.py')
s=p.read_text()
s=s.replace("RECORD_KEYS =", "for name in ['driver','hijacked','driveCompleted']: field(name)\nRECORD_KEYS =")
s=s.replace("models=[130,217,274,282,287,273]", "models=[0,130,217,274,282,287,273]")
s=s.replace("for index in range(3):p.set(f'target{index}_handle',-1)", "p.set('driver',-1);p.set('hijacked',0);p.set('driveCompleted',0)\n    for index in range(3):p.set(f'target{index}_handle',-1)")
# First scene: no fake damage or ammo credits. Independent native milestone fields.
a=s.index("    {'scene':1,"); b=s.index("    {'scene':2,",a)
s=s[:a]+"    {'scene':1,'title':'С1. Угон','weapon':0,'weaponName':'За руль','model':0,'ammo':0,'burst':0,\n     'targetModel':130,'positions':[(500,-1015,13)],'pointsPerTarget':10,\n     'instruction':'Вытащи водителя, сядь и прокатись по двору.',\n     'criterion':'Настоящая посадка и поездка. Без выстрелов.'},\n"+s[b:]
s=s.replace("p.label('gameplay');p.emit", "p.label('gameplay');if_eq('scene',1,'shooting_gameplay');p.go('car_gameplay')\n    p.label('shooting_gameplay');p.emit",1)
# car milestones, no destruction-based completion. Timeout handles noncompletion.
anchor="    p.label('finish_scene');"
car="""    p.label('car_gameplay')
    p.branch_false('0118',G('driver'),target='driver_alive');p.set('outcome',4);p.go('finish_scene')
    p.label('driver_alive')
    p.branch_false('0119',G('target0_handle'),target='car_alive');p.set('outcome',4);p.go('finish_scene')
    p.label('car_alive')
    p.branch_false('00DB',G('ped'),G('target0_handle'),target='car_timeout')
    p.branch_false('00DB',G('driver'),G('target0_handle'),target='hijack_verified');p.go('car_timeout')
    p.label('hijack_verified');p.set('hijacked',1)
    p.branch_false('01AD',G('target0_handle'),F(500),F(-1015),F(18),F(18),I(0),target='drive_verified');p.go('car_timeout')
    p.label('drive_verified');p.set('driveCompleted',1);p.set('outcome',1);p.go('finish_scene')
    p.label('car_timeout');p.branch_false('001C',G('nativeTimer'),G('sceneDeadline'),target='native_loop');p.set('outcome',3);p.go('finish_scene')
"""
s=s.replace(anchor,car+anchor)
s=s.replace("p.emit('01B4',G('player'),I(1));p.set('phase',2)","p.emit('01B4',G('player'),I(1));p.set('phase',2)\n    if_eq('scene',1,'start_other');copy('sceneDeadline','nativeTimer');p.emit('0008',G('sceneDeadline'),I(90000))\n    p.label('start_other')")
s=s.replace("p.set('rpgHit',0);p.set('heliRoute',0);p.set('sceneDeadline',0)","p.branch_false('0028',G('driver'),I(0),target=f'no_old_driver_{number}');p.emit('009B',G('driver'))\n        p.label(f'no_old_driver_{number}');p.set('driver',-1);p.set('hijacked',0);p.set('driveCompleted',0)\n        p.set('rpgHit',0);p.set('heliRoute',0);p.set('sceneDeadline',0)")
s=s.replace("p.emit('01B1',G('player'),G('weapon'),G('ammoInitial'));p.emit('01B8',G('player'),G('weapon'))", "if number!=1:p.emit('01B1',G('player'),G('weapon'),G('ammoInitial'));p.emit('01B8',G('player'),G('weapon'))")
s=s.replace("p.emit('02EB');p.emit", "if number==1:\n            p.emit('020A',G('target0_handle'),I(1));p.emit('0129',G('target0_handle'),I(4),I(0),G('driver'))\n        p.emit('02EB');p.emit")
s=s.replace("p.emit('04D7',G('ped'),I(1));p.set('playerFrozen',1);p.emit('0373')", "p.emit('04D7',G('ped'),I(number!=1));p.set('playerFrozen',int(number!=1));p.emit('0373')")
s=s.replace("out=HERE/'native-exam-main'", "out=HERE/'native-car-prototype'")
p.with_name('build-car-prototype.py').write_text(s)
