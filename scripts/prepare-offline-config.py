#!/usr/bin/env python3
"""Load durable offline signing material; never invent a host-local replacement key."""
import json
import os
import re
import subprocess
import sys


def validate(config):
    secret = config.get('OFFLINE_SIGNING_SECRET', '')
    key_id = config.get('OFFLINE_SIGNING_KEY_ID', '')
    if not isinstance(secret, str) or len(secret) < 32 or secret == config.get('JWT_SECRET'):
        raise ValueError('Offline signing needs an independent protected key of at least 32 characters')
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,64}', key_id):
        raise ValueError('Offline signing key ID is missing or invalid')
    retained = config.get('OFFLINE_PREVIOUS_SIGNING_KEYS') or '{}'
    keys = json.loads(retained) if isinstance(retained, str) else retained
    if not isinstance(keys, dict):
        raise ValueError('Retained offline verification keys must be an object')
    for ident, value in keys.items():
        if not re.fullmatch(r'[A-Za-z0-9._-]{1,64}', ident) or not isinstance(value, str) or len(value) < 32:
            raise ValueError('A retained offline verification key is invalid')
        if ident == key_id and value != secret:
            raise ValueError('An offline key ID cannot be reused for different signing material')
    legacy = config.get('OFFLINE_LEGACY_SIGNING_SECRET')
    if legacy and len(legacy) < 32:
        raise ValueError('Legacy offline verification material is invalid')
    config['OFFLINE_PREVIOUS_SIGNING_KEYS'] = json.dumps(keys, separators=(',', ':'))
    return config


def prepare(config, secret_id, region, run=subprocess.run):
    config = dict(config)
    if not config.get('OFFLINE_SIGNING_SECRET'):
        result = run(['aws', 'secretsmanager', 'get-secret-value', '--secret-id', secret_id,
                      '--region', region, '--query', 'SecretString', '--output', 'text'],
                     capture_output=True, text=True)
        if result.returncode:
            raise ValueError('Durable offline signing configuration is unavailable. Apply the infrastructure stack before deploying; saved-payment verification keys must be retained')
        signing = json.loads(result.stdout)
        # Only designated signing fields can come from this separate secret.
        for key in ['OFFLINE_SIGNING_SECRET', 'OFFLINE_SIGNING_KEY_ID', 'OFFLINE_PREVIOUS_SIGNING_KEYS', 'OFFLINE_LEGACY_SIGNING_SECRET']:
            if key in signing:
                config[key] = signing[key]
    return validate(config)


if __name__ == '__main__':
    try:
        data = prepare(json.load(sys.stdin), os.environ['CHITWISE_OFFLINE_SECRET_ID'], os.environ['AWS_REGION'])
        for key, value in data.items():
            if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
                raise ValueError('Production configuration contains an invalid environment key')
            # Compose .env single quotes prevent expansion of $, # and spaces.
            value = str(value).replace('\\', '\\\\').replace("'", "\\'").replace('\r', '\\r').replace('\n', '\\n')
            print(f"{key}='{value}'")
    except Exception as error:
        # Exception contents from AWS/JSON can contain secret data; never print them.
        print('Production offline signing configuration failed validation; no replacement keys were generated.', file=sys.stderr)
        sys.exit(1)
