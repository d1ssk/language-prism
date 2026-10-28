"""Validated JSON plan on stdin -> atomic WAV/MP3 + provenance, offline by default."""
from __future__ import annotations
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from backends import create_backend

ROOT = Path(__file__).resolve().parents[2]
LANGUAGES = [item['code'] for item in json.loads((ROOT / 'config/languages.json').read_text())]


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def file_digest(file):
    h = hashlib.sha256()
    with Path(file).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def model_snapshot(model, revision):
    if Path(model).is_dir():
        return str(Path(model).resolve())
    from huggingface_hub import snapshot_download
    return snapshot_download(model, revision=revision, local_files_only=True,
                             allow_patterns=['*.safetensors', '*.json', '*.txt', '*.jinja', '*.model', '*.pt'])


def model_identity(folder):
    # Snapshot commit + file identities also detect edits to local model weights.
    return digest([str(Path(folder).resolve()), [(str(p.relative_to(folder)), p.stat().st_size, p.stat().st_mtime_ns)
                   for p in sorted(Path(folder).rglob('*')) if p.is_file()]])


def fingerprint(plan, job, model_id, reference_hash, version):
    return digest({'text': job['text'], 'language': job['language'], 'backend': plan['backend'],
                   'model': plan['model'], 'revision': plan['revision'], 'model_identity': model_id,
                   'parameters': plan['params'], 'reference_sha256': reference_hash, 'version': version,
                   'adapter': file_digest(Path(__file__).with_name('backends.py')), 'encoding': 'mp3-192k-v1'})


def ffmpeg_executable():
    explicit = os.environ.get('PRISM_FFMPEG')
    if explicit:
        executable = explicit
    else:
        try:
            import imageio_ffmpeg
            executable = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            executable = shutil.which('ffmpeg')
    if not executable:
        raise RuntimeError('ffmpeg または imageio-ffmpeg を導入してください')
    subprocess.run([executable, '-version'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return executable


def atomic_json(path, value):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, suffix='.json.tmp', delete=False) as tmp:
        json.dump(value, tmp, ensure_ascii=False, indent=2)
        tmp.write('\n')
        name = tmp.name
    os.replace(name, path)


def register_audio(plan, job):
    if plan['backend'] == 'mock':
        return
    file = Path(plan['contentPath'])
    content = json.loads(file.read_text())
    entry = next(u for u in content['units'] if u['id'] == job['unit'])['languages'][job['language']]
    if (entry.get('ttsText') or entry['text']) != job['text']:
        raise RuntimeError('処理中に本文が変更されました。再実行してください')
    entry['audio'] = {'path': job['relative'], 'origin': 'chatterbox', 'qualityStatus': 'unreviewed'}
    atomic_json(file, content)


def run(plan):
    for job in plan['jobs']:
        if job['language'] not in LANGUAGES:
            raise ValueError('未対応言語')
    if plan['dryRun']:
        for index, job in enumerate(plan['jobs'], 1):
            print(f"[{index}/{len(plan['jobs'])}] {job['unit']}/{job['language']}: {job['text']} -> {job['output']}")
        print('DRY RUN: モデル・参照音声・キャッシュの確認と生成は実行していません。実行時に変更を判定します。')
        return 0
    if plan['backend'] == 'mock':
        model_path, model_id, reference_hash, version = '', 'mock-v1', '', 'stdlib'
    else:
        if not plan['reference'] or not Path(plan['reference']).is_file():
            raise ValueError('参照音声がありません。--ref または PRISM_TTS_REFERENCE を設定してください')
        reference_hash = file_digest(plan['reference'])
        model_path = model_snapshot(plan['model'], plan['revision'])
        identities = [model_identity(model_path)]
        if plan['backend'] == 'mlx':
            identities.append(model_identity(model_snapshot('mlx-community/S3TokenizerV2', 'main')))
        model_id = digest(identities)
        version = importlib.metadata.version('mlx-audio' if plan['backend'] == 'mlx' else 'chatterbox-tts')
    executable = ffmpeg_executable()
    backend = None
    failures = 0
    for index, job in enumerate(plan['jobs'], 1):
        target = Path(job['output'])
        manifest = target.with_suffix('.mp3.json')
        key = fingerprint(plan, job, model_id, reference_hash, version)
        print(f"[{index}/{len(plan['jobs'])}] {job['unit']}/{job['language']}", flush=True)
        try:
            if target.exists() and manifest.exists() and not plan['force']:
                previous = json.loads(manifest.read_text())
                if previous.get('fingerprint') == key and previous.get('audio_sha256') == file_digest(target):
                    print('  SKIP: 入力・モデル・参照音声・パラメータの変更なし', flush=True)
                    continue
            if backend is None:
                print(f"Loading {plan['backend']}: {plan['model']}", flush=True)
                backend = create_backend(plan['backend'], model_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='.tts-', dir=target.parent) as folder:
                wav, mp3 = Path(folder) / 'audio.wav', Path(folder) / 'audio.mp3'
                backend.generate(job, wav, plan['params'], plan['reference'])
                subprocess.run([executable, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', str(wav),
                                '-codec:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1', str(mp3)], check=True)
                if mp3.stat().st_size == 0:
                    raise ValueError('MP3が空です')
                metadata = {'backend': plan['backend'], 'mock': plan['backend'] == 'mock', 'model': plan['model'],
                            'revision': plan['revision'], 'fingerprint': key, 'model_identity': model_id,
                            'text': job['text'], 'language': job['language'], 'parameters': plan['params'],
                            'reference_sha256': reference_hash, 'audio_sha256': file_digest(mp3),
                            'backend_version': version, 'generatedAt': datetime.now(timezone.utc).isoformat()}
                # Conversion completes before replacing any existing successful audio.
                os.replace(mp3, target)
                atomic_json(manifest, metadata)
                register_audio(plan, job)
                print(f'  SAVED: {target}', flush=True)
        except Exception as exc:
            failures += 1
            print(f"  FAILED: {job['unit']}/{job['language']}: {exc}", file=sys.stderr, flush=True)
    print(f"完了: {len(plan['jobs']) - failures}/{len(plan['jobs'])}, 失敗: {failures}", flush=True)
    return 1 if failures else 0


if __name__ == '__main__':
    try:
        sys.exit(run(json.load(sys.stdin)))
    except Exception as exc:
        print(f'TTS ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
