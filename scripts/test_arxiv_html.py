import sys
sys.path.append('.')
import httpx
from src.transformation.html_parser import AcademicHTMLParser

client = httpx.Client(
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
    timeout=15.0,
    follow_redirects=True
)
parser = AcademicHTMLParser()

test_pids = ['2401.02652', '2403.12345', '2312.00001', '2401.00001', '2402.00001']
for pid in test_pids:
    url = f'https://arxiv.org/html/{pid}'
    try:
        r = client.get(url)
        print(f"{pid}: status={r.status_code}, len={len(r.text)}")
        if r.status_code == 200:
            parsed = parser.parse(r.text)
            print(f"   -> sections={parsed['total_sections']}, words={parsed['total_words']}, math={parsed['total_math_count']}")
    except Exception as e:
        print(f"{pid}: error={e}")
