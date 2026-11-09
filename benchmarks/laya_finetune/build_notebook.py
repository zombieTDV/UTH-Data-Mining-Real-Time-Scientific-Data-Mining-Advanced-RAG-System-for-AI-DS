"""Writes notebooks/finetune.ipynb. Edit the cells here, then rerun."""
import base64, hashlib, json, lzma
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CELLS = []
md = lambda s: CELLS.append(dict(cell_type="markdown", metadata={}, source=s.strip().splitlines(True)))
code = lambda s, **meta: CELLS.append(dict(cell_type="code", metadata=meta, execution_count=None, outputs=[], source=s.strip().splitlines(True)))

DATA = ROOT / "logs/benchmarks/laya_finetune"
def blob(name):
    raw = (DATA / name).read_bytes()
    return base64.b85encode(lzma.compress(raw, preset=9 | lzma.PRESET_EXTREME)).decode(), hashlib.sha256(raw).hexdigest()
TRAIN_BLOB, TRAIN_SHA = blob("train.jsonl")
DEV_BLOB, DEV_SHA = blob("dev.jsonl")

md("""
# Fine-tune Laya cho RAG_TS

Train lại Laya (`convaiinnovations/laya`) để chấm đúng câu hỏi production đang hỏi: *"đoạn văn này có trả lời trực tiếp câu hỏi không?"* trên paper khoa học. Kết quả là gói ONNX thay được cho `RAG_TS/model/laya`.

**Cách chạy:** chọn **Runtime > Change runtime type > T4 GPU**, rồi **Runtime > Run all**.

- Dữ liệu train/dev đã nằm sẵn trong notebook, không cần upload gì.
- Ngay phút đầu Colab sẽ hỏi quyền Google Drive một lần: bấm cho phép. Sau đó để tab chạy, không cần bấm gì thêm.
- Kết quả tự lưu vào `MyDrive/laya_finetune/`. Trình duyệt tự tải `report_<RUN_ID>.json`; gói `laya_onnx_<RUN_ID>.zip` (~1,7 GB) lấy trong Drive. `RUN_ID` có dạng `20261108-1430_seed0` (giờ Việt Nam), nên các lần chạy không ghi đè nhau.

**Quy tắc:** chọn model và ngưỡng trên `dev.jsonl`. Tập test v1 không có trong notebook này và chỉ dùng để đo model cuối cùng, trên máy local.
""")

md("## 1. Cài đặt")
code("""
%pip install -q "laya[onnx]==0.4.27"
import transformers, laya; print("transformers", transformers.__version__, "| laya", laya.__version__)
""")
code("""
import json, os, shutil, time
import numpy as np
import torch

assert torch.cuda.is_available(), "Chua co GPU: chon Runtime > Change runtime type > T4 GPU"
print("GPU:", torch.cuda.get_device_name(0), round(torch.cuda.get_device_properties(0).total_memory / 1e9, 1), "GB")

# --- Cau hinh ---
DRIVE_DIR = "/content/drive/MyDrive/laya_finetune"
WORK_DIR = "/content/laya_work"
SEED = 0
EPOCHS = 1         # Full fine-tune: cac lan chay truoc tot nhat o epoch 1, epoch 2-4 deu hoc thuoc.
MICRO_BATCH = 8   # Thieu VRAM (CUDA out of memory) thi giam con 4 va tang GRAD_ACCUM len 16.
GRAD_ACCUM = 8
TRAIN_TOP_LAYERS = None  # None = full fine-tune. So N = dong bang cac layer duoi, chi train N layer tren cung + head.
LABEL_SMOOTHING = 0.0  # 0.1 = nhan 0.95/0.05, bot loss vot len khi tu tin sai.
BEST_BY = "loss"  # Giu epoch co val loss thap nhat ("loss") hoac AUC dev cao nhat ("auc").
LOSS = "soft-ce"  # Tai lieu cua Laya: 0.790 so voi 0.7715 cua rlcd tren typed-decisions.
MAX_LEN = 512     # Giu dung 512 cua model production de do trong cung dieu kien.
os.makedirs(WORK_DIR, exist_ok=True)
# Ten moi file ket qua mang moc thoi gian (gio Viet Nam) va seed, de cac lan chay khong ghi de nhau.
from datetime import datetime, timedelta, timezone
RUN_ID = datetime.now(timezone(timedelta(hours=7))).strftime("%Y%m%d-%H%M") + f"_seed{SEED}"
print("RUN_ID =", RUN_ID)

# Hoi quyen Drive ngay tu dau, de sau do co the bo may chay mot minh.
from google.colab import drive
drive.mount("/content/drive")
os.makedirs(DRIVE_DIR, exist_ok=True)
""")

