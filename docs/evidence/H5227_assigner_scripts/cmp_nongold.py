import sys, importlib
sys.stdout.reconfigure(encoding='utf-8')
mod = importlib.import_module(sys.argv[1])
V = mod.Verse(sys.argv[2])
new, na = mod.assign(V, mod.DEFAULT)
print(' '.join(f"{i}:{s['syl']} b{p:.2f} n{x:.2f}" for i, (s, p, x) in enumerate(zip(V.syls, V.pred, new))))
