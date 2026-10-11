# mockfull_audio.py —— 產 n5-mock-full.html（正式版模擬考）聴解要的 VOICEVOX 音檔
#
# 和 n5-mock-easy 的差別：
#   - 音檔**外置**在 docs/audio/mockfull/<id>.ogg（正式版的對白量大，內嵌會讓 HTML 破 6MB），
#     頁面只存一份 say 對照表（<script id="mf-say">），聴解開始前再一次預載。
#   - 要唸的東西＝各大題的說明（旁白 N）＋例題的每一行＋每一題 play 裡的每一行。
#     前端 init() 把 part.instr 當成說明旁白，這裡要用同一條規則，不然會對不上。
#   - clip id = md5("speaker|文本") 前 12 碼、opus 16k mono，和其他頁的管線一致。
#   - --prune：把不再需要的 clip 從 say 與資料夾裡刪掉。
# 冪等：缺 0 個就原地結束，HTML 一個字元都不動。
import base64, hashlib, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.normpath(os.path.join(HERE, '..'))
HTML = os.path.join(DOCS, 'n5-mock-full.html')
AUD = os.path.join(DOCS, 'audio', 'mockfull')
BASE = 'http://127.0.0.1:50021'
SPEAKER = {'F': 2, 'M': 11, 'N': 13}   # 四国めたん／玄野武宏／青山龍星
SPEED = 0.85                           # 語速：貼近 JLPT 的播報速度（預設 1.0 太快）

os.environ['PYTHONIOENCODING'] = 'utf-8'
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

os.makedirs(AUD, exist_ok=True)
h = open(HTML, encoding='utf-8').read()

need = []
for pid in ('A', 'B', 'C'):
    m = re.search(r'<script id="paper-%s" type="application/json">(.*?)</script>' % pid, h, re.S)
    if not m:
        continue
    data = json.loads(m.group(1))
    if not data.get('sections'):
        continue
    for sec in data['sections']:
        if sec.get('key') != 'choukai':
            continue
        if sec.get('opening'):
            need.append(('N', sec['opening']))   # 聴解開頭的總說明
        if sec.get('closing'):
            need.append(('N', sec['closing']))   # 聴解結束語
        for part in sec['parts']:
            need.append(('N', part['instr']))          # 與前端 init() 的 instr_lines 同一條規則
            for l in (part.get('ex') or {}).get('play', []):
                if 'p' not in l:
                    need.append((l['r'], l['t']))
            for it in part['items']:
                for l in it['play']:
                    if 'p' not in l:          # {'p': 秒數} 是靜默，不用合成
                        need.append((l['r'], l['t']))
need = list(dict.fromkeys(need))
need_set = set(need)

msay = re.search(r'(<script id="mf-say" type="application/json">)(.*?)(</script>)', h, re.S)
assert msay, '找不到 <script id="mf-say">'
SAY = json.loads(msay.group(2) or '{}')
missing = [(r, t) for r, t in need if (r + '|' + t) not in SAY]
orphan = [k for k in SAY if tuple(k.split('|', 1)) not in need_set]
PRUNE = '--prune' in sys.argv
print('文本 %d 個；缺 %d 個；多餘 %d 個%s'
      % (len(need), len(missing), len(orphan), '（--prune 刪掉）' if PRUNE else '（不動，要刪加 --prune）'))
if PRUNE and orphan:
    for k in orphan:
        cid = SAY.pop(k)
        if cid not in SAY.values():
            p = os.path.join(AUD, cid + '.ogg')
            if os.path.exists(p):
                os.remove(p)
if not missing and not (PRUNE and orphan):
    print('沒有缺的，HTML 一個字元都沒動。')
    sys.exit(0)


def engine_alive():
    try:
        urllib.request.urlopen(BASE + '/version', timeout=2)
        return True
    except Exception:
        return False


if missing and not engine_alive():
    subprocess.run([sys.executable, os.path.join(HERE, '本機補音檔.py'), '--engine-only'], check=True)

TMP = tempfile.mkdtemp()


# 引擎會唸錯的字：合成前換成假名，clip 的 key 仍用原文（前端是用原文去查的）。
# 順序有意義：「何ですか」要排在「何で」前面，否則會被改成「なにですか」。
READ_FIX = [('何ですか', 'なんですか'), ('何で', 'なにで'),
            ('十分', 'じゅっぷん'),      # 本卷的「十分」都是「十分鐘」，不是「足夠」
            ('日本語', 'にほんご'), ('日本', 'にほん')]


def engine_text(t):
    for a, b in READ_FIX:
        t = t.replace(a, b)
    return t


def synth(text, sp, out):
    q = urllib.parse.urlencode({'text': text, 'speaker': sp})
    query = urllib.request.urlopen(
        urllib.request.Request('%s/audio_query?%s' % (BASE, q), method='POST'), timeout=60).read()
    # JLPT 的播報比一般說話慢；VOICEVOX 預設 1.0 太快，放慢到 SPEED 才接近考試錄音的節奏。
    qj = json.loads(query)
    qj['speedScale'] = SPEED
    query = json.dumps(qj).encode('utf-8')
    wav = urllib.request.urlopen(
        urllib.request.Request('%s/synthesis?speaker=%d' % (BASE, sp), data=query,
                               headers={'Content-Type': 'application/json'}, method='POST'),
        timeout=180).read()
    wavf = os.path.join(TMP, 'c.wav')
    open(wavf, 'wb').write(wav)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wavf,
                    '-c:a', 'libopus', '-b:a', '16k', '-ac', '1', out], check=True)
    if os.path.getsize(out) < 300:
        raise RuntimeError('clip too small: ' + text)


for i, (r, t) in enumerate(missing, 1):
    sp = SPEAKER[r]
    cid = hashlib.md5(('%d|%s' % (sp, t)).encode('utf-8')).hexdigest()[:12]
    out = os.path.join(AUD, cid + '.ogg')
    if not os.path.exists(out):
        synth(engine_text(t), sp, out)
    SAY[r + '|' + t] = cid
    if i % 20 == 0 or i == len(missing):
        print('  ...%d/%d' % (i, len(missing)))

blob = json.dumps(SAY, ensure_ascii=False, separators=(',', ':'))
assert '</script' not in blob
out = h[:msay.start(2)] + blob + h[msay.end(2):]
fd = os.open(HTML, os.O_WRONLY | os.O_TRUNC)
os.write(fd, out.encode('utf-8')); os.fsync(fd); os.close(fd)

h2 = open(HTML, encoding='utf-8').read()
SAY2 = json.loads(re.search(r'<script id="mf-say" type="application/json">(.*?)</script>', h2, re.S).group(1))
still = [(r, t) for r, t in need
         if (r + '|' + t) not in SAY2 or not os.path.exists(os.path.join(AUD, SAY2[r + '|' + t] + '.ogg'))]
assert not still, '合併後仍缺 %d 個：%s' % (len(still), still[:3])
assert h2.rstrip().endswith('</html>')
size = sum(os.path.getsize(os.path.join(AUD, f)) for f in os.listdir(AUD))
print('完成：新增 %d 個 clip；say %d 筆；%s 共 %d 檔 %.2fMB；HTML %.2fMB'
      % (len(missing), len(SAY2), os.path.relpath(AUD, DOCS), len(os.listdir(AUD)), size / 1e6,
         os.path.getsize(HTML) / 1e6))
print('驗證：node test_mockfull.mjs')
