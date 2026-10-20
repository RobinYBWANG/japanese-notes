# -*- coding: utf-8 -*-
"""把 Google Analytics 4 掛進 docs/ 底下每一個頁面（2026-10-20）。

用法：
    python3 add_ga.py G-XXXXXXXXXX     # 換成你的評估 ID；可以重複跑，會原地更新
    python3 add_ga.py --check          # 只檢查每頁是不是都有掛、ID 是什麼

設計：
- 只在 *.github.io 上啟用。本機用 file:// 打開（編輯模式）不會載入 GA，自己不會被算進去，
  minna-notes 的「💾 儲存」也就不會把 Google 的 script 一起存回檔案。
- ID 還是佔位字（G-XXXXXXXXXX）時也不啟用，所以先插好、晚點再填 ID 也安全。
- 每頁只放一份，用 <!-- GA4 --> … <!-- /GA4 --> 包起來，重跑就是整塊替換，不會越疊越多。
"""
import os, re, sys

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PAGES = ['index.html', 'minna-notes.html', 'kana.html', 'n5-vocab.html', 'n5-grammar.html',
         'n5-mock-easy.html', 'n5-mock-full.html']
PLACEHOLDER = 'G-XXXXXXXXXX'
BLOCK_RE = re.compile(r'<!-- GA4 -->.*?<!-- /GA4 -->\n?', re.S)


def block(ga_id):
    return ("<!-- GA4 -->\n<script>\n"
            "/* Google Analytics 4：只在線上 github.io 啟用，本機 file:// 打開不算。\n"
            "   ID 由 語音包工具/add_ga.py 統一寫入，要換就重跑那支，不要手改。 */\n"
            "(function(){\n"
            "  var GA_ID='" + ga_id + "';\n"
            "  if(!/\\.github\\.io$/.test(location.hostname)||/X{6}/.test(GA_ID))return;\n"
            "  var s=document.createElement('script');s.async=true;\n"
            "  s.src='https://www.googletagmanager.com/gtag/js?id='+GA_ID;\n"
            "  document.head.appendChild(s);\n"
            "  window.dataLayer=window.dataLayer||[];\n"
            "  window.gtag=function(){dataLayer.push(arguments);};\n"
            "  gtag('js',new Date());gtag('config',GA_ID);\n"
            "})();\n"
            "</script>\n<!-- /GA4 -->\n")


def current_id(h):
    m = BLOCK_RE.search(h)
    if not m:
        return None
    m2 = re.search(r"var GA_ID='([^']+)'", m.group(0))
    return m2.group(1) if m2 else '?'


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else PLACEHOLDER
    if arg == '--check':
        for f in PAGES:
            h = open(os.path.join(DOCS, f), encoding='utf-8').read()
            print('%-20s %s' % (f, current_id(h) or '（沒掛）'))
        return
    if not re.fullmatch(r'G-[A-Z0-9]{6,12}', arg):
        sys.exit('評估 ID 應該長得像 G-ABC123XYZ，收到：%r' % arg)
    for f in PAGES:
        p = os.path.join(DOCS, f)
        h = open(p, encoding='utf-8').read()
        before = current_id(h)
        if BLOCK_RE.search(h):
            h2 = BLOCK_RE.sub(lambda m: block(arg), h, count=1)
        else:
            assert h.count('</head>') == 1, f + ' 的 </head> 不只一個'
            h2 = h.replace('</head>', block(arg) + '</head>', 1)
        assert h2.count('<!-- GA4 -->') == 1 and h2.rstrip().endswith('</html>'), f
        if h2 != h:
            fd = os.open(p, os.O_WRONLY | os.O_TRUNC)
            os.write(fd, h2.encode('utf-8')); os.fsync(fd); os.close(fd)
        print('%-20s %s → %s' % (f, before or '（沒掛）', arg))


if __name__ == '__main__':
    main()
