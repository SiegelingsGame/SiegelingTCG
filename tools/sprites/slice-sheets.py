"""Cut 4-frame pose sheets (one pose per image, solid backdrop) into the
frame strips Siege battle sprites play (adventure.js ANIM_SPRITES).

  python3 tools/sprites/slice-sheets.py OUT_DIR NAME SCALE idle=a.png walk=b.png \
      attack=c.png cheer=d.png hurt=e.png fainted=f.png

Writes OUT_DIR/NAME-<pose>.webp and prints the shared cell size, which goes in
ANIM_SPRITES as w/h. Every pose shares that cell with the feet on one baseline,
so poses swap mid-animation without the unit jumping.
"""
import sys, numpy as np
from PIL import Image, ImageDraw
OUT, NAME = sys.argv[1], sys.argv[2]
SHEETS = dict(a.split('=', 1) for a in sys.argv[4:])

def components(mask):
    """Label 4-connected True regions using PIL floodfill (no scipy here)."""
    h,w=mask.shape
    lab=np.zeros((h,w),np.int32)
    img=Image.fromarray((mask*1).astype(np.uint8))
    comps=[]; n=1
    ys,xs=np.nonzero(mask)
    for y,x in zip(ys,xs):
        if lab[y,x]: continue
        n+=1; v=(n%250)+2
        ImageDraw.floodfill(img,(int(x),int(y)),v)
        a=np.array(img); reg=(a==v)
        lab[reg]=n; img.paste(0,mask=Image.fromarray((reg*255).astype(np.uint8)))
        comps.append((n,int(reg.sum())))
    return lab,comps

def cut(name):
    rgb=np.array(Image.open(SHEETS[name]).convert('RGB')).astype(np.int32)
    h,w,_=rgb.shape
    border=np.concatenate([rgb[:4].reshape(-1,3),rgb[-4:].reshape(-1,3),rgb[:,:4].reshape(-1,3),rgb[:,-4:].reshape(-1,3)])
    bg=np.median(border,0)
    d=np.sqrt(((rgb-bg)**2).sum(2))
    bgl=d<34
    # Background = bg-coloured pixels connected to the sheet edge, plus enclosed
    # pockets that are flat bg colour (gaps between an arm and the body).
    lab,comps=components(bgl)
    edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bgmask=np.isin(lab,list(edge))
    for n,a in comps:
        if n in edge or a<120: continue
        reg=lab==n
        if d[reg].mean()<14: bgmask|=reg
    alpha=~bgmask
    # drop stray specks
    lab2,c2=components(alpha)
    for n,a in c2:
        if a<40: alpha[lab2==n]=False
    # eat 1px of bg-tinted fringe
    pad=np.pad(alpha,1)
    nb=pad[:-2,1:-1]&pad[2:,1:-1]&pad[1:-1,:-2]&pad[1:-1,2:]
    alpha&=~((~nb)&(d<70))
    lab2,c2=components(alpha)
    rgba=np.dstack([rgb,alpha*255]).astype(np.uint8)
    # frame cuts: empty column nearest each quarter
    colfill=alpha.sum(0)
    cuts=[0]
    for k in (1,2,3):
        t=w*k//4; best=None
        for off in range(0,200):
            for x in (t-off,t+off):
                if 0<x<w and colfill[x]==0: best=x;break
            if best is not None: break
        cuts.append(best if best is not None else t)
    cuts.append(w)
    frames=[]
    for i in range(4):
        x0,x1=cuts[i],cuts[i+1]
        a=alpha[:,x0:x1]; L=lab2[:,x0:x1]
        ids,cnt=np.unique(L[a],return_counts=True)
        body=L==ids[cnt.argmax()]
        ys,xs=np.nonzero(body)
        top,bot=ys.min(),ys.max()
        cap=body[top:top+int((bot-top)*.3)]
        cx=np.nonzero(cap)[1].mean()
        capw=np.median(np.sort(cap.sum(1))[-8:])
        frames.append(dict(img=rgba[:,x0:x1],x0=x0,alpha=a,capx=cx,base=bot,top=top,capw=capw))
    return frames

data={n:cut(n) for n in SHEETS}
# The sheets were drawn at slightly different sizes (attack runs ~15% small);
# scale every sheet so its first, standing frame matches idle's height.
ref=np.median([f['capw'] for f in data['idle']])
for n,fr in data.items():
    k=ref/np.median([f['capw'] for f in fr[:2]])
    print(n,'scale',round(k,3))
    for f in fr:
        im=Image.fromarray(f['img'])
        im=im.resize((round(im.width*k),round(im.height*k)),Image.LANCZOS)
        f['img']=np.array(im); f['alpha']=f['img'][:,:,3]>40
        f['capx']*=k; f['base']*=k
# Anchor each frame at (cap centre, feet). Faint moves the head on purpose,
# so every faint frame keeps frame 0's anchor.
for n,fr in data.items():
    for f in fr:
        f['ax']=fr[0]['capx'] if n=='fainted' else f['capx']
        f['ay']=fr[0]['base'] if n=='fainted' else f['base']
L=R=Up=Dn=0
for fr in data.values():
    for f in fr:
        ys,xs=np.nonzero(f['alpha'])
        L=max(L,f['ax']-xs.min()); R=max(R,xs.max()-f['ax'])
        Up=max(Up,f['ay']-ys.min()); Dn=max(Dn,ys.max()-f['ay'])
half=int(np.ceil(max(L,R)))+4
CW=2*half; CH=int(np.ceil(Up+Dn))+8
S=float(sys.argv[3])
cw,ch=round(CW*S),round(CH*S)
print('cell',CW,CH,'->',cw,ch,'anchorY from top',(Up+4)/CH)
for n,fr in data.items():
    strip=Image.new('RGBA',(CW*4,CH),(0,0,0,0))
    for i,f in enumerate(fr):
        im=Image.fromarray(f['img'])
        strip.alpha_composite(im,(int(round(i*CW+half-f['ax'])),int(round(Up+4-f['ay']))))
    strip=strip.resize((cw*4,ch),Image.LANCZOS)
    strip.save(f'{OUT}/{NAME}-{n}.webp','WEBP',quality=88,method=6)
    print(n,[round(f['capx']) for f in fr])