md("## 2. Nạp dữ liệu")
code(f"""
#@title Dữ liệu train/dev (nhúng sẵn, nén xz + base85)
import base64, hashlib, lzma
TRAIN, DEV = WORK_DIR + "/train.jsonl", WORK_DIR + "/dev.jsonl"
for path, packed, sha in [(TRAIN, "{TRAIN_BLOB}", "{TRAIN_SHA}"), (DEV, "{DEV_BLOB}", "{DEV_SHA}")]:
    raw = lzma.decompress(base64.b85decode(packed))
    assert hashlib.sha256(raw).hexdigest() == sha, "Du lieu nhung bi hong: " + path
    open(path, "wb").write(raw)
print("Da giai nen", TRAIN, DEV)
""", cellView="form")
code("""

read = lambda p: [json.loads(l) for l in open(p, encoding="utf-8")]
train_rows, dev_rows = read(TRAIN), read(DEV)
QUESTIONS = train_rows[0]["questions"]
source_papers = lambda rows: {r["group"].split("_sec")[0].split("_abs")[0].split("|")[0] for r in rows}
assert not (source_papers(train_rows) & source_papers(dev_rows)), "Train va dev khong duoc chung bai nguon"

def describe(name, rows):
    kinds = {}
    for r in rows:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(name, len(rows), "dong, ty le True", round(np.mean([r["expected"]["relevant"] for r in rows]), 3), kinds)
describe("train", train_rows)
describe("dev", dev_rows)
print(QUESTIONS["relevant"]["instructions"])
""")

md("## 3. Tải checkpoint gốc và kiểm tra dữ liệu")
code("""
from huggingface_hub import snapshot_download
from laya.train import TrainConfig, dry_run, finetune
import laya

BASE = snapshot_download("convaiinnovations/laya", local_dir=f"{WORK_DIR}/base", allow_patterns=[
    "model.safetensors", "config.json", "rl_agent_config.json", "encoder/*", "tokenizer/*"])

config = TrainConfig(loss=LOSS, epochs=EPOCHS, micro_batch=MICRO_BATCH, grad_accum=GRAD_ACCUM, label_smoothing=LABEL_SMOOTHING,
                     seed=SEED, max_len=MAX_LEN, eval_data=DEV)
print(json.dumps(dry_run(TRAIN, BASE, config), ensure_ascii=False, indent=1, default=str))
""")

