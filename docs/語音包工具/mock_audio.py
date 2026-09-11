# mock_audio.py —— 補齊 n5-mock-easy.html 聽解題缺的 VOICEVOX 音檔（本機一步跑完）
#
# 用法：python3 mock_audio.py        # 引擎沒開會自動叫 本機補音檔.py --engine-only
#
# 這頁的音檔跟 minna-notes / kana 的管線分開：
#   - key 是「角色|文本」，角色 F/M/N 對應 speaker 2/11/13（從既有 clip id 反推，2026-09-11）
#   - readChoices 的題目，每個選項也要有「N|1ばん。選項」的音檔（前端 vvCover 會檢查）
#   - clip id = md5("speaker|文本") 前 12 碼、opus 16k mono，與 export_missing_clips.py 相同
# 冪等：缺 0 個就原地結束，HTML 一個字元都不動。只動 `var VV = {...};` 那一行。
import base64, hashlib, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.normpath(os.path.join(HERE, '..', 'n5-mock-easy.html'))
BASE = 'http://127.0.0.1:50021'
SPEAKER = {'F': 2, 'M': 11, 'N': 13}   # 四国めたん／玄野武宏／青山龍星

os.environ['PYTHONIOENCODING'] = 'utf-8'
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

h = open(HTML, encoding='utf-8').read()

# BANK 是 JS 物件字面值（題目裡有 HTML），交給 node 求值再轉 JSON
m = re.search(r'\nvar BANK = (\[[\s\S]*?\n\]);', h)
assert m, '找不到 var BANK'
# stdin 一定要先 setEncoding：分塊讀 Buffer 再拼字串，多位元組的日文字切在塊邊界會變亂碼（2026-09-11 踩到）
NODE_EVAL = ('const vm=require("vm");let s="";process.stdin.setEncoding("utf8");'
             'process.stdin.on("data",d=>s+=d)'
             '.on("end",()=>{console.log(JSON.stringify(vm.runInNewContext(s)))})')
bank = json.loads(subprocess.run(['node', '-e', NODE_EVAL], input=m.group(1),
                                 capture_output=True, text=True, check=True).stdout)

# 與前端 audioLines() 同步：課題理解／ポイント理解（問題1・2）由旁白在對話前後各唸一次題目；
# readChoices 的題目每個選項唸「1ばん。選項」
need = []
for q in bank:
    if not q.get('audio'):
        continue
    if re.match(r'問題[12]　', q['type']):
        need.append(('N', q['q']))
    for line in q['audio']:
        need.append((line['r'], line['t']))
    if q.get('readChoices'):
        for j, c in enumerate(q['c']):
            need.append(('N', '%dばん。%s' % (j + 1, c)))
need = list(dict.fromkeys(need))
need_set = set(need)

mvv = re.search(r'^var VV = (\{.*\});$', h, re.M)
assert mvv, '找不到 var VV'
VV = json.loads(mvv.group(1))
missing = [(r, t) for r, t in need if (r + '|' + t) not in VV['say']]
orphan = [k for k in VV['say'] if tuple(k.split('|', 1)) not in need_set]
print('文本 %d 個；缺 %d 個；多餘 %d 個（不動）' % (len(need), len(missing), len(orphan)))
if not missing:
    print('沒有缺的，HTML 一個字元都沒動。')
    sys.exit(0)


def engine_alive():
    try:
        urllib.request.urlopen(BASE + '/version', timeout=2)
        return True
    except Exception:
        return False


if not engine_alive():
    subprocess.run([sys.executable, os.path.join(HERE, '本機補音檔.py'), '--engine-only'], check=True)

TMP = tempfile.mkdtemp()


def synth(text, sp):
    q = urllib.parse.urlencode({'text': text, 'speaker': sp})
    query = urllib.request.urlopen(
        urllib.request.Request('%s/audio_query?%s' % (BASE, q), method='POST'), timeout=60).read()
    wav = urllib.request.urlopen(
        urllib.request.Request('%s/synthesis?speaker=%d' % (BASE, sp), data=query,
                               headers={'Content-Type': 'application/json'}, method='POST'),
        timeout=180).read()
    wavf, oggf = os.path.join(TMP, 'c.wav'), os.path.join(TMP, 'c.ogg')
    open(wavf, 'wb').write(wav)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wavf,
                    '-c:a', 'libopus', '-b:a', '16k', '-ac', '1', oggf], check=True)
    b = base64.b64encode(open(oggf, 'rb').read()).decode()
    if len(b) < 300 * 4 // 3:
        raise RuntimeError('clip too small: ' + text)
    return b


for i, (r, t) in enumerate(missing, 1):
    sp = SPEAKER[r]
    cid = hashlib.md5(('%d|%s' % (sp, t)).encode('utf-8')).hexdigest()[:12]
    VV['audio'][cid] = synth(t, sp)
    VV['say'][r + '|' + t] = cid
    if i % 10 == 0 or i == len(missing):
        print('  ...%d/%d' % (i, len(missing)))

out = h[:mvv.start(1)] + json.dumps(VV, ensure_ascii=False) + h[mvv.end(1):]
fd = os.open(HTML, os.O_WRONLY | os.O_TRUNC)
os.write(fd, out.encode('utf-8'))
os.fsync(fd)
os.close(fd)

# 重讀驗證：每個需要的 key 都有、指到的 clip 都在、檔案結尾沒壞
h2 = open(HTML, encoding='utf-8').read()
VV2 = json.loads(re.search(r'^var VV = (\{.*\});$', h2, re.M).group(1))
still = [(r, t) for r, t in need
         if (r + '|' + t) not in VV2['say'] or VV2['say'][r + '|' + t] not in VV2['audio']]
assert not still, '合併後仍缺 %d 個' % len(still)
assert h2.rstrip().endswith('</html>'), '檔案結尾不對'
print('完成：新增 %d 個 clip；say %d / audio %d；%s 現在 %.2fMB' % (
    len(missing), len(VV2['say']), len(VV2['audio']), os.path.basename(HTML), os.path.getsize(HTML) / 1e6))
print('驗證：node test_mock.mjs')
