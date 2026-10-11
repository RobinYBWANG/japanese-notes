# -*- coding: utf-8 -*-
"""正式版模擬考的考卷共用樣板：helper、聴解的秒數與播放結構、正解打散、檢查、寫檔。
   各卷（paper_A.py / paper_B.py / paper_C.py）只寫題目內容，其餘都走這裡。
   規格見 正式版考卷規格.md。"""
import json, os, collections

UL = lambda w: '<span class="ul">' + w + '</span>'
BK = '<span class="bk">　　</span>'
ST = '<span class="star">★</span>'


def V(q, c, a, e):
    return {'q': q, 'c': c, 'a': a, 'e': e}


def R(pas, zh, items):
    """読解：一篇文章帶 1〜4 題"""
    return [{'pass': pas, 'passZh': zh, 'q': q, 'c': c, 'a': a, 'e': e} for q, c, a, e in items]


def LN(*pairs):
    return [{'r': r, 't': t} for r, t in pairs]


def Q2(pre, post, c, e):
    """組み立て：pre ▢ ▢ ★ ▢ post，c 是正確語序，正解固定在第三格"""
    return {'q': pre + ' ' + BK + ' ' + BK + ' ' + ST + ' ' + BK + ' ' + post,
            'c': c, 'a': 2, 'e': e}


GAP12, GAP34 = 10, 8
INSTR = {
 1: '問題1では、はじめに しつもんを 聞いて ください。それから 話を 聞いて、'
    'もんだいようしの 1から4の 中から、いちばん いい ものを 一つ えらんで ください。',
 2: '問題2では、はじめに しつもんを 聞いて ください。それから 話を 聞いて、'
    'もんだいようしの 1から4の 中から、いちばん いい ものを 一つ えらんで ください。',
 3: '問題3では、えを 見ながら しつもんを 聞いて ください。'
    'やじるしの 人は 何と 言いますか。1から3の 中から、いちばん いい ものを 一つ えらんで ください。',
 4: '問題4では、えなどが ありません。ぶんを 聞いて、'
    '1から3の 中から、いちばん いい ものを 一つ えらんで ください。',
}


def C1(n, img, a, lines, q, zh, e):
    """問題1・2：印出四格圖或文字選項；旁白在對話前後各唸一次題目。
       第一次唸完問題後有一段留白讓你看圖／看選項 —— 正式考試就是這樣，
       問題2（文字選項）給得比問題1（圖）久。{'p': 秒數} 是播放器認得的靜默。"""
    look = 12 if isinstance(img, list) else 5
    play = ([{'r': 'N', 't': '%dばん。' % n}, {'r': 'N', 't': q}, {'p': look}]
            + lines + [{'r': 'N', 't': q}])
    it = {'n': n, 'play': play, 'q': q, 'a': a, 'gap': GAP12, 'zh': zh, 'e': e}
    if isinstance(img, str):
        it['img'] = 'img/mock/' + img + '.png'
        it['c'] = ['1', '2', '3', '4']
    else:
        it['c'] = img
    return it


def C3(n, img, narr, c, a, zh, e):
    play = [{'r': 'N', 't': '%dばん。' % n}, {'r': 'N', 't': narr}]
    for i, t in enumerate(c, 1):
        play += [{'r': 'N', 't': '%dばん。' % i}, {'r': 'M' if i % 2 else 'F', 't': t}]
    return {'n': n, 'scene': 'img/mock/' + img + '.png', 'play': play, 'q': '何と 言いますか。',
            'c': c, 'a': a, 'gap': GAP34, 'zh': zh, 'e': e, 'hideChoices': True}


def C4(n, role, line, c, a, zh, e):
    play = [{'r': 'N', 't': '%dばん。' % n}, {'r': role, 't': line}]
    for i, t in enumerate(c, 1):
        play += [{'r': '%s' % ('F' if role == 'M' else 'M'), 't': t}]
    return {'n': n, 'play': play, 'q': '（へんじを えらんで ください）', 'c': c, 'a': a,
            'gap': GAP34, 'zh': zh, 'e': e, 'hideChoices': True}


# ── 各大題的「例」：正式考試每個大題都會先播一題例題並公布答案（不計分）。
#    畫面上也要有例題的圖卡（含選項與答案），這樣聽說明和例題的時候可以順便調音量。
OPENING = 'これから、ちょうかいしけんを はじめます。もんだいようしに メモを とっても かまいません。'
ANS = lambda a: {'r': 'N', 't': 'いちばん いい ものは %dばんです。' % (a + 1)}


def EX1(img, q, lines, c, a, zh):
    """例題（問題1・2）：有四格圖或文字選項"""
    look = 12 if not img else 5          # 例題也照正式考試留看圖／看選項的時間
    e = {'ex': True, 'q': q, 'c': c, 'a': a, 'zh': zh,
         'play': ([{'r': 'N', 't': 'れい。'}, {'r': 'N', 't': q}, {'p': look}]
                  + lines + [{'r': 'N', 't': q}, ANS(a)])}
    if img:
        e['img'] = 'img/mock/' + img + '.png'
    return e


def EX3(img, narr, c, a, zh):
    play = [{'r': 'N', 't': 'れい。'}, {'r': 'N', 't': narr}]
    for i, t in enumerate(c, 1):
        play += [{'r': 'N', 't': '%dばん。' % i}, {'r': 'M' if i % 2 else 'F', 't': t}]
    return {'ex': True, 'scene': 'img/mock/' + img + '.png', 'q': narr, 'c': c, 'a': a, 'zh': zh,
            'play': play + [ANS(a)]}


