"""Local source-grounded knowledge retrieval for TALGAT AI NOVA.
No LLM weight training: retrieval-augmented context for an existing model.
Usage: python knowledge/search.py "Как устроена память?"
"""
import json, math, re, sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
INDEX = HERE / "index.json"
TOKEN = re.compile(r"[\wа-яё]{2,}", re.I)

def words(text):
    return TOKEN.findall(text.lower())

def build_index(sources):
    chunks = []
    for filename, text in sources.items():
        text = re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
        text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        tokens = text.split()
        for start in range(0, len(tokens), 160):
            segment = " ".join(tokens[start:start + 200])
            if segment:
                chunks.append({"source": filename, "chunk": start // 160, "text": segment})
    return chunks

def search(question, chunks, limit=4):
    query = Counter(words(question))
    if not query:
        return []
    df = Counter()
    docs = []
    for c in chunks:
        tf = Counter(words(c["text"]))
        docs.append(tf)
        df.update(tf.keys())
    scored = []
    n = len(chunks)
    for chunk, tf in zip(chunks, docs):
        score = sum((1 + math.log(tf[t])) * math.log(1 + (n + 1) / (df[t] + 1))
                    for t in query if tf[t])
        if score > 0:
            scored.append((score, chunk))
    return [dict(item, score=round(score, 3)) for score, item in
            sorted(scored, key=lambda x: -x[0])[:limit]]

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--build":
        sources = {p.name: p.read_text(encoding="utf-8")
                   for p in HERE.glob("sources/*") if p.is_file()}
        INDEX.write_text(json.dumps(build_index(sources), ensure_ascii=False), encoding="utf-8")
        print("Indexed:", len(sources), "sources")
    else:
        if not INDEX.exists():
            sys.exit("Missing index.json; run --build")
        chunks = json.loads(INDEX.read_text(encoding="utf-8"))
        print(json.dumps(search(" ".join(sys.argv[1:]), chunks), ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
