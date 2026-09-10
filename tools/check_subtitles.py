#!/usr/bin/env python3
"""Installed synthetic capture→reader without Hub, then real optional WS receipt.

Requires PYTHONPATH pointing at TAP Core. Does not access YouTube or alter routing.
"""
import argparse
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import uuid
from tap_core.runtime import Profile
from tap_core.pack_store import PackStore, build_artifact
from tap_core.capture import Writer
from tap_core.readers import Reader
from tap_core.components import prepare, needs_hub
import tap_core

ROOT=Path(__file__).resolve().parents[1]
CORE=Path(tap_core.__file__).resolve().parent.parent

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bun',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    report={'scope':'installed artifacts, synthetic capture record, real reader subprocess and Hub WS; no public YouTube or launchd', 'scenario_passed':False}
    with tempfile.TemporaryDirectory(prefix='tap-youtube-subtitles-') as directory:
        root=Path(directory)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        profile=Profile(root/'profile','/fixture/backend',port+1,'explicit','https://www.youtube.com',[],
            bridge={'version':1,'enabled':False,'hub_port':port,'allow_origins':[],'exclude_origins':[],'page_scripts':[]},
            components={'version':1,'python':sys.executable,'bun':'','readers':{},'handlers':{}})
        profile.save(); store=PackStore(profile.root)
        artifacts={}
        for source in (ROOT,ROOT/'packs/subtitles',ROOT/'packs/subtitle-status'):
            manifest=json.loads((source/'pack.json').read_text()); pack_id=manifest['id']
            artifact=root/(pack_id+'.tap-pack');build_artifact(source,artifact)
            artifacts[pack_id]=hashlib.sha256(artifact.read_bytes()).hexdigest()
            store.install(artifact)
            if pack_id == 'youtube.subtitles':
                store.enable(pack_id,manifest['version'],origins=manifest['access']['origins'],capabilities=manifest['access']['capabilities'])
        components=prepare(profile)
        assert not needs_hub(components), 'reader/page must not require Hub'
        video='dQw4w9WgXcQ';body='<transcript><text>Installed fixture</text></transcript>'
        seed=json.loads((CORE/'fixtures/capture/v1.jsonl').read_text().splitlines()[0])
        seed.update(record_id=str(uuid.uuid4()),url='https://www.youtube.com/api/timedtext?v='+video+'&lang=en',status=200,body=body,body_kept=True,body_reason='retained',streamed=False,size=len(body))
        writer=Writer(profile.root/'data',profile.root/'state');writer.submit(seed);writer.close()
        reader=Reader(profile,'youtube.subtitles');spec=components['readers']['youtube.subtitles']
        reader.run(spec)
        path=profile.root/'data/readers/youtube.subtitles'/video/'subtitles.json'
        assert json.loads(path.read_text())['raw']==body
        before=path.read_bytes();reader.run(spec);assert path.read_bytes()==before
        report.update(reader_without_hub=True,checkpoint_resume=True,artifact_sha256=artifacts)
        profile.components['bun']=str(args.bun.resolve());profile.bridge['enabled']=True;profile.save()
        store.enable('example.youtube-copy-links',json.loads((ROOT/'pack.json').read_text())['version'],origins=['https://www.youtube.com','https://youtube.com'],capabilities=['page.inject'])
        store.enable('youtube.subtitle-status','0.1.0',origins=['https://www.youtube.com','https://youtube.com'],capabilities=['bridge.handle'])
        prepare(profile)
        result=subprocess.run([str(args.bun),str(ROOT/'tests/subtitle_ws.mjs'),str(profile.root),str(CORE/'tap_core/hub.mjs'),hashlib.sha256(body.encode()).hexdigest()],capture_output=True,text=True,timeout=20)
        assert result.returncode==0,result.stdout+result.stderr
        report['ws']=json.loads(result.stdout)
        report['pack_commit']=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip()
        report['core_commit']=subprocess.check_output(['git','-C',str(CORE),'rev-parse','HEAD'],text=True).strip()
        report['scenario_passed']=True
    report['temporary_profile_removed']=not root.exists()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__=='__main__': main()
