#!/usr/bin/env python3
"""Extract verified source text from explorer HTML; never execute page scripts."""
import json,sys
from html.parser import HTMLParser
class Sources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='input' and 'data-csource' in attrs:
            path=attrs.get('data-cname','unknown.sol')
            if '/contracts/' in path and path.startswith('/Users/'):
                path='contracts/'+path.rsplit('/contracts/',1)[1]
            self.sources.append({'file_path':path,'source_code':attrs['data-csource']})
html=sys.stdin.read()
p=Sources();p.feed(html)
if not p.sources or 'Source Code Verified' not in html or 'Exact Match' not in html:
    raise SystemExit('Verified exact-match source was not available')
print(json.dumps({'name':'FiatTokenV2_2','is_verified':True,'file_path':p.sources[0]['file_path'],'source_code':p.sources[0]['source_code'],'additional_sources':p.sources[1:]}))
