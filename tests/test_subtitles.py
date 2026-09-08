import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value
reader = module('reader', 'packs/subtitles/reader.py')
handler = module('handler', 'packs/subtitle-status/handler.py')
VIDEO = 'dQw4w9WgXcQ'

class SubtitlesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.output = self.root / 'data/readers/youtube.subtitles'
        self.body = '<transcript><text>Fixture &amp; text</text></transcript>'
        self.rec = {'url': 'https://www.youtube.com/api/timedtext?v='+VIDEO+'&lang=en',
                    'status': 200, 'body': self.body}
    def receipt(self, raw=None, video=VIDEO):
        digest = hashlib.sha256((self.body if raw is None else raw).encode()).hexdigest()
        return handler.result({'profile_root': str(self.root)},
                              {'version':1,'args':{'videoId':video,'sha256':digest}})
    def test_raw_replay_and_receipt(self):
        for _ in range(2): reader.consume(self.rec, self.output)
        saved = json.loads((self.output / VIDEO / 'subtitles.json').read_text())
        self.assertEqual(saved['raw'], self.body)
        self.assertTrue(self.receipt()['value']['saved'])
        self.assertNotIn('raw', self.receipt()['value'])
        self.assertEqual(len(list((self.output / VIDEO).iterdir())), 1)
    def test_stale_and_tampered_content_not_confirmed(self):
        reader.consume(self.rec, self.output)
        self.assertFalse(self.receipt('new text')['value']['saved'])
        path=self.output / VIDEO / 'subtitles.json'
        saved=json.loads(path.read_text()); saved['raw']='tampered'; path.write_text(json.dumps(saved))
        self.assertFalse(self.receipt()['value']['saved'])
    def test_missing_output(self):
        self.assertFalse(self.receipt()['value']['saved'])
    def test_filtered_records(self):
        for change in ({'url':'https://evil.test/api/timedtext?v='+VIDEO},
                       {'url':'https://www.youtube.com/assets.js'}, {'status':403},
                       {'body':''}, {'body':None}, {'body_kept':False}, {'streamed':True}):
            self.assertIsNone(reader.consume({**self.rec,**change}, self.output))
        self.assertFalse(self.output.exists())
    def test_video_ids(self):
        for video in ('../escaped', 'x', VIDEO+'&v=another_id_'):
            self.assertIsNone(reader.consume({**self.rec,'url':'https://youtube.com/api/timedtext?v='+video},self.output))
        self.assertFalse(self.receipt(video='../escaped')['ok'])
    def test_player_and_subtitles_arrive_independently(self):
        details={'videoId':VIDEO,'title':'Fixture','author':'Author'}
        rec={**self.rec,'url':'https://youtube.com/youtubei/v1/player','body':json.dumps({'videoDetails':details})}
        reader.consume(self.rec,self.output); reader.consume(rec,self.output)
        self.assertEqual(json.loads((self.output/VIDEO/'details.json').read_text()),details)
        self.assertTrue(self.receipt()['value']['saved'])
    def test_omitted_body_does_not_destroy_previous_projection(self):
        reader.consume(self.rec,self.output)
        reader.consume({**self.rec,'record_version':1,'body_kept':False},self.output)
        self.assertTrue(self.receipt()['value']['saved'])
    def test_unknown_version(self):
        with self.assertRaises(ValueError): reader.consume({**self.rec,'record_version':2},self.output)
    def test_handler_does_not_follow_symlink(self):
        reader.consume(self.rec,self.output)
        path=self.output/VIDEO/'subtitles.json'; target=self.root/'elsewhere';path.rename(target);path.symlink_to(target)
        self.assertFalse(self.receipt()['value']['saved'])

if __name__ == '__main__': unittest.main()
