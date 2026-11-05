import { nativeMessage } from "@/lib/i18n/messages";

// 실제 모드의 화면 동작: 서버 API(공통 계약 10개)와 Supabase(RLS) 직접 쓰기. 끝나면 화면이 다시 읽는다(reload).
// AI 결과는 서버가 만들고, 화면은 가짜 결과를 만들지 않는다.
// 근거: 문서/설계/데이터구조-v2.3.4.md '공통 계약', 문서/결정/2026-10-21-녹음업로드.md, 2026-10-27-녹음임시보관.md
import type { NativeLang } from "@/lib/auth/signup";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { HelperAnswer } from "../demo/helper";
import type { ResidentEdit } from "../demo/review";
import type { ItemKey } from "../demo/state";
import type { FontSize, NoCareReason } from "../demo/store";
import { FONT_VALUE } from "./map";

export type HelperConversationsPage = {
  conversations: { id: string; title: string; last_message_at: string; message_count: number }[];
  next_before: string | null;
};

/** GET /api/helper/messages 응답(데이터 구조 v2.1.0 공통 계약). conversation은 대화가 하나도 없으면 null */
export type HelperMessagesPage = {
  conversation: { id: string; title: string } | null;
  messages: Array<{
    id: string;
    question: string;
    answer: HelperAnswer;
    created_at: string;
  }>;
  next_before: string | null;
};

export type ActionError = {
  ok: false;
  error: string;
  ko: string;
  native: string;
  /** unconfirmed_items·unresolved_needs_check일 때 남은 항목 */
  items?: ItemKey[];
};

const MESSAGES: Record<string, { ko: string; native: string }> = {
  // 여기서는 기관을 몰라 reviewer_only처럼 '관리자(강사)'로 함께 쓴다(이슈 #146)
  ai_not_configured: {
    ko: "AI 기능이 아직 켜지지 않았어요. 관리자(강사)에게 알려 주세요.",
    native: nativeMessage("vi", "actions.aiNotConfigured"),
  },
  unconfirmed_items: {
    ko: "확인 전 항목이 있어요.",
    native: nativeMessage("vi", "actions.unconfirmed"),
  },
  unresolved_needs_check: {
    ko: "정하지 않은 ‘확인 필요’ 항목이 남아 있어요.",
    native: nativeMessage("vi", "actions.unresolved"),
  },
  return_reason_required: {
    ko: "되돌리는 이유를 써 주세요.",
    native: nativeMessage("vi", "actions.returnReason"),
  },
  note_required: { ko: "사유를 써 주세요.", native: nativeMessage("vi", "actions.noteRequired") },
  invalid_transition: {
    ko: "지금 상태에서는 할 수 없어요. 화면을 새로 고쳐 주세요.",
    native: nativeMessage("vi", "actions.invalidTransition"),
  },
  has_records: {
    ko: "기록이 있는 어르신은 지울 수 없어요.",
    native: nativeMessage("vi", "actions.hasRecords"),
  },
  record_locked: {
    ko: "승인된 기록은 고칠 수 없어요.",
    native: nativeMessage("vi", "actions.recordLocked"),
  },
  // 권한·날짜 거절(이슈 #114). DB 트리거·API 오류 키와 같은 글자(supabase/README.md, 공통 계약 '응답 코드와 오류 키')
  reviewer_only: {
    ko: "관리자(강사)만 할 수 있어요.",
    native: nativeMessage("vi", "actions.reviewerOnly"),
  },
  not_record_worker: {
    ko: "이 기록을 쓴 사람만 할 수 있어요.",
    native: nativeMessage("vi", "actions.notRecordWorker"),
  },
  org_mismatch: {
    ko: "다른 기관의 어르신이에요. 화면을 새로 고쳐 주세요.",
    native: nativeMessage("vi", "actions.orgMismatch"),
  },
  care_date_out_of_range: {
    ko: "처리할 수 있는 기간이 아닌 날짜예요. 화면을 새로 고쳐 주세요.",
    native: nativeMessage("vi", "actions.dateOutOfRange"),
  },
  record_exists: {
    ko: "이 날은 이미 기록이 있어요. 화면을 새로 고쳐 주세요.",
    native: nativeMessage("vi", "actions.recordExists"),
  },
  no_care_day_exists: {
    ko: "이 날은 ‘기록 없음’으로 정리된 날이에요.",
    native: nativeMessage("vi", "actions.noCareDayExists"),
  },
  duplicate_entry: {
    ko: "이미 처리된 내용이에요. 화면을 새로 고쳐 주세요.",
    native: nativeMessage("vi", "actions.duplicate"),
  },
  not_signed_in: {
    ko: "다시 로그인해 주세요.",
    native: nativeMessage("vi", "actions.notSignedIn"),
  },
  rate_limited: {
    ko: "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.",
    native: nativeMessage("vi", "actions.rateLimited"),
  },
  stt_failed: {
    ko: "음성을 글자로 바꾸지 못했어요. 다시 올리거나 글로 써 주세요.",
    native: nativeMessage("vi", "actions.sttFailed"),
  },
  empty_transcript: {
    ko: "녹음에서 말을 찾지 못했어요. 다시 녹음해 주세요.",
    native: nativeMessage("vi", "actions.emptyTranscript"),
  },
  value_ko_not_korean: {
    ko: "공식 기록 칸에는 한국어로 써 주세요.",
    native: nativeMessage("vi", "actions.koreanRequired"),
  },
  fill_failed: {
    ko: "고칠 내용을 정리하지 못했어요. 다시 시도해 주세요.",
    native: nativeMessage("vi", "actions.fillFailed"),
  },
  stale_item: {
    ko: "그사이 내용이 바뀌었어요. 화면을 새로 고친 뒤 다시 해 주세요.",
    native: nativeMessage("vi", "actions.staleItem"),
  },
  agent_failed: {
    ko: "초안을 만들지 못했어요. 다시 시도하거나 글로 써 주세요.",
    native: nativeMessage("vi", "actions.agentFailed"),
  },
};
const NETWORK = {
  ko: "인터넷 연결을 확인하고 다시 시도해 주세요.",
  native: nativeMessage("vi", "actions.network"),
};

