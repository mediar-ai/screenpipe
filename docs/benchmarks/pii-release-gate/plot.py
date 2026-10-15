# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
import pathlib,json,statistics
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=pathlib.Path(__file__).parent
rows=[json.loads(x) for x in (root/'scale-results.jsonl').read_text().splitlines()]
modes=['off','disabled','ready','pending','sparse','failure','worker','discovery']
labels=['Protection absent','Installed, disabled','All history ready','All history pending','Only old records ready','Test detector failing','Test detector working','Aggressive discovery']
values=[];low=[];high=[]
for mode in modes:
 v=[m['data']['capture_3_windows']['p95_ms'] for r in rows if r['env']['PRIVACY_BENCH_HISTORY']==100000 and r['env']['PRIVACY_BENCH_MODE']==mode for m in r['metrics'] if m['phase']=='capture_contention']
 mid=statistics.median(v);values.append(mid);low.append(mid-min(v));high.append(max(v)-mid)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':12,'axes.spines.top':False,'axes.spines.right':False,'axes.spines.left':False})
fig,ax=plt.subplots(figsize=(10,6),dpi=150)
fig.patch.set_facecolor('#fbfbfd');ax.set_facecolor('#fbfbfd')
ax.barh(labels,values,color=['#8c96a8']*2+['#386bce']*5+['#bd6737'],xerr=[low,high],error_kw={'ecolor':'#273041','capsize':3},height=.58)
ax.invert_yaxis();ax.set_xlim(0,max(v+h for v,h in zip(values,high))*1.2)
ax.set_xlabel('Database insert p95, three windows (ms)');ax.set_title('Capture insert latency with 100,000 history frames',loc='left',fontweight='bold',pad=18)
ax.tick_params(axis='y',length=0);ax.grid(axis='x',alpha=.15);ax.set_axisbelow(True)
for i,(v,h) in enumerate(zip(values,high)):ax.text(v+h+.12,i,f'{v:.2f}',va='center',fontsize=11)
fig.tight_layout();fig.savefig(root/'capture-latency.png');plt.close(fig)
models=[json.loads(x) for x in (root/'model-results.jsonl').read_text().splitlines()]
fig,ax=plt.subplots(figsize=(10,5.5),dpi=150)
for name,label,color in [('text-1','3 distinct frames/s','#386bce'),('text-2','6 distinct frames/s','#e59a33'),('text-5','15 distinct frames/s','#bd493c'),('text-duplicate-2','6 frames/s, duplicate windows','#359b88'),('mixed','3 frames/s + images','#8c61b3')]:
 r=next(r for r in models if r['case']==name);m=next(m for m in r['metrics'] if m['phase']=='sustained_text');b=m['data']['backlog_samples']
 ax.plot([x['seconds'] for x in b],[x['captured']-x['completed'] for x in b],label=label,color=color,linewidth=2)
ax.set_title('Text backlog while capture continues',loc='left',fontweight='bold',pad=18);ax.set_xlabel('Elapsed capture time (seconds)');ax.set_ylabel('Frames awaiting text receipt');ax.grid(alpha=.15);ax.legend(frameon=False);fig.tight_layout();fig.savefig(root/'text-backlog.png');plt.close(fig)
