"""Sanity-check the generated hanzi table against combos that definitely have a common character.

Run after regenerating src/shared/hanzi.ts:  python3 sanity.py
"""
import json
import sys

from tonemark import format_pinyin

table = json.load(open('/tmp/ph.json'))

# (syllable, tone, an expected character that is definitely valid)
KNOWN = [
    ('ba', 1, '八'), ('ba', 2, '拔'), ('ba', 3, '把'), ('ba', 4, '爸'),
    ('bin', 1, '宾'), ('bing', 1, '冰'), ('bing', 3, '饼'), ('bing', 4, '病'),
    ('cui', 1, '催'), ('cui', 3, '璀'), ('cui', 4, '脆'),
    ('zhuo', 1, '桌'), ('zhuo', 2, '卓'),
    ('zi', 1, '资'), ('zi', 3, '子'), ('zi', 4, '字'),
    ('zhi', 1, '知'), ('zhi', 3, '只'), ('zhi', 4, '志'),
    ('lü', 4, '绿'), ('lüe', 4, '略'), ('nü', 3, '女'), ('nüe', 4, '虐'),
    ('ju', 4, '句'), ('jun', 1, '军'), ('xue', 2, '学'), ('yue', 4, '月'),
    ('er', 2, '儿'), ('er', 3, '耳'), ('er', 4, '二'),
    ('shui', 3, '水'), ('shuo', 1, '说'),
    ('qu', 3, '取'), ('xu', 1, '需'), ('yu', 2, '鱼'),
    ('hao', 3, '好'), ('ni', 3, '你'), ('wo', 3, '我'), ('ta', 1, '他'),
    ('zhong', 1, '中'), ('guo', 2, '国'), ('ren', 2, '人'), ('da', 4, '大'),
    ('xiao', 3, '小'), ('shang', 4, '上'), ('xia', 4, '下'),
]

ok = bad = 0
problems = []
for s, tone, expected in KNOWN:
    key = format_pinyin(s, tone)
    chars = table.get(key, [])
    if expected in chars:
        ok += 1
    else:
        bad += 1
        problems.append((s, tone, key, expected, chars[:4]))

print(f'known-good combos verified: {ok}/{ok + bad}')
if problems:
    print('\nPROBLEMS:')
    for s, t, k, exp, got in problems:
        print(f'  {s}+{t} ({k}): expected {exp}, dataset has {got}')
else:
    print('all expected characters present')