export function actionError(error: string, items?: ItemKey[]): ActionError {
  const message = MESSAGES[error] ?? {
    ko: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    native: nativeMessage("vi", "actions.failed"),
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

// DB가 돌려준 오류: 트리거는 message에 오류 키를 담고, 같은 행이 이미 있으면(unique) code 23505다
const dbError = (error: { message: string; code?: string } | null): ActionError | null =>
  error ? actionError(error.code === "23505" ? "duplicate_entry" : error.message) : null;

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
      if (error || !data) return after(dbError(error) ?? actionError("create_failed"));
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
    /** W3 [수정 내용 적용]: 글로 쓴 고칠 내용으로 그 항목만 AI가 다시 쓴다(음성 보태기와 같은 길) */
    async rewriteItemText(recordId: string, key: ItemKey, text: string) {
      return after(await callApi(`/api/records/${recordId}/items/${key}`, { body: { text } }));
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
    /** M4 [수정](관리자, RLS). 어르신 정보(실명·급여 종류)는 바뀐 때만 residents를 고치고,
     *  담당 연결은 작성자마다 한 줄(assignments unique(worker_id, resident_id))이라 고른 작성자만 남기고
     *  빠진 작성자 줄은 지우고 새 작성자 줄은 넣는다(이슈 #95). 표시용 방문 시간은 schedule 칸(이슈 #96).
     *  바뀐 줄이 없으면 changed: false */
    async updateResident(residentId: string, edit: ResidentEdit) {
      let changed = false;
      if (edit.name !== undefined || edit.careType !== undefined) {
        const { error } = await supabase
          .from("residents")
          .update({
            ...(edit.name !== undefined ? { name: edit.name.trim() } : {}),
            ...(edit.careType !== undefined ? { care_type: edit.careType } : {}),
          })
          .eq("id", residentId);
        if (error) return after(dbError(error) as ActionError);
        changed = true;
      }
      const { data, error: readError } = await supabase
        .from("assignments")
        .select("worker_id, visit_days, start_date, schedule")
        .eq("resident_id", residentId);
      if (readError) return after(dbError(readError) as ActionError);
      const rows = (data ?? []) as {
        worker_id: string;
        visit_days: number[] | null;
        start_date: string;
        schedule: string;
      }[];
      const wanted = edit.workerIds ?? rows.map((row) => row.worker_id);
      const schedule = edit.visitTime ?? "";
      const sameDays = (a: number[] | null, b: number[] | null) =>
        JSON.stringify(a ? [...a].sort() : null) === JSON.stringify(b ? [...b].sort() : null);
      const removed = rows.filter((row) => !wanted.includes(row.worker_id));
      if (removed.length > 0) {
        const { error } = await supabase
          .from("assignments")
          .delete()
          .eq("resident_id", residentId)
          .in(
            "worker_id",
            removed.map((row) => row.worker_id),
          );
        if (error) return after(dbError(error) as ActionError);
        changed = true;
      }
      const upserts = wanted
        .filter((workerId) => {
          const row = rows.find((entry) => entry.worker_id === workerId);
          return (
            !row ||
            !sameDays(row.visit_days, edit.visitDays) ||
            row.start_date !== edit.startDate ||
            (row.schedule ?? "") !== schedule
          );
        })
        .map((workerId) => ({
          resident_id: residentId,
          worker_id: workerId,
          visit_days: edit.visitDays,
          start_date: edit.startDate,
          schedule,
        }));
      if (upserts.length > 0) {
        const { error } = await supabase
          .from("assignments")
          .upsert(upserts, { onConflict: "worker_id,resident_id" });
        if (error) return after(dbError(error) as ActionError);
        changed = true;
      }
      return after({ ok: true as const, changed });
    },
    /** M4 어르신 삭제(이슈 #103). 기록이 하나도 없을 때만 서버가 지우고 사진 파일도 정리한다 */
    async removeResident(residentId: string) {
      const result = await callApi<{ ok: true; cleanup_pending: boolean }>(
        `/api/residents/${residentId}`,
        { method: "DELETE" },
      );
      if (!result.ok) return result;
      try {
        await reload();
      } catch {
        // 지우기는 끝났다. 목록은 화면을 새로 고치면 맞는다
      }
      return result;
    },
    /** M4 어르신 추가: residents에 넣고(실명, #99) 고른 작성자와 담당 연결을 만든다(이슈 #95) */
    async addResident(
      name: string,
      careType: "facility" | "home",
      link: { workerIds: string[]; startDate: string } = { workerIds: [], startDate: "" },
    ) {
      const { data, error } = await supabase
        .from("residents")
        .insert({ name: name.trim(), care_type: careType })
        .select("id")
        .single();
      if (error || !data) return after(dbError(error) ?? actionError("create_failed"));
      const warnings: string[] = [];
      if (link.workerIds.length > 0) {
        try {
          const { error: linkError } = await supabase.from("assignments").insert(
            link.workerIds.map((workerId) => ({
              resident_id: data.id as string,
              worker_id: workerId,
              visit_days: careType === "home" ? [] : null,
              ...(link.startDate ? { start_date: link.startDate } : {}),
            })),
          );
          if (linkError)
            warnings.push("담당 연결을 저장하지 못했어요. [수정]에서 다시 연결해 주세요.");
        } catch {
          warnings.push("담당 연결을 확인하지 못했어요. [수정]에서 확인해 주세요.");
        }
      }
      // 생성은 이미 완료됐다. 이후 실패를 생성 실패로 돌려 재등록하게 하지 않는다.
      try {
        await reload();
      } catch {
        warnings.push("목록을 다시 읽지 못했어요. 화면을 새로 고쳐 주세요.");
      }
      return { ok: true as const, data: { id: data.id as string }, warnings };
    },
    async setProfile(fields: {
      fontSize?: FontSize;
      onboarded?: boolean;
      nativeLang?: NativeLang;
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
    /** 수정 필요 기록의 사유를 작성자 모국어로 번역해 채움(W3·W4를 열 때, 결정 2026-10-28-되돌림사유번역). 다시 읽기는 부르는 쪽이 한다 */
    async translateReturnReason(recordId: string) {
      return callApi(`/api/records/${recordId}/return/translate`);
    },
    /**
     * W6 도우미. 서버가 답한 뒤 helper_messages에 남기고 id·created_at을 더해 준다(저장이 실패하면 null, 이슈 #218).
     * conversationId가 있으면 그 대화에 붙고, 없으면 새 대화를 만든다(이슈 #251). 응답의 conversation_id를 다음 질문에 쓴다
     */
    async askHelper(question: string, conversationId?: string | null) {
      return callApi<
        HelperAnswer & {
          id: string | null;
          created_at: string | null;
          conversation_id: string | null;
        }
      >("/api/helper/ask", {
        body: conversationId ? { question, conversation_id: conversationId } : { question },
      });
    },
    /**
     * W6를 열 때 지난 대화(대화 하나, 최근 50개, 오래된 순)를 서버에서 불러온다. before는 앞서 받은 created_at.
     * conversationId가 없으면 가장 최근 대화(이슈 #251)
     */
    async helperMessages(before?: string, conversationId?: string | null) {
      const params = new URLSearchParams();
      if (before) params.set("before", before);
      if (conversationId) params.set("conversation_id", conversationId);
      const query = params.size > 0 ? `?${params.toString()}` : "";
      // 서버의 전환 기간 응답(vi)은 화면 경계에서 native로 읽는다. API 계약은 바꾸지 않는다.
      const result = await callApi<HelperMessagesPage>(`/api/helper/messages${query}`, {
        method: "GET",
      });
      if (!result.ok) return result;
      return {
        ...result,
        data: {
          ...result.data,
          messages: result.data.messages.map((message) => ({
            ...message,
            answer: {
              ...message.answer,
              native:
                message.answer.native ??
                (message.answer as HelperAnswer & { vi?: string }).vi ??
                "",
            },
          })),
        },
      };
    },
    /** W6 · 이전 대화. 내 대화 목록을 최근 질문 순으로 20개씩 읽는다(이슈 #251). */
    async helperConversations(before?: string) {
      const query = before ? `?before=${encodeURIComponent(before)}` : "";
      return callApi<HelperConversationsPage>(`/api/helper/conversations${query}`, {
        method: "GET",
      });
    },
    /** M2 'AI 작업 기록'(관리자는 같은 기관 agent_steps 읽기) */
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
