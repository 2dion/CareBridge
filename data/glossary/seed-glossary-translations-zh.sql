-- 용어 번역(glossary_translations) 중국어(간체자) 시드. 원본: data/glossary/translations-zh.csv (term_id, term, reviewed).
-- term_id는 CSV의 사람용 번호라 DB에 없으므로, 용어는 (expression, term_ko)로 찾아 잇는다(glossary unique 키).
-- 다시 돌려도 안전: 같은 (용어, 언어)면 번역 글만 맞춘다. 검수 전 중국어(간체자)는 Claude 초안이다(reviewed = false).
-- 이 파일은 data/glossary/build_translation_seeds.py가 만든다. 고칠 때는 CSV를 고치고 다시 만든다.
-- 근거: 문서/결정/2026-11-03-용어번역표.md, 문서/설계/데이터구조-v2.3.6.md 'glossary_translations'
insert into public.glossary_translations (glossary_id, lang, term, reviewed)
select g.id, 'zh', v.term, v.reviewed
from (values
  ('세수해 드렸어요', '세면도움', '协助洗脸', false),
  ('양치 도와드렸어요', '구강청결', '口腔清洁', false),
  ('옷 갈아입혀 드렸어요', '옷 갈아입기 도움', '协助更衣', false),
  ('머리 감겨 드렸어요', '머리감기 도움', '协助洗头', false),
  ('면도해 드렸어요', '몸단장', '仪容整理（刮胡子、剪指甲）', false),
  ('씻겨 드렸어요', '목욕도움(몸 씻기 도움)', '协助洗澡', false),
  ('밥 먹여 드렸어요', '식사도움', '协助进食', false),
  ('다 드셨어요', '섭취량 1(전량)', '全部吃完', false),
  ('반 넘게 드셨어요', '섭취량 1/2이상', '吃了一半以上', false),
  ('반도 못 드셨어요', '섭취량 1/2미만', '吃了不到一半', false),
  ('조금 드셨어요', '(섭취량 확인 필요)', '吃了一点（需再确认食量）', false),
  ('죽 드셨어요', '죽', '粥', false),
  ('콧줄로 드셨어요', '경관영양(튜브영양공급)', '管饲营养', false),
  ('자세 바꿔 드렸어요', '체위변경', '变换体位', false),
  ('하루 종일 누워 계세요', '와상', '卧床不起', false),
  ('부축해서 걸었어요', '이동도움', '协助移动', false),
  ('화장실 모시고 갔어요', '화장실이용하기', '协助如厕', false),
  ('기저귀 갈았어요', '기저귀 교환', '更换尿布', false),
  ('소변 실수하셨어요', '소변 실수(요실금)', '尿失禁', false),
  ('사레 들리셨어요', '삼킴 어려움 관찰', '呛咳 / 吞咽困难', false),
  ('잠을 잘 못 주무셨대요', '수면 상태(본인 진술)', '本人说睡得不好', false),
  ('아프다고 하셨어요', '통증 호소', '诉说疼痛', false),
  ('빨개요', '발적 관찰', '皮肤发红', false),
  ('부었어요', '부종 관찰', '肿胀 / 水肿', false),
  ('약 드시는 거 봤어요', '복약 확인', '已看到服药', false),
  ('말동무해 드렸어요', '말벗·격려(의사소통 도움)', '陪伴聊天、鼓励', false),
  ('같이 색칠·숫자 놀이 했어요', '인지관리 지원', '协助认知活动', false),
  ('산책 같이 했어요', '산책(외출) 동행', '陪同散步', false),
  ('넘어지셨어요', '낙상', '跌倒', false),
  ('변을 못 보셨어요', '배변 상태(변비·설사 관찰)', '排便困难 / 腹泻', false),
  ('침대에서 앉혀 드려야 일어나세요', '준와상', '部分卧床（扶助下可坐起）', false),
  ('엉덩이에 상처가 생겼어요', '욕창', '压疮', false),
  ('한쪽 팔다리를 못 쓰세요', '편마비', '偏瘫', false),
  ('코에 줄 끼고 계세요', '비위관(L-tube)', '鼻胃管', false),
  ('소변 줄 달고 계세요', '유치도뇨관(고정소변배출관)', '留置导尿管', false),
  ('배에 변 주머니 차고 계세요', '장루(창자샛길)', '肠造口', false),
  ('배에 소변 주머니 차고 계세요', '요루(요도샛길)', '尿路造口', false),
  ('기저귀 닿는 데가 빨개요', '기저귀피부염', '尿布皮炎', false),
  ('살 접히는 데가 짓물렀어요', '간찰진', '皮肤褶皱处糜烂', false),
  ('걸쭉하게 만들어 드려요', '연하도움식', '吞咽辅助食', false),
  ('입술이 파래요', '청색증', '发绀', false),
  ('어지럽대요', '현기증', '头晕', false),
  ('갑자기 엉뚱한 말씀을 하세요', '섬망', '谵妄', false),
  ('밤에 계속 돌아다니세요', '배회', '徘徊', false),
  ('없는 사람이 보인대요', '환각', '幻觉', false),
  ('불러도 대답을 안 하세요', '의식장애', '意识障碍', false),
  ('넘어지고 팔이 이상해요', '골절', '骨折', false),
  ('팔에 멍이 들었어요', '노인성 자반', '老年性紫癜', false),
  ('소변 볼 때 아프대요', '요로감염', '尿路感染', false),
  ('보청기 끼워 드렸어요', '보청기', '助听器', false),
  ('진지 잡수세요', '식사 (진지: 밥의 높임말)', '请您用餐（敬语）', false)
) as v (expression, term_ko, term, reviewed)
join public.glossary g on g.expression = v.expression and g.term_ko = v.term_ko
on conflict (glossary_id, lang) do update
  set term = excluded.term, reviewed = excluded.reviewed
  where public.glossary_translations.term is distinct from excluded.term
     or public.glossary_translations.reviewed is distinct from excluded.reviewed;
