import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/tts'))
import generate
from backends import MockBackend


class PipelineTests(unittest.TestCase):
    def plan(self, root):
        return {'backend': 'mock', 'model': 'test', 'revision': 'main', 'reference': None,
                'params': {'seed': 42, 'max_tokens': 50, 'temperature': 0.8}, 'force': False, 'dryRun': False,
                'jobs': [{'unit': 'u001', 'language': 'ja', 'text': 'こんにちは。', 'relative': 'ja.mp3', 'output': str(root / 'ja.mp3')}]}

    def test_fingerprint_changes_for_each_input(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.plan(Path(directory)); job = p['jobs'][0]
            original = generate.fingerprint(p, job, 'model-a', 'voice-a', '1')
            for change in [('model-b', 'voice-a', '1'), ('model-a', 'voice-b', '1'), ('model-a', 'voice-a', '2')]:
                self.assertNotEqual(original, generate.fingerprint(p, job, *change))
            self.assertNotEqual(original, generate.fingerprint(p, dict(job, text='こんばんは。'), 'model-a', 'voice-a', '1'))
            p['params']['seed'] = 43
            self.assertNotEqual(original, generate.fingerprint(p, job, 'model-a', 'voice-a', '1'))

    def test_mock_produces_wav(self):
        import wave
        with tempfile.TemporaryDirectory() as directory:
            wav = Path(directory) / 'tone.wav'
            MockBackend().generate({}, wav, {}, None)
            with wave.open(str(wav)) as source:
                self.assertEqual(source.getnchannels(), 1)
                self.assertGreater(source.getnframes(), 0)

    def test_cache_skip_force_and_failed_regeneration_preserves_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); p = self.plan(root)
            def convert(args, **kwargs):
                Path(args[-1]).write_bytes(b'ID3-test-audio')
            with patch.object(generate, 'ffmpeg_executable', return_value='ffmpeg'), patch.object(generate.subprocess, 'run', side_effect=convert):
                self.assertEqual(generate.run(p), 0)
                manifest = json.loads((root / 'ja.mp3.json').read_text())
                self.assertTrue(manifest['mock'])
                with patch.object(generate, 'create_backend', side_effect=AssertionError('must skip')):
                    self.assertEqual(generate.run(p), 0)
                p['force'] = True
                with patch.object(generate, 'create_backend', side_effect=ValueError('test failure')):
                    self.assertEqual(generate.run(p), 1)
                self.assertEqual((root / 'ja.mp3').read_bytes(), b'ID3-test-audio')
                p['force'] = False; p['jobs'][0]['text'] = 'こんばんは。'
                with patch.object(generate, 'create_backend', side_effect=ValueError('changed input must regenerate')):
                    self.assertEqual(generate.run(p), 1)

    def test_dry_run_never_loads_models(self):
        with tempfile.TemporaryDirectory() as directory:
            p = self.plan(Path(directory)); p['dryRun'] = True; p['backend'] = 'mlx'
            with patch.object(generate, 'model_snapshot', side_effect=AssertionError('no load')):
                self.assertEqual(generate.run(p), 0)
            self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
