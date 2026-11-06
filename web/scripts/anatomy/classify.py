"""Classifies every BodyParts3D IS-A mesh into a body system for the 3D anatomy explorer.

Usage: python classify.py <bodyparts3d dir> <out dir>   -> <out dir>/parts.json (see build.mjs)
"""
import glob, math, os, re, collections, json, sys

BP = sys.argv[1] if len(sys.argv) > 1 else 'bp3d'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'

par = collections.defaultdict(set)
name = {}
for l in open(f'{BP}/isa_inclusion_relation_list.txt', encoding='utf8').read().splitlines()[1:]:
    p, pn, c, cn = l.split('\t')[:4]
    par[c].add(p)
    name[p] = pn
    name[c] = cn

memo = {}


def anc(c):
    if c in memo:
        return memo[c]
    out = set()
    for p in par.get(c, ()):
        out.add(p)
        out |= anc(p)
    memo[c] = out
    return out


SKIP = ('ligament', 'membrane', 'raphe', 'hair', 'eyebrow', 'mesentery', 'mesoappendix', 'taenia', 'external ear', 'lip',
        'tarsal plate', 'trochlea of', 'conus elasticus', 'common tendinous ring', 'lacrimal', 'lens', 'vitreous',
        'iliotibial tract', 'linea alba', 'interpeduncular fossa', 'interventricular foramen', 'central canal', 'cavity of',
        'chamber of', 'third ventricle', 'fourth ventricle', 'lateral ventricle', 'cerebral aqueduct', 'penis', 'testis',
        'prostate', 'scrot', 'seminal', 'deferent', 'epididym', 'spermatic', 'urethra')


def system(cid, en):
    n = en.lower()
    if not n or any(k in n for k in SKIP):
        return None
    if n == 'skin':
        return 'integumentary'
    if 'papillary muscle' in n or 'arteries' in n:
        return 'cardiovascular'
    if 'sternum' in n or 'xiphoid' in n:
        return 'skeletal'
    if any(k in n for k in ('trapezius', 'interossei', 'lumbrical', 'levatores', 'intertransversarii', 'interspinales')):
        return 'muscular'
    if any(k in n for k in ('adrenal', 'suprarenal', 'pituitary', 'thyroid gland', 'thymus', 'spleen')):
        return 'glands'
    if 'ileocecal' in n:
        return 'digestive'
    a = {name.get(x, x).lower() for x in anc(cid)} | {n}
    s = ' | '.join(sorted(a))
    has = lambda *ks: any(k in s for k in ks)
    if has('heart', 'cardiac', 'artery', 'vein', 'vena cava', 'aorta', 'vascular', 'atrium', 'valve', 'myocardium', 'pericardi'):
        return 'cardiovascular'
    if has('bone organ', 'cartilage organ', 'intervertebral disk', 'articular disk', 'tooth', 'vertebra', 'skull', 'cranium'):
        return 'skeletal'
    if has('muscle organ', 'head of muscle', 'zone of muscle', 'tendon', 'aponeurosis', 'diaphragm'):
        return 'muscular'
    if has('neuraxis', 'brain', 'nerve', 'neural', 'spinal cord', 'cerebr', 'cerebell', 'ganglion', 'gyrus', 'eyeball', 'retina', 'optic'):
        return 'nervous'
    if has('lung', 'bronch', 'trachea', 'larynx', 'pleura', 'respiratory', 'nasal cavity', 'pharynx'):
        return 'respiratory'
    if has('kidney', 'ureter', 'urinary bladder', 'urethra', 'renal'):
        return 'urinary'
    if has('spleen', 'thymus', 'lymph', 'tonsil'):
        return 'lymphatic'
    if has('stomach', 'intestine', 'jejun', 'ileum', 'duoden', 'colon', 'cecum', 'rectum', 'liver', 'hepat', 'pancrea',
           'gallbladder', 'esophag', 'tongue', 'gingiva', 'palate', 'salivary', 'appendix', 'anal canal', 'oral', 'biliary',
           'bile duct', 'cystic duct'):
        return 'digestive'
    if has('thyroid', 'adrenal', 'suprarenal', 'pituitary', 'hypophysis', 'parathyroid', 'pineal'):
        return 'endocrine'
    return None


rows = []
for f in sorted(glob.glob(f'{BP}/isa_BP3D_4.0_obj_99/*.obj')):
    cid = en = None
    b = None
    with open(f, encoding='utf8', errors='replace') as fh:
        for i, l in enumerate(fh):
            if l.startswith('# Concept ID'):
                cid = l.split(':', 1)[1].strip()
            elif l.startswith('# English name'):
                en = l.split(':', 1)[1].strip()
            elif l.startswith('# Bounds'):
                b = [float(x) for x in re.findall(r'-?\d+\.\d+', l)]
            if i > 14:
                break
    fj = os.path.basename(f)[:-4]
    with open(f, encoding='utf8', errors='replace') as fh:
        faces = sum(1 for l in fh if l.startswith('f '))
    diag = math.dist(b[:3], b[3:]) if b else 0
    rows.append(dict(fj=fj, fma=cid, name=en, system=system(cid, en or ''), bounds=b, faces=faces, diag=diag))

json.dump(rows, open(f'{OUT}/parts.json', 'w'), indent=0)
c = collections.Counter(r['system'] for r in rows)
print(c)