def EX4(role, line, c, a, zh):
    other = 'F' if role == 'M' else 'M'
    play = [{'r': 'N', 't': 'れい。'}, {'r': role, 't': line}] + [{'r': other, 't': t} for t in c]
    return {'ex': True, 'q': '（へんじを えらんで ください）', 'c': c, 'a': a, 'zh': zh,
            'play': play + [ANS(a)]}




INSTR = {
 1: '問題1では、はじめに しつもんを 聞いて ください。それから 話を 聞いて、'
    'もんだいようしの 1から4の 中から、いちばん いい ものを 一つ えらんで ください。',
 2: '問題2では、はじめに しつもんを 聞いて ください。それから 話を 聞いて、'
    'もんだいようしの 1から4の 中から、いちばん いい ものを 一つ えらんで ください。',
 3: '問題3では、えを 見ながら しつもんを 聞いて ください。'
    'やじるしの 人は 何と 言いますか。1から3の 中から、いちばん いい ものを 一つ えらんで ください。',
 4: '問題4では、えなどが ありません。ぶんを 聞いて、'
    '1から3の 中から、いちばん いい ものを 一つ えらんで ください。',
}
TITLES = {1: '問題1　課題理解', 2: '問題2　ポイント理解', 3: '問題3　発話表現', 4: '問題4　即時応答'}
S1_INSTR = {
 1: '＿＿の ことばは ひらがなで どう 書きますか。1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
 2: '＿＿の ことばは どう 書きますか。1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
 3: '（　）に 何を 入れますか。1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
 4: '＿＿の ぶんと だいたい 同じ いみの ぶんが あります。1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
}
S2_INSTR = {
 1: '（　）に 何を 入れますか。1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
 2: '★に 入る ものは どれですか。1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
 3: 'つぎの 文章を 読んで、【　】に 入る ものを1・2・3・4から 一つ えらんで ください。',
 4: 'つぎの 文を 読んで、しつもんに こたえて ください。'
    'こたえは 1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
 5: 'つぎの 文章を 読んで、しつもんに こたえて ください。'
    'こたえは 1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
 6: 'つぎの お知らせを 見て、しつもんに こたえて ください。'
    'こたえは 1・2・3・4から いちばん いい ものを 一つ えらんで ください。',
}
WANT = {'moji': [7, 5, 6, 3], 'bunpou': [9, 4, 4, 2, 2, 1], 'choukai': [7, 6, 5, 6]}


def paper(pid, name, s1, s2, s3, ex):
    """把各卷的題目組成完整的考卷結構"""
    return {
     'id': pid, 'name': name, 'pass': {'total': 80, 'a': 38, 'b': 19},
     'sections': [
      {'key': 'moji', 'label': '言語知識（文字・語彙）', 'min': 20, 'parts': [
        {'no': i + 1, 'title': '問題%d' % (i + 1), 'instr': S1_INSTR[i + 1], 'items': p}
        for i, p in enumerate(s1)]},
      {'key': 'bunpou', 'label': '言語知識（文法）・読解', 'min': 40, 'parts': [
        {'no': i + 1, 'title': '問題%d' % (i + 1), 'instr': S2_INSTR[i + 1], 'items': p}
        for i, p in enumerate(s2)]},
      {'key': 'choukai', 'label': '聴解', 'min': None, 'opening': OPENING,
       'closing': 'これで ちょうかいしけんを おわります。', 'parts': [
        {'no': i + 1, 'title': TITLES[i + 1], 'instr': INSTR[i + 1], 'ex': ex[i + 1], 'items': p}
        for i, p in enumerate(s3)]},
     ],
    }


def build(PAPER, OUT):
    """正解打散 → 檢查 → 寫 JSON"""
    # 輪流把正解放到第 1→2→3→4 格，其餘選項維持原本的相對順序
    # （時間、價錢那種選項還是照順序排）。圖片題與組み立て題不能動。
    k = 0
    for sec in PAPER['sections']:
        for part in sec['parts']:
            for it in part['items']:
                if it['c'] == ['1', '2', '3', '4'] or 'class="star"' in it.get('q', ''):
                    continue
                ans = it['c'][it['a']]
                rest = [x for x in it['c'] if x != ans]
                t = k % len(it['c'])
                k += 1
                it['c'] = rest[:t] + [ans] + rest[t:]
                it['a'] = t

    n, pos = 0, collections.Counter()
    for sec in PAPER['sections']:
        sn = 0
        want = WANT[sec['key']]
        assert [len(p['items']) for p in sec['parts']] == want, \
            '%s 的題數 %s，應為 %s' % (sec['label'], [len(p['items']) for p in sec['parts']], want)
        for part in sec['parts']:
            for it in part['items']:
                n += 1
                sn += 1
                assert 2 < len(it['c']) < 5, (part['title'], it['c'])
                assert 0 <= it['a'] < len(it['c'])
                assert len(set(it['c'])) == len(it['c']), it['c']
                assert it.get('e') and len(it['e']) > 40, (part['title'], it.get('e'))
                pos[it['a']] += 1
        sec['n'] = sn
        print('%-24s %d 題' % (sec['label'], sn))
    print('合計 %d 題；正解位置分布 %s' % (n, dict(sorted(pos.items()))))
    assert n == 67, n

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8').write(json.dumps(PAPER, ensure_ascii=False, indent=1))
    print('→', OUT, '%.1fKB' % (os.path.getsize(OUT) / 1024))