md("""
## 4. Hàm đánh giá trên dev
- **`auc`:** khả năng tách chunk đúng khỏi chunk sai, không phụ thuộc ngưỡng.
- **`mrr`:** thứ hạng chunk đúng trong các chunk thật mà tìm kiếm trả về.
- **`accept@t`:** tỷ lệ mỗi loại được cho qua ngưỡng `t`. Loại `answerable` càng cao càng tốt, hai loại `missing_detail` và `fabricated` càng thấp càng tốt.
""")
code("""
THRESHOLDS = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)


def score_rows(checkpoint, rows, batch_size=32):
    agent = laya.load(checkpoint, device="cuda")
    out = agent.predict_batch([r["state"] for r in rows], QUESTIONS, batch_size=batch_size, sort_by_length=True)
    scores = np.array([o["answers"]["relevant"]["noul"] for o in out], dtype=float)
    del agent
    torch.cuda.empty_cache()
    return scores


def auc(positive, negative):
    p, n = np.asarray(positive)[:, None], np.asarray(negative)[None, :]
    return float((p > n).mean() + 0.5 * (p == n).mean())


def evaluate(rows, scores):
    labels = np.array([r["expected"]["relevant"] for r in rows])
    kinds = np.array([r["kind"] for r in rows])
    groups = {}
    for r, s in zip(rows, scores):
        if r["kind"] in ("answerable", "retrieved_relevant", "retrieved_irrelevant"):
            groups.setdefault(r["group"], []).append((s, r["expected"]["relevant"]))
    reciprocal = []
    for items in groups.values():
        if any(l for _, l in items) and any(not l for _, l in items):
            order = sorted(items, key=lambda x: -x[0])
            reciprocal.append(1 / (next(i for i, (_, l) in enumerate(order) if l) + 1))
    report = {"auc": round(auc(scores[labels], scores[~labels]), 4), "mrr": round(float(np.mean(reciprocal)), 4), "mrr_groups": len(reciprocal), "accept": {}}
    for kind in sorted(set(kinds)):
        report["accept"][kind] = {t: round(float((scores[kinds == kind] >= t).mean()), 3) for t in THRESHOLDS}
    return report


def show(name, report):
    print(f"{name}: auc={report['auc']} mrr={report['mrr']} (tren {report['mrr_groups']} cau)")
    print("  loai".ljust(26), *[f"t={t}".rjust(7) for t in THRESHOLDS])
    for kind, values in report["accept"].items():
        print(" ", kind.ljust(24), *[f"{values[t]:.3f}".rjust(7) for t in THRESHOLDS])
""")
code("""
before = evaluate(dev_rows, score_rows(BASE, dev_rows))
show("Laya goc", before)
""")

