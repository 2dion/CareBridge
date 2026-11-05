import { afterEach, describe, expect, it, vi } from "vitest";

import { koreanVoice, speakKorean } from "./speech";

const voice = (name: string, lang = "ko-KR", isDefault = false) => ({
  name,
  lang,
  default: isDefault,
});

afterEach(() => vi.unstubAllGlobals());

describe("한국어 듣기 목소리", () => {
  it("다른 언어의 Natural 대신 한국어 목소리를 고른다", () => {
    const korean = voice("기본 한국어");
    expect(koreanVoice([voice("Natural", "en-US"), korean])).toBe(korean);
    expect(koreanVoice([voice("Natural", "kok-IN")])).toBeUndefined();
  });

  it("한국어 Natural·Neural, Google, Yuna, 기본 목소리 순서로 고른다", () => {
    const voices = [
      voice("기본", "ko-KR", true),
      voice("Yuna"),
      voice("Google 한국어"),
      voice("Natural"),
    ];
    expect(koreanVoice(voices)?.name).toBe("Natural");
    expect(koreanVoice(voices.slice(0, 3))?.name).toBe("Google 한국어");
    expect(koreanVoice(voices.slice(0, 2))?.name).toBe("Yuna");
    expect(koreanVoice([voice("Neural", "KO_kr")])?.name).toBe("Neural");
  });

  it("한국어 목소리가 없으면 voice를 지정하지 않고 읽는다", () => {
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        constructor(readonly text: string) {}
      },
    );
    const cancel = vi.fn();
    const speak = vi.fn();
    const getVoices = vi
      .fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([voice("Yuna")]);
    const synth = { cancel, speak, getVoices } as unknown as SpeechSynthesis;
    speakKorean("식사를 드셨어요.", synth);
    expect(speak.mock.calls[0][0]).toMatchObject({
      text: "식사를 드셨어요.",
      lang: "ko-KR",
      rate: 0.9,
    });
    expect(speak.mock.calls[0][0].voice).toBeUndefined();
    // 늦게 준비된 목록은 다음 클릭에서 사용한다.
    speakKorean("다음 문장", synth);
    expect(speak.mock.calls[1][0].voice.name).toBe("Yuna");
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
