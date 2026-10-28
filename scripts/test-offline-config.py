import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('offline_config', Path(__file__).with_name('prepare-offline-config.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class OfflineConfigTest(unittest.TestCase):
    def config(self):
        return {'OFFLINE_SIGNING_SECRET': 'independent-offline-key-' + 'x' * 32, 'OFFLINE_SIGNING_KEY_ID': 'offline-v1', 'JWT_SECRET': 'different-login-key'}
    def test_existing_keys_never_trigger_generation_or_remote_changes(self):
        def denied(*args, **kwargs): self.fail('Existing signing configuration must be used unchanged')
        data = module.prepare(self.config(), 'signing', 'ap-south-1', denied)
        self.assertEqual(data['OFFLINE_SIGNING_SECRET'], self.config()['OFFLINE_SIGNING_SECRET'])
    def test_host_replacement_reads_same_durable_key(self):
        calls = []
        def aws(args, **kwargs):
            calls.append(args); return subprocess.CompletedProcess(args, 0, json.dumps(self.config()), '')
        first = module.prepare({}, 'signing', 'ap-south-1', aws)
        second = module.prepare({}, 'signing', 'ap-south-1', aws)
        self.assertEqual(first, second)
        self.assertTrue(all('get-secret-value' in call for call in calls))
    def test_missing_secret_never_becomes_a_local_key(self):
        with self.assertRaises(ValueError):
            module.prepare({}, 'missing', 'ap-south-1', lambda *a, **k: subprocess.CompletedProcess(a, 1, '', 'unavailable'))
    def test_key_reuse_and_login_key_sharing_are_rejected(self):
        invalid = self.config(); invalid['JWT_SECRET'] = invalid['OFFLINE_SIGNING_SECRET']
        with self.assertRaises(ValueError): module.validate(invalid)
        invalid = self.config(); invalid['OFFLINE_PREVIOUS_SIGNING_KEYS'] = json.dumps({'offline-v1': 'z' * 64})
        with self.assertRaises(ValueError): module.validate(invalid)
    def test_verification_keys_survive_rotation(self):
        data = self.config(); data['OFFLINE_PREVIOUS_SIGNING_KEYS'] = json.dumps({'offline-v0': 'old-protected-key-' + 'x' * 32})
        self.assertEqual(json.loads(module.validate(data)['OFFLINE_PREVIOUS_SIGNING_KEYS'])['offline-v0'], 'old-protected-key-' + 'x' * 32)

if __name__ == '__main__': unittest.main()
