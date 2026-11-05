import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import { vi as messages } from "./messages/vi";

it("작성자·계정 화면과 데모의 베트남어 고정 문구는 번역 파일에만 둔다(#258)", () => {
  const folders = ["app/(worker)", "app/(auth)", "components/mobile", "lib/demo"];
  const files = folders.flatMap((folder) =>
    readdirSync(folder, { recursive: true })
      .filter((name): name is string => typeof name === "string")
      .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
      .map((name) => resolve(folder, name)),
  );
  files.push(
    resolve("app/page.tsx"),
    resolve("lib/real/actions.ts"),
    resolve("lib/privacy.ts"),
    resolve("lib/records/item-badge.ts"),
  );
  const violations: string[] = [];
  for (const file of files) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isStringLiteralLike(node) ||
          ts.isJsxText(node) ||
          node.kind === ts.SyntaxKind.TemplateHead ||
          node.kind === ts.SyntaxKind.TemplateMiddle ||
          node.kind === ts.SyntaxKind.TemplateTail) &&
        /[À-ỹ]/.test((node as ts.StringLiteralLike).text)
      )
        violations.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(sf) === "nativeMessage" &&
        node.arguments[1] &&
        ts.isStringLiteral(node.arguments[1])
      ) {
        expect(messages, `${file}: ${node.arguments[1].text}`).toHaveProperty(
          node.arguments[1].text,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  expect(violations).toEqual([]);
});
