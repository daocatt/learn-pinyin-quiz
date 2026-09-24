"""脏话 / 脏字 — the single source of truth for the no-profanity content rule.

Shared by build_hanzi.py (example characters) and build_words.py (组词) so the
two generators can never drift apart on this.

These must never appear in generated content, even though the frequency tables
rank several of them first: 操, 逼, 干, 嫖, 骚 are all common characters that are
also profanity or sexual vulgarity.
"""

BLOCKED_CHARS = set(
    '操'  # cāo  fuck
    '肏'  # cào  fuck (vulgar)
    '屄'  # bī   cunt
    '毴'  # bī   cunt (variant)
    '屌'  # diǎo penis
    '逼'  # bī   cunt; 傻逼 / 装逼
    '干'  # gàn  fuck (干你)
    '嫖'  # piáo to solicit a prostitute
    '骚'  # sāo  lewd
    '娼'  # chāng prostitute
    '妓'  # jì   prostitute
    '婊'  # biǎo prostitute (slur)
    '淫'  # yín  obscene
    '贱'  # jiàn despicable (slur)
    '尻'  # kāo  buttocks (crude)
    '屎'  # shǐ  shit
    '屁'  # pì   fart; 放屁
)

# Combos where *every* candidate is vulgar, so nothing is emitted at all and the
# UI falls back to its placeholder. "diǎo" only has 鸟, which is the vulgar
# reading of an otherwise legitimate character (niǎo 鸟 = bird), so the
# character itself cannot be blocked without also losing the niǎo entry.
BLOCKED_KEYS = {'diao3'}
