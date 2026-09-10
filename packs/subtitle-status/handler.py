"""Read-only confirmation of saved subtitle text in this TAP profile."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys


def result(context, request):
    args = request.get('args')
    if request.get('version') != 1 or not isinstance(args, dict):
        return {'ok': False, 'error': {'code': 'bad_request'}}
    video, digest = args.get('videoId'), args.get('sha256')
    if (not isinstance(video, str) or not re.fullmatch(r'[A-Za-z0-9_-]{11}', video)
            or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest)):
        return {'ok': False, 'error': {'code': 'bad_request'}}
    root = Path(context['profile_root']).resolve()
    path = root / 'data/readers/youtube.subtitles' / video / 'subtitles.json'
    if path.resolve() != path or not path.is_file():
        return {'ok': True, 'value': {'saved': False, 'videoId': video, 'reason': 'not_saved'}}
    # Read one bounded atomic snapshot. Do not expose text or local paths to the page.
    with path.open('rb') as source:
        body = source.read(24 * 1024 * 1024 + 1)
    try:
        if len(body) > 24 * 1024 * 1024:
            raise ValueError('oversize')
        value = json.loads(body)
        raw = value['raw']
        matches = (value['contract'] == 'youtube.subtitles/v1' and value['videoId'] == video
                   and isinstance(raw, str) and bool(raw.strip())
                   and value['sha256'] == digest
                   and hashlib.sha256(raw.encode('utf-8')).hexdigest() == digest)
    except (ValueError, KeyError, TypeError):
        matches = False
    return {'ok': True, 'value': {'saved': matches, 'videoId': video,
                                'sha256': digest if matches else None}}


if __name__ == '__main__':
    context = json.loads(os.environ['TAP_PACK_CONTEXT'])
    print(json.dumps(result(context, json.loads(sys.stdin.readline()))))
