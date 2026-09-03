#!/usr/bin/env python3
"""Turn the screencast frame dump (variable frame rate) into a constant-frame-rate
PNG sequence and draw the pointer on top, from the click log record.mjs wrote.
The pointer is composited here, in post-production — nothing is injected into the
application while it runs.

usage: python3 compose.py [--fps 30]
reads  out/frames/*.png, out/frames.json, out/cursor.json
writes out/cfr/%05d.png
"""
import argparse, json, math, os, shutil
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

ap = argparse.ArgumentParser()
ap.add_argument('--fps', type=int, default=30)
ap.add_argument('--tail', type=float, default=0.25, help='seconds to hold the last frame')
args = ap.parse_args()

frames = json.load(open(os.path.join(OUT, 'frames.json')))
cursor = json.load(open(os.path.join(OUT, 'cursor.json')))
if not frames:
    raise SystemExit('no frames recorded')

t0 = frames[0]['timestamp']
t_end = frames[-1]['timestamp'] + args.tail
moves = [c for c in cursor if c['kind'] == 'move']
downs = [c['t'] for c in cursor if c['kind'] == 'down']


def pointer_at(t):
    """Linear interpolation between logged waypoints (eased by the recorder itself)."""
    if not moves:
        return None
    if t <= moves[0]['t']:
        return moves[0]['x'], moves[0]['y']
    for a, b in zip(moves, moves[1:]):
        if a['t'] <= t <= b['t']:
            k = 0 if b['t'] == a['t'] else (t - a['t']) / (b['t'] - a['t'])
            return a['x'] + (b['x'] - a['x']) * k, a['y'] + (b['y'] - a['y']) * k
    return moves[-1]['x'], moves[-1]['y']


def draw_pointer(img, x, y, t):
    d = ImageDraw.Draw(img, 'RGBA')
    # click ripple: 320 ms expanding ring after each mouse-down
    for td in downs:
        age = t - td
        if 0 <= age <= 0.32:
            r = 6 + 22 * (age / 0.32)
            alpha = int(200 * (1 - age / 0.32))
            d.ellipse([x - r, y - r, x + r, y + r], outline=(96, 165, 250, alpha), width=3)
    # arrow pointer (16 px tall), white fill with dark outline
    s = 1.15
    pts = [(0, 0), (0, 16), (4.5, 12.5), (7.5, 18.5), (10.5, 17), (7.5, 11), (12, 11)]
    pts = [(x + px * s, y + py * s) for px, py in pts]
    d.polygon(pts, fill=(255, 255, 255, 255), outline=(20, 24, 33, 255))
    d.line(pts + [pts[0]], fill=(20, 24, 33, 255), width=1)


cfr = os.path.join(OUT, 'cfr')
shutil.rmtree(cfr, ignore_errors=True)
os.makedirs(cfr)

n_out = int(math.ceil((t_end - t0) * args.fps))
src_i = 0
cache_idx, cache_img = None, None
for n in range(n_out):
    t = t0 + n / args.fps
    while src_i + 1 < len(frames) and frames[src_i + 1]['timestamp'] <= t:
        src_i += 1
    idx = frames[src_i]['index']
    if idx != cache_idx:
        cache_img = Image.open(os.path.join(OUT, 'frames', f'{idx:05d}.png')).convert('RGB')
        cache_idx = idx
    img = cache_img.copy()
    p = pointer_at(t)
    if p:
        draw_pointer(img, p[0], p[1], t)
    img.save(os.path.join(cfr, f'{n:05d}.png'), compress_level=1)

print(f'[compose] {n_out} frames @ {args.fps} fps = {n_out / args.fps:.1f}s from {len(frames)} captured frames')
