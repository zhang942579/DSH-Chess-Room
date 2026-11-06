"""Generate faithful expression cutouts from the user-supplied whale maid PNG.
Only assets/expressions and deliverables are generated. Requires Pillow/numpy.
Run: python scripts/build-expressions.py
The source is a read-only attachment COPY; source.png is never altered in place.
"""
from __future__ import annotations
import argparse
from collections import deque
import hashlib
import json
import math
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, features

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "expressions"
DELIVER = ROOT / "deliverables" / "expressions"
SOURCE = ASSETS / "source.png"
STATES = ("idle", "thinking", "smug", "surprised", "troubled", "victory", "defeat")
SIZE = 448
WEBP_SIZE = 384
GIF_SIZE = 384
FRAMES = 24
DURATION = 100
INK = (54, 34, 46, 255)
MOUTH_INK = (120, 71, 68, 255)
BROW = (171, 117, 119, 235)


def flood_exterior(image: Image.Image) -> tuple[Image.Image, dict]:
    """Remove only neutral-white pixels connected to the exterior.

    The boundary is the connected neutral-white component. Dark outlines prevent
    the fill reaching the white headband/apron/eye whites. No global white erase.
    A one-pixel subthreshold outside fringe receives alpha inferred from its
    contrast to nearby opaque outlines, to avoid white matting on dark themes.
    """
    a = np.asarray(image.convert("RGB")).copy()
    h, w = a.shape[:2]
    minimum = a.min(axis=2)
    spread = a.max(axis=2).astype(np.int16) - minimum.astype(np.int16)
    eligible = (minimum >= 220) & (spread <= 40)
    seen = np.zeros((h, w), dtype=bool)
    queue = deque()
    for x in range(w):
        if eligible[0, x]: queue.append((0, x)); seen[0, x] = True
        if eligible[h-1, x]: queue.append((h-1, x)); seen[h-1, x] = True
    for y in range(1, h-1):
        if eligible[y, 0]: queue.append((y, 0)); seen[y, 0] = True
        if eligible[y, w-1]: queue.append((y, w-1)); seen[y, w-1] = True
    # Parent-approved, visually validated negative-space holes only: the two
    # hair loops and the small gap between right hair and whale tail. Their
    # bright connected components are background, not headband/apron whites.
    negative_space_seeds = [(105,592),(726,558),(747,736)]
    for x,y in negative_space_seeds:
        assert eligible[y,x], (x,y,"negative-space seed")
        queue.append((y,x)); seen[y,x]=True
    while queue:
        y, x = queue.popleft()
        for yy, xx in ((y-1,x), (y+1,x), (y,x-1), (y,x+1)):
            if 0 <= yy < h and 0 <= xx < w and eligible[yy,xx] and not seen[yy,xx]:
                seen[yy,xx] = True
                queue.append((yy,xx))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # Only the visible outside rim is de-matted; never process enclosed whites.
    outer = Image.fromarray((seen * 255).astype(np.uint8))
    rim = (np.asarray(outer.filter(ImageFilter.MaxFilter(3))) > 0) & ~seen
    dark = np.asarray(Image.fromarray(a).filter(ImageFilter.MinFilter(5))).astype(float)
    ys, xs = np.where(rim & (minimum > 100))
    for y, x in zip(ys, xs):
        color = a[y,x].astype(float)
        bg = dark[y,x]
        denom = 255 - bg
        channels = denom > 35
        if not channels.any(): continue
        opacity = float(np.clip(np.max((255-color[channels])/denom[channels]), 0, 1))
        if opacity < .14:
            alpha[y,x] = 0
        elif opacity < .98:
            alpha[y,x] = round(255 * opacity)
            a[y,x] = np.clip(255 + (color-255)/opacity, 0, 255).astype(np.uint8)
    # Remove tiny isolated scanner/antialias specks outside the intact figure.
    # A seeded foreground connectivity pass does not erase any enclosed whites.
    connected = np.zeros((h,w),dtype=bool)
    q = deque([(400,400)])
    connected[400,400] = True
    while q:
        y,x = q.popleft()
        for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1),(y-1,x-1),(y-1,x+1),(y+1,x-1),(y+1,x+1)):
            if 0 <= yy < h and 0 <= xx < w and alpha[yy,xx] and not connected[yy,xx]:
                connected[yy,xx]=True; q.append((yy,xx))
    alpha[~connected]=0
    a[alpha==0] = 0
    result = Image.fromarray(np.dstack([a, alpha]), "RGBA")
    return result, {"method": "4-connected exterior neutral-white flood fill plus three manually validated negative-space hole seeds; local one-pixel matte removal and isolated-speck cleanup", "backgroundPixels": int(seen.sum()), "negativeSpaceSeeds": negative_space_seeds, "opaqueClothingAndEyeWhites": True}


