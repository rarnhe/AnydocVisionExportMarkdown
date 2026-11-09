/** Structured AnyDoc OCR request. Page numbers are 1-based. */
export interface OcrRequest { pages: number[]; pageCount: number }

function validateRequest(value: {pages?:unknown;pageCount?:unknown}): OcrRequest {
  if (!Number.isSafeInteger(value.pageCount) || Number(value.pageCount) < 1 ||
      !Array.isArray(value.pages) || value.pages.length === 0)
    throw new Error("Malformed needsOcr metadata: missing pages or pageCount");
  const count=Number(value.pageCount), raw=value.pages as unknown[];
  if(raw.some(p=>!Number.isSafeInteger(p)||Number(p)<1||Number(p)>count))
    throw new Error("Malformed needsOcr metadata: invalid page index");
  return {pages:[...new Set(raw as number[])].sort((a,b)=>a-b),pageCount:count};
}

/** Parse AnyDoc's structured payload or its current human-readable WASM error. */
export function parseNeedsOcr(error: unknown): OcrRequest | null {
  if(error && typeof error==="object") {
    const value=error as {code?:unknown;pages?:unknown;pageCount?:unknown;message?:unknown;cause?:unknown};
    if(value.code==="needsOcr" || value.pages!==undefined) {
      if(value.code!==undefined && value.code!=="needsOcr")return null;
      return validateRequest(value);
    }
    if(typeof value.message==="string") {
      const parsed=parseNeedsOcr(value.message);
      if(parsed)return parsed;
    }
    if(value.cause!==undefined)return parseNeedsOcr(value.cause);
    return null;
  }
  if(typeof error!=="string")return null;
  const message=error.trim();

  // Some wasm-bindgen versions include a JSON/object payload in Error.message.
  const jsonStart=message.indexOf("{"),jsonEnd=message.lastIndexOf("}");
  if(jsonStart>=0&&jsonEnd>jsonStart) {
    const candidate=message.slice(jsonStart,jsonEnd+1);
    try {
      const value=JSON.parse(candidate) as {code?:unknown;pages?:unknown;pageCount?:unknown};
      if(value.code==="needsOcr")return validateRequest(value);
    } catch { /* Fall through to the stable textual format below. */ }
  }

  // Actual AnyDoc error format, e.g. "Error: pages 12, 17, 20-56 of 56 need OCR".
  const match=message.match(/pages?\s+([\d\s,;–—-]+?)\s+of\s+(\d+)\s+(?:need|needs)\s+OCR/i);
  if(!match)return null;
  const pageCount=Number(match[2]);
  if(!Number.isSafeInteger(pageCount)||pageCount<1)
    throw new Error("Malformed needsOcr message: invalid page count");
  const pages:number[]=[];
  for(const token of match[1].split(/[,;]+/).map(part=>part.trim()).filter(Boolean)) {
    const range=token.match(/^(\d+)\s*(?:-|–|—)\s*(\d+)$/);
    if(range) {
      const start=Number(range[1]),end=Number(range[2]);
      if(start<1||end<start||end>pageCount||end-start>pageCount)
        throw new Error("Malformed needsOcr message: invalid page range "+token);
      for(let page=start;page<=end;page++)pages.push(page);
    } else if(/^\d+$/.test(token)) pages.push(Number(token));
    else throw new Error("Malformed needsOcr message: invalid page list "+token);
  }
  return validateRequest({pages,pageCount});
}

/** Split into ordered consecutive text ranges and isolated OCR pages. */
export function planOcrPages(request: OcrRequest): Array<{start:number;end:number;ocr:boolean}> {
  const flagged=new Set(request.pages),result:Array<{start:number;end:number;ocr:boolean}>=[];
  for(let page=1;page<=request.pageCount;page++) {
    const ocr=flagged.has(page),last=result[result.length-1];
    if(last&&!ocr&&!last.ocr&&last.end===page-1)last.end=page;
    else result.push({start:page,end:page,ocr});
  }
  return result;
}