md("""
## 5a. Ghi lại loss train và val
`laya` chỉ trả loss trung bình mỗi epoch. Ô này gắn thêm vào vòng train của `laya.train`, không đổi cách train:
- **train loss:** loss của từng micro-batch.
- **val:** cuối mỗi epoch (và một lần trước khi train) chấm `dev.jsonl` để lấy loss, accuracy, AUC, ECE. Nhiệt độ để mặc định 1, nên số này dùng để xem xu hướng, không so trực tiếp với bảng ở bước 6.

Mỗi lần chấm dev mất khoảng một phút trên T4.
""")
code("""
import laya.train as lt

CURVES = {"step_loss": [], "epoch_loss": [], "val": []}
# Giu ban goc ngay lan dau, de chay lai o nay khong boc chong len nhau.
lt._orig_fns = getattr(lt, "_orig_fns", (lt.soft_ce_loss, lt.rlcd_loss, lt.train_model))
_orig_soft_ce, _orig_rlcd, _orig_train_model = lt._orig_fns


def _record(fn):
    def wrapped(*args, **kwargs):
        loss = fn(*args, **kwargs)
        CURVES["step_loss"].append(float(loss.detach()))
        return loss
    return wrapped


def _val_point(model, tok, items, device, max_len, head_max_len, parallel, epoch):
    records = lt.calibration_records(model, tok, items, device, max_len, head_max_len, parallel=parallel)
    metrics = lt.evaluate_records(records)
    labels = np.array([r["expected"]["relevant"] for r in dev_rows])
    assert len(records) == len(labels), "Dev bi bo dong khi doc: khong ghep duoc nhan"
    # Option ung voi "True" la option ma target cua mot dong True tro toi; noul giu thu tu option co dinh.
    yes = int(np.argmax(records[int(np.argmax(labels))][2]))
    probs = np.array([np.exp(r[1] - r[1].max()) / np.exp(r[1] - r[1].max()).sum() for r in records])
    score = probs[:, yes]
    point = {"epoch": epoch, "loss": metrics["loss"], "accuracy": metrics["accuracy"], "ece": metrics["ece"],
             "auc": round(auc(score[labels], score[~labels]), 4)}
    CURVES["val"].append(point)
    print("val", point, flush=True)


def _train_model_with_curves(model, tok, items, config, device, max_len, head_max_len, on_epoch_end=None, parallel=False):
    if TRAIN_TOP_LAYERS:
        enc = model.encoder
        for p in enc.parameters():
            p.requires_grad_(False)
        for layer in enc.layers[-TRAIN_TOP_LAYERS:]:
            for p in layer.parameters():
                p.requires_grad_(True)
        for p in enc.final_norm.parameters():
            p.requires_grad_(True)
    # laya chi dua tham so con requires_grad vao optimizer, nen phan dong bang dung yen.
    n_train = sum(p.numel() for p in model.parameters() if p.requires_grad)
    n_all = sum(p.numel() for p in model.parameters())
    CURVES["trainable_params"] = n_train
    print(f"Train {n_train / 1e6:.1f}M / {n_all / 1e6:.1f}M tham so ({100 * n_train / n_all:.1f}%), "
          f"{'top ' + str(TRAIN_TOP_LAYERS) + '/' + str(len(model.encoder.layers)) + ' layer' if TRAIN_TOP_LAYERS else 'full fine-tune'}", flush=True)

    rows = lt.read_data(DEV)
    val_items, _ = lt.items_from_rows(tok, rows, max_len, head_max_len, label_smoothing=0.0)
    _val_point(model, tok, val_items, device, max_len, head_max_len, parallel, 0)

    best = {"score": None, "epoch": None, "state": None}

    def epoch_end(epoch, mean):
        CURVES["epoch_loss"].append(mean)
        _val_point(model, tok, val_items, device, max_len, head_max_len, parallel, epoch + 1)
        point = CURVES["val"][-1]
        score = -point["loss"] if BEST_BY == "loss" else point["auc"]
        if best["score"] is None or score > best["score"]:
            # Ban sao tren RAM CPU (~1,6 GB), khong ton VRAM.
            best.update(score=score, epoch=epoch + 1, state={k: v.detach().to("cpu", copy=True) for k, v in model.state_dict().items()})
            print(f"-> epoch {epoch + 1} tot nhat den gio theo {BEST_BY}", flush=True)
        model.train()  # calibration_records chuyen model sang eval; tra lai che do train cho epoch sau.
        if on_epoch_end is not None:
            on_epoch_end(epoch, mean)

    history = _orig_train_model(model, tok, items, config, device, max_len, head_max_len, on_epoch_end=epoch_end, parallel=parallel)
    # Nap lai epoch tot nhat truoc khi laya hieu chinh nhiet do va luu: model luu ra, buoc 6 va ONNX deu dung ban nay.
    model.load_state_dict(best["state"])
    model.eval()
    CURVES["best_epoch"] = best["epoch"]
    print(f"Dung epoch {best['epoch']}/{len(history)} (chon theo {BEST_BY} tren dev)", flush=True)
    best["state"] = None
    return history


lt.soft_ce_loss, lt.rlcd_loss, lt.train_model = _record(_orig_soft_ce), _record(_orig_rlcd), _train_model_with_curves
""")

md("## 5. Train\nMột lần chạy có thể mất từ vài chục phút đến hơn một giờ, tùy GPU Colab cấp. Đừng để tab ngủ.")
code("""
OUT = f"{WORK_DIR}/laya_ft"
t0 = time.time()
summary = finetune(TRAIN, BASE, OUT, config, device="cuda")
print("Train xong sau", round((time.time() - t0) / 60, 1), "phut")
print(json.dumps({k: summary.get(k) for k in ("eval_mode", "before", "after") if k in summary}, ensure_ascii=False, indent=1, default=str))
""")

