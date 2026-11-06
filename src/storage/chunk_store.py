"""Silver chunk table: the source of truth for every chunk (one row per chunk) in MinIO.

Layout (mirrors silver/papers/):
  silver/chunks/year=<year>/parts/part-<ts>-<rand>.parquet   one immutable part per embed micro-batch
  silver/chunks/year=<year>/chunks.parquet                   compacted, sorted by chunk_id, small row groups

Qdrant only holds the vector plus the fields used to filter (see QDRANT_PAYLOAD_FIELDS); retrieval hydrates the
chunk text and metadata from here by chunk_id. Lookups read only the row groups whose chunk_id min/max range can
contain a requested id (footers are cached), so a top-k query touches a few small byte ranges, not whole files.

A re-indexed paper (refresh) writes new rows with a later `indexed_at`; compaction keeps, per paper, only the rows
of its latest indexing, and lookups prefer the newest row of a chunk_id.
"""

import collections
import datetime
import logging
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq

from src.config.settings import settings
from src.storage.lakehouse_io import LakehouseIO
from src.storage.minio_client import StorageClient

logger = logging.getLogger("chunk_store")

CHUNKS_PREFIX = "silver/chunks/"
# The only chunk fields kept in the Qdrant payload: identity plus the fields search filters / facets on
QDRANT_PAYLOAD_FIELDS = ("chunk_id", "paper_id", "year", "primary_category", "section_type")
ROW_GROUP_SIZE = 512  # ~0.3 MB compressed per group: a lookup reads a handful of these


