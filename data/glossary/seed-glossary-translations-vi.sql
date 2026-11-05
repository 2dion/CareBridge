-- 용어 번역(glossary_translations) 베트남어 시드. 원본: data/glossary/translations-vi.csv (term_id, term, reviewed).
-- term_id는 CSV의 사람용 번호라 DB에 없으므로, 용어는 (expression, term_ko)로 찾아 잇는다(glossary unique 키).
-- 다시 돌려도 안전: 같은 (용어, 언어)면 번역 글만 맞춘다. 검수 전 베트남어는 Claude 초안이다(reviewed = false).
-- 근거: 문서/결정/2026-11-03-용어번역표.md, 문서/설계/데이터구조-v2.3.6.md 'glossary_translations'
insert into public.glossary_translations (glossary_id, lang, term, reviewed)
select g.id, 'vi', v.term, v.reviewed
from (values
  ('세수해 드렸어요', '세면도움', 'Hỗ trợ rửa mặt', false),
  ('양치 도와드렸어요', '구강청결', 'Vệ sinh răng miệng', false),
  ('옷 갈아입혀 드렸어요', '옷 갈아입기 도움', 'Hỗ trợ thay quần áo', false),
  ('머리 감겨 드렸어요', '머리감기 도움', 'Hỗ trợ gội đầu', false),
  ('면도해 드렸어요', '몸단장', 'Chăm sóc ngoại hình (cạo râu, cắt móng)', false),
  ('씻겨 드렸어요', '목욕도움(몸 씻기 도움)', 'Hỗ trợ tắm', false),
  ('밥 먹여 드렸어요', '식사도움', 'Hỗ trợ ăn uống', false),
  ('다 드셨어요', '섭취량 1(전량)', 'Ăn hết khẩu phần', false),
  ('반 넘게 드셨어요', '섭취량 1/2이상', 'Ăn được hơn một nửa', false),
  ('반도 못 드셨어요', '섭취량 1/2미만', 'Ăn chưa được một nửa', false),
  ('조금 드셨어요', '(섭취량 확인 필요)', 'Ăn một ít (cần hỏi lại lượng)', false),
  ('죽 드셨어요', '죽', 'Cháo', false),
  ('콧줄로 드셨어요', '경관영양(튜브영양공급)', 'Nuôi ăn qua ống', false),
  ('자세 바꿔 드렸어요', '체위변경', 'Đổi tư thế', false),
  ('하루 종일 누워 계세요', '와상', 'Nằm liệt giường', false),
  ('부축해서 걸었어요', '이동도움', 'Hỗ trợ di chuyển', false),
  ('화장실 모시고 갔어요', '화장실이용하기', 'Hỗ trợ đi vệ sinh', false),
  ('기저귀 갈았어요', '기저귀 교환', 'Thay tã', false),
  ('소변 실수하셨어요', '소변 실수(요실금)', 'Tiểu không tự chủ', false),
  ('사레 들리셨어요', '삼킴 어려움 관찰', 'Bị sặc / khó nuốt', false),
  ('잠을 잘 못 주무셨대요', '수면 상태(본인 진술)', 'Bà nói ngủ không ngon', false),
  ('아프다고 하셨어요', '통증 호소', 'Kêu đau', false),
  ('빨개요', '발적 관찰', 'Da bị đỏ', false),
  ('부었어요', '부종 관찰', 'Bị sưng / phù', false),
  ('약 드시는 거 봤어요', '복약 확인', 'Đã thấy uống thuốc', false),
  ('말동무해 드렸어요', '말벗·격려(의사소통 도움)', 'Trò chuyện, động viên', false),
  ('같이 색칠·숫자 놀이 했어요', '인지관리 지원', 'Hỗ trợ hoạt động nhận thức', false),
  ('산책 같이 했어요', '산책(외출) 동행', 'Đi dạo cùng', false),
  ('넘어지셨어요', '낙상', 'Té ngã', false),
  ('변을 못 보셨어요', '배변 상태(변비·설사 관찰)', 'Không đi ngoài được / đi ngoài phân lỏng', false),
  ('침대에서 앉혀 드려야 일어나세요', '준와상', 'Nằm liệt một phần (ngồi được khi có hỗ trợ)', false),
  ('엉덩이에 상처가 생겼어요', '욕창', 'Loét tì đè', false),
  ('한쪽 팔다리를 못 쓰세요', '편마비', 'Liệt nửa người', false),
  ('코에 줄 끼고 계세요', '비위관(L-tube)', 'Ống thông dạ dày qua mũi', false),
  ('소변 줄 달고 계세요', '유치도뇨관(고정소변배출관)', 'Ống thông tiểu lưu', false),
  ('배에 변 주머니 차고 계세요', '장루(창자샛길)', 'Hậu môn nhân tạo', false),
  ('배에 소변 주머니 차고 계세요', '요루(요도샛길)', 'Lỗ dẫn lưu nước tiểu ra da', false),
  ('기저귀 닿는 데가 빨개요', '기저귀피부염', 'Viêm da do tã', false),
  ('살 접히는 데가 짓물렀어요', '간찰진', 'Hăm da ở nếp gấp', false),
  ('걸쭉하게 만들어 드려요', '연하도움식', 'Thức ăn mềm cho người khó nuốt', false),
  ('입술이 파래요', '청색증', 'Tím tái', false),
  ('어지럽대요', '현기증', 'Chóng mặt', false),
  ('갑자기 엉뚱한 말씀을 하세요', '섬망', 'Mê sảng', false),
  ('밤에 계속 돌아다니세요', '배회', 'Đi lang thang', false),
  ('없는 사람이 보인대요', '환각', 'Ảo giác', false),
  ('불러도 대답을 안 하세요', '의식장애', 'Rối loạn ý thức', false),
  ('넘어지고 팔이 이상해요', '골절', 'Gãy xương', false),
  ('팔에 멍이 들었어요', '노인성 자반', 'Vết bầm (ban xuất huyết tuổi già)', false),
  ('소변 볼 때 아프대요', '요로감염', 'Nhiễm trùng đường tiết niệu', false),
  ('보청기 끼워 드렸어요', '보청기', 'Máy trợ thính', false),
  ('진지 잡수세요', '식사 (진지: 밥의 높임말)', 'Mời ông/bà dùng bữa (cách nói kính trọng)', false)
) as v (expression, term_ko, term, reviewed)
join public.glossary g on g.expression = v.expression and g.term_ko = v.term_ko
on conflict (glossary_id, lang) do update
  set term = excluded.term, reviewed = excluded.reviewed
  where public.glossary_translations.term is distinct from excluded.term
     or public.glossary_translations.reviewed is distinct from excluded.reviewed;
