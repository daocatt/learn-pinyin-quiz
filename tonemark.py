"""Shared pinyin helpers for the data-build scripts."""
TONES = {
    'a': {'1': 'ā', '2': 'á', '3': 'ǎ', '4': 'à', '5': 'a'},
    'o': {'1': 'ō', '2': 'ó', '3': 'ǒ', '4': 'ò', '5': 'o'},
    'e': {'1': 'ē', '2': 'é', '3': 'ě', '4': 'è', '5': 'e'},
    'i': {'1': 'ī', '2': 'í', '3': 'ǐ', '4': 'ì', '5': 'i'},
    'u': {'1': 'ū', '2': 'ú', '3': 'ǔ', '4': 'ù', '5': 'u'},
    'ü': {'1': 'ǖ', '2': 'ǘ', '3': 'ǚ', '4': 'ǜ', '5': 'ü'},
    'A': {'1': 'Ā', '2': 'Á', '3': 'Ǎ', '4': 'À', '5': 'A'},
    'O': {'1': 'Ō', '2': 'Ó', '3': 'Ǒ', '4': 'Ò', '5': 'O'},
    'E': {'1': 'Ē', '2': 'É', '3': 'Ě', '4': 'È', '5': 'E'},
    'I': {'1': 'Ī', '2': 'Í', '3': 'Ǐ', '4': 'Ì', '5': 'I'},
    'U': {'1': 'Ū', '2': 'Ú', '3': 'Ǔ', '4': 'Ù', '5': 'U'},
    'Ü': {'1': 'Ǖ', '2': 'Ǘ', '3': 'Ǚ', '4': 'Ǜ', '5': 'Ü'},
}
VOWELS = 'aoeiuü'


def _is_vowel(c):
    return c.lower() in VOWELS


def format_pinyin(syllable, tone):
    """Port of formatPinyin() from src/client/lib/pinyin.ts."""
    end = start = -1
    for pos in range(len(syllable), 0, -1):
        char = syllable[pos - 1]
        if end == -1 and _is_vowel(char):
            end = pos
        if end != -1 and not _is_vowel(char):
            start = pos
            break
        if end != -1 and pos == 1 and _is_vowel(char):
            start = 0
            break
    if start == -1 or end == -1:
        return syllable
    vowels = syllable[start:end]
    lower = vowels.lower()
    t = str(tone)
    if 'a' in lower:
        marked = vowels.replace('a', TONES['a'][t]).replace('A', TONES['A'][t])
    elif 'e' in lower:
        marked = vowels.replace('e', TONES['e'][t]).replace('E', TONES['E'][t])
    elif lower == 'ou':
        marked = vowels.replace('o', TONES['o'][t]).replace('O', TONES['O'][t])
    else:
        last = vowels[-1]
        marked = vowels[:-1] + TONES.get(last, {}).get(t, last)
    return syllable[:start] + marked + syllable[end:]


def load_readings(path):
    """Parse a `U+XXXX: r1,r2  # 字` file into {reading: [chars]}."""
    import re
    out = {}
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            m = re.match(r'^U\+([0-9A-F]+):\s*(.*?)\s*#\s*(.*)$', line)
            if not m:
                continue
            char = m.group(3).strip()
            for r in m.group(2).split(','):
                r = r.strip()
                if r:
                    out.setdefault(r, []).append(char)
    return out
