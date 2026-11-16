import re, json
t=open(__import__('sys').argv[1] if len(__import__('sys').argv)>1 else 'CORE_RULES.md').read()
rev=re.search(r'Revision ([\d-]+)',t).group(1)
chunks=[]; chap=''
for sec in re.split(r'\n(?=## |### )', t):
    if sec.startswith('## '): chap=sec.split('\n')[0][3:].strip(); continue
    if not sec.startswith('### '): continue
    head=sec.split('\n')[0][4:].strip()
    body=sec[len(sec.split('\n')[0]):].strip()
    # split long sections at rule numbers, ~2200 chars per chunk
    parts=re.split(r'\n(?=\*\*\d+\.\*\*)', body); cur=''
    for p in parts:
        if len(cur)+len(p) > 2200 and cur:
            chunks.append([head, chap, cur.strip()]); cur=''
        cur+= '\n'+p
    if cur.strip(): chunks.append([head, chap, cur.strip()])
# compact markdown
for c in chunks: c[2]=re.sub(r'\*\*(\d[\d.a-z]*)\.\*\*',r'\1.',c[2]).replace('\n\n','\n')
json.dump({'rev':rev,'chunks':chunks}, open(__import__('pathlib').Path(__file__).parent/'data'/'rules.json','w'), separators=(',',':'))
print(rev, len(chunks), sum(len(c[2]) for c in chunks))
