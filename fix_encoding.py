import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = r'd:\ICUNI Group\ICUNI Labs\MMMedia Pro\src\features\TrailerGenerator\TrailerWizard.tsx'

with open(path, 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8')

def fix_double_encoding(s):
    """Fix double-encoded UTF-8 iteratively"""
    result = []
    i = 0
    chars = list(s)
    while i < len(chars):
        if ord(chars[i]) > 127:
            chunk = ''
            while i < len(chars) and ord(chars[i]) > 127:
                chunk += chars[i]
                i += 1
            try:
                fixed = chunk.encode('latin1').decode('utf-8')
                result.append(fixed)
            except (UnicodeDecodeError, UnicodeEncodeError):
                result.append(chunk)
        else:
            result.append(chars[i])
            i += 1
    return ''.join(result)

# Apply fix iteratively (some chars may be triple-encoded)
for iteration in range(3):
    prev = text
    text = fix_double_encoding(text)
    if text == prev:
        print(f"Converged after {iteration + 1} iterations")
        break

# Now replace all decorative Unicode with ASCII for robustness
# These are in comments and desc strings
replacements = {
    '\u2192': '->',      # right arrow
    '\u2190': '<-',      # left arrow
    '\u2194': '<->',     # left-right arrow
    '\u2191': '^',       # up arrow
    '\u2193': 'v',       # down arrow
    '\u2013': '-',       # en-dash
    '\u2014': '--',      # em-dash
    '\u201c': '"',       # left double quote
    '\u201d': '"',       # right double quote
    '\u2018': "'",       # left single quote
    '\u2019': "'",       # right single quote
    '\u2026': '...',     # ellipsis
    '\u2702': 'X',       # scissors
    '\u2728': '*',       # sparkles
    '\u26a1': '*',       # zap
    '\u2500': '-',       # box drawing horizontal
    '\u2550': '=',       # box drawing double horizontal
    '\u2022': '*',       # bullet
    '\u20ac': '*',       # euro sign (misencoded, likely was a special char)
    '\u2020': '->',      # dagger (likely was arrow)
    '\u2726': '*',       # four-pointed star
    '\u2606': '*',       # white star
}

for old, new in replacements.items():
    text = text.replace(old, new)

# Verify key lines
lines = text.split('\n')
print("\n=== Key user-visible lines after fix ===")
check_indices = [12, 81, 90, 1112, 1148, 1260, 1540, 1541, 1545, 1559, 1572, 1577]
for i in check_indices:
    if i < len(lines):
        line = lines[i].strip()[:140]
        print(f"L{i+1}: {line}")

# Count remaining non-ASCII
bad_count = 0
for i, line in enumerate(lines):
    for ch in line:
        cp = ord(ch)
        if cp > 127 and not (0x1F300 <= cp <= 0x1FAFF):  # exclude emoji
            bad_count += 1
            print(f"  Still bad at L{i+1}: U+{cp:04X} = {repr(ch)} -- {line.strip()[:80]}")
            break

print(f"\nRemaining non-ASCII lines (excl emoji): {bad_count}")

if '--write' in sys.argv:
    with open(path, 'wb') as f:
        f.write(text.encode('utf-8'))
    print("\nFILE WRITTEN SUCCESSFULLY")
else:
    print("\nDry run. Pass --write to save changes.")