def polygon_mask(points, feather=1.3):
    m = Image.new("L", (910, 941))
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather))

# These irregular polygons follow visible lashes/eye whites. The notch of the
# left eye follows the bangs; no rectangular face patch is drawn.
EYE_POINTS = [
    [(236,439),(243,418),(257,398),(261,389),(268,390),(274,386),
     (283,388),(295,390),(308,398),(314,415),(325,428),(335,433),
     (340,450),(337,473),(327,485),(308,491),(287,491),(269,485),
     (254,475),(246,463),(240,450)],
    [(426,414),(435,397),(455,387),(477,382),(495,382),(504,377),
     (509,385),(526,394),(538,408),(547,423),(541,442),(535,464),
     (522,478),(501,487),(479,489),(457,486),(442,478),(432,463),
     (425,441)]
]
EYE_MASKS = [polygon_mask(p, 1.15) for p in EYE_POINTS]
EYE_BOXES = [(230,386,344,496),(420,372,552,495)]
MOUTH_MASK = polygon_mask([(363,491),(373,486),(410,486),(421,493),(425,513),(421,530),(408,540),(382,540),(365,530),(359,510)], 2.5)


def skin_fill(image, mask, region):
    """Feathered, textured, warm local skin fill inside the drawn feature mask."""
    x0, y0, x1, y1 = region
    rgb = np.asarray(image).copy()
    yy, xx = np.mgrid[y0:y1, x0:x1]
    if region[0] < 360 and region[1] < 480:
        # Preserve the original pink cheek gradation below the left eye.
        t = np.clip((yy-463)/42, 0, 1)
        fill = np.stack([253 + 0*t, 237-26*t, 231-24*t], axis=2)
    elif region[0] >= 420:
        t = np.clip((yy-462)/42, 0, 1)
        fill = np.stack([253 + 0*t, 238-27*t, 231-24*t], axis=2)
    else:
        fill = np.stack([np.full_like(xx,253),np.full_like(xx,236),np.full_like(xx,229)],axis=2).astype(float)
    # Very faint source-like grain; deterministic, never a flat solid patch.
    grain = np.random.default_rng(810).normal(0, .32, (y1-y0,x1-x0,1))
    fill = np.clip(fill+grain,0,255)
    blend = np.asarray(mask.crop(region)).astype(float)[...,None]/255
    rgb[y0:y1,x0:x1,:3] = np.round(rgb[y0:y1,x0:x1,:3]*(1-blend)+fill*blend).astype(np.uint8)
    return Image.fromarray(rgb, "RGBA")


def bezier(points, steps=45):
    p = np.array(points, dtype=float)
    n = len(points)-1
    result=[]
    for t in np.linspace(0,1,steps):
        xy = sum(math.comb(n,i)*(1-t)**(n-i)*t**i*p[i] for i in range(n+1))
        result.append(tuple(xy))
    return result


def stroke(draw, points, fill, width=4):
    xy=bezier(points)
    draw.line(xy,fill=fill,width=width,joint="curve")
    r=width/2
    for x,y in (xy[0],xy[-1]): draw.ellipse((x-r,y-r,x+r,y+r),fill=fill)


def soften_layer(layer, sigma=.35):
    return layer.filter(ImageFilter.GaussianBlur(sigma))


