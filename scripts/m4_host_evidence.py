import json

def parse_trace(host,source,purchase=False):
    successful=[];attempted=[];denied=[];uses={};final='';purchases=[]
    def records(value,depth=0):
        if depth>8:return []
        if isinstance(value,str):
            try:return records(json.loads(value),depth+1)
            except ValueError:return []
        if isinstance(value,list):return [r for item in value for r in records(item,depth+1)]
        if isinstance(value,dict):
            if 'paymentState' in value and 'stepId' in value:return [value]
            return [r for item in value.values() for r in records(item,depth+1)]
        return []
    for line in source.splitlines():
        try:d=json.loads(line)
        except ValueError:continue
        if host=='codex' and d.get('type')=='item.completed':
            item=d.get('item',{})
            if item.get('type')=='mcp_tool_call':
                name=item.get('tool');attempted.append(name)
                if not item.get('error') and not (item.get('result') or {}).get('isError'):
                    successful.append(name)
                    if name=='mandate_call_service':purchases.extend(records(item.get('result')))
                else:denied.append(name)
            if item.get('type')=='agent_message':final=item.get('text','')
        if host=='claude':
            if d.get('type')=='assistant':
                for c in d.get('message',{}).get('content',[]):
                    if c.get('type')=='tool_use':uses[c['id']]=c['name'].split('__')[-1];attempted.append(uses[c['id']])
            if d.get('type')=='user':
                for c in d.get('message',{}).get('content',[]):
                    if c.get('type')=='tool_result':
                        name=uses.get(c.get('tool_use_id'))
                        if name:
                            (denied if c.get('is_error') else successful).append(name)
                            if name=='mandate_call_service' and not c.get('is_error'):purchases.extend(records(c.get('content')))
            if d.get('type')=='result':final=d.get('result','')
    required={'mandate_get_context','mandate_search_services','mandate_quote_service','mandate_get_task'}
    if purchase:required|={'mandate_call_service','mandate_get_receipt'}
    return {'attemptedTools':attempted,'successfulTools':successful,'deniedTools':denied,'requiredToolsObserved':required.issubset(successful),'purchaseRecords':purchases,'finalAnswer':final}
