"""shrink-decoder.py — make the Tarteel whisper-base decoder small enough for iPhone Safari.

Why (2026-11-13): eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran `decoder_model_merged_q4.onnx` is 123 MB, of which
106 MB is ONE fp32 table, the token embedding [51865, 512]. It is used twice: a Gather (token -> vector) and, through a
Transpose, the MatMul that makes the logits. ONNX Runtime constant-folds that Transpose when the session is created,
so a second 106 MB copy appears in memory; with the copies made while loading, building the recognizer peaked at
~0.6-1 GB and iOS killed the Safari tab (Ricky's iPhone 13: reload loop).

What this does (same model, same weights, only how the table is stored):
  * Gather path: an int8 copy of the table with one fp32 scale per row; the gathered rows are dequantised at run time
    (Gather int8 rows + Gather scales -> Cast -> Mul). Nothing to constant-fold.
  * Logits: Transpose + MatMul -> 8-bit int weights (one scale per output column) with standard ops:
    DynamicQuantizeLinear(hidden) -> MatMulInteger -> Cast -> Mul. (LM_BITS=4 uses MatMulNBits 4-bit instead: smaller, but
    it lost the ذ/ز difference in "a'uzu" in our test, so 8-bit is the default.)
  * The fp32 table is removed.

Usage:  python shrink-decoder.py <in decoder_model_merged_q4.onnx> <out .onnx>
Needs:  onnx, numpy (and onnxruntime for the self-check at the end).
"""
import sys
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
G = m.graph
E_NAME = 'model.decoder.embed_tokens.weight_merged_0'
E_T = 'model.decoder.embed_tokens.weight_transposed'
inits = {t.name: t for t in G.initializer}
E = numpy_helper.to_array(inits[E_NAME]).astype(np.float32)  # [N=51865, K=512]
N, K = E.shape
import os
BITS = int(os.environ.get('LM_BITS', '8'))     # logits weights: 8 (MatMulInteger, default) or 4 (MatMulNBits)
BLOCK = int(os.environ.get('LM_BLOCK', '32'))  # values per scale
assert K % BLOCK == 0 and BITS in (4, 8)

# ---- int8 table for the Gather (per-row symmetric) ----
row_max = np.abs(E).max(axis=1)
row_scale = np.where(row_max > 0, row_max / 127.0, 1.0).astype(np.float32)
E_i8 = np.clip(np.round(E / row_scale[:, None]), -127, 127).astype(np.int8)

