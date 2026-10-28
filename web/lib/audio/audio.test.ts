import { describe, expect, it } from "vitest";

import { buildStoragePath, parseAudioInput, parseUploadInput, pathBelongsTo } from "./audio";

const org = "11111111-1111-1111-1111-111111111111";
const rec = "22222222-2222-2222-2222-222222222222";
const uuid = "33333333-3333-3333-3333-333333333333";

describe("parseUploadInput", () => {
  it("기록 전체·항목 보태기와 형식 2개를 받음", () => {
    expect(parseUploadInput({ target: "record", mime_type: "audio/webm" })).toEqual({
      ok: true,
      target: { target: "record", item_key: null },
      mime: "audio/webm",
    });
    expect(
      parseUploadInput({ target: "item", item_key: "meal", mime_type: "audio/mp4" }),
    ).toMatchObject({ ok: true, target: { target: "item", item_key: "meal" } });
  });

  it("형식이 다르면 415", () => {
    expect(parseUploadInput({ target: "record", mime_type: "audio/wav" })).toEqual({
      ok: false,
      status: 415,
      error: "unsupported_media_type",
    });
  });

  it("항목 보태기에 item_key가 없거나 틀리면, 도우미 음성이면 400", () => {
    for (const body of [
      { target: "item", mime_type: "audio/webm" },
      { target: "item", item_key: "mood", mime_type: "audio/webm" },
      { target: "helper", mime_type: "audio/webm" },
      null,
    ]) {
      expect(parseUploadInput(body)).toMatchObject({ ok: false, status: 400 });
    }
  });
});

describe("저장 경로", () => {
  it("서버가 {org}/{record}/{uuid}.{확장자}로 정함", () => {
    expect(buildStoragePath(org, rec, uuid, "audio/mp4")).toBe(`${org}/${rec}/${uuid}.mp4`);
  });

  it("이 기록의 경로만 받음", () => {
    const path = buildStoragePath(org, rec, uuid, "audio/webm");
    expect(pathBelongsTo(path, org, rec)).toBe(true);
    expect(pathBelongsTo(path, org, uuid)).toBe(false);
    expect(pathBelongsTo(`${org}/${rec}/../x.webm`, org, rec)).toBe(false);
  });

  it("audio 입력은 storage_path와 target", () => {
    expect(parseAudioInput({ storage_path: "a", target: "record" })).toMatchObject({ ok: true });
    expect(parseAudioInput({ target: "record" })).toEqual({ ok: false });
  });
});
