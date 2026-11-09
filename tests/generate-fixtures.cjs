#!/usr/bin/env node
"use strict";
/* Generate compact, valid OOXML regression fixtures from PDFKit-extracted
 * text of tests/chunk_1.pdf. macOS only, no npm dependency. */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"anydoc-fixtures-"));
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const write=(base,name,data)=>{const file=path.join(base,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
function pack(name,parts){
  const dir=path.join(tmp,name);fs.mkdirSync(dir,{recursive:true});
  for(const [file,data] of Object.entries(parts))write(dir,file,data);
  const result=spawnSync("/usr/bin/zip",["-q","-r",path.join(root,name),"."],{cwd:dir,encoding:"utf8"});
  if(result.status!==0)throw Error("zip "+name+": "+result.stderr);
}
const jxa=path.join(tmp,"pdf-text.js");
fs.writeFileSync(jxa,'ObjC.import("Foundation");ObjC.import("PDFKit");function run(argv){var doc=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(argv[0])));if(!doc)throw Error("PDFKit open failed");return ObjC.unwrap(doc.string);}');
const result=spawnSync("osascript",["-l","JavaScript",jxa,path.join(root,"chunk_1.pdf")],{encoding:"utf8",maxBuffer:8*1024*1024});
if(result.status!==0)throw Error("PDFKit text extraction: "+result.stderr);
const lines=result.stdout.split(/\r?\n/).map(x=>x.trim()).filter(x=>x.length>12).slice(0,18);
if(lines.length<2)throw Error("PDFKit extracted insufficient text from chunk_1.pdf");
const title=lines[0].slice(0,140), paragraphs=lines.slice(0,12).map(x=>x.slice(0,350));
const types='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
const rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
const docParas=paragraphs.map(t=>'<w:p><w:r><w:t xml:space="preserve">'+esc(t)+'</w:t></w:r></w:p>').join("");
pack("chunk_1.docx",{
 "[Content_Types].xml":types+'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
 "_rels/.rels":rels+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 "word/document.xml":'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+docParas+'<w:sectPr/></w:body></w:document>'
});
const slideText=[title,...paragraphs.slice(0,5)].join(" — ").slice(0,1100);
pack("chunk_1.pptx",{
 "[Content_Types].xml":types+'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
 "_rels/.rels":rels+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
 "ppt/presentation.xml":'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
 "ppt/_rels/presentation.xml.rels":rels+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
 "ppt/slides/slide1.xml":'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Extracted PDF text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="300000" y="300000"/><a:ext cx="8400000" cy="4500000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>'+esc(slideText)+'</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
});
const rows=[["Page","Extracted text"],...paragraphs.map((p,i)=>[String(i+1),p])];
const sheetRows=rows.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((v,j)=>'<c r="'+(j?"B":"A")+(i+1)+'" t="inlineStr"><is><t>'+esc(v)+'</t></is></c>').join("")+'</row>').join("");
pack("chunk_1.xlsx",{
 "[Content_Types].xml":types+'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 "_rels/.rels":rels+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 "xl/workbook.xml":'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PDF text" sheetId="1" r:id="rId1"/></sheets></workbook>',
 "xl/_rels/workbook.xml.rels":rels+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 "xl/worksheets/sheet1.xml":'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+sheetRows+'</sheetData></worksheet>'
});
fs.rmSync(tmp,{recursive:true,force:true});
console.log("Generated DOCX/PPTX/XLSX from PDFKit text: "+title);