md("## 6. So sánh trên dev")
code("""
after_scores = score_rows(OUT, dev_rows)
after = evaluate(dev_rows, after_scores)
show("Laya goc", before)
show("Laya fine-tune", after)
print()
if after["auc"] > before["auc"] and after["mrr"] >= before["mrr"]:
    print("DAT tren dev: chuyen sang xuat ONNX.")
else:
    print("CHUA DAT tren dev: chua nen dung model nay. Thu SEED khac; mot lan chay chua du de ket luan.")
""")

md("## 6b. Biểu đồ loss train và val")
code("""
import matplotlib.pyplot as plt

steps = np.array(CURVES["step_loss"])
per_epoch = len(steps) // max(1, len(CURVES["epoch_loss"]))
x = np.arange(1, len(steps) + 1) / per_epoch  # truc x tinh bang epoch
# Loss cua moi lan cap nhat trong so = trung binh GRAD_ACCUM micro-batch; day moi la thu optimizer thay.
upd_x, upd_y = [], []
for e in range(len(CURVES["epoch_loss"])):
    ep = steps[e * per_epoch:(e + 1) * per_epoch]
    for i in range(0, len(ep), GRAD_ACCUM):
        upd_y.append(ep[i:i + GRAD_ACCUM].mean())
        upd_x.append(e + min(i + GRAD_ACCUM, len(ep)) / per_epoch)
val = CURVES["val"]
ve = [v["epoch"] for v in val]

fig, ax = plt.subplots(1, 3, figsize=(17, 4.2))
ax[0].plot(x, steps, color="#9bb7d4", lw=0.5, alpha=0.5, label="micro-batch")
ax[0].plot(upd_x, upd_y, color="#1f5fa8", lw=1.8, label=f"moi lan cap nhat ({GRAD_ACCUM * MICRO_BATCH} mau)")
ax[0].plot(range(1, len(CURVES["epoch_loss"]) + 1), CURVES["epoch_loss"], "o", color="#1f5fa8", label="trung binh epoch")
ax[0].plot(ve, [v["loss"] for v in val], "s-", color="#c2410c", lw=1.8, label="val (dev)")
if CURVES.get("best_epoch"):
    for a in ax[:2]:
        a.axvline(CURVES["best_epoch"], color="#6b7280", ls="--", lw=1)
    ax[0].text(CURVES["best_epoch"], ax[0].get_ylim()[1] * 0.95, f" epoch giu lai: {CURVES['best_epoch']}", color="#374151", va="top")
# Cat truc y o phan vi 99 de vai micro-batch vot len khong lam det ca bieu do.
ax[0].set_ylim(0, max(np.percentile(steps, 99), max(v["loss"] for v in val)) * 1.1)
ax[0].set(title="Loss", xlabel="epoch", ylabel="loss"); ax[0].legend(frameon=False)

ax[1].plot(ve, [v["accuracy"] for v in val], "o-", color="#1f5fa8", label="accuracy")
ax[1].plot(ve, [v["auc"] for v in val], "s-", color="#15803d", label="AUC")
ax[1].plot(ve, [v["ece"] for v in val], "^-", color="#c2410c", label="ECE (thap la tot)")
ax[1].set(title="Dev theo epoch (epoch 0 = Laya goc)", xlabel="epoch", ylim=(0, 1)); ax[1].legend(frameon=False)

kinds = list(before["accept"])
w = 0.38
ax[2].bar(np.arange(len(kinds)) - w / 2, [before["accept"][k][0.6] for k in kinds], w, color="#9ca3af", label="Laya goc")
ax[2].bar(np.arange(len(kinds)) + w / 2, [after["accept"][k][0.6] for k in kinds], w, color="#1f5fa8", label="fine-tune")
ax[2].set_xticks(range(len(kinds)), kinds, rotation=20, ha="right")
ax[2].set(title="Ty le cho qua o nguong 0.6 (dev)", ylim=(0, 1)); ax[2].legend(frameon=False)
for a in ax:
    a.spines[["top", "right"]].set_visible(False); a.grid(alpha=0.25)
plt.tight_layout()
plt.savefig(f"{DRIVE_DIR}/curves_{RUN_ID}.png", dpi=140)
plt.show()
""")