class Artist:
    def __init__(self, source):
        self.source=source
        self.clean=source.copy()
        for mask,box in zip(EYE_MASKS,EYE_BOXES):
            self.clean=skin_fill(self.clean, mask, box)
        self.clean=skin_fill(self.clean,MOUTH_MASK,(355,480,430,545))
        # Remove the source's faint brows once, then restore/draw exactly one
        # matching pair per state; avoid doubled brows under compressed eyes.
        self.brow_masks=[polygon_mask([(250,391),(267,380),(290,380),(298,387),(294,394),(273,393),(251,398)],1.8),polygon_mask([(429,393),(438,378),(453,370),(475,368),(482,375),(478,382),(463,384),(446,389),(433,399)],1.8)]
        for mask,box in zip(self.brow_masks,[(247,376,302,402),(425,364,486,403)]):
            self.clean=skin_fill(self.clean,mask,box)
        self.eyes=[]
        for i,(mask,box) in enumerate(zip(EYE_MASKS,EYE_BOXES)):
            eye=source.crop(box).copy()
            eye_alpha=np.asarray(mask.crop(box)).astype(float)*(1-np.asarray(self.brow_masks[i].crop(box)).astype(float)/255)
            gy,gx=np.mgrid[box[1]:box[3],box[0]:box[2]]
            top=np.where(gx<450,399-.7*(gx-430),np.where(gx<496,381,375)) if i==1 else np.where(gx<278,386,np.where(gx<309,394,0))
            eye_alpha[gy<top]=0
            eye.putalpha(Image.fromarray(np.round(eye_alpha).astype(np.uint8)))
            self.eyes.append(eye)
        # Hair foreground is restored above reshaped eyes, preserving fine bangs.
        rgb=np.asarray(source)
        y,x=np.mgrid[:941,:910]
        blue=(rgb[:,:,2].astype(int)-rgb[:,:,0].astype(int)>14)&(rgb[:,:,1]>42)
        domain=((x>300)&(x<352)&(y>374)&(y<430)&(y < 1.6*(x-300)+394)) | ((x>527)&(x<557)&(y>392)&(y<481)) | ((x>227)&(x<251)&(y>405)&(y<464))
        restore=blue&domain
        left_candidates=restore&(x>300)&(x<352)
        kept=np.zeros_like(left_candidates)
        q=deque([(385,320)])
        kept[385,320]=True
        while q:
            yy,xx=q.popleft()
            for y2,x2 in ((yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1),(yy-1,xx-1),(yy-1,xx+1),(yy+1,xx-1),(yy+1,xx+1)):
                if 0<=y2<941 and 0<=x2<910 and left_candidates[y2,x2] and not kept[y2,x2]:
                    kept[y2,x2]=True; q.append((y2,x2))
        restore[(x>300)&(x<352)]=kept[(x>300)&(x<352)]
        self.hair=source.copy()
        self.hair.putalpha(Image.fromarray((restore*255).astype(np.uint8)))

    def open_eye(self,canvas,index,openness=1,shift=0,tilt=0):
        if openness>=.995 and abs(shift)<.01 and abs(tilt)<.01:
            canvas.alpha_composite(self.eyes[index],EYE_BOXES[index][:2]); return
        original=self.eyes[index]
        new_h=max(3,round(original.height*openness))
        eye=original.resize((original.width,new_h),Image.Resampling.LANCZOS)
        if tilt:
            eye=eye.rotate(tilt,Image.Resampling.BICUBIC,expand=True)
        x0,y0,x1,y1=EYE_BOXES[index]
        # Upper lid gently descends, lower lid stays near its original location.
        center=(y0+y1)/2+shift+4*(1-openness)
        canvas.alpha_composite(eye,(round((x0+x1-eye.width)/2),round(center-eye.height/2)))

    def closed_eye(self,canvas,index,style="soft",amount=1):
        layer=Image.new("RGBA",canvas.size)
        d=ImageDraw.Draw(layer)
        left=index==0
        if left: x0,x1,cy=256,329,449
        else: x0,x1,cy=441,527,445
        if style=="joy":
            stroke(d,[(x0,cy+5),(x0+19,cy-27),(x1-17,cy-24),(x1,cy+3)],INK,6)
        elif style=="down":
            stroke(d,[(x0,cy-2),(x0+21,cy+9),(x1-17,cy+12),(x1,cy+2)],INK,5)
        elif style=="wink":
            stroke(d,[(x0,cy+8),(x0+29,cy-6),(x1,cy+3)],INK,6)
        else:
            stroke(d,[(x0,cy-1),(x0+24,cy+12),(x1-16,cy+11),(x1,cy)],INK,5)
        outer=x0 if left else x1
        stroke(d,[(outer,cy),(outer+(-8 if left else 8),cy-4)],INK,4)
        canvas.alpha_composite(soften_layer(layer))

    def mouth(self,canvas,state,phase):
        if state=="idle":
            mouth=self.source.crop((357,482,430,545)).copy()
            mouth.putalpha(MOUTH_MASK.crop((357,482,430,545)))
            canvas.alpha_composite(mouth,(357,482)); return
        layer=Image.new("RGBA",canvas.size)
        d=ImageDraw.Draw(layer)
        if state=="thinking":
            stroke(d,[(374,518),(385,521),(401,519),(409,516)],MOUTH_INK,3)
            stroke(d,[(401,516),(408,518),(412,515)],MOUTH_INK,2)
        elif state=="smug":
            stroke(d,[(371,515),(386,533),(410,525),(417,508)],MOUTH_INK,4)
            stroke(d,[(412,510),(417,508),(420,512)],MOUTH_INK,2)
        elif state=="surprised":
            points=bezier([(382,499),(367,508),(375,537),(393,537)])+bezier([(393,537),(414,536),(411,501),(396,496)])+bezier([(396,496),(390,495),(386,497),(382,499)])
            d.polygon(points,fill=(157,89,89,255))
            d.ellipse((379,514,405,535),fill=(245,165,166,255))
            d.line(points+[points[0]],fill=MOUTH_INK,width=3,joint="curve")
        elif state=="troubled":
            stroke(d,[(371,522),(380,514),(385,530),(392,521)],MOUTH_INK,3)
            stroke(d,[(392,521),(401,512),(406,529),(414,520)],MOUTH_INK,3)
        elif state=="victory":
            points=bezier([(366,498),(382,491),(402,492),(420,495)])+bezier([(420,495),(432,545),(363,552),(366,498)])
            d.polygon(points,fill=(151,78,81,255))
            tongue=bezier([(371,519),(386,507),(410,510),(417,521)])+bezier([(417,521),(411,543),(378,549),(371,519)])
            d.polygon(tongue,fill=(247,161,161,255))
            d.line(points+[points[0]],fill=MOUTH_INK,width=3,joint="curve")
        elif state=="defeat":
            stroke(d,[(374,526),(385,512),(405,512),(416,525)],MOUTH_INK,3)
        canvas.alpha_composite(soften_layer(layer,.6))

    def brows(self,canvas,state):
        if state in ("idle","surprised","victory"):
            for mask in self.brow_masks:
                layer=self.source.copy(); layer.putalpha(mask)
                canvas.alpha_composite(layer)
            return
        if state in ("thinking","smug"):
            layer=self.source.copy(); layer.putalpha(self.brow_masks[0])
            canvas.alpha_composite(layer)
        layer=Image.new("RGBA",canvas.size); d=ImageDraw.Draw(layer)
        # Subtle short brows stay entirely within the exposed skin wedges.
        if state in ("troubled","defeat"):
            stroke(d,[(260,386),(278,389),(291,396)],BROW,3)
            stroke(d,[(435,388),(449,374),(465,372)],BROW,3)
        elif state=="thinking":
            stroke(d,[(438,391),(450,388),(469,389)],BROW,3)
        elif state=="smug":
            stroke(d,[(441,386),(455,390),(467,394)],BROW,3)
        canvas.alpha_composite(soften_layer(layer,.7))

    def cheeks(self,canvas,state,phase):
        if state not in ("smug","victory","troubled","defeat"): return
        layer=Image.new("RGBA",canvas.size); d=ImageDraw.Draw(layer)
        opacity=40 if state=="victory" else 20
        d.ellipse((251,480,310,526),fill=(242,145,149,opacity))
        d.ellipse((469,478,526,520),fill=(242,145,149,opacity))
        canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(7)))
        if state in ("troubled","defeat"):
            tear_layer=Image.new("RGBA",canvas.size); d=ImageDraw.Draw(tear_layer)
            t=(phase/(2*math.pi))%1
            for x0,y0,offset in ((266,477,0),(521,476,.43)):
                if state=="troubled" and x0==266: continue
                travel=((t+offset)%1)*14
                yy=y0+travel
                pts=bezier([(x0,yy),(x0-9,yy+12),(x0-8,yy+23),(x0,yy+24)])+bezier([(x0,yy+24),(x0+9,yy+23),(x0+7,yy+11),(x0,yy)])
                d.polygon(pts,fill=(138,205,237,218))
                d.line(pts+[pts[0]],fill=(89,147,179,235),width=2)
                d.ellipse((x0-4,yy+10,x0-1,yy+17),fill=(244,253,255,220))
            canvas.alpha_composite(soften_layer(tear_layer,.5))

    def face(self,state,blink=0,phase=0):
        canvas=self.clean.copy()
        eye_settings={"idle":(1,1),"thinking":(.75,.70),"smug":(0,.68),"surprised":(1.035,1.035),"troubled":(.83,.86),"victory":(0,0),"defeat":(0,0)}
        for i,opening in enumerate(eye_settings[state]):
            if state in ("victory","defeat"):
                self.closed_eye(canvas,i,"joy" if state=="victory" else "down")
            elif state=="smug" and i==0:
                self.closed_eye(canvas,i,"wink")
            elif blink>=.9:
                self.closed_eye(canvas,i)
            else:
                opening*=1-.87*blink
                shift=3 if state=="thinking" else (-2 if state=="surprised" else 1 if state in ("troubled","smug") else 0)
                tilt=(3 if i==0 else -3) if state=="troubled" else (2 if state=="smug" else 0)
                self.open_eye(canvas,i,opening,shift,tilt)
        canvas.alpha_composite(self.hair)
        self.mouth(canvas,state,phase)
        self.brows(canvas,state)
        self.cheeks(canvas,state,phase)
        return canvas


