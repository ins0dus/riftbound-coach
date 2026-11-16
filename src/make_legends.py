import json, re
C=json.load(open(__import__('pathlib').Path(__file__).parent/'data'/'cards.json'))
cards=list(C.values())
TAGS={'exhaust/ready':r'\bexhaust|\bready\b','movement':r'\bmove','hidden':r'HIDDEN|\bhide','tokens':r'token','gold/ramp':r'\bgold\b|add \[','buffs':r'\bbuff','XP/level':r'\bXP\b|LEVEL','spells':r'\bspell','gear/equip':r'EQUIP|\bgear','card draw':r'\bdraw','discard':r'discard','recycle':r'recycle','damage/burn':r'damage|BURN','removal':r'\bkill\b|banish|return .* to .* hand','death triggers':r'DEATHKNELL|\bdies?\b','conquer':r'conquer','hold':r'\bhold','stun':r'STUN','tank':r'TANK','assault':r'ASSAULT','shield':r'SHIELD','accelerate':r'ACCELERATE','legion':r'LEGION','empower':r'EMPOWER','mighty':r'MIGHTY|5\+ \[might','counter/deny':r'counter a spell|counter it'}
def tags(t): return {k for k,r in TAGS.items() if re.search(r,t or '',re.I)}
import math
freq={k:sum(1 for c in cards if re.search(r,c[6] or '',re.I)) for k,r in TAGS.items()}
idf={k:math.log(len(cards)/(1+f)) for k,f in freq.items()}
out={}
for v in cards:
    if 'legend' not in (v[1] or '').lower(): continue
    name=v[0]; champ=name.split(' ')[0].replace(',','')
    doms=(v[2] or '').split()
    champs=[c for c in cards if (c[0].startswith(champ+' ') or c[0].startswith(champ+',')) and 'champion' in (c[1] or '').lower()]
    t=set(tags(v[6]))
    for c in champs: t|=tags(c[6])
    # synergy picks: in-domain cards sharing 2+ themes with legend+champions
    picks=[]
    for c in cards:
        if c in champs or 'legend' in (c[1] or '').lower() or 'battlefield' in (c[1] or '').lower() or 'rune' in (c[1] or '').lower(): continue
        cd=(c[2] or '').split()
        if not cd or not set(cd)<=set(doms): continue
        sh=tags(c[6])&t
        w=sum(idf[x] for x in sh)
        if len(sh)>=2 and w>4: picks.append((w,c[0],sorted(sh)))
    picks.sort(key=lambda x:-x[0])
    out[name.lower().replace(',','')]={'name':name,'domains':doms,'text':v[6],'champions':[[c[0],c[6]] for c in champs],'themes':sorted(t),'synergy':[[p[1],p[2]] for p in picks[:12]]}
json.dump(out,open(__import__('pathlib').Path(__file__).parent/'data'/'legends.json','w'),separators=(',',':'))
print(len(out)); k='irelia blade dancer'; import pprint; pprint.pprint({x:out[k][x] for x in ['themes','synergy']})
