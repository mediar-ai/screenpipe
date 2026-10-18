#!/usr/bin/env python3
# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Synthetic local screenshots only. Requires Pillow; accepts a font path."""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
p=argparse.ArgumentParser();p.add_argument('folder');p.add_argument('--font',required=True);a=p.parse_args()
folder=Path(a.folder);folder.mkdir(parents=True,exist_ok=True)
for w,h in [(512,512),(1920,1080),(3840,2160)]:
    im=Image.new('RGB',(w,h),'#f0f3f8');d=ImageDraw.Draw(im)
    font=ImageFont.truetype(a.font,max(14,w//80))
    for row in range(0,h-30,max(28,w//50)):
        d.text((20,row+10),f'Synthetic row {row}: Jordan Example, jordan@example.test | token: sk_test_0123456789abcdef0123456789',font=font,fill='#263143')
    im.save(folder/f'{w}x{h}.png')
