#!/usr/bin/env python3
"""Targeted semantic trace of our generated SCM; native queries are explicit fixtures, no WASM execution."""
import contextlib,io,json,pathlib,runpy,sys
base=pathlib.Path(__file__).resolve().parent
sys.argv=['review-custom-scm.py',str(base/'native-exam-main.scm')]
with contextlib.redirect_stdout(io.StringIO()):
 review=runpy.run_path(str(base/'review-custom-scm.py'))
contract=json.loads((base/'native-exam-main.contract.json').read_text())
rows=review['rows']; instructions={r[0]:r for r in rows}; following={r[0]:rows[i+1][0] if i+1<len(rows) else None for i,r in enumerate(rows)}
fields={k:contract['globalByteOffset']+v['offset'] for k,v in contract['fields'].items()}
start=contract['validation']['labels']['native_loop']
def run(health,dead,expect_complete):
 mem={};fire_checks=[];pc=start;cmp=False;steps=0;loops=0
 def setfield(n,v):mem[fields[n]]=v
 def getfield(n):return mem.get(fields[n],0)
 for n,v in {'phase':2,'scene':3,'ammo':0,'ammoInitial':3,'weapon':30,'targetCount':2,'emptyDeadline':1,'target0_handle':101,'target1_handle':102,'target2_handle':-1}.items():setfield(n,v)
 def val(v):return mem.get(int(v[1:]),0) if isinstance(v,str) and v.startswith('G') else v
 def put(dst,v):assert isinstance(dst,str) and dst.startswith('G');mem[int(dst[1:])]=v
 while steps<3000:
  if pc==start:
   loops+=1
   if loops>1:break
  at,op,name,args=instructions[pc];pc=following[at];steps+=1
  values=list(map(val,args))
  if name in ['WAIT','IF']:pass
  elif name=='SET_VAR_INT':put(args[0],values[1])
  elif name=='SET_VAR_INT_TO_VAR_INT':put(args[0],values[1])
  elif name=='ADD_VAL_TO_INT_VAR':put(args[0],values[0]+values[1])
  elif name=='GOTO':pc=values[0]
  elif name=='GOTO_IF_FALSE':
   if not cmp:pc=values[0]
  elif name in ['IS_INT_VAR_EQUAL_TO_NUMBER','IS_INT_VAR_EQUAL_TO_INT_VAR']:cmp=values[0]==values[1]
  elif name in ['IS_INT_VAR_GREATER_THAN_NUMBER','IS_INT_VAR_GREATER_THAN_INT_VAR']:cmp=values[0]>values[1]
  elif name=='IS_INT_VAR_GREATER_OR_EQUAL_TO_NUMBER':cmp=values[0]>=values[1]
  elif name=='GET_GAME_TIMER':put(args[0],100000)
  elif name=='GET_PLAYER_HEALTH':put(args[1],100)
  elif name=='GET_PLAYER_COORDINATES':
   for dst,v in zip(args[1:],[500,-1020,12]):put(dst,v)
  elif name=='GET_AMMO_IN_PLAYER_WEAPON':put(args[2],0)
  elif name=='GET_CURRENT_PLAYER_WEAPON':put(args[1],30)
  elif name=='GET_CAR_HEALTH':put(args[1],health[values[0]])
  elif name=='IS_CAR_DEAD':cmp=dead[values[0]]
  # Fixture truth table includes VC's health<250 branch, which also matches wrecks.
  # Source: reVC/src/control/Script6.cpp, COMMAND_IS_CAR_ON_FIRE.
  # This supplies native-query outcomes; it does not simulate fire or collisions.
  elif name=='IS_CAR_ON_FIRE':fire_checks.append(values[0]);cmp=health[values[0]]<250
  elif name=='SET_PLAYER_CONTROL':pass
  else:raise AssertionError(('unexpected instruction on focused path',at,name,args))
  if getfield('phase')==3:break
 if expect_complete:
  assert getfield('phase')==3 and getfield('completed')==1
  assert getfield('outcome')==2 and getfield('record3_outcome')==2
  assert getfield('record3_completed')==1 and getfield('record3_ammo')==0
  assert [getfield('record3_target0_credited'),getfield('record3_target1_credited')]==[1,0]
  assert fire_checks==[102],fire_checks
 else:
  assert getfield('phase')==2 and getfield('completed')==0 and getfield('record3_completed')==0
  assert fire_checks==[101],fire_checks
 print(json.dumps({'case':'one-wreck-one-untouched' if expect_complete else 'one-burning-live','instructions':steps,'phase':getfield('phase'),'record3_completed':getfield('record3_completed'),'outcome':getfield('outcome'),'fireQueries':fire_checks,'nativeRuntimeExecuted':False}))
run({101:0,102:1000},{101:True,102:False},True)
run({101:200,102:1000},{101:False,102:False},False)
