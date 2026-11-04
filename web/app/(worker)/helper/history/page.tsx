"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { Icon } from "@/components/mobile/icon";
import { BtnLabel } from "@/components/mobile/parts";
import { AppBar, Loading, MobileScreen } from "@/components/mobile/shell";
import { kstDateOf, monthDayWeek } from "@/lib/demo/store";
import { browserStorage, loadMockConversations, MOCK_HELPER_USER } from "@/lib/helper/history";
import type { HelperConversationsPage } from "@/lib/real/actions";

type PageState = HelperConversationsPage & {
  status: "loading" | "done" | "error";
  loadingMore: boolean;
};

export default function HelperHistoryPage() {
  const demo = useDemo();
  if (!demo) return <Loading tab="helper" />;
  return <ConversationList key={demo.real?.userId ?? MOCK_HELPER_USER} />;
}

function ConversationList() {
  const demo = useDemo()!;
  const actions = demo.real?.actions;
  const userId = demo.real?.userId ?? MOCK_HELPER_USER;
  const search = useSearchParams();
  const current = search.get("current");
  const back = current ? `/helper?conversation=${encodeURIComponent(current)}` : "/helper?new=1";
  const [page, setPage] = useState<PageState>({
    conversations: [],
    next_before: null,
    status: "loading",
    loadingMore: false,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const inFlight = useRef(false);

  const loadPage = useCallback(
    (before?: string) => {
      if (before && inFlight.current) return;
      const sequence = ++request.current;
      inFlight.current = true;
      const load = actions
        ? actions.helperConversations(before)
        : Promise.resolve(
            (() => {
              const rows = loadMockConversations(browserStorage(), userId).filter(
                (row) => !before || row.last_message_at < before,
              );
              const conversations = rows
                .slice(0, 20)
                .map(({ id, title, last_message_at, message_count }) => ({
                  id,
                  title,
                  last_message_at,
                  message_count,
                }));
              return {
                ok: true as const,
                data: {
                  conversations,
                  next_before: rows.length > 20 ? conversations.at(-1)!.last_message_at : null,
                },
              };
            })(),
          );
      void load
        .then((result) => {
          if (sequence !== request.current) return;
          if (!result.ok) {
            setPage((previous) => ({ ...previous, status: "error", loadingMore: false }));
            return;
          }
          setPage((previous) => {
            const rows = before
              ? [...previous.conversations, ...result.data.conversations]
              : result.data.conversations;
            return {
              conversations: [...new Map(rows.map((row) => [row.id, row])).values()],
              next_before: result.data.next_before,
              status: "done",
              loadingMore: false,
            };
          });
        })
        .finally(() => {
          if (sequence === request.current) inFlight.current = false;
        });
    },
    [actions, userId],
  );

  useEffect(() => {
    loadPage();
    return () => {
      request.current += 1;
      inFlight.current = false;
    };
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!page.next_before || page.status !== "done" || page.loadingMore || inFlight.current) return;
    setPage((previous) => ({ ...previous, loadingMore: true }));
    loadPage(page.next_before);
  }, [page.next_before, page.status, page.loadingMore, loadPage]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !page.next_before || page.status !== "done") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "100px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, page.next_before, page.status]);

  return (
    <MobileScreen tab="helper">
      <AppBar title="이전 대화" vi="Trò chuyện trước" back={back} />
      <div className="helper-history-list">
        {page.status === "loading" && (
          <div role="status" aria-label="대화 목록 불러오는 중">
            {[0, 1, 2].map((key) => (
              <div key={key} className="card helper-history-skeleton" aria-hidden="true" />
            ))}
          </div>
        )}
        {page.conversations.map((conversation) => {
          const date = kstDateOf(conversation.last_message_at);
          return (
            <Link
              key={conversation.id}
              className="card helper-conversation"
              href={`/helper?conversation=${encodeURIComponent(conversation.id)}`}
            >
              <div className="helper-conversation-heading">
                <b>{conversation.title}</b>
                {current === conversation.id && <span className="badge badge-green">보는 중</span>}
              </div>
              <span className="helper-conversation-meta">
                {date === demo.today ? "오늘" : monthDayWeek(date)} · 질문{" "}
                {conversation.message_count}개
                <Icon name="next" />
              </span>
            </Link>
          );
        })}
        {page.status === "done" && page.conversations.length === 0 && (
          <div className="empty">
            <p>아직 대화가 없어요.</p>
            <span className="vi">Chưa có cuộc trò chuyện nào.</span>
            <Link className="btn btn-primary" href="/helper?new=1">
              <BtnLabel ko="질문하러 가기" vi="Đặt câu hỏi" />
            </Link>
          </div>
        )}
        {page.status === "error" && (
          <div className="form-error box" role="alert">
            <div>
              <b>대화 목록을 불러오지 못했어요.</b>
              <span className="vi">Không thể tải danh sách cuộc trò chuyện.</span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setPage((previous) => ({
                    ...previous,
                    status: previous.conversations.length ? "done" : "loading",
                    loadingMore: Boolean(previous.conversations.length),
                  }));
                  loadPage(page.conversations.length ? (page.next_before ?? undefined) : undefined);
                }}
              >
                <BtnLabel ko="다시 불러오기" vi="Tải lại" />
              </button>
            </div>
          </div>
        )}
        {page.loadingMore && (
          <p role="status">
            대화를 더 불러오는 중이에요.<span className="vi">Đang tải thêm cuộc trò chuyện…</span>
          </p>
        )}
        {page.next_before && page.status === "done" && (
          <button
            type="button"
            className="btn btn-outline"
            disabled={page.loadingMore}
            onClick={loadMore}
          >
            <BtnLabel ko="이전 대화 더 보기" vi="Xem thêm cuộc trò chuyện" />
          </button>
        )}
        <div ref={sentinel} aria-hidden="true" />
      </div>
    </MobileScreen>
  );
}
