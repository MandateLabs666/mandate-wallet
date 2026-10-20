"""Synchronize planning coverage only; never derive acceptance from code existence."""
import datetime,hashlib,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=root/'artifacts/planning/execution-map.json'
mapping=json.loads(path.read_text());source=root/mapping['taskSource'];text=source.read_text()
rows=re.findall(r'^- \[([x ])\] \*\*(T\d+\.\d+)\*\*',text,re.M)
accepted={task:mark=='x' for mark,task in rows}
if len(rows)!=105 or len(accepted)!=len(rows):raise SystemExit('TASK_SOURCE_NOT_UNIQUE_105')
tasks=[row['taskId'] for milestone in mapping['milestones'].values() for row in milestone['tasks']]
if len(tasks)!=105 or len(set(tasks))!=len(tasks) or set(tasks)!=set(accepted):raise SystemExit('TASK_MAP_NOT_EXACT')
mapping['milestones']['M7']['spec']='planning/M7_SPEC.zh-CN.md'
mapping['boundaries']['M3_M7']='M3-M5 accepted; M6 active; M7 independent recovery/operations started under formal spec; G3 still requires T8 acceptance'
for milestone in mapping['milestones'].values():
    milestone['specSHA256']=hashlib.sha256((root/milestone['spec']).read_bytes()).hexdigest()
    for row in milestone['tasks']:row['accepted']=accepted[row['taskId']]
mapping['recordedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
mapping['taskSourceSHA256']=hashlib.sha256(source.read_bytes()).hexdigest()
mapping['acceptedTaskCount']=sum(accepted.values());mapping['allTasksAssignedExactlyOnce']=True
path.write_text(json.dumps(mapping,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'taskCount':105,'acceptedTaskCount':mapping['acceptedTaskCount'],'allTasksAssignedExactlyOnce':True}))
