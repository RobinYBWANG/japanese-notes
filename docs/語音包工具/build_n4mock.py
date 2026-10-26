# -*- coding: utf-8 -*-
"""把 n4_bank.py 的題庫嵌進 n4-mock-easy.html（只換 `var BANK = [...]` 和 QUOTA／LABEL 兩段），順便體檢。
   用法：python3 build_n4mock.py → python3 mock_audio.py ../n4-mock-easy.html --prune → node test_n4mock.mjs"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from n4_bank import BANK, TYPE, QUOTA
from n4_level import outside

HTML = os.path.normpath(os.path.join(HERE, '..', 'n4-mock-easy.html'))
DOCS = os.path.dirname(HTML)
LABEL = {'1-1': '漢字読み', '1-2': '表記', '1-3': '文脈規定', '1-4': '言い換え類義', '1-5': '用法',
         '2-1': '文の文法1（文法形式）', '2-2': '文の文法2（文の組み立て）', '2-3': '文章の文法',
         '2-4': '内容理解（短文）', '2-5': '内容理解（中文）', '2-6': '情報検索',
         '3-1': '課題理解', '3-2': 'ポイント理解', '3-3': '発話表現', '3-4': '即時応答'}
FIELDS = ['sec', 'type', 'pass', 'passZh', 'scene', 'audio', 'readChoices', 'audioZh', 'img', 'fixed', 'q', 'c', 'a', 'e']
plain = lambda s: re.sub(r'<[^>]+>', '', s)

bad, out, papers = [], [], {}
for k, items in BANK.items():
    n, cur, done = QUOTA[k], 0, 0
    for i, it in enumerate(items):
        tag = '%s#%d' % (k, i + 1)
        q = dict(it, sec=int(k[0]), type=TYPE[k])
        c, a = q['c'], q['a']
        if not (3 <= len(c) <= 4) or len(set(c)) != len(c) or not (0 <= a < len(c)):
            bad.append('%s 選項或正解不對：%s a=%s' % (tag, c, a))
        if len(q.get('e', '')) < 20:
            bad.append('%s 解說太短' % tag)
        # 漢字程度：表記題只看正解，漢字讀法題的底線也要是 N4 字
        fs = [q['q'], q.get('pass') or ''] + ([c[a]] if k == '1-2' else c) + [l['t'] for l in q.get('audio') or []]
        ko = outside(' '.join(fs))
        if ko:
            bad.append('%s 表外漢字 %s' % (tag, ''.join(ko)))
        for f in [q.get('img'), (q.get('scene') or {}).get('img')]:
            if f and not os.path.exists(os.path.join(DOCS, f)):
                bad.append('%s 缺圖 %s' % (tag, f))
        if k.startswith('3') and not q.get('audio'):
            bad.append('%s 聴解沒有台詞' % tag)
        # 同一篇讀解的題目要在同一回
        first = i == 0 or not q.get('pass') or items[i - 1].get('pass') != q.get('pass')
        if first and cur and cur + sum(1 for x in items[i:] if x.get('pass') == q.get('pass') and q.get('pass')) > n:
            bad.append('%s 這篇讀解會被切到兩回' % tag)
        cur += 1
        if cur == n:
            cur, done = 0, done + 1
        out.append({f: q[f] for f in FIELDS if f in q})
    papers[k] = done
NP = min(papers.values())

h = open(HTML, encoding='utf-8').read()
a = h.index('\nvar BANK = [') + len('\nvar BANK = [')
z = h.index('\n];', a)
h = h[:a] + '\n' + ',\n'.join('  ' + json.dumps(q, ensure_ascii=False) for q in out) + h[z:]
qa = h.index('/* @@QUOTA'); qa = h.index('\n', qa) + 1
qz = h.index('/* @@/QUOTA */')
quota = {'%s|%s' % (k[0], TYPE[k]): QUOTA[k] for k in TYPE}
label = {'%s|%s' % (k[0], TYPE[k].split('　')[0]): LABEL[k] for k in TYPE}
h = h[:qa] + 'var QUOTA = ' + json.dumps(quota, ensure_ascii=False, indent=1) + ';\nvar LABEL = ' + \
    json.dumps(label, ensure_ascii=False, indent=1) + ';\n' + h[qz:]
open(HTML, 'w', encoding='utf-8').write(h)

print('題庫 %d 題；各題型可出的回數 %s → 共 %d 回' % (len(out), papers, NP))
if bad:
    print('找到 %d 個問題：' % len(bad))
    for b in bad:
        print('  ✗', b)
    sys.exit(1)
print('體檢沒有問題。→ %s' % HTML)
