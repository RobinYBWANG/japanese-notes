# build_mockfull.py —— 把 docs/data/paper-X.json 嵌進 n5-mock-full.html
#
# 題目與選項都固定，所以考卷是先產成 JSON（scratchpad 的 paper_a.py）再嵌進頁面，
# 不在前端即時組，也不洗牌 —— 換裝置、重考都是同一份。
# 執行：python3 build_mockfull.py
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.normpath(os.path.join(HERE, '..'))
HTML = os.path.join(DOCS, 'n5-mock-full.html')

os.environ['PYTHONIOENCODING'] = 'utf-8'
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

h = open(HTML, encoding='utf-8').read()
n = 0
for pid in ('A', 'B', 'C'):
    src = os.path.join(DOCS, 'data', 'paper-%s.json' % pid)
    if not os.path.exists(src):
        continue
    data = json.load(open(src, encoding='utf-8'))
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    assert '</script' not in blob
    tag = '<script id="paper-%s" type="application/json">' % pid
    i = h.index(tag) + len(tag)
    j = h.index('</script>', i)
    h = h[:i] + blob + h[j:]
    n += 1
    print('嵌入 %s 卷：%d 題、%.1fKB' % (pid, sum(s['n'] for s in data['sections']), len(blob) / 1024))

fd = os.open(HTML, os.O_WRONLY | os.O_TRUNC)
os.write(fd, h.encode('utf-8')); os.fsync(fd); os.close(fd)

h2 = open(HTML, encoding='utf-8').read()
assert h2.rstrip().endswith('</html>')
assert h2.count('<script') == h2.count('</script>')
blocks = [b for t, b in re.findall(r'<script([^>]*)>(.*?)</script>', h2, re.S) if 'application/json' not in t]
for k, b in enumerate(blocks):
    fn = os.path.join(HERE, '_mf%d.js' % k)
    open(fn, 'w', encoding='utf-8').write(b)
    subprocess.run(['node', '--check', fn], check=True)
    os.remove(fn)
print('完成：%d 份考卷；%s 現在 %.2fMB' % (n, os.path.basename(HTML), os.path.getsize(HTML) / 1e6))
