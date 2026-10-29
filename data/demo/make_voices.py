"""시연 음성(이슈 #157)을 TTS로 만든다. 음성 파일은 저장소에 올리지 않는다(공유 폴더에 둠).

사용: pip install edge-tts  (ffmpeg 필요)
      python3 data/demo/make_voices.py 출력폴더
대본: data/demo/voices.json (문장마다 [언어, 글]). 기대 결과: data/demo/voices.md
목소리: 한국어 ko-KR-SunHiNeural, 베트남어 vi-VN-HoaiMyNeural, 속도 -15%, 문장 사이 1.3초.
끝 문장("오늘 기록은 여기까지입니다.")은 받아쓰기가 끝에 없는 말을 지어내지 않게 넣은 것이다.
"""
import json, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "voices-out").resolve()
OUT.mkdir(parents=True, exist_ok=True)
VOICE = {"ko": "ko-KR-SunHiNeural", "vi": "vi-VN-HoaiMyNeural"}
run = lambda *a: subprocess.run(list(a), check=True, capture_output=True)

sil = OUT / "sil.wav"
run("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "1.3", str(sil))
for name, case in json.loads((HERE / "voices.json").read_text()).items():
    parts = []
    for i, (lang, text) in enumerate(case["segs"]):
        mp3, wav = OUT / f"{name}-{i:02d}.mp3", OUT / f"{name}-{i:02d}.wav"
        run("edge-tts", "--voice", VOICE[lang], "--rate=-15%", "--text", text, "--write-media", str(mp3))
        run("ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-ar", "24000", "-ac", "1", str(wav))
        parts.append(wav)
        mp3.unlink()
    lst = OUT / f"{name}.txt"
    lst.write_text(f"file '{sil}'\n" + "".join(f"file '{p}'\nfile '{sil}'\n" for p in parts[:-1]) + f"file '{parts[-1]}'\n")
    run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c:a", "libmp3lame", "-b:a", "128k", str(OUT / f"{name}.mp3"))
    run("ffmpeg", "-y", "-loglevel", "error", "-i", str(OUT / f"{name}.mp3"), "-c:a", "aac", "-b:a", "96k", str(OUT / f"{name}.m4a"))
    for p in parts:
        p.unlink()
    lst.unlink()
    print(OUT / f"{name}.mp3")
sil.unlink()
