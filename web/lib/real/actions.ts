// 실제 모드의 화면 동작: 서버 API(공통 계약 10개)와 Supabase(RLS) 직접 쓰기. 끝나면 화면이 다시 읽는다(reload).
// AI 결과는 서버가 만들고, 화면은 가짜 결과를 만들지 않는다.
// 근거: 문서/설계/데이터구조-v1.6.3.md '공통 계약', 문서/결정/2026-10-21-녹음업로드.md, 2026-10-27-녹음임시보관.md
import type { SupabaseClient } from "@supabase/supabase-js";

import type { HelperAnswer } from "../demo/helper";
import type { ResidentEdit } from "../demo/review";
import type { ItemKey } from "../demo/state";
import type { FontSize, NoCareReason } from "../demo/store";
import { FONT_VALUE } from "./map";

export type ActionError = {
  ok: false;
  error: string;
  ko: string;
  vi: string;
  /** unconfirmed_items·unresolved_needs_check일 때 남은 항목 */
  items?: ItemKey[];
};

const MESSAGES: Record<string, { ko: string; vi: string }> = {
  ai_not_configured: {
    ko: "AI 기능이 아직 켜지지 않았어요. 담당자에게 알려 주세요.",
    vi: "Tính năng AI chưa được bật. Hãy báo người phụ trách.",
  },
  unconfirmed_items: {
    ko: "아직 확인하지 않은 항목이 있어요.",
    vi: "Vẫn còn mục chưa kiểm tra.",
  },
  unresolved_needs_check: {
    ko: "정하지 않은 ‘확인 필요’ 항목이 남아 있어요.",
    vi: "Vẫn còn mục cần kiểm tra chưa được quyết định.",
  },
  return_reason_required: { ko: "되돌리는 이유를 써 주세요.", vi: "Hãy viết lý do trả lại." },
  note_required: { ko: "사유를 써 주세요.", vi: "Hãy viết lý do." },
  invalid_transition: {
    ko: "지금 상태에서는 할 수 없어요. 화면을 새로 고쳐 주세요.",
    vi: "Không thể thực hiện ở trạng thái này. Hãy tải lại trang.",
  },
  record_locked: { ko: "승인된 기록은 고칠 수 없어요.", vi: "Không thể sửa bản ghi đã duyệt." },
  not_signed_in: { ko: "다시 로그인해 주세요.", vi: "Hãy đăng nhập lại." },
  stt_failed: {
    ko: "음성을 글자로 바꾸지 못했어요. 다시 보내거나 글로 써 주세요.",
    vi: "Không chuyển được giọng nói thành văn bản. Hãy gửi lại hoặc viết trực tiếp.",
  },
  empty_transcript: {
    ko: "녹음에서 말을 찾지 못했어요. 다시 녹음해 주세요.",
    vi: "Không nghe thấy lời nói trong bản ghi âm. Hãy ghi âm lại.",
  },
  agent_failed: {
    ko: "초안을 만들지 못했어요. 다시 시도하거나 글로 써 주세요.",
    vi: "Không tạo được bản nháp. Hãy thử lại hoặc viết trực tiếp.",
  },
};
const NETWORK = {
  ko: "인터넷 연결을 확인하고 다시 시도해 주세요.",
  vi: "Hãy kiểm tra kết nối mạng rồi thử lại.",
};

export function actionError(error: string, items?: ItemKey[]): ActionError {
  const message = MESSAGES[error] ?? {
    ko: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    vi: "Không xử lý được. Hãy thử lại sau.",
  };
  return { ok: false, error, ...message, ...(items ? { items } : {}) };
}

/** 서버 API 부르기. 실패하면 응답의 error 키로 안내 문구를 고른다 */
export async function callApi<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; data: T } | ActionError> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "POST",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, error: "network", ...NETWORK };
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof data.error === "string" ? data.error : `http_${response.status}`;
    return actionError(error, Array.isArray(data.items) ? (data.items as ItemKey[]) : undefined);
  }
  return { ok: true, data: data as T };
}

const dbError = (error: { message: string } | null): ActionError | null =>
  error ? actionError(error.message) : null;

/** MediaRecorder 형식(audio/webm;codecs=opus 등)을 서버가 받는 두 형식으로 맞춘다 */
export function audioMime(type: string): "audio/webm" | "audio/mp4" | null {
  if (type.startsWith("audio/webm")) return "audio/webm";
  if (type.startsWith("audio/mp4") || type.startsWith("audio/m4a")) return "audio/mp4";
  return null;
}

