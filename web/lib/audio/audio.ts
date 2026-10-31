// 녹음 올리기: 1회용 업로드 주소로 Storage에 바로 올리고, 서버에는 storage_path만 보낸다.
// 근거: 문서/결정/2026-10-21-녹음업로드.md, 문서/설계/데이터구조-v1.7.md '공통 계약' upload-url·audio

import { ITEM_KEYS, type ItemKey } from "@/lib/agent/validate-draft";

export const AUDIO_BUCKET = "audio";
export const AUDIO_MIME = { "audio/webm": "webm", "audio/mp4": "mp4" } as const;
export type AudioMime = keyof typeof AUDIO_MIME;

export type AudioTarget =
  { target: "record"; item_key: null } | { target: "item"; item_key: ItemKey };

/** target(record / item)과 item_key를 검사한다. 도우미(helper) 음성은 추후 적용이라 받지 않는다 */
export function parseTarget(body: Record<string, unknown>): AudioTarget | null {
  if (body.target === "record") return { target: "record", item_key: null };
  if (body.target === "item" && ITEM_KEYS.includes(body.item_key as ItemKey)) {
    return { target: "item", item_key: body.item_key as ItemKey };
  }
  return null;
}

export type UploadInput =
  | { ok: true; target: AudioTarget; mime: AudioMime }
  | { ok: false; status: 400 | 415; error: "invalid_input" | "unsupported_media_type" };

export function parseUploadInput(body: unknown): UploadInput {
  if (!body || typeof body !== "object") return { ok: false, status: 400, error: "invalid_input" };
  const input = body as Record<string, unknown>;
  const target = parseTarget(input);
  if (!target) return { ok: false, status: 400, error: "invalid_input" };
  if (!(typeof input.mime_type === "string" && input.mime_type in AUDIO_MIME)) {
    return { ok: false, status: 415, error: "unsupported_media_type" };
  }
  return { ok: true, target, mime: input.mime_type as AudioMime };
}

/** 경로는 서버가 정한다: {org_id}/{record_id}/{uuid}.{webm|mp4} */
export function buildStoragePath(orgId: string, recordId: string, uuid: string, mime: AudioMime) {
  return `${orgId}/${recordId}/${uuid}.${AUDIO_MIME[mime]}`;
}

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webm|mp4)$/;

/** 이 기록의 경로인지 본다(Storage RLS의 can_use_audio_path와 같은 모양) */
export function pathBelongsTo(path: string, orgId: string, recordId: string) {
  return PATH.test(path) && path.startsWith(`${orgId}/${recordId}/`);
}

export type AudioInput = { ok: true; target: AudioTarget; storagePath: string } | { ok: false };

export function parseAudioInput(body: unknown): AudioInput {
  if (!body || typeof body !== "object") return { ok: false };
  const input = body as Record<string, unknown>;
  const target = parseTarget(input);
  if (!target || typeof input.storage_path !== "string") return { ok: false };
  return { ok: true, target, storagePath: input.storage_path };
}
