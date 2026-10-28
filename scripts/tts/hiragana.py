"""Suggest a reading on stdout. Never overwrite hand-edited ttsText."""
import sys
try:
    from pykakasi import kakasi
except ImportError:
    sys.exit('Optional helper: pip install pykakasi を専用環境で実行してください。')
text = ' '.join(sys.argv[1:]) or sys.stdin.read()
print(''.join(part['hira'] for part in kakasi().convert(text)))
print('自動変換の候補です。固有名詞・助詞・多音字を確認してから ttsText に転記してください。', file=sys.stderr)
