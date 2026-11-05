import { noteAreas, type NoteArea } from "@/lib/print/fields";

/** 제16호 특이사항을 넣을 영역 체크(여러 개). 처음에는 4개 모두 켜져 있다(이슈 #321) */
export function NoteAreaChecks({
  legend,
  value,
  disabled,
  onChange,
}: {
  legend: string;
  value: NoteArea[];
  disabled?: boolean;
  onChange: (next: NoteArea[]) => void;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
      <legend className="flabel">{legend}</legend>
      {noteAreas.map(({ key, label }) => (
        <label key={key} style={{ display: "block", padding: "4px 0" }}>
          <input
            type="checkbox"
            checked={value.includes(key)}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                noteAreas
                  .map((area) => area.key)
                  .filter((area) => (area === key ? event.target.checked : value.includes(area))),
              )
            }
          />{" "}
          {label}
        </label>
      ))}
      {value.length === 0 && (
        <p role="status" className="warn-text">
          특이사항 영역을 하나 이상 골라 주세요
        </p>
      )}
    </fieldset>
  );
}
