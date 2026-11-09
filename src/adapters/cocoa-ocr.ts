import {decodeBase64} from "../shared/base64";
import {AnyDocEngine} from "../core/engine";
import {planOcrPages, type OcrRequest} from "../core/needs-ocr";
declare const ObjC:any;
declare const $:any;
function ns(s:string):any {return $.NSString.stringWithString(s);}
function str(v:any):string {return String(ObjC.unwrap(v));}
function write(data:any,path:string):void {
  if(!data || !data.writeToFileAtomically(ns(path),true))throw new Error("Cannot write temporary PDF/image: "+path);
}
function ocrImage(path:string):string {
  const url=$.NSURL.fileURLWithPath(ns(path));
  const request=$.VNRecognizeTextRequest.alloc.init;
  request.setRecognitionLevel($.VNRequestTextRecognitionLevelAccurate);
  request.setUsesLanguageCorrection(true);
  const languages=["zh-Hans","en-US"];
  request.setRecognitionLanguages($(languages));
  const handler=$.VNImageRequestHandler.alloc.initWithURLOptions(url,$.NSDictionary.dictionary);
  if(!handler.performRequestsError($([request]),null))
    throw new Error("Vision OCR failed: "+path);
  const observations=request.results;
  const count=observations?Number(observations.count):0;
  const lines:string[]=[];
  for(let i=0;i<count;i++){
    const item=observations.objectAtIndex(i);
    const candidates=item.topCandidates(1);
    if(candidates && Number(candidates.count)>0){
      const line=str(candidates.objectAtIndex(0).string);
      if(line.trim())lines.push(line);
    }
  }
  if(!lines.length)throw new Error("Vision OCR returned no text: "+path);
  return lines.join("\n");
}
/**
 * JXA-only PDFKit + Vision fallback. No JSC, NSTask, npm OCR library or
 * additional WASM instance. Temporary chunks are removed even on failure.
 */
export function recoverWithCocoaPdfKit(
  input:string, request:OcrRequest, engine:AnyDocEngine
):string {
  ObjC.import("Foundation");ObjC.import("AppKit");ObjC.import("PDFKit");ObjC.import("Vision");
  const document=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(ns(input)));
  if(!document)throw new Error("PDFKit cannot open source: "+input);
  if(Number(document.pageCount)!==request.pageCount)
    throw new Error("PDFKit/AnyDoc page count mismatch: "+document.pageCount+" vs "+request.pageCount);
  const manager=$.NSFileManager.defaultManager;
  const uuid=str($.NSUUID.UUID.UUIDString);
  const temp=str($.NSTemporaryDirectory()).replace(/\/$/,"")+"/anydoc-ocr-"+uuid;
  if(!manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
    ns(temp),true,$.NSDictionary.dictionary,null))throw new Error("Cannot create OCR temporary directory");
  try {
    const chunks:string[]=[];
    for(const task of planOcrPages(request)){
      if(task.ocr){
        const page=document.pageAtIndex(task.start-1);
        if(!page)throw new Error("PDFKit page missing: "+task.start);
        const image=page.thumbnailOfSizeForBox($.NSMakeSize(2200,3100),$.kPDFDisplayBoxMediaBox);
        if(!image)throw new Error("PDFKit could not render page "+task.start);
        const tiff=image.TIFFRepresentation;
        const bitmap=$.NSBitmapImageRep.imageRepWithData(tiff);
        if(!bitmap)throw new Error("Cannot encode OCR image for page "+task.start);
        const png=bitmap.representationUsingTypeProperties($.NSPNGFileType,$.NSDictionary.dictionary);
        const path=temp+"/page-"+task.start+".png";
        write(png,path);
        chunks.push("<!-- page "+task.start+" (Vision OCR) -->\n\n"+ocrImage(path));
      }else{
        const sub=$.PDFDocument.alloc.init;
        for(let page=task.start;page<=task.end;page++){
          const item=document.pageAtIndex(page-1);
          if(!item)throw new Error("PDFKit page missing: "+page);
          sub.insertPageAtIndex(item,Number(sub.pageCount));
        }
        const path=temp+"/pages-"+task.start+"-"+task.end+".pdf";
        if(!sub.writeToURL($.NSURL.fileURLWithPath(ns(path))))
          throw new Error("PDFKit cannot split text pages "+task.start+"-"+task.end);
        const data=$.NSData.dataWithContentsOfFile(ns(path));
        if(!data)throw new Error("Cannot read temporary PDF "+path);
        const bytes=decodeBase64(str(data.base64EncodedStringWithOptions(0)));
        chunks.push("<!-- pages "+task.start+"-"+task.end+" (AnyDoc) -->\n\n"+engine.convertPdf(bytes));
      }
    }
    return chunks.join("\n\n---\n\n")+"\n";
  } finally {
    if(!manager.removeItemAtPathError(ns(temp),null))
      throw new Error("Cannot remove OCR temporary directory: "+temp);
  }
}
