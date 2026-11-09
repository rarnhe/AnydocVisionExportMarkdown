import {strict as assert} from "node:assert";
import {test} from "node:test";
import {parseNeedsOcr,planOcrPages} from "../src/core/needs-ocr";
test("only structured needsOcr is recoverable",()=>{
  assert.equal(parseNeedsOcr(new Error("needs OCR")),null);
  assert.equal(parseNeedsOcr({code:"other",pages:[1],pageCount:1}),null);
  assert.deepEqual(parseNeedsOcr({code:"needsOcr",pages:[5,2,2,3],pageCount:6}),
    {pages:[2,3,5],pageCount:6});
  for(const pages of [[0],[7],[1.5],["2"],[]])
    assert.throws(()=>parseNeedsOcr({code:"needsOcr",pages,pageCount:6}));
});
test("page plan preserves ordering and coalesces consecutive text pages",()=>{
  assert.deepEqual(planOcrPages({pages:[2,5],pageCount:6}),[
    {start:1,end:1,ocr:false},{start:2,end:2,ocr:true},
    {start:3,end:4,ocr:false},{start:5,end:5,ocr:true},
    {start:6,end:6,ocr:false}
  ]);
});
