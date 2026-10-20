// Mock 모드에서 실제 외부 API 클라이언트를 만들려고 할 때 던진다.
// 부르는 쪽은 getAiMode()로 먼저 갈라서 Mock 응답을 쓴다.
export class MockModeError extends Error {
  constructor(service: string) {
    super(`${service}: USE_MOCK_AI가 false가 아니라서 실제 호출을 하지 않습니다.`);
    this.name = "MockModeError";
  }
}

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`환경 변수 ${name}이(가) 없습니다. web/.env.example을 보세요.`);
    this.name = "MissingEnvError";
  }
}
