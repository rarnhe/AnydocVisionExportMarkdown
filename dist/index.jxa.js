#!/usr/bin/osascript -l JavaScript
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/polyfills.ts
  var require_polyfills = __commonJS({
    "src/polyfills.ts"(exports) {
      var _Global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : exports || {};
      if (typeof _Global.TextDecoder === "undefined") {
        _Global.TextDecoder = class TextDecoder {
          constructor() {
            __publicField(this, "encoding", "utf-8");
          }
          decode(input) {
            if (!input) return "";
            const bytes = input instanceof Uint8Array ? input : new Uint8Array(input.buffer || input);
            if (typeof ObjC !== "undefined" && typeof $ !== "undefined" && $.NSString) {
              const nsData = $.NSData.dataWithBytesLength(bytes, bytes.length);
              const nsStr = $.NSString.alloc.initWithDataEncoding(nsData, $.NSUTF8StringEncoding);
              if (nsStr && nsStr != $.nil) return String(nsStr.js);
            }
            return String.fromCharCode.apply(null, Array.from(bytes));
          }
        };
      }
      if (typeof _Global.TextEncoder === "undefined") {
        _Global.TextEncoder = class TextEncoder {
          constructor() {
            __publicField(this, "encoding", "utf-8");
          }
          encode(input = "") {
            if (!input) return new Uint8Array(0);
            if (typeof ObjC !== "undefined" && typeof $ !== "undefined" && $.NSString) {
              const nsStr = $.NSString.stringWithString(input);
              const data = nsStr.dataUsingEncoding($.NSUTF8StringEncoding);
              const buf2 = new Uint8Array(Number(data.length));
              data.getBytesLength(buf2, buf2.length);
              return buf2;
            }
            const buf = new Uint8Array(input.length);
            for (let i = 0; i < input.length; i++) buf[i] = input.charCodeAt(i);
            return buf;
          }
        };
      }
      if (typeof _Global.process === "undefined") {
        _Global.process = {
          argv: ["osascript", "index.jxa.js"],
          env: {},
          exit: (code) => {
            if (typeof $ !== "undefined" && $.exit) $.exit(code);
          }
        };
      }
    }
  });

  // src/index.ts
  var import_polyfills2 = __toESM(require_polyfills());

  // node_modules/@firecrawl/anydoc-wasm/anydoc_wasm.js
  var import_polyfills = __toESM(require_polyfills(), 1);
  var import_meta = {};
  function toMarkdownBytes(bytes, format) {
    let deferred3_0;
    let deferred3_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
      const len0 = WASM_VECTOR_LEN;
      wasm.toMarkdownBytes(retptr, ptr0, len0, isLikeNone(format) ? 13 : (__wbindgen_enum_Format.indexOf(format) + 1 || 13) - 1);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr2 = r0;
      var len2 = r1;
      if (r3) {
        ptr2 = 0;
        len2 = 0;
        throw takeObject(r2);
      }
      deferred3_0 = ptr2;
      deferred3_1 = len2;
      return getStringFromWasm0(ptr2, len2);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
  }
  function __wbg_get_imports() {
    const import0 = {
      __proto__: null,
      __wbg_String_8564e559799eccda: function(arg0, arg1) {
        const ret = String(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
      },
      __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
      },
      __wbg_from_13e323c65fc8f464: function(arg0) {
        const ret = Array.from(getObject(arg0));
        return addHeapObject(ret);
      },
      __wbg_getRandomValues_cc7f052a444bb2ce: function() {
        return handleError(function(arg0, arg1) {
          globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments);
      },
      __wbg_new_32b398fb48b6d94a: function() {
        const ret = new Array();
        return addHeapObject(ret);
      },
      __wbg_new_b667d279fd5aa943: function(arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
      },
      __wbg_new_cd45aabdf6073e84: function(arg0) {
        const ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
      },
      __wbg_new_da52cf8fe3429cb2: function() {
        const ret = new Object();
        return addHeapObject(ret);
      },
      __wbg_push_d2ae3af0c1217ae6: function(arg0, arg1) {
        const ret = getObject(arg0).push(getObject(arg1));
        return ret;
      },
      __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
        getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
      },
      __wbg_set_8535240470bf2500: function() {
        return handleError(function(arg0, arg1, arg2) {
          const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
          return ret;
        }, arguments);
      },
      __wbg_set_8a16b38e4805b298: function(arg0, arg1, arg2) {
        getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
      },
      __wbindgen_cast_0000000000000001: function(arg0) {
        const ret = arg0;
        return addHeapObject(ret);
      },
      __wbindgen_cast_0000000000000002: function(arg0, arg1) {
        const ret = getArrayU8FromWasm0(arg0, arg1);
        return addHeapObject(ret);
      },
      __wbindgen_cast_0000000000000003: function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
      },
      __wbindgen_object_clone_ref: function(arg0) {
        const ret = getObject(arg0);
        return addHeapObject(ret);
      },
      __wbindgen_object_drop_ref: function(arg0) {
        takeObject(arg0);
      }
    };
    return {
      __proto__: null,
      "./anydoc_wasm_bg.js": import0
    };
  }
  var __wbindgen_enum_Format = ["doc", "docx", "odt", "pdf", "ppt", "pptx", "rtf", "epub", "xlsx", "ods", "odp", "csv"];
  function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
  }
  function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
  }
  function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
  }
  var cachedDataViewMemory0 = null;
  function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
      cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
  }
  function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
  }
  var cachedUint8ArrayMemory0 = null;
  function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
      cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
  }
  function getObject(idx) {
    return heap[idx];
  }
  function handleError(f, args) {
    try {
      return f.apply(this, args);
    } catch (e) {
      wasm.__wbindgen_export3(addHeapObject(e));
    }
  }
  var heap = new Array(1024).fill(void 0);
  heap.push(void 0, null, true, false);
  var heap_next = heap.length;
  function isLikeNone(x) {
    return x === void 0 || x === null;
  }
  function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
  }
  function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === void 0) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr2 = malloc(buf.length, 1) >>> 0;
      getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr2;
    }
    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;
    const mem = getUint8ArrayMemory0();
    let offset = 0;
    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 127) break;
      mem[ptr + offset] = code;
    }
    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
      const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
      const ret = cachedTextEncoder.encodeInto(arg, view);
      offset += ret.written;
      ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
  }
  function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
  }
  var cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
  cachedTextDecoder.decode();
  var MAX_SAFARI_DECODE_BYTES = 2146435072;
  var numBytesDecoded = 0;
  function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
      cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
      cachedTextDecoder.decode();
      numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
  }
  var cachedTextEncoder = new TextEncoder();
  if (!("encodeInto" in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function(arg, view) {
      const buf = cachedTextEncoder.encode(arg);
      view.set(buf);
      return {
        read: arg.length,
        written: buf.length
      };
    };
  }
  var WASM_VECTOR_LEN = 0;
  var wasmModule;
  var wasmInstance;
  var wasm;
  function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
  }
  async function __wbg_load(module, imports) {
    if (typeof Response === "function" && module instanceof Response) {
      if (typeof WebAssembly.instantiateStreaming === "function") {
        try {
          return await WebAssembly.instantiateStreaming(module, imports);
        } catch (e) {
          const validResponse = module.ok && expectedResponseType(module.type);
          if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
            console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
          } else {
            throw e;
          }
        }
      }
      const bytes = await module.arrayBuffer();
      return await WebAssembly.instantiate(bytes, imports);
    } else {
      const instance = await WebAssembly.instantiate(module, imports);
      if (instance instanceof WebAssembly.Instance) {
        return { instance, module };
      } else {
        return instance;
      }
    }
    function expectedResponseType(type) {
      switch (type) {
        case "basic":
        case "cors":
        case "default":
          return true;
      }
      return false;
    }
  }
  async function __wbg_init(module_or_path) {
    if (wasm !== void 0) return wasm;
    if (module_or_path !== void 0) {
      if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
        ({ module_or_path } = module_or_path);
      } else {
        console.warn("using deprecated parameters for the initialization function; pass a single object instead");
      }
    }
    if (module_or_path === void 0) {
      module_or_path = new URL("anydoc_wasm_bg.wasm", import_meta.url);
    }
    const imports = __wbg_get_imports();
    if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
      module_or_path = fetch(module_or_path);
    }
    const { instance, module } = await __wbg_load(await module_or_path, imports);
    return __wbg_finalize_init(instance, module);
  }

  // src/index.ts
  if (typeof ObjC !== "undefined") {
    try {
      ObjC.import("Foundation");
      ObjC.import("AppKit");
      ObjC.import("PDFKit");
      ObjC.import("Vision");
    } catch (e) {
    }
  }
  function safeLog(...args) {
    const message = args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
    if (typeof process !== "undefined" && process.stdout) {
      console.log(message);
    } else if (typeof $ !== "undefined" && $.NSFileHandle) {
      const str = $.NSString.stringWithString(message + "\n");
      const data = str.dataUsingEncoding($.NSUTF8StringEncoding);
      $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
    } else {
      console.log(message);
    }
  }
  var sys = {
    isNode() {
      return typeof process !== "undefined" && process.versions && !!process.versions.node && false;
    },
    resolvePath(...paths) {
      if (this.isNode()) return __require("path").resolve(...paths);
      return String($(paths.join("/")).stringByStandardizingPath.js);
    },
    dirname(p) {
      if (this.isNode()) return __require("path").dirname(p);
      return String($(p).stringByDeletingLastPathComponent.js);
    },
    basename(p) {
      if (this.isNode()) return __require("path").basename(p);
      return String($(p).lastPathComponent.js);
    },
    fileExists(p) {
      if (this.isNode()) return __require("fs").existsSync(p);
      return Boolean($.NSFileManager.defaultManager.fileExistsAtPath($(p)));
    },
    readFileBuffer(p) {
      if (this.isNode()) return new Uint8Array(__require("fs").readFileSync(p));
      const data = $.NSData.dataWithContentsOfFile($(p));
      if (!data || data == $.nil) throw new Error(`\u65E0\u6CD5\u8BFB\u53D6\u6587\u4EF6: ${p}`);
      const buf = new Uint8Array(Number(data.length));
      data.getBytesLength(buf, buf.length);
      return buf;
    },
    readFileText(p) {
      if (this.isNode()) return __require("fs").readFileSync(p, "utf-8");
      const nsStr = $.NSString.stringWithContentsOfFileEncodingError($(p), $.NSUTF8StringEncoding, Ref());
      return String(nsStr.js);
    },
    writeFileText(p, content) {
      if (this.isNode()) {
        __require("fs").writeFileSync(p, content, "utf-8");
        return;
      }
      $.NSString.stringWithString(content || "").writeToFileAtomicallyEncodingError(
        $(p),
        true,
        $.NSUTF8StringEncoding,
        Ref()
      );
    },
    removeDirRecursively(p) {
      if (this.isNode()) {
        __require("fs").rmSync(p, { recursive: true, force: true });
        return;
      }
      $.NSFileManager.defaultManager.removeItemAtPathError($(p), Ref());
    },
    getFileSize(p) {
      if (this.isNode()) return __require("fs").statSync(p).size;
      const attrs = $.NSFileManager.defaultManager.attributesOfItemAtPathError($(p), Ref());
      return Number(attrs.objectForKey($.NSFileSize));
    }
  };
  function executePdfSplitInJxa(rawPdfPath, ocrConfigString, outDirOption, dpi) {
    if (typeof ObjC !== "undefined") {
      try {
        ObjC.import("Foundation");
        ObjC.import("AppKit");
        ObjC.import("PDFKit");
        ObjC.import("Vision");
      } catch (e) {
      }
    } else {
      return { success: false, error: "\u975E JXA \u8FD0\u884C\u73AF\u5883" };
    }
    try {
      const expandPath = (p) => $(p).stringByExpandingTildeInPath.js;
      const pdfPath = expandPath(rawPdfPath);
      const pdfUrl = $.NSURL.fileURLWithPath($(pdfPath));
      const pdfDoc = $.PDFDocument.alloc.initWithURL(pdfUrl);
      if (!pdfDoc || pdfDoc == $.nil) return { success: false, error: `\u65E0\u6CD5\u6253\u5F00 PDF: ${pdfPath}` };
      const totalPages = Number(pdfDoc.pageCount);
      const outputDir = outDirOption ? expandPath(outDirOption) : String($(pdfPath).stringByDeletingPathExtension.js);
      const fm = $.NSFileManager.defaultManager;
      if (!fm.fileExistsAtPathIsDirectory($(outputDir), Ref())) {
        fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(outputDir), true, $({}), Ref());
      }
      const ocrPages = /* @__PURE__ */ new Set();
      if (ocrConfigString) {
        try {
          const data = JSON.parse(ocrConfigString);
          if (data && Array.isArray(data.pages)) {
            data.pages.forEach((p) => ocrPages.add(Number(p)));
          }
        } catch (e) {
        }
      }
      const tasks = [];
      let taskId = 1;
      let currentPage = 1;
      while (currentPage <= totalPages) {
        const chunkName = `chunk_${taskId}`;
        if (ocrPages.has(currentPage)) {
          tasks.push({ id: taskId, type: "png", pages: [currentPage, currentPage], outputFileName: chunkName });
          taskId++;
          currentPage++;
        } else {
          const startPage = currentPage;
          while (currentPage <= totalPages && !ocrPages.has(currentPage)) currentPage++;
          tasks.push({ id: taskId, type: "pdf", pages: [startPage, currentPage - 1], outputFileName: chunkName });
          taskId++;
        }
      }
      const scaleFactor = dpi / 72;
      for (const task of tasks) {
        const outPath = `${outputDir}/${task.outputFileName}.${task.type}`;
        if (task.type === "pdf") {
          const newDoc = $.PDFDocument.alloc.init;
          for (let p = task.pages[0]; p <= task.pages[1]; p++) {
            const page = pdfDoc.pageAtIndex(p - 1);
            if (page && page != $.nil) newDoc.insertPageAtIndex(page, newDoc.pageCount);
          }
          newDoc.writeToURL($.NSURL.fileURLWithPath($(outPath)));
        } else {
          const pdfPage = pdfDoc.pageAtIndex(task.pages[0] - 1);
          if (pdfPage && pdfPage != $.nil) {
            const pdfImageRep = $.NSPDFImageRep.imageRepWithData(pdfPage.dataRepresentation);
            const origSize = pdfImageRep.bounds.size;
            const pw = Math.round(origSize.width * scaleFactor);
            const ph = Math.round(origSize.height * scaleFactor);
            const bitmapRep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
              $.nil,
              pw,
              ph,
              8,
              4,
              true,
              false,
              $.NSCalibratedRGBColorSpace,
              0,
              32
            );
            const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(bitmapRep);
            $.NSGraphicsContext.saveGraphicsState;
            $.NSGraphicsContext.setCurrentContext(ctx);
            ctx.setImageInterpolation($.NSImageInterpolationHigh);
            const rect = $.NSMakeRect(0, 0, pw, ph);
            $.NSColor.whiteColor.set;
            $.NSBezierPath.fillRect(rect);
            pdfImageRep.drawInRect(rect);
            $.NSGraphicsContext.restoreGraphicsState;
            const pngData = bitmapRep.representationUsingTypeProperties($.NSPNGFileType, $({}));
            pngData.writeToFileAtomically($(outPath), true);
          }
        }
      }
      const manifest = {
        sourceFile: String($(pdfPath).lastPathComponent.js),
        totalPages,
        tasks
      };
      const manifestJson = JSON.stringify(manifest, null, 2);
      $.NSString.stringWithString(manifestJson).writeToFileAtomicallyEncodingError(
        $(`${outputDir}/manifest.json`),
        true,
        $.NSUTF8StringEncoding,
        Ref()
      );
      return { success: true, outputDir };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }
  function performVisionOcrInJxa(imagePath, targetLang) {
    if (typeof ObjC !== "undefined") {
      try {
        ObjC.import("Foundation");
        ObjC.import("AppKit");
        ObjC.import("Vision");
      } catch (e) {
      }
    } else {
      return "";
    }
    const fileURL = $.NSURL.fileURLWithPath($(imagePath));
    const request = $.VNRecognizeTextRequest.alloc.init;
    request.setRecognitionLevel($.VNRequestTextRecognitionLevelAccurate);
    request.setUsesLanguageCorrection(true);
    request.setRecognitionLanguages($([targetLang]));
    const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(fileURL, $({}));
    const error = Ref();
    if (!handler.performRequestsError($([request]), error)) return "";
    const results = request.results;
    if (!results || results == $.nil) return "";
    const rawResults = results.js || results;
    const count = rawResults.length || (results.count ? Number(results.count) : 0);
    const lines = [];
    for (let i = 0; i < count; i++) {
      const obs = rawResults[i] || results.objectAtIndex && results.objectAtIndex(i);
      if (!obs || obs == $.nil) continue;
      const candidates = obs.topCandidates(1);
      if (!candidates || candidates == $.nil) continue;
      const top = candidates.js && candidates.js[0] || candidates.objectAtIndex && candidates.objectAtIndex(0);
      if (top && top != $.nil) lines.push(String(top.string.js));
    }
    return lines.join("\n");
  }
  function extractOcrConfigFromErrorPayload(err) {
    if (!err) return "";
    if (Array.isArray(err.pages) && err.pages.length > 0) return JSON.stringify({ pages: err.pages });
    const errStr = typeof err === "string" ? err : err.message || String(err);
    const first = errStr.indexOf("{");
    const last = errStr.lastIndexOf("}");
    return first !== -1 && last > first ? errStr.substring(first, last + 1) : "";
  }
  function decodeMarkdownResult(rawRes) {
    if (!rawRes) return "";
    if (typeof rawRes === "string") return rawRes;
    const safeBytes = rawRes instanceof Uint8Array ? rawRes : new Uint8Array(rawRes.buffer || rawRes);
    const DecoderClass = globalThis.TextDecoder;
    if (DecoderClass) {
      try {
        return new DecoderClass("utf-8").decode(safeBytes);
      } catch (e) {
        return new DecoderClass().decode(safeBytes);
      }
    }
    return String.fromCharCode.apply(null, Array.from(safeBytes));
  }
  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  async function processAndExportDocument(inputFilePath) {
    if (!inputFilePath) throw new Error("\u672A\u6307\u5B9A\u8F93\u5165 PDF \u6587\u4EF6\u8DEF\u5F84");
    const absInputPath = sys.resolvePath(inputFilePath);
    const inputDir = sys.dirname(absInputPath);
    const baseName = sys.basename(absInputPath);
    const docName = baseName.lastIndexOf(".") > 0 ? baseName.substring(0, baseName.lastIndexOf(".")) : baseName;
    const finalMdPath = sys.resolvePath(inputDir, `${docName}.md`);
    const workDir = sys.resolvePath(inputDir, docName);
    if (sys.fileExists(finalMdPath)) {
      safeLog(`\u23E9 \u5DF2\u5B58\u5728\u5BFC\u51FA\u6587\u4EF6: ${finalMdPath} (${formatFileSize(sys.getFileSize(finalMdPath))})\uFF0C\u8DF3\u8FC7\u5904\u7406\u3002`);
      return;
    }
    safeLog(`\u{1F680} \u5F00\u59CB\u89E3\u6790\u6587\u6863: ${absInputPath}`);
    if (sys.isNode()) {
      const wasmPath = __require.resolve("@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm");
      await __wbg_init({ module_or_path: sys.readFileBuffer(wasmPath) });
    } else {
      safeLog(`\u{1F50D} 1`);
      const pwd = String($.NSFileManager.defaultManager.currentDirectoryPath.js);
      const args = $.NSProcessInfo.processInfo.arguments;
      let rawScriptPath = "";
      for (let i = 0; i < args.count; i++) {
        const arg = String(args.objectAtIndex(i).js);
        if (arg.endsWith(".jxa.js") || arg.includes("dist/")) {
          rawScriptPath = arg;
          break;
        }
      }
      if (!rawScriptPath) {
        rawScriptPath = String(args.objectAtIndex(args.count - 1).js);
      }
      const absScriptPath = String(
        $(pwd).stringByAppendingPathComponent(rawScriptPath).stringByStandardizingPath.js
      );
      const scriptDir = sys.dirname(absScriptPath);
      let wasmPath = sys.resolvePath(scriptDir, "anydoc_wasm_bg.wasm");
      if (!sys.fileExists(wasmPath)) {
        const rawWasmPath = sys.resolvePath(scriptDir, "../anydoc_wasm_bg.wasm");
        wasmPath = String($(rawWasmPath).stringByStandardizingPath.js);
      }
      safeLog(`Resolved WASM Path: ${wasmPath}`);
      if (!sys.fileExists(wasmPath)) {
        throw new Error(`[WASM Error] \u6587\u4EF6\u4E0D\u5B58\u5728\u4E8E\u8DEF\u5F84: ${wasmPath}`);
      }
      const wasmBuffer = sys.readFileBuffer(wasmPath);
      safeLog(`WASM Byte Length: ${wasmBuffer.length}`);
      await __wbg_init({ module_or_path: wasmBuffer });
      safeLog(`\u2705 WASM \u521D\u59CB\u5316\u6210\u529F\uFF01`);
    }
    let directMarkdown = "";
    let needsSplit = false;
    let ocrConfigJson = "";
    try {
      safeLog(`\u{1F50D} \u6267\u884C WASM \u9884\u68C0\u6D4B...`);
      directMarkdown = decodeMarkdownResult(toMarkdownBytes(inputBuffer));
    } catch (err) {
      needsSplit = true;
      ocrConfigJson = extractOcrConfigFromErrorPayload(err);
      safeLog(`\u26A0\uFE0F \u5305\u542B\u626B\u63CF\u9875/\u9700\u5206\u5207\u5904\u7406\uFF0C\u63D0\u53D6\u914D\u7F6E JSON: ${ocrConfigJson || "(\u7A7A)"}`);
    }
    if (!needsSplit) {
      sys.writeFileText(finalMdPath, directMarkdown);
      safeLog(`
\u{1F389} \u7535\u5B50\u7248 PDF \u8F6C\u6362\u5B8C\u6210\uFF01\u4FDD\u5B58\u81F3: ${finalMdPath}`);
      return;
    }
    safeLog(`\u2702\uFE0F \u542F\u52A8 PDF \u9875\u9762\u5206\u5207\u5F15\u64CE...`);
    let splitResult;
    if (sys.isNode()) {
      const { run: runJxa } = __require("@jxa/run");
      try {
        splitResult = await runJxa(
          (pdfPath, jsonConfig, targetDir, dpiVal, code) => {
            try {
              if (typeof globalThis.__name === "undefined") {
                globalThis.__name = (fn) => fn;
              }
              const execFn = new Function("return (" + code + ")")();
              return execFn(pdfPath, jsonConfig, targetDir, dpiVal);
            } catch (err) {
              return {
                success: false,
                error: "[JXA Bridge Split Error] " + (err ? err.message || String(err) : "\u672A\u77E5\u9519\u8BEF")
              };
            }
          },
          absInputPath,
          ocrConfigJson,
          workDir,
          200,
          executePdfSplitInJxa.toString()
        );
      } catch (err) {
        splitResult = { success: false, error: err?.message || String(err) };
      }
    } else {
      splitResult = executePdfSplitInJxa(absInputPath, ocrConfigJson, workDir, 200);
    }
    if (!splitResult.success) {
      safeLog(`\u274C PDF \u5206\u5207\u5931\u8D25: ${splitResult.error}`);
      if (sys.isNode()) process.exit(1);
      return;
    }
    const manifestPath = sys.resolvePath(workDir, "manifest.json");
    if (!sys.fileExists(manifestPath)) {
      safeLog(`\u274C \u672A\u627E\u5230\u6E05\u5355\u6587\u4EF6: ${manifestPath}`);
      if (sys.isNode()) process.exit(1);
      return;
    }
    const manifest = JSON.parse(sys.readFileText(manifestPath));
    safeLog(`\u{1F4CB} \u5305\u542B ${manifest.tasks.length} \u4E2A\u5206\u5757\u4EFB\u52A1\uFF0C\u5F00\u59CB\u9010\u5757 OCR / \u89E3\u6790...`);
    for (const task of manifest.tasks) {
      const chunkFileName = `${task.outputFileName}.${task.type}`;
      const chunkFilePath = sys.resolvePath(workDir, chunkFileName);
      const standardMdPath = sys.resolvePath(workDir, `${task.outputFileName}.md`);
      if (task.type === "pdf") {
        safeLog(`  [Chunk ${task.id}/${manifest.tasks.length}] \u89E3\u6790\u7535\u5B50\u9875: ${chunkFileName}`);
        const pdfBuffer = sys.readFileBuffer(chunkFilePath);
        const mdContent = decodeMarkdownResult(toMarkdownBytes(pdfBuffer));
        sys.writeFileText(standardMdPath, mdContent);
      } else {
        safeLog(`  [Chunk ${task.id}/${manifest.tasks.length}] Apple Vision OCR \u89E3\u6790\u626B\u63CF\u9875: ${chunkFileName}`);
        let ocrText = "";
        if (sys.isNode()) {
          const { run: runJxa } = __require("@jxa/run");
          try {
            ocrText = await runJxa(
              (imgPath, lang, code) => {
                try {
                  if (typeof globalThis.__name === "undefined") {
                    globalThis.__name = (fn) => fn;
                  }
                  const execFn = new Function("return (" + code + ")")();
                  return execFn(imgPath, lang);
                } catch (err) {
                  return "";
                }
              },
              chunkFilePath,
              "zh-Hans",
              performVisionOcrInJxa.toString()
            );
          } catch (e) {
            ocrText = "";
          }
        } else {
          ocrText = performVisionOcrInJxa(chunkFilePath, "zh-Hans");
        }
        sys.writeFileText(standardMdPath, ocrText);
      }
    }
    safeLog(`\u{1F9F5} \u7F1D\u5408\u6240\u6709\u5757\u6587\u672C...`);
    const segments = [];
    for (const task of manifest.tasks) {
      const mdPath = sys.resolvePath(workDir, `${task.outputFileName}.md`);
      if (sys.fileExists(mdPath)) {
        const content = sys.readFileText(mdPath).trim();
        if (content) segments.push(content);
      }
    }
    sys.writeFileText(finalMdPath, segments.join("\n\n---\n\n"));
    safeLog(`\u{1F9F9} \u6E05\u7406\u4E34\u65F6\u5DE5\u4F5C\u76EE\u5F55: ${workDir}`);
    sys.removeDirRecursively(workDir);
    safeLog(`
\u{1F389} \u89E3\u6790\u5B8C\u6210\uFF01\u6700\u7EC8\u6587\u4EF6: ${finalMdPath} (${formatFileSize(sys.getFileSize(finalMdPath))})`);
  }
  if (sys.isNode()) {
    const args = process.argv.slice(2);
    if (args.length > 0) {
      processAndExportDocument(args[0]).catch((err) => {
        safeLog("\u274C \u6267\u884C\u8FC7\u7A0B\u4E2D\u53D1\u751F\u672A\u6355\u83B7\u5F02\u5E38:", err);
        process.exit(1);
      });
    } else {
      safeLog("\u26A0\uFE0F \u8BF7\u63D0\u4F9B PDF \u6587\u4EF6\u8DEF\u5F84\u3002");
    }
  } else {
    try {
      let targetFilePath = "";
      const rawArgs = $.NSProcessInfo.processInfo.arguments;
      const count = Number(rawArgs.count);
      let scriptIdx = -1;
      for (let i = 0; i < count; i++) {
        const arg = String(rawArgs.objectAtIndex(i).js);
        if (/\.(jxa|js)$/i.test(arg)) {
          scriptIdx = i;
          break;
        }
      }
      const startIdx = scriptIdx !== -1 ? scriptIdx + 1 : 1;
      for (let i = startIdx; i < count; i++) {
        const arg = String(rawArgs.objectAtIndex(i).js);
        if (!arg.startsWith("-") && arg !== "JavaScript") {
          targetFilePath = arg;
          break;
        }
      }
      if (targetFilePath) {
        let isDone = false;
        let errorOccurred = null;
        processAndExportDocument(targetFilePath).then(() => isDone = true).catch((err) => {
          errorOccurred = err;
          isDone = true;
        });
        const runLoop = $.NSRunLoop.currentRunLoop;
        while (!isDone) {
          runLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
        }
        if (errorOccurred) {
          safeLog(`\u274C [Execution Error]: ${errorOccurred?.message || errorOccurred}`);
          if (typeof $ !== "undefined" && $.exit) $.exit(1);
        } else {
          if (typeof $ !== "undefined" && $.exit) $.exit(0);
        }
      }
    } catch (err) {
      safeLog("\u274C [JXA Global Error]", err?.message || String(err));
      if (typeof $ !== "undefined" && $.exit) $.exit(1);
    }
  }
})();