md("## 7. Xuất ONNX và kiểm tra khớp với PyTorch")
code("""
from safetensors.torch import load_file
from laya.common import build_model
import onnxruntime as ort

ONNX_DIR = f"{WORK_DIR}/laya_onnx"
shutil.rmtree(ONNX_DIR, ignore_errors=True)
os.makedirs(ONNX_DIR)
cfg = json.load(open(f"{OUT}/rl_agent_config.json"))
model = build_model(cfg, encoder_dir=f"{OUT}/encoder")
model.load_state_dict(load_file(f"{OUT}/model.safetensors"), strict=True)
model = model.float().cpu().eval()
model.encoder.config.reference_compile = False


class Wrapper(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, input_ids, attention_mask, marker_pos, marker_mask, qtype):
        logits, act = self.m(input_ids, attention_mask, marker_pos, marker_mask, qtype)
        return logits, torch.softmax(act.float(), -1)


wrapped = Wrapper(model).eval()  # Wrapper moi tao mac dinh o che do train; model ben trong da eval.
B, L, K = 2, 40, 4
example = (
    torch.randint(5, 1000, (B, L)),
    torch.ones(B, L, dtype=torch.long),
    torch.tensor([[3, 9, 15, 21], [3, 9, 0, 0]]),
    torch.tensor([[True, True, True, True], [True, True, False, False]]),
    torch.tensor([0, 2]),
)
example[1][1, 30:] = 0
batch, seq, options = torch.export.Dim("batch"), torch.export.Dim("seq", min=8), torch.export.Dim("options", min=2)
# Grad stays on: the fused fast path of TransformerEncoderLayer cannot be exported and is only taken under no_grad.
program = torch.onnx.export(
    wrapped, example, opset_version=18, dynamo=True, optimize=True,
    input_names=["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"],
    output_names=["logits", "act_probs"],
    dynamic_shapes={"input_ids": {0: batch, 1: seq}, "attention_mask": {0: batch, 1: seq},
                    "marker_pos": {0: batch, 1: options}, "marker_mask": {0: batch, 1: options}, "qtype": {0: batch}},
)
program.save(f"{ONNX_DIR}/laya.onnx", external_data=True)
shutil.copytree(f"{OUT}/tokenizer", f"{ONNX_DIR}/tokenizer")
# temperature_by_options la tuy chon: checkpoint fine-tune khong co thi runtime (ca Python lan @receptron/laya) dung temperature[qtype].
runtime_cfg = {k: cfg[k] for k in ("max_len", "head_max_len", "temperature", "temperature_by_options") if k in cfg}
json.dump(runtime_cfg, open(f"{ONNX_DIR}/laya_config.json", "w"), indent=1)
# Thu muc weight tu ghi ro no la lan chay nao, ke ca sau khi giai nen va doi ten.
json.dump(dict(run_id=RUN_ID, seed=SEED, loss=LOSS, epochs=EPOCHS, laya_version=laya.__version__, dev_before=before, dev_after=after),
          open(f"{ONNX_DIR}/RUN_INFO.json", "w"), ensure_ascii=False, indent=1, default=str)

with torch.no_grad():
    reference, _ = wrapped(*example)
session = ort.InferenceSession(f"{ONNX_DIR}/laya.onnx", providers=["CPUExecutionProvider"])
got = session.run(None, dict(zip(["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"], [x.numpy() for x in example])))
gap = float(np.abs(got[0] - reference.numpy()).max())
print("Lech logit lon nhat giua ONNX va PyTorch:", gap)
assert gap < 1e-2, "ONNX khong khop PyTorch: khong dung ban nay"
print("Nhiet do noul:2 =", runtime_cfg.get("temperature_by_options", {}).get("noul:2", runtime_cfg["temperature"][2]), "| config:", sorted(runtime_cfg))
print(os.listdir(ONNX_DIR), round(sum(os.path.getsize(f"{ONNX_DIR}/{f}") for f in os.listdir(ONNX_DIR) if f.startswith("laya.")) / 1e9, 2), "GB")
""")