def star(draw,cx,cy,r,color,angle=0):
    points=[]
    for i in range(8):
        a=angle+i*math.pi/4
        rr=r if i%2==0 else r*.22
        points.append((cx+math.cos(a)*rr,cy+math.sin(a)*rr))
    draw.polygon(points,fill=color)


def effects(canvas,state,phase):
    layer=Image.new("RGBA",canvas.size); d=ImageDraw.Draw(layer)
    wave=math.sin(phase)
    if state=="thinking":
        # Three drifting translucent thought bubbles, no burned-in words.
        for i,(x,y,r) in enumerate(((313,161,3),(330,146,5),(348,126,9))):
            off=math.sin(phase-i*.7)*2
            d.ellipse((x-r,y+off-r,x+r,y+off+r),fill=(225,242,255,150),outline=(114,169,212,220),width=2)
    elif state=="smug":
        star(d,329,204,6+wave*.8,(255,215,126,225),phase*.15)
    elif state=="surprised":
        for i,a in enumerate((-70,-40,-10)):
            rad=math.radians(a)
            xx=331+math.cos(rad)*17; yy=162+math.sin(rad)*17
            width=2
            d.line((xx,yy,xx+math.cos(rad)*9,yy+math.sin(rad)*9),fill=(107,166,214,round(180+55*(wave+1)/2)),width=width)
    elif state=="troubled":
        # A small skin-adjacent sweat drop complements the actual worried face.
        x,y=321,188+wave*2
        pts=bezier([(x,y),(x-5,y+7),(x-6,y+14),(x,y+15)])+bezier([(x,y+15),(x+7,y+14),(x+6,y+7),(x,y)])
        d.polygon(pts,fill=(130,200,234,215)); d.line(pts+[pts[0]],fill=(96,154,193,230),width=1)
    elif state=="victory":
        for i,(x,y,r) in enumerate(((91,131,9),(351,152,10),(327,95,6),(99,280,6))):
            pul=.76+.24*math.sin(phase+i*1.6)
            star(d,x,y+math.sin(phase+i)*2,r*pul,(255,210,110,round(170+75*pul)),phase*.13)
        # A handful of restrained celebratory confetti flakes.
        for i,(x,y) in enumerate(((73,189),(365,238),(125,88),(345,305))):
            yy=y+5*math.sin(phase+i)
            d.line((x,yy,x+3,yy+5),fill=((120,196,226,215) if i%2 else (242,176,191,215)),width=3)
    elif state=="defeat":
        # Small gently pulsing stress lines outside the hair, not across its paint.
        for i in range(3):
            x=101+i*7; y=164+wave*2
            d.line((x,y,x-2,y+12+i*2),fill=(95,126,185,175),width=2)
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(.3)))
    return canvas


