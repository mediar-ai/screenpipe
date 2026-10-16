#!/usr/bin/env python3
# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Manual serial benchmark. Build the release test binary first; no CI jobs."""
import argparse,json,os,pathlib,platform,subprocess,time
p=argparse.ArgumentParser();p.add_argument('--binary',required=True);p.add_argument('--out',required=True);p.add_argument('--images');p.add_argument('--suite',choices=['scale','models','identity'],default='scale');p.add_argument('--only',choices=['text-1','text-2','text-5','text-duplicate-2','image','mixed','large-fields']);a=p.parse_args()
if a.only and a.suite!='models':p.error('--only requires --suite models')
if a.only in ['image','mixed'] and not a.images:p.error('this case requires --images')
out=pathlib.Path(a.out)
if (out/'results.jsonl').exists():p.error('use a fresh output directory to avoid mixing runs')
out.mkdir(parents=True,exist_ok=True)
(out/'machine.json').write_text(json.dumps({'platform':platform.platform(),'cpu_count':os.cpu_count(),'started_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'binary':a.binary},indent=2))
failures=[]
def run(name,test,env,timeout=600):
 if a.only and name != a.only:return
 path=out/(name+'.log');started=time.monotonic()
 print('START',name,flush=True)
 with path.open('w') as f:
  try:r=subprocess.run([a.binary,test,'--exact','--ignored','--nocapture'],env={**{k:v for k,v in os.environ.items() if not k.startswith("PRIVACY_BENCH_")},**{k:str(v) for k,v in env.items()}},stdout=f,stderr=subprocess.STDOUT,timeout=timeout);code=r.returncode
  except subprocess.TimeoutExpired:code='timeout'
 record={'case':name,'exit':code,'wall_s':time.monotonic()-started,'env':env,'metrics':[]}
 for line in path.read_text().splitlines():
  if line.startswith('PRIVACY_METRIC '):record['metrics'].append(json.loads(line[len('PRIVACY_METRIC '):]))
 expected={'scale_overhead':{'reads','queue','capture_contention'},'real_text_sustained':{'model_load','sustained_text'},'real_image_pipeline':{'image_model_load','image_inference','image_worker'},'real_large_fields':{'large_field'},'policy_identity_overhead':{'identity_sensitivity'}}[test]
 if code==0 and (not expected.issubset({m['phase'] for m in record['metrics']}) or '1 passed; 0 failed' not in path.read_text()):record['exit']='missing expected metrics / test not compiled'
 with (out/'results.jsonl').open('a') as f:f.write(json.dumps(record)+'\n')
 print('DONE',name,record['exit'],round(record['wall_s'],2),flush=True)
 if record["exit"] != 0: failures.append(name)
 # Preserve failures and continue independent cases.
if a.suite=='scale':
 for history,repeats,modes in [(1000,3,['off','disabled','ready','pending']), (100000,3,['off','disabled','ready','pending','sparse','discovery','failure','worker']), (1000000,1,['off','ready','pending','sparse','discovery'])]:
  for repeat in range(repeats):
   order=modes if repeat%2==0 else list(reversed(modes))
   for mode in order:
    run(f'{history}-{repeat}-{mode}','scale_overhead',{'PRIVACY_BENCH_HISTORY':history,'PRIVACY_BENCH_MODE':mode,'PRIVACY_BENCH_SAMPLES':1000,'PRIVACY_BENCH_READ_SAMPLES':100 if history<1000000 else 30})
elif a.suite=='models':
 for rate in [1,2,5]:
  run(f'text-{rate}','real_text_sustained',{'PRIVACY_BENCH_SECONDS':60,'PRIVACY_BENCH_RATE':rate})
 run('text-duplicate-2','real_text_sustained',{'PRIVACY_BENCH_SECONDS':60,'PRIVACY_BENCH_RATE':2,'PRIVACY_BENCH_DUPLICATE_WINDOWS':1})
 if a.images:
  run('image','real_image_pipeline',{'PRIVACY_BENCH_IMAGES':a.images,'PRIVACY_BENCH_IMAGE_SAMPLES':30},timeout=900)
  run('mixed','real_text_sustained',{'PRIVACY_BENCH_SECONDS':60,'PRIVACY_BENCH_RATE':1,'PRIVACY_BENCH_BACKLOG':6,'PRIVACY_BENCH_MIXED':1,'PRIVACY_BENCH_IMAGES':a.images})

if a.suite=='models':
 run('large-fields','real_large_fields',{},timeout=900)

if a.suite=='identity':
 for history in [100000,1000000]:
  for size in [8,512]:
   run(f'identity-{history}-{size}','policy_identity_overhead',{'PRIVACY_BENCH_HISTORY':history,'PRIVACY_BENCH_POLICY_BYTES':size},timeout=900)

raise SystemExit(1 if failures else 0)
