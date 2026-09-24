"""Build src/shared/words.ts — a 组词 (example word) for each quiz item.

The quiz asks "which tone is this syllable?", and shows a word that contains it
for context. That word has to be playable from the recordings we already ship,
so a candidate is only accepted when:

  * its FIRST syllable+tone is the quiz item, so the card's pinyin and the word
    agree (音调匹配);
  * every other syllable also has a recording in public/audio, so the word can be
    played by chaining the per-syllable mp3s;
  * every character is in the 通用规范汉字表 (so the word stays simplified) and
    none is a 脏话/脏字.

Items with no such word are simply absent, and the card omits the word — which is
expected, e.g. zhuàng has no common two-character word starting with it.

Source: CC-CEDICT (data/cedict.txt), CC BY-SA 4.0.
"""

import os
import re

from blocked import BLOCKED_CHARS
from tonemark import load_readings

AUDIO_DIR = 'public/audio'
CEDICT = 'data/cedict.txt'

ENTRY = re.compile(r'^(\S+) (\S+) \[([^\]]*)\] /(.*)/\s*$')
# CC-CEDICT spells ü as "u:", e.g. nu:3 / lu:e4. Tone 5 is the neutral tone,
# which the quiz never asks about.
SYLLABLE = re.compile(r'^([a-z\u00fc:]+)([1-5])$')
HANZI_LINE = re.compile(r'^\s*([a-z\u00fc]+\d): "(.+)"')

# Below this jieba frequency a word is almost always too obscure to teach with
# (戆督, 袍泽, 搋面 …). Items that only have such words simply get no 组词, which
# the card already handles.
MIN_FREQ = 100

# Glosses that mark an entry as vulgar. CC-CEDICT does not flag every one of
# them, so this is backed by BLOCKED_WORDS and by auditing the generated table.
VULGAR_DEF = re.compile(
    r'\bvulgar\b|obscene|cunnilingus|fellatio|\bpenis\b|\bvagina\b|genital|'
    r'to fuck|prostitute|brothel|\bslut\b|\bwhore\b|erotic|pornograph|'
    r'derogatory|offensive term',
    re.I,
)

# Words whose characters are individually fine, so the character blocklist cannot
# catch them. Found by auditing the generated table.
BLOCKED_WORDS = {'舔阴', '工口'}


def audio_keys() -> set[str]:
    """Syllable+tone keys that have a recording, e.g. {"shang1", "nü3"}."""
    keys = set()
    for name in os.listdir(AUDIO_DIR):
        if not name.endswith('.mp3'):
            continue
        base = name[:-4]
        # Recordings use "v" for ü: nv3.mp3 is nǚ.
        if 'v' in base:
            base = base.replace('v', '\u00fc')
        m = re.fullmatch(r'([a-z\u00fc]+)([1-4])', base)
        if m:
            keys.add(f'{m.group(1)}{m.group(2)}')
    return keys


def example_hanzi() -> dict[str, str]:
    """The example character the chart popup shows for each item."""
    out = {}
    with open('src/shared/hanzi.ts', encoding='utf-8') as fh:
        for line in fh:
            m = HANZI_LINE.match(line)
            if m:
                out[m.group(1)] = m.group(2)
    return out


def load_jieba() -> dict[str, int]:
    """Word -> corpus frequency, from jieba's dictionary (MIT).

    CC-CEDICT has no frequency data, so without this the picker happily chose
    rare-but-well-formed compounds (场区) over everyday ones (场所).
    """
    freq: dict[str, int] = {}
    with open('data/jieba_dict.txt', encoding='utf-8') as fh:
        for line in fh:
            parts = line.split()
            if len(parts) >= 2 and parts[1].isdigit():
                freq[parts[0]] = int(parts[1])
    return freq


def parse_pinyin(token: str) -> tuple[str, int] | None:
    """'shang1' -> ('shang', 1); 'lu:e4' -> ('lüe', 4); None if unusable."""
    m = SYLLABLE.fullmatch(token.replace('u:', '\u00fc'))
    if not m:
        return None
    return m.group(1), int(m.group(2))


def main() -> None:
    playable = audio_keys()
    hanzi = example_hanzi()
    wfreq = load_jieba()
    tghz = load_readings('data/tghz.txt')
    standard = {c for chars in tghz.values() for c in chars}

    # First key -> best candidate word.
    best: dict[str, tuple] = {}
    scanned = kept = 0

    with open(CEDICT, encoding='utf-8') as fh:
        for line in fh:
            if line.startswith('#'):
                continue
            m = ENTRY.match(line)
            if not m:
                continue
            scanned += 1
            _trad, simplified, pinyin, gloss = m.groups()
            pinyin = pinyin.split()

            # Two-character words keep the audio short and the card clean.
            if len(simplified) != 2 or len(pinyin) != 2:
                continue
            if not all('\u4e00' <= c <= '\u9fff' for c in simplified):
                continue
            # CC-CEDICT capitalises proper nouns; skip those.
            if any(t != t.lower() for t in pinyin):
                continue
            if any(c in BLOCKED_CHARS for c in simplified):
                continue
            if simplified in BLOCKED_WORDS or VULGAR_DEF.search(gloss):
                continue
            if any(c not in standard for c in simplified):
                continue
            if wfreq.get(simplified, 0) < MIN_FREQ:
                continue

            parsed = [parse_pinyin(t) for t in pinyin]
            if any(p is None for p in parsed):
                continue
            keys = [f'{syl}{tone}' for syl, tone in parsed]  # type: ignore[misc]
            if any(k not in playable for k in keys):
                continue

            kept += 1
            first = keys[0]
            # Prefer the word whose first character is the same example character
            # the chart popup shows (so the two agree), then the most common word.
            # Unknown-to-jieba words score 0 and therefore sort last.
            score = (
                0 if simplified[0] == hanzi.get(first) else 1,
                -wfreq.get(simplified, 0),
                simplified,
            )
            if first not in best or score < best[first][0]:
                best[first] = (score, simplified, keys)

    lines = [
        '// AUTO-GENERATED by build_words.py — do not edit by hand.',
        '//',
        '// An example 组词 for each quiz item. The item\'s syllable+tone is the FIRST',
        '// syllable of the word, so the card\'s pinyin and the word agree and the word',
        '// can be played by chaining the existing per-syllable recordings.',
        '//',
        '// Items with no suitable word are absent (the card then omits the word), as',
        '// are words containing a 脏话/脏字. Source: CC-CEDICT, CC BY-SA 4.0.',
        '',
        'export type WordEntry = {',
        '  /** The word itself, e.g. 商场. */',
        '  word: string',
        '  /** Syllable+tone keys in order, e.g. ["shang1", "chang3"]. */',
        '  syllables: string[]',
        '}',
        '',
        'export const WORDS: Record<string, WordEntry> = {',
    ]
    for key in sorted(best):
        _score, word, keys = best[key]
        parts = ', '.join(f'"{k}"' for k in keys)
        lines.append(f'  {key}: {{ word: "{word}", syllables: [{parts}] }},')
    lines += ['}', '']

    with open('src/shared/words.ts', 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))

    covered = len(best)
    print(f'cedict entries scanned : {scanned}')
    print(f'  usable two-char words: {kept}')
    print(f'playable audio keys    : {len(playable)}')
    print(f'items with a word      : {covered}')
    print(f'items without one      : {len(playable) - covered}')
    for probe in ('shang1', 'zhuang3', 'chang3'):
        print(f'  {probe}: {best.get(probe, (None, "-", []))[1]}')
    print(f'wrote src/shared/words.ts ({covered} entries)')


if __name__ == '__main__':
    main()
