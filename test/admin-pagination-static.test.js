import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminHtml = readFileSync(new URL("../admin/admin.html", import.meta.url), "utf8");
const adminScript = readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");

test("admin visit log exposes pagination controls", () => {
  assert.match(adminHtml, /id="visitPagination"/);
  assert.match(adminHtml, /id="visitPrevPageButton"/);
  assert.match(adminHtml, /id="visitPageInfo"/);
  assert.match(adminHtml, /id="visitNextPageButton"/);
});

test("admin visit log paginates records without changing export", () => {
  assert.match(adminScript, /VISIT_PAGE_SIZE\s*=\s*10/);
  assert.match(adminScript, /visitRecords/);
  assert.match(adminScript, /function renderVisitPage/);
  assert.match(adminScript, /visitRecords\.slice/);
  assert.match(adminScript, /\/api\/admin\/visits\/export/);
});