class ChunkStore:
    SCHEMA = pa.schema(
        [
            ("chunk_id", pa.string()),
            ("paper_id", pa.string()),
            ("title", pa.string()),
            ("authors", pa.list_(pa.string())),
            ("primary_category", pa.string()),
            ("year", pa.int64()),
            ("section_title", pa.string()),
            ("section_type", pa.string()),
            ("text", pa.string()),
            ("word_count", pa.int64()),
            ("source", pa.string()),
            ("tier", pa.string()),
            ("content_origin", pa.string()),
            ("indexed_at", pa.string()),
        ]
    )

    def __init__(self, storage: Optional[StorageClient] = None, cache_size: int = 20000, list_ttl: float = 30.0):
        self.storage = storage or StorageClient()
        self.io = LakehouseIO(self.storage)
        self._fs: Optional[pafs.S3FileSystem] = None
        self._lock = threading.Lock()
        self._files: List[Dict[str, Any]] = []  # [{key, size, last_modified}]
        self._files_at = 0.0
        self._list_ttl = list_ttl
        self._meta: Dict[Tuple[str, int, str], Tuple[pq.FileMetaData, List[Tuple[str, str]]]] = {}
        self._cache: "collections.OrderedDict[str, Dict[str, Any]]" = collections.OrderedDict()
        self._cache_size = cache_size

    # ------------------------------------------------------------------ write
    @staticmethod
    def year_key(year: str) -> str:
        return f"{CHUNKS_PREFIX}year={year}/chunks.parquet"

    def to_table(self, chunks: Iterable[Dict[str, Any]], indexed_at: Optional[str] = None) -> pa.Table:
        stamp = indexed_at or datetime.datetime.now(datetime.timezone.utc).isoformat()
        rows = []
        for c in chunks:
            authors = c.get("authors") or []
            if hasattr(authors, "tolist"):
                authors = authors.tolist()
            elif not isinstance(authors, list):
                authors = [str(authors)]
            year = c.get("year")
            rows.append({
                "chunk_id": str(c["chunk_id"]),
                "paper_id": str(c.get("paper_id", "")),
                "title": str(c.get("title") or ""),
                "authors": [str(a) for a in authors],
                "primary_category": c.get("primary_category"),
                "year": int(year) if year not in (None, "") else None,
                "section_title": c.get("section_title"),
                "section_type": c.get("section_type"),
                "text": str(c.get("text") or ""),
                "word_count": int(c["word_count"]) if c.get("word_count") is not None else None,
                "source": c.get("source"),
                "tier": c.get("tier"),
                "content_origin": c.get("content_origin"),
                "indexed_at": c.get("indexed_at") or stamp,
            })
        return pa.Table.from_pylist(rows, schema=self.SCHEMA)

    def append_part(self, chunks: List[Dict[str, Any]], year: str, indexed_at: Optional[str] = None) -> Dict[str, Any]:
        """Write one immutable part for a micro-batch (O(batch)); compact_year() folds parts into chunks.parquet."""
        if not chunks:
            return {"status": "NO_CHUNKS", "count": 0}
        table = self.to_table(chunks, indexed_at)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S")
        key = f"{CHUNKS_PREFIX}year={year}/parts/part-{stamp}-{uuid.uuid4().hex[:8]}.parquet"
        res = self.io.write_parquet(key, table)
        with self._lock:
            self._files_at = 0.0  # make the next lookup see the new part
        return {"status": "SUCCESS", "count": table.num_rows, "key": key, "size_bytes": res["size_bytes"]}

    @staticmethod
    def latest_only(table: pa.Table) -> pa.Table:
        """Keep, per paper, only the rows of its latest indexing, then one row per chunk_id (last wins); sort by chunk_id."""
        if table.num_rows == 0:
            return table
        idx = pa.array(range(table.num_rows), pa.int64())
        keys = pa.table({"paper_id": table["paper_id"], "chunk_id": table["chunk_id"], "indexed_at": table["indexed_at"], "i": idx})
        latest = keys.group_by("paper_id").aggregate([("indexed_at", "max")])
        keys = keys.join(latest, "paper_id")
        keys = keys.filter(pc.equal(keys["indexed_at"], keys["indexed_at_max"]))
        last = keys.group_by("chunk_id").aggregate([("i", "max")])
        table = table.take(last["i_max"])
        return table.sort_by([("chunk_id", "ascending")])

    def write_compacted(self, key: str, table: pa.Table) -> Dict[str, Any]:
        import io

        buf = io.BytesIO()
        pq.write_table(table.cast(self.SCHEMA), buf, compression="zstd", row_group_size=ROW_GROUP_SIZE)
        res = self.storage.upload_bytes(buf.getvalue(), key, content_type="application/vnd.apache.parquet")
        with self._lock:
            self._files_at = 0.0
        return res

    def compact_year(self, year: str) -> Dict[str, Any]:
        """Merge every parts/ object of `year` into chunks.parquet, then delete those parts."""
        part_keys = self.io.list_keys(f"{CHUNKS_PREFIX}year={year}/parts/")
        if not part_keys:
            return {"status": "NOTHING_TO_COMPACT", "parts": 0}
        tables = []
        existing = self._read_table(self.year_key(year))
        if existing is not None:
            tables.append(existing)
        tables += [t for t in (self._read_table(k) for k in sorted(part_keys)) if t is not None]
        merged = self.latest_only(pa.concat_tables([t.cast(self.SCHEMA) for t in tables]))
        res = self.write_compacted(self.year_key(year), merged)
        self.storage.delete_objects_batch(part_keys)  # only after the merged object is safely written
        return {"status": "SUCCESS", "parts": len(part_keys), "rows": merged.num_rows, "size_bytes": res.get("size_bytes")}

    def compact_all(self) -> Dict[str, Any]:
        years = sorted({
            m.group(1) for k in self.io.list_keys(CHUNKS_PREFIX)
            if (m := re.match(r"silver/chunks/year=([^/]+)/parts/.+\.parquet$", k))
        })
        results = {y: self.compact_year(y) for y in years}
        return {"years": years, "results": results, "parts": sum(r.get("parts", 0) for r in results.values())}

    def _read_table(self, key: str) -> Optional[pa.Table]:
        import io

        try:
            raw = self.storage.get_bytes(key)
        except Exception as e:
            if "NoSuchKey" in str(e) or "404" in str(e):
                return None
            raise
        return pq.read_table(io.BytesIO(raw))

    # ------------------------------------------------------------------ read
    @property
    def fs(self) -> pafs.S3FileSystem:
        if self._fs is None:
            ep = urlparse(settings.MINIO_ENDPOINT_URL)
            self._fs = pafs.S3FileSystem(
                access_key=settings.MINIO_ACCESS_KEY_ID,
                secret_key=settings.MINIO_SECRET_ACCESS_KEY,
                endpoint_override=ep.netloc,
                scheme=ep.scheme or "http",
                region="us-east-1",
            )
        return self._fs

    def _list_files(self, force: bool = False) -> List[Dict[str, Any]]:
        with self._lock:
            fresh = time.time() - self._files_at < self._list_ttl
            if fresh and not force:
                return self._files
        files = [o for o in self.storage.list_objects(CHUNKS_PREFIX, max_keys=1_000_000) if o["key"].endswith(".parquet")]
        with self._lock:
            self._files, self._files_at = files, time.time()
        return files

    def _file_meta(self, f: Dict[str, Any]) -> Tuple[pq.FileMetaData, List[Tuple[str, str]]]:
        """Footer + per-row-group (min, max) chunk_id, cached per object version."""
        ck = (f["key"], int(f["size"]), str(f.get("last_modified")))
        hit = self._meta.get(ck)
        if hit:
            return hit
        with self.fs.open_input_file(f"{self.storage.bucket_name}/{f['key']}") as fh:
            meta = pq.ParquetFile(fh).metadata
        col = meta.schema.names.index("chunk_id")
        ranges = []
        for g in range(meta.num_row_groups):
            st = meta.row_group(g).column(col).statistics
            ranges.append((st.min, st.max) if st is not None and st.has_min_max else ("", "\U0010ffff"))
        with self._lock:
            for k in [k for k in self._meta if k[0] == f["key"]]:
                del self._meta[k]
            self._meta[ck] = (meta, ranges)
        return meta, ranges

    def _read_group(self, f: Dict[str, Any], group: int, meta: pq.FileMetaData, want: pa.Array) -> List[Dict[str, Any]]:
        with self.fs.open_input_file(f"{self.storage.bucket_name}/{f['key']}") as fh:
            t = pq.ParquetFile(fh, metadata=meta, pre_buffer=True).read_row_group(group)  # pre_buffer: one coalesced range read
        return t.filter(pc.is_in(t["chunk_id"], value_set=want)).to_pylist()

    def get(self, chunk_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """chunk_id -> chunk row (newest indexing wins); ids not in the table are absent from the result."""
        ids = [str(c) for c in dict.fromkeys(chunk_ids) if c]
        out: Dict[str, Dict[str, Any]] = {}
        with self._lock:
            for cid in ids:
                if cid in self._cache:
                    self._cache.move_to_end(cid)
                    out[cid] = self._cache[cid]
        missing = sorted(c for c in ids if c not in out)
        for attempt in range(2):  # a miss may be a part written after the cached listing: relist once
            if not missing:
                break
            found = self._lookup(missing, self._list_files(force=attempt == 1))
            out.update(found)
            missing = [c for c in missing if c not in found]
        with self._lock:
            for cid in ids:
                if cid in out:
                    self._cache[cid] = out[cid]
                    self._cache.move_to_end(cid)
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)
        return out

    def _lookup(self, ids: List[str], files: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Read, in parallel, every (file, row group) whose chunk_id range can hold one of `ids`."""
        jobs = []
        for f in files:
            try:
                meta, ranges = self._file_meta(f)
            except Exception as e:  # e.g. a part deleted by a compaction since the listing: the relist picks it up
                logger.warning("[ChunkStore] %s unreadable: %s", f["key"], e)
                continue
            jobs += [(f, g, meta) for g, (lo, hi) in enumerate(ranges) if any(lo <= cid <= hi for cid in ids)]
        if not jobs:
            return {}
        want = pa.array(ids, pa.string())

        def read(job) -> List[Dict[str, Any]]:
            try:
                return self._read_group(*job, want)
            except Exception as e:
                logger.warning("[ChunkStore] %s row group %d unreadable: %s", job[0]["key"], job[1], e)
                return []

        with ThreadPoolExecutor(max_workers=16) as pool:
            batches = list(pool.map(read, jobs))
        found: Dict[str, Dict[str, Any]] = {}
        for rows in batches:
            for r in rows:
                cur = found.get(r["chunk_id"])
                if cur is None or str(r.get("indexed_at") or "") >= str(cur.get("indexed_at") or ""):
                    found[r["chunk_id"]] = r
        return found

    _local_silver_cache: Optional[Dict[str, Dict[str, Any]]] = None
    _chunks_parquet_cache: Optional[Dict[str, Dict[str, Any]]] = None
    _local_silver_lock = threading.Lock()

    def _ensure_local_silver(self):
        if ChunkStore._local_silver_cache is not None:
            return
        with ChunkStore._local_silver_lock:
            if ChunkStore._local_silver_cache is not None:
                return
            import json, os, re
            from pathlib import Path
            cache: Dict[str, Dict[str, Any]] = {}
            chunks_cache: Dict[str, Dict[str, Any]] = {}

            # 1. Load persistent arXiv metadata cache from disk
            arxiv_cache_file = Path('data/silver/arxiv_metadata_cache.json')
            if arxiv_cache_file.exists():
                try:
                    disk_arxiv = json.loads(arxiv_cache_file.read_text(encoding='utf-8'))
                    for k, v in disk_arxiv.items():
                        cache[k] = v
                except Exception as e:
                    logger.debug('Error loading arxiv_metadata_cache.json: %s', e)

            # 2. Local chunks.parquet is read on demand via pyarrow.dataset (sub-second)
            ChunkStore._chunks_ds = None
            cp = Path('data/silver/chunks.parquet')
            if cp.exists():
                try:
                    import pyarrow.dataset as ds
                    ChunkStore._chunks_ds = ds.dataset(str(cp), format='parquet')
                except Exception as err:
                    logger.debug('Failed opening chunks.parquet dataset: %s', err)

            # 3. Load local silver paper tables
            tables = [
                Path('data/silver/year=2026/papers.parquet'),
                Path('data/silver/tier1/landmark_papers.parquet'),
                Path('data/silver/tier1/landmark_html_papers.parquet'),
                Path('data/silver/tier2/fulltext_papers.parquet'),
                Path('data/silver/tier2/near_past_papers.parquet'),
                Path('data/silver/arxiv/arxiv_near_past.parquet'),
                Path('data/silver/cvf/cvpr2024.parquet'),
                Path('data/silver/papers.parquet'),
            ]
            for p in tables:
                if p.exists():
                    try:
                        schema = pq.read_schema(p)
                        cols = [c for c in ['paper_id', 'title', 'authors', 'abstract', 'doi', 'clean_full_text'] if c in schema.names]
                        t = pq.read_table(p, columns=cols)
                        pids = t['paper_id'].to_pylist() if 'paper_id' in cols else []
                        titles = t['title'].to_pylist() if 'title' in cols else []
                        authors_col = t['authors'].to_pylist() if 'authors' in cols else []
                        abstracts = t['abstract'].to_pylist() if 'abstract' in cols else []
                        dois = t['doi'].to_pylist() if 'doi' in cols else []

                        for idx in range(t.num_rows):
                            pid = pids[idx] if idx < len(pids) else None
                            title = titles[idx] if idx < len(titles) else ''
                            raw_authors = authors_col[idx] if idx < len(authors_col) else []
                            authors = [str(a) for a in (raw_authors or [])]
                            abstract = abstracts[idx] if idx < len(abstracts) else ''
                            doi = dois[idx] if idx < len(dois) else None

                            info = {
                                'title': title or '',
                                'authors': authors,
                                'abstract': abstract or '',
                                'text': abstract or title or '',
                            }
                            if pid and pid not in cache:
                                cache[pid] = info
                            if doi and 'arxiv.' in str(doi).lower():
                                m = re.search(r'arxiv\.(\d{4}\.\d{4,5})', str(doi), re.IGNORECASE)
                                if m and m.group(1) not in cache:
                                    cache[m.group(1)] = info
                    except Exception as err:
                        logger.debug('Failed loading %s into local silver cache: %s', p, err)

            ChunkStore._local_silver_cache = cache
            ChunkStore._chunks_parquet_cache = chunks_cache
            logger.info('[ChunkStore] Initialized local fallback: %d papers, %d chunks', len(cache), len(chunks_cache))

    def _fetch_arxiv_on_demand(self, arxiv_id: str) -> Optional[Dict[str, Any]]:
        import json, re, urllib.request, xmltodict
        from pathlib import Path
        clean_id = re.sub(r'v\d+$', '', arxiv_id.strip())
        if ChunkStore._local_silver_cache is not None and clean_id in ChunkStore._local_silver_cache:
            res = ChunkStore._local_silver_cache[clean_id]
            return res if res else None

        # Do not query external arXiv API for future synthetic or unpublished years (>= 2504 or 26xx)
        if clean_id.startswith('26') or (clean_id.startswith('25') and clean_id > '2504'):
            if ChunkStore._local_silver_cache is not None:
                ChunkStore._local_silver_cache[clean_id] = {}
            return None
        try:
            url = f'http://export.arxiv.org/api/query?id_list={clean_id}'
            req = urllib.request.Request(url, headers={'User-Agent': 'UTH-Scientific-Harvester/2.0'})
            with urllib.request.urlopen(req, timeout=3) as r:
                data = xmltodict.parse(r.read())
                entry = data['feed'].get('entry')
                if not entry:
                    if ChunkStore._local_silver_cache is not None:
                        ChunkStore._local_silver_cache[clean_id] = {}
                    return None
                if isinstance(entry, list):
                    entry = entry[0]
                title = ' '.join(entry.get('title', '').split())
                summary = ' '.join(entry.get('summary', '').split())
                raw_authors = entry.get('author', [])
                if isinstance(raw_authors, dict):
                    raw_authors = [raw_authors]
                authors = [a.get('name', '') for a in raw_authors if a.get('name')]
                info = {
                    'title': title,
                    'authors': authors,
                    'abstract': summary,
                    'text': summary,
                }
                if ChunkStore._local_silver_cache is not None:
                    ChunkStore._local_silver_cache[clean_id] = info
                    ChunkStore._local_silver_cache[arxiv_id] = info
                # Persist to disk
                cache_file = Path('data/silver/arxiv_metadata_cache.json')
                cache_data = {}
                if cache_file.exists():
                    try:
                        cache_data = json.loads(cache_file.read_text(encoding='utf-8'))
                    except Exception:
                        pass
                cache_data[clean_id] = info
                cache_file.write_text(json.dumps(cache_data, indent=2, ensure_ascii=False), encoding='utf-8')
                logger.info('[ChunkStore] Fetched and cached arXiv paper %s: %s', clean_id, title[:50])
                return info
        except Exception as e:
            if ChunkStore._local_silver_cache is not None:
                ChunkStore._local_silver_cache[clean_id] = {}
            logger.debug('[ChunkStore] Failed on-demand arXiv fetch for %s: %s', clean_id, e)
            return None

    def _lookup_local_silver(self, paper_id, chunk_id):
        self._ensure_local_silver()
        # 1. Exact chunk match from chunks.parquet on demand
        if chunk_id and getattr(ChunkStore, '_chunks_ds', None) is not None:
            try:
                import pyarrow.dataset as ds
                t = ChunkStore._chunks_ds.scanner(
                    columns=['chunk_id', 'paper_id', 'title', 'text', 'full_chunk_text'],
                    filter=ds.field('chunk_id') == chunk_id
                ).to_table()
                if t.num_rows > 0:
                    r = t.slice(0, 1).to_pylist()[0]
                    pid = r.get('paper_id') or paper_id or ''
                    p_info = ChunkStore._local_silver_cache.get(pid, {}) if ChunkStore._local_silver_cache else {}
                    return {
                        'chunk_id': chunk_id,
                        'paper_id': pid,
                        'title': r.get('title') or p_info.get('title', ''),
                        'authors': p_info.get('authors', []),
                        'text': r.get('full_chunk_text') or r.get('text') or r.get('title', ''),
                        'abstract': p_info.get('abstract', ''),
                    }
            except Exception as e:
                logger.debug('chunks_ds lookup failed for %s: %s', chunk_id, e)

        if not paper_id and chunk_id:
            import re
            m = re.match(r'^(.*?)_(abs|sec\d+)', chunk_id)
            if m:
                paper_id = m.group(1)
            elif '_' in chunk_id:
                paper_id = chunk_id.rsplit('_', 1)[0]
        if not paper_id:
            return None

        # 2. Check local paper cache
        info = None
        if ChunkStore._local_silver_cache:
            for k in (paper_id, paper_id.replace('openalex:', ''), paper_id.replace('arXiv:', ''), paper_id.replace('oa_', '')):
                if k in ChunkStore._local_silver_cache:
                    info = ChunkStore._local_silver_cache[k]
                    break

        # 3. If missing and is an arXiv ID, fetch on demand
        if not info:
            import re
            m = re.search(r'(\d{4}\.\d{4,5})', paper_id)
            if m:
                info = self._fetch_arxiv_on_demand(m.group(1))

        if info:
            title = str(info.get('title', '') or '').strip()
            if title.lower() == 'nan': title = ''
            abstract = str(info.get('abstract', '') or '').strip()
            if abstract.lower() == 'nan': abstract = ''
            txt = str(info.get('text', '') or '').strip()
            if txt.lower() == 'nan': txt = ''
            final_text = txt or abstract or title
            authors = info.get('authors', [])
            if not isinstance(authors, list): authors = []
            return {
                'chunk_id': chunk_id or f'{paper_id}_abs',
                'paper_id': paper_id,
                'title': title,
                'authors': [str(a) for a in authors if str(a).lower() != 'nan'],
                'text': final_text,
                'abstract': abstract,
            }
        return None

    def hydrate(self, payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Merge each Qdrant payload with its chunk row (payload keys such as score/id are kept)."""
        rows = self.get(p.get("chunk_id") for p in payloads)
        merged = []
        for p in payloads:
            non_empty_p = {k: v for k, v in p.items() if v is not None and v != "" and v != []}
            row = rows.get(str(p.get("chunk_id")))
            if row is None:
                local_info = self._lookup_local_silver(p.get("paper_id"), p.get("chunk_id"))
                if local_info:
                    merged.append({**local_info, **non_empty_p})
                else:
                    logger.warning("[ChunkStore] chunk %s missing from %s", p.get("chunk_id"), CHUNKS_PREFIX)
                    merged.append(dict(p))
            else:
                merged.append({**row, **non_empty_p})
        return merged


_default: Optional[ChunkStore] = None
_default_lock = threading.Lock()


def default_chunk_store() -> ChunkStore:
    """Process-wide store, so the footer and row caches are shared by every caller."""
    global _default
    with _default_lock:
        if _default is None:
            _default = ChunkStore()
        return _default
