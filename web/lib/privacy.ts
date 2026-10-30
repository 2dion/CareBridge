// #105: 가입 동의와 W5 개인정보 안내가 같은 문구를 쓴다.
export const PRIVACY_SECTIONS = [
  {
    icon: "doc",
    ko: "수집·이용 목적",
    vi: "Mục đích",
    body: "돌봄 기록 초안 작성, 번역, 관리자 검토·승인. 같은 기관 사람만 열람",
    bodyVi: "Soạn bản nháp, dịch, quản lý xem xét và duyệt. Chỉ người trong cùng cơ sở xem được",
  },
  {
    icon: "user",
    ko: "수집 항목",
    vi: "Thông tin thu thập",
    body: "이름, 이메일, 사용 언어, 녹음을 바꾼 글, 돌봄 기록 내용. 어르신은 가명(예: 김○○)으로만 기록",
    bodyVi:
      "Tên, email, ngôn ngữ, văn bản từ ghi âm, nội dung ghi chép. Người cao tuổi chỉ ghi bằng tên ẩn danh (vd: Kim○○)",
  },
  {
    icon: "shield",
    ko: "보유·이용 기간",
    vi: "Thời gian lưu",
    body: "회원 탈퇴 시까지. 승인한 돌봄 기록은 관계 법령에 따른 기간 동안 보관. 녹음 파일은 글자로 바꾼 즉시 삭제",
    bodyVi:
      "Đến khi xóa tài khoản. Ghi chép đã duyệt lưu theo thời hạn luật định. Tệp ghi âm bị xóa ngay sau khi chuyển thành chữ",
  },
  {
    icon: "alert",
    ko: "동의 거부 권리",
    vi: "Quyền từ chối",
    body: "동의하지 않을 수 있어요. 다만 동의하지 않으면 서비스를 쓸 수 없어요.",
    bodyVi: "Bạn có thể từ chối, nhưng khi đó không thể dùng dịch vụ",
  },
] as const;
