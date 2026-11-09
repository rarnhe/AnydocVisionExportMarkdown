import {strict as assert} from "node:assert";
import {test} from "node:test";
import {parseNeedsOcr,planOcrPages} from "../src/core/needs-ocr";

test("parses structured needsOcr metadata",()=>{
  assert.deepEqual(parseNeedsOcr({code:"needsOcr",pages:[5,2,2,3],pageCount:6}),
    {pages:[2,3,5],pageCount:6});
});
test("parses the real AnyDoc WASM Error message with page ranges",()=>{
  const error=new Error("pages 12, 17, 20-56 of 56 need OCR");
  const result=parseNeedsOcr(error);
  assert.deepEqual(result,{pages:[12,17,...Array.from({length:37},(_,i)=>i+20)],pageCount:56});
  assert.equal(result?.pages.length,39);
});
test("parses JSON payload embedded in an Error message",()=>{
  assert.deepEqual(parseNeedsOcr(new Error('AnyDoc error: {"code":"needsOcr","pages":[2,4],"pageCount":5}')),
    {pages:[2,4],pageCount:5});
});
test("does not recover unrelated or malformed errors",()=>{
  assert.equal(parseNeedsOcr(new Error("ordinary conversion failure")),null);
  assert.equal(parseNeedsOcr({code:"other",pages:[1],pageCount:1}),null);
  for(const pages of [[0],[7],[1.5],["2"],[]])
    assert.throws(()=>parseNeedsOcr({code:"needsOcr",pages,pageCount:6}));
  assert.throws(()=>parseNeedsOcr(new Error("pages 5-2 of 6 need OCR")));
});
test("page plan preserves ordering and coalesces consecutive text pages",()=>{
  assert.deepEqual(planOcrPages({pages:[2,5],pageCount:6}),[
    {start:1,end:1,ocr:false},{start:2,end:2,ocr:true},
    {start:3,end:4,ocr:false},{start:5,end:5,ocr:true},
    {start:6,end:6,ocr:false}
  ]);
});
