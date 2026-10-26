# -*- coding: utf-8 -*-
"""N4 程度的漢字標準（N4 簡易模擬考用）：N5 的字（n5_level.N5_KANJI）＋ N4 的字（Tanos 的 N4 漢字表）。
   題目、選項、文章、聴解台詞只能用這些字；表外的詞寫平假名。"""
import re
from n5_level import N5_KANJI

N4_ONLY = set(
    '悪暗医意以引院員運英映遠屋音歌夏家画海回開界楽館漢寒顔帰起究急牛去強教京業近銀区計兄軽犬研県建験元'
    '工広考光好合黒菜作産紙思姉止市仕死使始試私字自事持室質写者借弱首主秋集習終住重春所暑場乗色森心親真'
    '進図青正声世赤夕切説洗早走送族村体太待貸台代題短知地池茶着昼注町鳥朝通弟低転都度答冬頭同動堂働特肉'
    '売発飯病品不風服物文別勉歩方妹味民明門問夜野薬有曜用洋理旅料力林')
N4_KANJI = N5_KANJI | N4_ONLY
KANJI = re.compile(r'[一-龥々]')


def outside(text):
    """text 裡 N4 標準以外的漢字（照出現順序、不重複）"""
    seen = []
    for c in KANJI.findall(re.sub(r'<[^>]+>', '', text)):
        if c not in N4_KANJI and c not in seen:
            seen.append(c)
    return seen
