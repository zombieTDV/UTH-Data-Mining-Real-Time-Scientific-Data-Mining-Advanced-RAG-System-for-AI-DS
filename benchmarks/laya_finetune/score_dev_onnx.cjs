// Scores dev.jsonl through @receptron/laya (the production runtime) to check the ONNX export against Colab's Python scores.
//   node score_dev_onnx.cjs <modelDir> <dev.jsonl> <out.json>   (run from backend_rag/)
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const req = createRequire(path.join(process.cwd(), 'package.json'));
(async () => {
  const { Laya } = await import(req.resolve('@receptron/laya'));
  const [dir, devPath, outPath] = process.argv.slice(2);
  const rows = fs.readFileSync(devPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const model = await Laya.load({ modelDir: path.resolve(dir) });
  const scores = [];
  const t0 = Date.now();
  for (const r of rows) {
    const q = r.questions.relevant;
    const out = await model.systemOne(r.state, { q: { type: q.type, instructions: q.instructions } });
    scores.push(out.answers.q.noul);
    if (scores.length % 100 === 0) console.log(scores.length, ((Date.now() - t0) / scores.length).toFixed(0), 'ms/row');
  }
  fs.writeFileSync(outPath, JSON.stringify(scores));
  await model.close();
})().catch((e) => { console.error(e); process.exit(1); });
