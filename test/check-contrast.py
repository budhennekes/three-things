"""Check conservative text-region contrast on native background captures.
Requires Pillow and NumPy. Run after npm run test:ui; no personal data is read.
This is a screenshot check, not a complete accessibility audit.
"""
from pathlib import Path
import json
import re
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'evidence-v09'
def luminance(rgb):
    value = np.asarray(rgb, dtype=float) / 255
    value = np.where(value <= .04045, value / 12.92, ((value + .055) / 1.055) ** 2.4)
    return value @ np.array([.2126, .7152, .0722])

records = json.loads((root / 'collection.json').read_text())
results = []
for record in records:
    image = Image.open(root / record['backdrop']).convert('RGB')
    light = luminance(np.asarray(image))
    scale = image.width / record['viewport']['width']
    for sample in record['samples']:
        color = [float(x) for x in re.findall(r'[\d.]+', sample['color'])][:3]
        foreground = luminance(color)
        x, y, width, height = [sample[k] * scale for k in ['x', 'y', 'width', 'height']]
        crop = light[max(0, int(y)):min(image.height, int(y + height)), max(0, int(x)):min(image.width, int(x + width))]
        if not crop.size:
            continue
        minimum = float(((np.maximum(crop, foreground) + .05) / (np.minimum(crop, foreground) + .05)).min())
        threshold = 3 if sample['size'] >= 24 else 4.5
        results.append({'skin': record['skin'], 'mode': record['mode'], 'label': sample['label'], 'contrast': round(minimum, 2), 'required': threshold, 'pass': minimum >= threshold})
(root / 'contrast-results.json').write_text(json.dumps(results, indent=2))
failed = [r for r in results if not r['pass']]
print(json.dumps({'regions': len(results), 'failed': failed, 'minimum': min(r['contrast'] for r in results)}, indent=2))
assert results and not failed
