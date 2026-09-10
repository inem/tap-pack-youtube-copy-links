"""Retained YouTube HTTP bodies → profile-owned per-video files; no network."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import parse_qs, urlsplit

VIDEO = re.compile(r'[A-Za-z0-9_-]{11}')
ORIGINS = {'www.youtube.com', 'youtube.com'}
MAX_BYTES = 4 * 1024 * 1024


def save(directory, name, value):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=directory,
                                     delete=False) as target:
        temporary = Path(target.name)
        try:
            json.dump(value, target, ensure_ascii=False, allow_nan=False)
            target.flush()
            os.replace(temporary, directory / name)
        finally:
            temporary.unlink(missing_ok=True)


def consume(record, output):
    version = record.get('record_version', 0)
    if type(version) is not int or version not in (0, 1):
        raise ValueError('Unsupported capture record version')
    url = urlsplit(record.get('url', ''))
    if (url.scheme != 'https' or url.netloc not in ORIGINS or record.get('status') != 200
            or url.path not in ('/youtubei/v1/player', '/api/timedtext')):
        return None
    raw = record.get('body')
    if (not isinstance(raw, str) or not raw.strip() or record.get('streamed') is True
            or record.get('body_kept') is False or len(raw.encode('utf-8')) > MAX_BYTES):
        return None
    if url.path == '/youtubei/v1/player':
        try:
            player = json.loads(raw)
        except ValueError:
            return None
        details = player.get('videoDetails') if isinstance(player, dict) else None
        if not isinstance(details, dict):
            return None
        video = details.get('videoId')
        value = {key: details[key] for key in ('videoId', 'title', 'author', 'channelId', 'lengthSeconds') if key in details}
        name = 'details.json'
    else:
        query = parse_qs(url.query)
        ids = query.get('v', [])
        video = ids[0] if len(ids) == 1 else None
        value = {'contract': 'youtube.subtitles/v1', 'videoId': video,
                 'lang': query.get('lang', [None])[0], 'fmt': query.get('fmt', [None])[0],
                 'raw': raw, 'sha256': hashlib.sha256(raw.encode('utf-8')).hexdigest()}
        name = 'subtitles.json'
    if not isinstance(video, str) or not VIDEO.fullmatch(video):
        return None
    directory = Path(output) / video
    if directory.is_symlink():
        raise ValueError('Video directory must not be a symlink')
    save(directory, name, value)
    return {'videoId': video, 'file': name}


def main():
    context = json.loads(os.environ['TAP_PACK_CONTEXT'])
    for line in sys.stdin:
        result = consume(json.loads(line), context['output_dir'])
        if result:
            print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
