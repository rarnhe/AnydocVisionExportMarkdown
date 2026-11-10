import assert from "node:assert/strict";
import {test} from "node:test";
import {AnyDocEngine} from "../src/core/engine";
import {assembleOcrChunks,convertTextChunk,joinOcrLines} from "../src/adapters/cocoa-ocr";

test("Vision pages with no recognized text are valid empty chunks",()=>{
  assert.equal(joinOcrLines([]),"");
  assert.equal(joinOcrLines(["  ","\t"]),"");
  assert.equal(joinOcrLines(["第一行","  ","Second line"]),"第一行\nSecond line");
});

test("empty OCR and zero-byte text chunks do not stop ordered assembly",()=>{
  const emptyTextEngine={
    convertPdf:()=>{throw new Error("Converted Markdown empty or too short");}
  } as unknown as AnyDocEngine;
  const text=convertTextChunk(emptyTextEngine,new Uint8Array());
  assert.equal(text,"");
  const markdown=assembleOcrChunks([
    "first page text",
    joinOcrLines([]),
    text,
    "last page text"
  ]);
  assert.equal(markdown,"first page text\n\n---\n\n\n\n---\n\n\n\n---\n\nlast page text\n");
  assert.match(markdown,/first page text/);
  assert.match(markdown,/last page text/);
});

test("OCR recovery propagates non-empty-output conversion failures",()=>{
  const brokenEngine={
    convertPdf:()=>{throw new Error("WASM memory access failed");}
  } as unknown as AnyDocEngine;
  assert.throws(()=>convertTextChunk(brokenEngine,new Uint8Array([1])),/WASM memory access failed/);
});
