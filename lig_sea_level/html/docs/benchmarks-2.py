fig = plt.figure(figsize=(10,5))
from lig_sea_level.config import GIT_ROOT
import os
import json
benchmarks = os.listdir(str(GIT_ROOT)+'/.asv/results/carbonate')
check = 'time_gradient'
logpt = []
x = []
d = []
for i in range(len(benchmarks)):
    with open(str(GIT_ROOT)+'/.asv/results/carbonate/'+benchmarks[i]) as f:
        data = json.load(f)
        if 'results' in data.keys():
            if f'benchmarks.TimeSuite.{check}' in data['results'].keys():
                if data['results'][f'benchmarks.TimeSuite.{check}'] is not None:
                    logpt.append(data['results'][f'benchmarks.TimeSuite.{check}']['result'])
                    x.append(benchmarks[i][:6])
                    d.append(data['date'])
sortid = np.argsort(d)
plt.plot(np.array(logpt)[sortid],'o--')
plt.gca().set_xticks(np.arange(0,len(logpt)))
_=plt.gca().set_xticklabels(np.array(x)[sortid],rotation=90)
plt.gca().set_xlabel('Commit hash')
plt.gca().set_ylabel('Time (seconds)')
plt.gca().set_title('model gradient (3 LIG and 4 Holocene data)')
fig.tight_layout()
plt.show()