import { RoleGate } from "@/components/role-gate";

// R 화면(담당자·강사) 묶음. 작성자·교육생이 들어오면 /today로 돌려보낸다(이슈 #114).
export default function ReviewerLayout({ children }: LayoutProps<"/">) {
  return <RoleGate allow="reviewer">{children}</RoleGate>;
}
