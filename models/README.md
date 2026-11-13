# Recitation model (served with the game)

`whisper-base-ar-quran/` is **tarteel-ai/whisper-base-ar-quran** (Apache-2.0, https://huggingface.co/tarteel-ai/whisper-base-ar-quran),
converted to ONNX by **eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran** (Apache-2.0).

Files are copied unchanged except `onnx/decoder_model_merged_q4.onnx`, which was rewritten by
`tools/shrink-decoder.py` to fit iPhone Safari's memory:

- **Why:** the original decoder (123 MB) keeps the 51865×512 token embedding in float32 (106 MB). ONNX Runtime builds a
  second transposed copy of that table for the logits. Building the recognizer then peaked around 0.6–1 GB, and iOS
  killed the tab (Ricky's iPhone 13, 2026-11-13).
- **Changes:** the embedding lookup now uses an int8 copy with one scale per row. The logits use 8-bit integer weights (`DynamicQuantizeLinear` → `MatMulInteger`, one scale per column; 4-bit lost the ذ/ز difference in our test)
  The float32 table is gone. Same weights, same outputs
  within quantization noise (see docs/PROGRESS.md for the accuracy check).
- **Size:** decoder 70.8 MB, encoder (`encoder_model_q4.onnx`, unchanged) 18.7 MB, tokenizer/config 3.7 MB.

Served from this site rather than Hugging Face so the files stay available and are cached under our own URLs.