def frame(artist,state,index=None):
    phase=0 if index is None else 2*math.pi*index/FRAMES
    blink=0
    if index is not None:
        blink={6:.50,7:1,8:.45}.get(index,0)
    portrait=artist.face(state,blink,phase)
    # Keep the intact source figure and tail on a square transparent canvas.
    cropped=portrait.crop((18,9,895,925))
    height=408
    breathing=1 if index is None else 1+.0045*math.sin(phase)
    target=(round(877*height/916),round(height*breathing))
    small=cropped.resize(target,Image.Resampling.LANCZOS)
    if index is not None:
        amplitude=.65 if state not in ("troubled","defeat") else .35
        small=small.rotate(amplitude*math.sin(phase),Image.Resampling.BICUBIC,expand=True)
    canvas=Image.new("RGBA",(SIZE,SIZE))
    y=SIZE-small.height-17 + (0 if index is None else round(1.1*math.sin(phase)))
    x=(SIZE-small.width)//2 + (0 if index is None else round(.8*math.sin(phase)))
    canvas.alpha_composite(small,(x,y))
    return effects(canvas,state,phase)


def gif_frames(images):
    """Shared palette, reserved transparent index, binary alpha GIF fallback."""
    thumb=[im.resize((GIF_SIZE,GIF_SIZE),Image.Resampling.LANCZOS) for im in images]
    # One palette for the loop avoids shimmering palette changes.
    palette_size=128
    sample=Image.new("RGB",(palette_size*6,palette_size*4),(239,239,246))
    for i,im in enumerate(thumb):
        small=im.resize((palette_size,palette_size),Image.Resampling.LANCZOS)
        rgb=Image.new("RGB",small.size,(239,239,246)); rgb.paste(small,mask=small.getchannel("A"))
        sample.paste(rgb,((i%6)*palette_size,(i//6)*palette_size))
    pal=sample.quantize(colors=255,method=Image.Quantize.MEDIANCUT)
    palette=pal.getpalette()[:765]+[0,255,0]
    palette_holder=Image.new("P",(1,1)); palette_holder.putpalette(palette)
    result=[]
    for im in thumb:
        # Unmatted RGB is selected only for pixels retained by the GIF alpha mask.
        p=im.convert("RGB").quantize(palette=palette_holder,dither=Image.Dither.NONE)
        pixels=np.asarray(p).copy()
        pixels[np.asarray(im.getchannel("A"))<128]=255
        out=Image.fromarray(pixels,"P"); out.putpalette(palette)
        out.info["transparency"]=255
        result.append(out)
    return result


def contact_sheet(previews):
    width,height=1400,825
    sheet=Image.new("RGB",(width,height),(233,239,248)); d=ImageDraw.Draw(sheet)
    fontpath=Path("C:/Windows/Fonts/segoeui.ttf")
    titlefont=ImageFont.truetype(str(fontpath),28) if fontpath.exists() else ImageFont.load_default()
    font=ImageFont.truetype(str(fontpath),19) if fontpath.exists() else ImageFont.load_default()
    smallfont=ImageFont.truetype(str(fontpath),14) if fontpath.exists() else ImageFont.load_default()
    d.text((27,16),"Whale maid · seven expression assets",font=titlefont,fill=(32,51,85))
    d.text((28,56),"Faithful facial edits from the supplied avatar · PNG / animated alpha WebP / GIF",font=smallfont,fill=(83,105,137))
    labels={"idle":"Idle · gentle blink", "thinking":"Thinking · lowered gaze", "smug":"Smug · wink + grin", "surprised":"Surprised · round mouth", "troubled":"Troubled · worry + tear", "victory":"Victory · closed-eye joy", "defeat":"Defeat · frown + tears"}
    for i,state in enumerate(STATES):
        row=i//4; col=i%4
        x=22+col*345; y=93+row*356
        d.rounded_rectangle((x,y,x+331,y+340),radius=14,fill=(251,253,255),outline=(208,220,236),width=1)
        # Checkerboard shows actual alpha, not a fake UI screenshot.
        for yy in range(y+13,y+300,12):
            for xx in range(x+20,x+312,12):
                color=(236,241,248) if ((xx-x)//12+(yy-y)//12)%2 else (251,253,255)
                d.rectangle((xx,yy,min(xx+11,x+312),min(yy+11,y+300)),fill=color)
        avatar=previews[state].resize((288,288),Image.Resampling.LANCZOS)
        sheet.paste(avatar,(x+22,y+12),avatar)
        d.text((x+16,y+307),labels[state],font=font,fill=(42,62,96))
    sheet.save(DELIVER/"seven-state-contact-sheet.png",optimize=True)
    # Inspection strip, deliberately face-focused rather than an image mockup.
    strip=Image.new("RGB",(7*260,280),(245,248,253)); sd=ImageDraw.Draw(strip)
    for i,state in enumerate(STATES):
        crop=previews[state].crop((112,174,262,267)).resize((250,155),Image.Resampling.LANCZOS)
        strip.paste(crop,(i*260+5,40),crop)
        sd.text((i*260+12,225),state,font=font,fill=(42,62,96))
    strip.save(DELIVER/"face-detail-review.png",optimize=True)


def validate(manifest, artist=None):
    assert manifest['source']['sha256']=='84c38e06f675b615189c848965b77607542b7df9d2ce99c578734d0f8a6f0284', 'source integrity'
    identity={}
    if artist is not None:
        outside=np.ones((941,910),dtype=bool); outside[360:555,220:565]=False
        reference=np.asarray(artist.source)
        for state in STATES:
            edited=np.asarray(artist.face(state))
            different=int(np.any(edited!=reference,axis=2)[outside].sum())
            assert different==0, (state,'identity outside face',different)
            identity[state]={'changedSourcePixelsOutsideFacialRegion':different}
    results={}
    for state,item in manifest["expressions"].items():
        report={}
        for fmt in ("png","webp","gif"):
            path=ASSETS/item[fmt]
            with Image.open(path) as im:
                frames=getattr(im,"n_frames",1)
                sizes=[]; durations=[]; rgba=[]
                for n in range(frames):
                    im.seek(n)
                    sizes.append(im.size)
                    decoded=im.convert("RGBA")
                    durations.append(im.info.get("duration",0))
                    rgba.append(np.asarray(decoded))
                alpha=rgba[0][:,:,3]
                report[fmt]={"bytes":path.stat().st_size,"dimensions":list(im.size),"frames":frames,"durationMs":sum(durations),"transparentPixels":int((alpha==0).sum()),"opaquePixels":int((alpha==255).sum()),"partialAlphaPixels":int(((alpha>0)&(alpha<255)).sum()),"identicalSizeAcrossFrames":len(set(sizes))==1,"distinctDecodedFrames":len({hashlib.sha256(f.tobytes()).hexdigest() for f in rgba})}
                assert frames==(1 if fmt=="png" else FRAMES),(state,fmt,frames)
                assert (alpha==0).any() and (alpha==255).any(),(state,fmt,"alpha")
                expected=SIZE if fmt=='png' else WEBP_SIZE if fmt=='webp' else GIF_SIZE
                assert all(s==(expected,expected) for s in sizes),(state,fmt,'dimensions')
                assert all(a[0,0,3]==0 and a[-1,-1,3]==0 for a in rgba),(state,fmt,'transparent corners')
                if fmt in ('png','webp'):
                    assert report[fmt]['partialAlphaPixels']>0,(state,fmt,'smooth alpha')
                if fmt!="png":
                    assert report[fmt]["durationMs"]==FRAMES*DURATION and all(t==DURATION for t in durations),(state,fmt,durations)
                    # Breathing/sway use a symmetric sine loop: some returning
                    # poses repeat legitimately, especially after GIF quantizing.
                    minimum_unique=16 if fmt=='gif' else 20
                    assert report[fmt]["distinctDecodedFrames"]>=minimum_unique,(state,fmt,"animation")
                # Center of original white headband and whale apron remain opaque.
                scale=im.width/SIZE
                for xx,yy in ((220,65),(217,340)):
                    assert alpha[round(yy*scale),round(xx*scale)]==255,(state,fmt,"enclosed-white")
        results[state]=report
    (DELIVER/"integrity-report.json").write_text(json.dumps({"tests":"all passed","sourceSha256MatchesAttachment":True,"identityPixelTests":identity,"animationNote":"Symmetric returning poses can repeat; decoded unique frames are explicitly reported, not claimed to be 24 for every fallback loop.","states":results,"libraries":{"pillowWebP":features.check('webp'),"webPAnimationDecoded":all(results[s]['webp']['frames']==FRAMES for s in STATES),"webPVersion":features.version('webp')}},indent=2),encoding="utf-8")
    return results


def main(verify_existing=False):
    DELIVER.mkdir(parents=True,exist_ok=True)
    source=Image.open(SOURCE).convert("RGBA")
    assert source.size==(910,941),source.size
    cutout,alpha_info=flood_exterior(source)
    cutout.save(ASSETS/"source-cutout.png",optimize=True)
    artist=Artist(cutout)
    previews={}
    manifest={"schemaVersion":1,"source":{"file":"source.png","sha256":hashlib.sha256(SOURCE.read_bytes()).hexdigest(),"dimensions":[910,941],"rights":"User-supplied avatar; derivative edits for this local request. Original ownership/license not independently verified.","alphaExtraction":alpha_info},"defaultFormat":"webp","canvas":{"png":[SIZE,SIZE],"webp":[WEBP_SIZE,WEBP_SIZE],"gif":[GIF_SIZE,GIF_SIZE]},"animation":{"fps":10,"durationMs":FRAMES*DURATION,"loop":0,"frameCount":FRAMES},"expressions":{}}
    for state in STATES:
        print("Verifying" if verify_existing else "Building",state,flush=True)
        if verify_existing:
            with Image.open(ASSETS/f'{state}.png') as image:
                still=image.convert('RGBA').copy()
        else:
            still=frame(artist,state)
            still.save(ASSETS/f"{state}.png",optimize=True)
            animated=[frame(artist,state,n) for n in range(FRAMES)]
            webps=[im.resize((WEBP_SIZE,WEBP_SIZE),Image.Resampling.LANCZOS) for im in animated]
            webps[0].save(ASSETS/f"{state}.webp",format="WEBP",save_all=True,append_images=webps[1:],duration=DURATION,loop=0,quality=82,method=4,lossless=False,allow_mixed=True,minimize_size=True)
            gifs=gif_frames(animated)
            gifs[0].save(ASSETS/f"{state}.gif",save_all=True,append_images=gifs[1:],duration=DURATION,loop=0,transparency=255,disposal=2,optimize=False)
        previews[state]=still
        manifest["expressions"][state]={"png":f"{state}.png","webp":f"{state}.webp","gif":f"{state}.gif","width":SIZE,"height":SIZE,"webpWidth":WEBP_SIZE,"webpHeight":WEBP_SIZE,"gifWidth":GIF_SIZE,"gifHeight":GIF_SIZE,"frames":FRAMES,"frameCount":FRAMES,"durationMs":FRAMES*DURATION,"fps":10,"loop":0,"alt":f"User's blue-haired whale maid, {state} facial expression","animation":"facial blink where eyes are open; breathing and gentle sway; expression-specific illustrated effects"}
    contact_sheet(previews)
    reports=validate(manifest,artist)
    for state,item in manifest["expressions"].items():
        item["bytes"]={fmt:reports[state][fmt]["bytes"] for fmt in ("png","webp","gif")}
    manifest["totalRuntimeBytes"]={fmt:sum(reports[s][fmt]["bytes"] for s in STATES) for fmt in ("png","webp","gif")}
    (ASSETS/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    # The archive carries the lossless source/cutout and each requested original
    # expression output, plus the independently downloadable genuine overview.
    archive=DELIVER/"whale-maid-seven-expressions.zip"
    with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for path in sorted(ASSETS.glob("*")):
            if path.is_file(): z.write(path,f"assets/expressions/{path.name}")
        for name in ("seven-state-contact-sheet.png","face-detail-review.png","integrity-report.json","asset-notes.md"):
            if (DELIVER/name).exists(): z.write(DELIVER/name,f"deliverables/{name}")
        z.write(Path(__file__),"scripts/build-expressions.py")
    print(json.dumps({"runtimeBytes":manifest["totalRuntimeBytes"],"zipBytes":archive.stat().st_size,"integrity":"passed"},indent=2),flush=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-existing',action='store_true',help='Decode/verify existing outputs and rebuild manifest, overview and ZIP without rerendering expressions')
    main(parser.parse_args().verify_existing)