md("## 8. Lưu kết quả\nTự lưu vào Drive và tự tải về máy. Nếu trình duyệt chặn tải nhiều file, bấm cho phép, hoặc lấy trong `MyDrive/laya_finetune/`.")
code("""
report = dict(run_id=RUN_ID, seed=SEED, train_top_layers=TRAIN_TOP_LAYERS, label_smoothing=LABEL_SMOOTHING, best_by=BEST_BY, best_epoch=CURVES.get("best_epoch"), loss=LOSS, epochs=EPOCHS, micro_batch=MICRO_BATCH, grad_accum=GRAD_ACCUM, max_len=MAX_LEN, laya_version=laya.__version__, before=before, after=after, onnx_logit_gap=gap, train_summary=summary, curves=CURVES)
json.dump(report, open(f"{DRIVE_DIR}/report_{RUN_ID}.json", "w"), ensure_ascii=False, indent=1, default=str)
import zipfile
archive = f"{WORK_DIR}/laya_onnx_{RUN_ID}.zip"
# Trong so float khong nen duoc them, nen luu thang (ZIP_STORED) cho nhanh.
with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
    for root, _, names in os.walk(ONNX_DIR):
        for n in names:
            z.write(os.path.join(root, n), os.path.relpath(os.path.join(root, n), ONNX_DIR))
print("Da dong goi", round(os.path.getsize(archive) / 1e9, 2), "GB, dang chep sang Drive (vai phut)...", flush=True)
shutil.copy(archive, DRIVE_DIR)
print("Da luu vao", DRIVE_DIR, os.listdir(DRIVE_DIR))

from google.colab import files
files.download(f"{DRIVE_DIR}/report_{RUN_ID}.json")
# Goi 1,7 GB tai qua trinh duyet rat cham va hay dut: lay trong Drive.
print(f"Tai laya_onnx_{RUN_ID}.zip trong MyDrive/laya_finetune/")
""")

# Resume cell: reruns steps 7-8 from the checkpoint on disk when they failed earlier in this session.
_src = lambda marker: next("".join(c["source"]) for c in CELLS if c["cell_type"] == "code" and marker in "".join(c["source"]))
md("## 9. Chạy lại xuất ONNX và lưu (chỉ khi bước 7 hoặc 8 lỗi)\nDùng model đã train trong phiên này, không train lại. Nếu bước 7–8 đã chạy xong thì ô này tự bỏ qua.")
code("RESUME = " + json.dumps(_src("Wrapper(model)") + "\n\n" + _src("files.download")) + """
if os.path.exists(f"{DRIVE_DIR}/laya_onnx_{RUN_ID}.zip") and os.path.exists(f"{DRIVE_DIR}/report_{RUN_ID}.json"):
    print("Buoc 7-8 da xong, bo qua.")
else:
    assert os.path.exists(f"{OUT}/model.safetensors"), "Chua co model da train trong phien nay: chay buoc 5 truoc"
    exec(RESUME)
""", cellView="form")

nb = dict(cells=CELLS, metadata=dict(accelerator="GPU", colab=dict(gpuType="T4", provenance=[]), kernelspec=dict(display_name="Python 3", name="python3"), language_info=dict(name="python")), nbformat=4, nbformat_minor=5)
for i, c in enumerate(nb["cells"]):
    c["id"] = f"cell-{i:02d}"
(ROOT / "notebooks/finetune.ipynb").write_text(json.dumps(nb, ensure_ascii=False, indent=1))
print(len(CELLS), "cells")
