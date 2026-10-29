import { RoleGate } from "@/components/role-gate";

// W 화면(작성자·교육생) 묶음. 담당자·강사가 들어오면 /review로 돌려보낸다(이슈 #114).
export default function WorkerLayout({ children }: LayoutProps<"/">) {
  return <RoleGate allow="worker">{children}</RoleGate>;
}
