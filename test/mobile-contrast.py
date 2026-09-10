"""Check foreground contrast over the rendered phone scenes, not source colors."""
from pathlib import Path
import json
import re
from PIL import Image
ROOT = Path(__file__).resolve().parents[1] / 'evidence-mobile'
def luminance(rgb):
    channels = [v / 255 for v in rgb]
    channels = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(a * b for a, b in zip(channels, [.2126, .7152, .0722]))
results = []
for browser in ['chromium', 'webkit']:
    scenes = json.loads((ROOT / f'{browser}-scene-metrics.json').read_text())
    assert {s['skin'] for s in scenes} == {'summer-meadow', 'horizon', 'dunes'}
    for scene in scenes:
        image = Image.open(ROOT / f"{browser}-{scene['skin']}-background.png").convert('RGB')
        # Same text color across each scene. Full viewport samples also cover scrolling extras.
        text = luminance([float(v) for v in re.findall(r'[\d.]+', scene['boxes'][0]['color'])[:3]])
        ratios = []
        for y in range(0, image.height, 4):
            for x in range(0, image.width, 4):
                bg = luminance(image.getpixel((x, y)))
                ratios.append((max(text, bg) + .05) / (min(text, bg) + .05))
        minimum = min(ratios)
        results.append({'browser': browser, 'scene': scene['skin'], 'minimum_sampled_ratio': minimum})
        print(browser, scene['skin'], f'{minimum:.2f}:1')
assert len(results) == 6
(ROOT / 'scene-contrast.json').write_text(json.dumps(results, indent=2) + '\n')
assert all(r['minimum_sampled_ratio'] >= 4.5 for r in results), 'Scene foreground must pass 4.5:1 in every sampled region'
print('PASS six rendered scene contrast checks (390px portrait; not a full accessibility audit).')
