import "server-only";

import { toFile } from "openai";

import { getSttClient, getSttModel } from "./groq";

// ① 받아쓰기(AI 규칙 v1.1.2). 시간 초과·연결 오류는 한 번 다시 한다(서버 검사와 예외 처리 표).
// Mock 모드면 getSttClient가 MockModeError를 던진다. 가짜 받아쓴 글을 만들지 않는다.
export async function transcribeAudio(audio: Blob, fileName: string): Promise<string> {
  const client = getSttClient();
  const file = await toFile(audio, fileName, { type: audio.type });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await client.audio.transcriptions.create({ file, model: getSttModel() });
      return result.text.trim();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("stt_failed");
}
