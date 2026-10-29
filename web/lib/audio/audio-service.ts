import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addItemSystemPrompt,
  addItemUserMessage,
  checkAddedItem,
  parseAddedItem,
} from "@/lib/agent/added-item";
import { buildValidateContext, runAgentForRecord } from "@/lib/agent/agent-run";
import { readRecordItems, saveAddedItem } from "@/lib/agent/draft-repository";
import type { ItemKey } from "@/lib/agent/validate-draft";
import { getClaudeClient } from "@/lib/ai/claude";
import { getAiMode, getAiModels } from "@/lib/config";
import type { ApiResult } from "@/lib/records/transition";
import { transcribeAudio } from "@/lib/stt/transcribe";

import {
  AUDIO_BUCKET,
  buildStoragePath,
  parseAudioInput,
  parseUploadInput,
  pathBelongsTo,
} from "./audio";

// 녹음 처리. 업로드 주소·파일 읽기·지우기·원문 저장은 작성자 권한(Storage RLS),
// audio_jobs 상태·경로 바꾸기는 서버(service_role)만 한다(결정 2026-10-27-권한정리 5번).

type WorkerRecord = {
  id: string;
  org_id: string;
  worker_id: string;
  status: string;
  form_type: string;
  transcript: string;
  visit_start: string | null;
  visit_end: string | null;
};

const fail = (status: number, error: string): ApiResult => ({ status, body: { error } });

async function loadWorkerRecord(
  userClient: SupabaseClient,
  recordId: string,
): Promise<{ ok: true; userId: string; record: WorkerRecord } | { ok: false; result: ApiResult }> {
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return { ok: false, result: fail(401, "not_signed_in") };
  const { data } = await userClient
    .from("records")
    .select("id, org_id, worker_id, status, form_type, transcript, visit_start, visit_end")
    .eq("id", recordId)
    .maybeSingle();
  const record = data as WorkerRecord | null;
  if (!record) return { ok: false, result: fail(404, "record_not_found") };
  if (record.worker_id !== auth.user.id)
    return { ok: false, result: fail(403, "not_record_worker") };
  if (record.status !== "draft" && record.status !== "returned") {
    return { ok: false, result: fail(409, "invalid_transition") };
  }
  return { ok: true, userId: auth.user.id, record };
}

