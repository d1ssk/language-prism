"""Lazy adapters: importing this file does not import MLX/PyTorch or load weights."""
from pathlib import Path
import math
import struct
import wave


class MockBackend:
    def generate(self, job, wav, params, reference):
        # Audible test tone, deliberately never written into either media collection.
        with wave.open(str(wav), 'wb') as out:
            out.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
            out.writeframes(b''.join(struct.pack('<h', int(1200 * math.sin(2 * math.pi * 440 * n / 24000))) for n in range(7200)))


class MLXBackend:
    def __init__(self, model_path):
        from mlx_audio.tts import load
        self.model = load(model_path, lazy=True)

    def generate(self, job, wav, params, reference):
        import mlx.core as mx
        import numpy as np
        import soundfile as sf
        mx.random.seed(params['seed'])
        chunks, rate = [], None
        for result in self.model.generate(text=job['text'], lang_code=job['language'], ref_audio=reference,
                                          max_tokens=params['max_tokens'], temperature=params['temperature'], verbose=False):
            mx.eval(result.audio)
            audio = np.asarray(result.audio, dtype=np.float32).squeeze()
            if audio.ndim != 1 or not audio.size or not np.isfinite(audio).all():
                raise ValueError('モデルから不正な音声が返されました')
            if rate is not None and rate != result.sample_rate:
                raise ValueError('音声チャンクのサンプルレートが一致しません')
            chunks.append(audio)
            rate = result.sample_rate
        if not chunks:
            raise ValueError('モデルから音声が返されませんでした')
        sf.write(str(wav), np.concatenate(chunks), rate, subtype='FLOAT')
        mx.clear_cache()


class TorchBackend:
    def __init__(self, model_path):
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        device = 'mps' if torch.backends.mps.is_available() else 'cpu'
        self.model = ChatterboxMultilingualTTS.from_local(model_path, device=device)

    def generate(self, job, wav, params, reference):
        import torch
        import soundfile as sf
        torch.manual_seed(params['seed'])
        # Upstream Torch API uses language_id; max_tokens is MLX-specific.
        audio = self.model.generate(job['text'], language_id=job['language'], audio_prompt_path=reference,
                                    temperature=params['temperature'])
        sf.write(str(wav), audio.detach().cpu().numpy().squeeze(), self.model.sr)


def create_backend(name, model_path):
    return {'mlx': MLXBackend, 'torch': TorchBackend}[name](model_path) if name != 'mock' else MockBackend()
