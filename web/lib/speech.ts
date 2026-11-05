/** 한국어 듣기 목소리 선택(#153). 기기에 있는 한국어 목소리만 후보로 쓴다. */
export function koreanVoice<T extends Pick<SpeechSynthesisVoice, "lang" | "name" | "default">>(
  voices: readonly T[],
): T | undefined {
  const score = (voice: T) =>
    (/natural|neural/i.test(voice.name) ? 40 : 0) +
    (/google/i.test(voice.name) ? 20 : 0) +
    (/yuna|유나/i.test(voice.name) ? 10 : 0) +
    (voice.default ? 1 : 0);
  return voices
    .filter((voice) => /^ko(?:[-_]|$)/i.test(voice.lang))
    .sort((a, b) => score(b) - score(a))[0];
}

/** 목록은 클릭할 때마다 읽는다. 늦게 준비되는 목소리도 다음 클릭부터 쓸 수 있다. */
export function speakKorean(text: string, synth: SpeechSynthesis) {
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 0.9;
  const voice = koreanVoice(synth.getVoices());
  // 한국어 목소리가 없거나 아직 준비되지 않았으면 브라우저 기본값에 맡긴다.
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}
