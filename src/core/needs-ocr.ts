/** Structured anydoc-wasm OCR request. Page numbers are 1-based. */
export interface OcrRequest { pages: number[]; pageCount: number }
export function parseNeedsOcr(error: unknown): OcrRequest | null {
  if (!error || typeof error !== "object") return null;
  const value = error as {code?:unknown;pages?:unknown;pageCount?:unknown};
  if (value.code !== "needsOcr") return null;
  if (!Number.isSafeInteger(value.pageCount) || Number(value.pageCount) < 1 ||
      !Array.isArray(value.pages) || value.pages.length === 0)
    throw new Error("Malformed needsOcr metadata: missing pages or pageCount");
  const count = Number(value.pageCount);
  const pages = value.pages as unknown[];
  if (pages.some(p => !Number.isSafeInteger(p) || Number(p) < 1 || Number(p) > count))
    throw new Error("Malformed needsOcr metadata: invalid page index");
  return {pages:[...new Set(pages as number[])].sort((a,b)=>a-b),pageCount:count};
}
/** Split into ordered consecutive text ranges and isolated OCR pages. */
export function planOcrPages(request: OcrRequest): Array<{start:number;end:number;ocr:boolean}> {
  const flagged = new Set(request.pages), result:Array<{start:number;end:number;ocr:boolean}>=[];
  for(let page=1;page<=request.pageCount;page++){
    const ocr=flagged.has(page),last=result[result.length-1];
    if(last && !ocr && !last.ocr && last.end===page-1)last.end=page;
    else result.push({start:page,end:page,ocr});
  }
  return result;
}
