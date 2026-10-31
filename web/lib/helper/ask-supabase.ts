import "server-only";

import { getClaudeClient } from "@/lib/ai/claude";
import { translateQuestionKo } from "@/lib/ai/translate";
import type { NativeLang, Role } from "@/lib/auth/signup";
import { getAiMode, getAiModels } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { GlossaryTerm, HelperDeps, ManualSection } from "./ask";
import { rankSections } from "./manual-rank";

// 교재 검색은 로그인한 사람 권한(manual_sections·glossary는 기관 공통 읽기). 상위 3절만 Claude에 건넨다(W6 1번).
const MAX_SECTIONS = 3;

export async function createHelperDeps(): Promise<HelperDeps> {
  const supabase = await createSupabaseServerClient();

  return {
    async currentUser() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, native_lang, organizations(is_training)")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!profile) return null;
      return {
        id: auth.user.id,
        role: profile.role as Role,
        nativeLang: (profile.native_lang === "ko" ? "ko" : "vi") as NativeLang,
        // 교육용 기관이면 고정 안내에 '강사'(이슈 #180)
        isTraining: Boolean(
          (profile.organizations as unknown as { is_training: boolean } | null)?.is_training,
        ),
      };
    },
    async searchManual(question, keywords) {
      // 교재는 13절뿐이라 전부 가져와 앱에서 순위를 매긴다(이슈 #219): 흔한 말에 밀려 필요한 절이 빠지지 않게
      const { data, error } = await supabase
        .from("manual_sections")
        .select("chapter, title, page, body");
      if (error) throw new Error(`교재 검색 실패: ${error.message}`);
      return rankSections((data ?? []) as ManualSection[], question, keywords, MAX_SECTIONS);
    },
    async searchGlossary(question) {
      const { data, error } = await supabase.rpc("search_glossary", {
        expression: question,
        max_results: 5,
      });
      if (error) throw new Error(`용어 검색 실패: ${error.message}`);
      return (data ?? []) as GlossaryTerm[];
    },
    // 한글이 없는 질문은 한국어로 옮겨 검색한다(이슈 #122). Mock 모드는 null → 원문으로 검색
    translateQuestion: translateQuestionKo,
    async askClaude(system, user) {
      if (getAiMode() === "mock") return null;
      const response = await getClaudeClient().messages.create(
        {
          model: getAiModels().light,
          max_tokens: 1500,
          system,
          messages: [{ role: "user", content: user }],
        },
        { timeout: 60_000, maxRetries: 1 },
      );
      return response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    },
  };
}
