import assert from "node:assert/strict";
import {test} from "node:test";
import {assembleOcrChunks,joinOcrLines} from "../src/adapters/cocoa-ocr";

test("Vision pages with no recognized text are valid empty chunks",()=>{
  assert.equal(joinOcrLines([]),"");
  assert.equal(joinOcrLines(["  ","\t"]),"");
  assert.equal(joinOcrLines(["第一行","  ","Second line"]),"第一行\nSecond line");
});

test("empty OCR chunks are omitted while non-empty chunks retain page order",()=>{
  const markdown=assembleOcrChunks([
    "first page text",
    joinOcrLines([]),
    "",
    "last page text"
  ]);
  assert.equal(markdown,"first page text\n\n---\n\nlast page text\n");
});

test("all-empty OCR chunks produce no Markdown content",()=>{
  assert.equal(assembleOcrChunks(["",joinOcrLines([]),"  ","\n"]), "");
});
