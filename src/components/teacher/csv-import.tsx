"use client";

import { useRef, useState } from "react";
import { contentToCsv, csvToConcepts, parseCsv, type CsvRowError } from "@/domain/csv";
import type { QuizContent } from "@/domain/quiz-content";
import { buttonClass } from "@/components/ui";

/**
 * CSV 파일 글자 인코딩 판별: UTF-8(BOM 포함)을 먼저 시도하고,
 * 실패하면 한글 엑셀의 기본 저장 형식(CP949/EUC-KR)으로 읽는다.
 */
function decode(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("euc-kr").decode(buffer);
  }
}

export function CsvTools({
  content,
  editable,
  onImport,
}: {
  content: QuizContent;
  editable: boolean;
  onImport: (concepts: QuizContent["concepts"]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [message, setMessage] = useState("");

  function download() {
    const blob = new Blob([contentToCsv(content)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${content.title || "퀴즈"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErrors([]);
    setMessage("");
    if (file.size > 2 * 1024 * 1024) {
      setErrors([{ line: 0, message: "파일이 너무 커요(2MB 이하)." }]);
      return;
    }
    const result = csvToConcepts(parseCsv(decode(await file.arrayBuffer())));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (!window.confirm("CSV의 12개 개념, 36문항으로 바꿀까요? 지금 입력한 문항은 덮어써집니다(저장 전까지는 되돌릴 수 있어요).")) {
      return;
    }
    onImport(result.concepts);
    setMessage(`'${file.name}'에서 36문항을 불러왔어요. 확인 후 [임시저장]을 눌러 주세요.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={download} className={buttonClass.secondary}>
          ⬇ CSV 내려받기(양식)
        </button>
        {editable && (
          <>
            <button type="button" onClick={() => fileInput.current?.click()} className={buttonClass.secondary}>
              ⬆ CSV 가져오기
            </button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        내려받은 파일을 엑셀에서 채운 뒤 그대로 저장해 가져오면 돼요. 열: concept_order(1~12), concept_name,
        question_type(original 1개 + variant 2개), body, option_1~4, correct_option(1~4), explanation
      </p>
      {message && (
        <p role="status" className="rounded-xl bg-good-soft p-3 text-sm font-semibold text-good">
          ✓ {message}
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad">
          <p className="font-bold">CSV에 고칠 곳이 {errors.length}개 있어서 가져오지 않았어요.</p>
          <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-auto pl-5">
            {errors.map((err, i) => (
              <li key={i}>
                {err.line > 0 && <strong>{err.line}행: </strong>}
                {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
