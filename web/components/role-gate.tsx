"use client";

// 역할별 화면 막기(이슈 #114). 작성자·교육생(worker)은 W 화면만, 관리자·강사(reviewer)는 M 화면만 연다.
// 다른 역할의 화면 주소로 들어오면 자기 첫 화면으로 돌려보낸다. 권한 자체는 서버(API·RLS)가 이미 막고,
// 이 막기는 쓸 수 없는 버튼이 보이지 않게 하는 화면 쪽 안내다.
// Mock 모드는 작성자·관리자를 오가며 시연하므로 막지 않는다(화면 v1.3 '개발 환경').
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { useDemo } from "@/components/demo/demo-provider";

export type AppRole = "worker" | "reviewer";

/** 역할의 첫 화면 */
export function roleHome(role: AppRole) {
  return role === "reviewer" ? "/review" : "/today";
}

/** 이 화면 묶음을 열 수 없는 사람이면 보낼 곳, 열 수 있으면 null */
export function redirectFor(allowed: AppRole, userRole: AppRole | null | undefined) {
  if (!userRole || userRole === allowed) return null;
  return roleHome(userRole);
}

export function RoleGate({ allow, children }: { allow: AppRole; children: ReactNode }) {
  const demo = useDemo();
  const router = useRouter();
  const target = redirectFor(allow, demo?.real?.role);
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  // 돌려보내는 동안 쓸 수 없는 화면을 잠깐이라도 그리지 않는다
  if (target) return null;
  return <>{children}</>;
}