// POST /api/records/:id/audio/upload-url
export async function createUploadUrl(
  userClient: SupabaseClient,
  recordId: string,
  body: unknown,
): Promise<ApiResult> {
  const input = parseUploadInput(body);
  if (!input.ok) return fail(input.status, input.error);
  const loaded = await loadWorkerRecord(userClient, recordId);
  if (!loaded.ok) return loaded.result;

  const path = buildStoragePath(loaded.record.org_id, recordId, randomUUID(), input.mime);
  // 1회용 업로드 주소(2시간, 같은 경로에 한 번만). Storage RLS가 작성자·상태를 한 번 더 막는다
  const { data, error } = await userClient.storage.from(AUDIO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail(500, "upload_url_failed");
  return {
    status: 200,
    body: { upload_url: data.signedUrl, token: data.token, storage_path: data.path },
  };
}

// POST /api/records/:id/audio
// 같은 요청 안에서 받아쓰기를 하고 파일을 지운다. 기록 전체(record)면 원문을 저장한 뒤 Agent를 뒤에서 돌린다.
export async function receiveAudio(
  userClient: SupabaseClient,
  serverClient: SupabaseClient,
  recordId: string,
  body: unknown,
  runAfterResponse: (task: () => Promise<void>) => void,
): Promise<ApiResult> {
  const input = parseAudioInput(body);
  if (!input.ok) return fail(400, "invalid_input");
  const loaded = await loadWorkerRecord(userClient, recordId);
  if (!loaded.ok) return loaded.result;
  const { record, userId } = loaded;
  if (!pathBelongsTo(input.storagePath, record.org_id, recordId)) {
    return fail(403, "invalid_storage_path");
  }

  const removeFile = async () => {
    await userClient.storage.from(AUDIO_BUCKET).remove([input.storagePath]);
  };
  // 키가 없으면 받아쓰기를 하지 않는다. 올라온 파일은 바로 지운다
  if (getAiMode() === "mock") {
    await removeFile();
    return fail(503, "ai_not_configured");
  }

  // 같은 음성을 두 번 보내지 않음(storage_path unique)
  const { data: job, error: jobError } = await userClient
    .from("audio_jobs")
    .insert({
      record_id: recordId,
      target: input.target.target,
      item_key: input.target.item_key,
      storage_path: input.storagePath,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return jobError?.code === "23505" ? fail(409, "duplicate_audio") : fail(500, "job_failed");
  }
  const setJob = async (fields: Record<string, unknown>) => {
    await serverClient.from("audio_jobs").update(fields).eq("id", job.id);
  };

  let transcript: string;
  try {
    await setJob({ status: "transcribing" });
    const { data: audio, error } = await userClient.storage
      .from(AUDIO_BUCKET)
      .download(input.storagePath);
    if (error || !audio) throw new Error(`녹음 파일 읽기 실패: ${error?.message ?? ""}`);
    transcript = await transcribeAudio(audio, input.storagePath.split("/").pop() ?? "audio");
  } catch (error) {
    await setJob({ status: "failed", error: errorText(error) });
    return { status: 502, body: { id: job.id, status: "failed", error: "stt_failed" } };
  } finally {
    // 받아쓰기가 성공하든 실패하든 파일을 지우고 경로를 비운다(녹음업로드 결정 4번)
    await removeFile().catch(() => {});
    await setJob({ storage_path: null });
  }
  if (!transcript) {
    await setJob({ status: "failed", error: "empty_transcript" });
    return { status: 422, body: { id: job.id, status: "failed", error: "empty_transcript" } };
  }

  if (input.target.target === "item") {
    try {
      const item = await rewriteItem(
        userClient,
        serverClient,
        record,
        userId,
        input.target.item_key,
        transcript,
      );
      await setJob({ status: "done" });
      return { status: 200, body: { id: job.id, status: "done", item } };
    } catch (error) {
      await setJob({ status: "failed", error: errorText(error) });
      return { status: 502, body: { id: job.id, status: "failed", error: "fill_failed" } };
    }
  }

  // 기록 전체: 원문을 저장하고, Agent는 응답 뒤에 돌린다(작성자는 W3에서 '정리 중'을 봄)
  const { error: saveError } = await userClient
    .from("records")
    .update({ transcript })
    .eq("id", recordId)
    .select("id");
  if (saveError) {
    await setJob({ status: "failed", error: saveError.message });
    return { status: 409, body: { id: job.id, status: "failed", error: saveError.message } };
  }
  await setJob({ status: "filling" });
  runAfterResponse(async () => {
    try {
      await runAgentForRecord(userClient, serverClient, recordId);
      await setJob({ status: "done" });
    } catch (error) {
      await setJob({ status: "failed", error: errorText(error) });
    }
  });
  return { status: 202, body: { id: job.id, status: "filling", transcript } };
}

// POST /api/records/:id/items/:key { text }
// W3 [수정 내용 적용]: 작성자가 글로 쓴 고칠 내용도 음성 보태기와 같은 길(③)로 그 항목만 다시 쓴다.
// 한국어·베트남어 어느 쪽으로 써도 value_ko는 한국어 기록체, value_native는 모국어가 되고,
// status·reason도 새 내용으로 다시 정한다(이슈 #118).
export async function addItemByText(
  userClient: SupabaseClient,
  serverClient: SupabaseClient,
  recordId: string,
  itemKey: ItemKey,
  body: unknown,
): Promise<ApiResult> {
  const text =
    body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";
  if (!text || text.length > 1000) return fail(400, "invalid_input");
  const loaded = await loadWorkerRecord(userClient, recordId);
  if (!loaded.ok) return loaded.result;
  if (getAiMode() === "mock") return fail(503, "ai_not_configured");
  try {
    const item = await rewriteItem(
      userClient,
      serverClient,
      loaded.record,
      loaded.userId,
      itemKey,
      text,
    );
    return { status: 200, body: { status: "done", item } };
  } catch (error) {
    const message = errorText(error);
    if (message === "invalid_item") return fail(400, "invalid_item");
    if (message.includes("stale_item")) return fail(409, "stale_item");
    return fail(502, "fill_failed");
  }
}

// ③ 항목 보태기: Claude 한 번 호출(중간 등급), 형식이 틀리면 한 번 더. 저장은 save_ai_item(item)
// 작성자가 음성(받아쓴 글)이나 글로 새로 말한 내용(utterance)으로 그 항목만 다시 쓴다.
async function rewriteItem(
  userClient: SupabaseClient,
  serverClient: SupabaseClient,
  record: WorkerRecord,
  userId: string,
  itemKey: ItemKey,
  utterance: string,
) {
  const items = await readRecordItems(userClient, record.id);
  const current = items.find((item) => item.item_key === itemKey);
  if (!current) throw new Error("invalid_item");
  const context = await buildValidateContext(
    userClient,
    serverClient,
    record,
    userId,
    record.transcript ?? "",
  );
  const claude = getClaudeClient();
  const plain = items.map(
    ({ item_key, value_ko, value_native, status, evidence, reason, reason_native, detail }) => ({
      item_key,
      value_ko,
      value_native,
      status,
      evidence,
      reason,
      reason_native,
      detail,
    }),
  );
  const { data: saved } = await userClient
    .from("records")
    .select("form_fields")
    .eq("id", record.id)
    .single();

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await claude.messages.create(
      {
        model: getAiModels().main,
        max_tokens: 2000,
        system: addItemSystemPrompt(itemKey, context.nativeLang ?? "vi"),
        messages: [
          {
            role: "user",
            content: addItemUserMessage(
              plain.find((i) => i.item_key === itemKey)!,
              utterance,
            ),
          },
        ],
      },
      { timeout: 60_000, maxRetries: 1 },
    );
    const raw = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = parseAddedItem(raw, itemKey);
    const checked =
      parsed && checkAddedItem(parsed, plain, context, utterance, saved?.form_fields ?? {});
    if (checked) return saveAddedItem(serverClient, record.id, userId, current.value_ko, checked);
  }
  throw new Error("invalid_item_json");
}

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