export function createRealActions(supabase: SupabaseClient, reload: () => Promise<void>) {
  const after = async <T extends { ok: boolean }>(result: T) => {
    await reload();
    return result;
  };

  /** 업로드 주소 받기 → Storage에 바로 올리기 → /audio. 녹음은 메모리에만 있다 */
  async function sendAudio(
    recordId: string,
    blob: Blob,
    target: { target: "record" } | { target: "item"; item_key: ItemKey },
  ) {
    const mime = audioMime(blob.type);
    if (!mime) return actionError("unsupported_media_type");
    const url = await callApi<{ token: string; storage_path: string }>(
      `/api/records/${recordId}/audio/upload-url`,
      { body: { ...target, mime_type: mime } },
    );
    if (!url.ok) return url;
    const { error } = await supabase.storage
      .from("audio")
      .uploadToSignedUrl(url.data.storage_path, url.data.token, blob, { contentType: mime });
    if (error) return { ok: false as const, error: "upload_failed", ...NETWORK };
    return callApi<{ id: string; status: string }>(`/api/records/${recordId}/audio`, {
      body: { ...target, storage_path: url.data.storage_path },
    });
  }

  return {
    /** 기록 만들기: records에 바로 넣는다(작성자, 내 담당 어르신, draft) */
    async createRecord(residentId: string, careDate: string) {
      const { data, error } = await supabase
        .from("records")
        .insert({ resident_id: residentId, care_date: careDate })
        .select("id")
        .single();
      if (error || !data) return after(actionError(error?.message ?? "create_failed"));
      return after({ ok: true as const, data: { id: data.id as string } });
    },
    /** W2: 기록 전체 녹음. 서버가 받아쓴 뒤 Agent를 뒤에서 돌린다(202 filling) */
    async sendVoice(recordId: string, blob: Blob) {
      return after(await sendAudio(recordId, blob, { target: "record" }));
    },
    /** W3 항목 보태기 녹음: 그 항목만 다시 쓴다 */
    async sendItemVoice(recordId: string, key: ItemKey, blob: Blob) {
      return after(await sendAudio(recordId, blob, { target: "item", item_key: key }));
    },
    /** [글로 쓰기]: 쓴 글을 원문으로 저장하고 Agent를 돌린다 */
    async writeText(recordId: string, text: string) {
      return after(await callApi(`/api/records/${recordId}/agent-run`, { body: { text } }));
    },
    /** [다시 시도]: 저장된 원문으로 Agent를 다시 돌린다 */
    async retryDraft(recordId: string) {
      return after(await callApi(`/api/records/${recordId}/agent-run`, { body: {} }));
    },
    async patchItem(recordId: string, key: ItemKey, patch: Record<string, unknown>) {
      return after(
        await callApi(`/api/records/${recordId}/items/${key}`, { method: "PATCH", body: patch }),
      );
    },
    /** 재가 방문 시작·종료는 records.visit_start·visit_end에 둔다(작성자가 씀) */
    async setVisitTime(recordId: string, start: string, end: string) {
      const { error } = await supabase
        .from("records")
        .update({ visit_start: start || null, visit_end: end || null })
        .eq("id", recordId);
      return dbError(error) ?? { ok: true as const };
    },
    async setFormFields(recordId: string, formFields: Record<string, unknown>) {
      const { error } = await supabase
        .from("records")
        .update({ form_fields: formFields })
        .eq("id", recordId);
      return after(dbError(error) ?? { ok: true as const });
    },
    async submit(recordId: string) {
      return after(await callApi(`/api/records/${recordId}/submit`));
    },
    async approve(recordId: string) {
      return after(await callApi(`/api/records/${recordId}/approve`));
    },
    /** reason은 '[식사, 복약 관찰] 사유'처럼 항목 이름을 앞에 붙인 한국어 문자열 */
    async returnRecord(recordId: string, reason: string) {
      return after(await callApi(`/api/records/${recordId}/return`, { body: { reason } }));
    },
    async addNoCare(day: {
      residentId: string;
      careDate: string;
      reason: NoCareReason;
      note: string;
    }) {
      const { error } = await supabase.from("no_care_days").insert({
        resident_id: day.residentId,
        care_date: day.careDate,
        reason: day.reason,
        note: day.note,
      });
      return after(dbError(error) ?? { ok: true as const });
    },
    async removeNoCare(residentId: string, careDate: string) {
      const { error } = await supabase
        .from("no_care_days")
        .delete()
        .eq("resident_id", residentId)
        .eq("care_date", careDate);
      return after(dbError(error) ?? { ok: true as const });
    },
    /** R4: 담당 연결의 방문 요일·담당 시작일(담당자, RLS). 방문 시간은 DB 칸이 없어 저장하지 않는다 */
    async updateResident(residentId: string, edit: ResidentEdit) {
      const { error } = await supabase
        .from("assignments")
        .update({ visit_days: edit.visitDays, start_date: edit.startDate })
        .eq("resident_id", residentId);
      return after(dbError(error) ?? { ok: true as const });
    },
    async addResident(alias: string, careType: "facility" | "home") {
      const { error } = await supabase.from("residents").insert({ alias, care_type: careType });
      return after(dbError(error) ?? { ok: true as const });
    },
    async setProfile(fields: {
      fontSize?: FontSize;
      onboarded?: boolean;
      nativeLang?: "ko" | "vi";
    }) {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return actionError("not_signed_in");
      const { error } = await supabase
        .from("profiles")
        .update({
          ...(fields.fontSize ? { font_size: FONT_VALUE[fields.fontSize] } : {}),
          ...(fields.onboarded !== undefined ? { onboarded: fields.onboarded } : {}),
          ...(fields.nativeLang ? { native_lang: fields.nativeLang } : {}),
        })
        .eq("id", auth.user.id);
      return after(dbError(error) ?? { ok: true as const });
    },
    /** W6 도우미. 답은 저장하지 않는다 */
    async askHelper(question: string) {
      return callApi<HelperAnswer>("/api/helper/ask", { body: { question } });
    },
    /** R2 'AI 작업 기록'(담당자는 같은 기관 agent_steps 읽기) */
    async agentSteps(recordId: string) {
      const { data } = await supabase
        .from("agent_steps")
        .select("step_no, tool, input_summary, result_summary, reason, duration_ms, tokens")
        .eq("record_id", recordId)
        .order("step_no");
      return (data ?? []) as {
        step_no: number;
        tool: string;
        input_summary: string;
        result_summary: string;
        reason: string;
        duration_ms: number | null;
        tokens: number | null;
      }[];
    },
  };
}

export type RealActions = ReturnType<typeof createRealActions>;