# ---- MatMulNBits weights for the logits: B is [N, K] = the table itself ----
blocks = E.reshape(N, K // BLOCK, BLOCK)
bmax = np.abs(blocks).max(axis=2)
qmax, zp = (7, 8) if BITS == 4 else (127, 128)                            # symmetric, default zero point
bscale = np.where(bmax > 0, bmax / qmax, 1.0).astype(np.float32)
q = np.clip(np.round(blocks / bscale[:, :, None]) + zp, 0, 2 * zp - 1).astype(np.uint8)  # [N, K/B, B]
packed = (q[:, :, 0::2] | (q[:, :, 1::2] << 4)).astype(np.uint8) if BITS == 4 else q     # 4-bit: low nibble first

new_inits = [
    numpy_helper.from_array(E_i8, 'km.embed_tokens.int8'),
    numpy_helper.from_array(row_scale, 'km.embed_tokens.row_scale'),
]
if BITS == 4:
    new_inits += [numpy_helper.from_array(packed, 'km.lm_head.Q4'), numpy_helper.from_array(bscale.reshape(-1), 'km.lm_head.scales')]
else:
    # 8-bit with standard ops (ORT web's MatMulNBits is 4-bit only): weights [K, N] int8, one scale per output column
    col_max = np.abs(E).max(axis=1)                                   # per token = per output column of the logits
    col_scale = np.where(col_max > 0, col_max / 127.0, 1.0).astype(np.float32)
    W8 = np.clip(np.round(E / col_scale[:, None]), -127, 127).astype(np.int8).T.copy()  # [K, N]
    new_inits += [numpy_helper.from_array(W8, 'km.lm_head.int8'), numpy_helper.from_array(col_scale, 'km.lm_head.col_scale'),
                  numpy_helper.from_array(np.array(0, dtype=np.int8), 'km.lm_head.zp')]
G.initializer.remove(inits[E_NAME])
G.initializer.extend(new_inits)

def patch(graph):
    nodes = list(graph.node)
    out = []
    for n in nodes:
        for a in n.attribute:
            if a.type == onnx.AttributeProto.GRAPH:
                patch(a.g)
        if n.op_type == 'Transpose' and list(n.input) == [E_NAME]:
            continue  # the folded 106 MB copy: gone
        if n.op_type == 'Gather' and n.input[0] == E_NAME:
            ids, y = n.input[1], n.output[0]
            p = n.name + '/km'
            out += [
                helper.make_node('Gather', ['km.embed_tokens.int8', ids], [p + '/rows_i8'], name=p + '/gather_i8', axis=0),
                helper.make_node('Gather', ['km.embed_tokens.row_scale', ids], [p + '/scale'], name=p + '/gather_scale', axis=0),
                helper.make_node('Cast', [p + '/rows_i8'], [p + '/rows_f'], name=p + '/cast', to=TensorProto.FLOAT),
                helper.make_node('Unsqueeze', [p + '/scale', p + '/axis'], [p + '/scale_u'], name=p + '/unsq'),
                helper.make_node('Mul', [p + '/rows_f', p + '/scale_u'], [y], name=p + '/mul'),
            ]
            graph.initializer.append(numpy_helper.from_array(np.array([-1], dtype=np.int64), p + '/axis'))
            continue
        if n.op_type == 'MatMul' and len(n.input) == 2 and n.input[1] == E_T:
            if BITS == 4:
                out.append(helper.make_node('MatMulNBits', [n.input[0], 'km.lm_head.Q4', 'km.lm_head.scales'], list(n.output),
                                            name=n.name + '/km_nbits', domain='com.microsoft', K=K, N=N, bits=BITS, block_size=BLOCK))
            else:
                p = n.name + '/km8'
                out += [
                    helper.make_node('DynamicQuantizeLinear', [n.input[0]], [p + '/xq', p + '/xs', p + '/xzp'], name=p + '/dq'),
                    helper.make_node('MatMulInteger', [p + '/xq', 'km.lm_head.int8', p + '/xzp', 'km.lm_head.zp'], [p + '/acc'], name=p + '/mmi'),
                    helper.make_node('Cast', [p + '/acc'], [p + '/accf'], name=p + '/cast', to=TensorProto.FLOAT),
                    helper.make_node('Mul', [p + '/xs', 'km.lm_head.col_scale'], [p + '/scale'], name=p + '/mulscale'),
                    helper.make_node('Mul', [p + '/accf', p + '/scale'], list(n.output), name=p + '/mul'),
                ]
            continue
        out.append(n)
    del graph.node[:]
    graph.node.extend(out)

patch(G)
onnx.save(m, dst)
print(f'wrote {dst}')

# ---- self-check against the original with onnxruntime (random hidden states, real token ids) ----
try:
    import onnxruntime as ort
except ImportError:
    sys.exit(0)
def run(path, feeds):
    s = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
    names = {i.name for i in s.get_inputs()}
    return s.run(['logits'], {k: v for k, v in feeds.items() if k in names})[0]
s0 = ort.InferenceSession(src, providers=['CPUExecutionProvider'])
rng = np.random.default_rng(0)
feeds = {}
for i in s0.get_inputs():
    shape = [d if isinstance(d, int) else {'batch_size': 1, 'decoder_sequence_length': 4, 'encoder_sequence_length_out': 1500,
             'past_decoder_sequence_length': 0, 'encoder_sequence_length': 1500}.get(d, 1) for d in i.shape]
    if i.name == 'input_ids': feeds[i.name] = np.array([[50258, 50272, 50359, 50363]], dtype=np.int64)
    elif i.name == 'use_cache_branch': feeds[i.name] = np.array([False])
    elif 'past_key_values' in i.name: feeds[i.name] = np.zeros(shape, dtype=np.float32)
    else: feeds[i.name] = rng.standard_normal(shape).astype(np.float32)
a, b = run(src, feeds), run(dst, feeds)
same = (a.argmax(-1) == b.argmax(-1)).mean()
print(f'logits: max |diff| {np.abs(a - b).max():.4f}, same next token {same * 100:.0f}%')
