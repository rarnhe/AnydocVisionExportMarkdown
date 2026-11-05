/* ES5-compatible JXA host capability probe, executed by osascript. */
var PREFIX = "JXA_RESULT=";
function collect() {
  var data = {schema:1, globals:{}, capabilities:{}};
  var names = ["ObjC","$","Application","WebAssembly","Promise","BigInt",
    "SharedArrayBuffer","Atomics","console","require",
    "process","fetch","XMLHttpRequest","setTimeout"];
  for (var i=0;i<names.length;i++) {
    try { data.globals[names[i]] = typeof this[names[i]]; }
    catch (e) { data.globals[names[i]] = "error: " + String(e); }
  }
  function check(name, present, fn) {
    if (!present) {
      data.capabilities[name] = {status:"unavailable",detail:"API not exposed"};
      return;
    }
    try {
      var value = fn();
      data.capabilities[name] = {status:"supported", detail:String(value)};
    } catch (e) {
      data.capabilities[name] = {status:"error", detail:String(e)};
    }
  }
  function presence(name, present) {
    check(name,present,function(){return "API present; not invoked";});
  }
  check("js.json",typeof JSON !== "undefined",function(){
    if (JSON.parse('{"x":1}').x !== 1) throw Error("JSON mismatch");
    return "JSON parse OK";
  });
  check("js.typed_array",typeof Uint8Array === "function",function(){
    var a=new Uint8Array([0,97,115,109]);
    if(a.length !== 4 || a[1] !== 97) throw Error("TypedArray mismatch");
    return "Uint8Array OK";
  });
  presence("js.promise_api",typeof Promise === "function");
  presence("js.bigint_api",typeof BigInt === "function");
  presence("js.shared_array_buffer_api",typeof SharedArrayBuffer === "function");
  presence("js.atomics_api",typeof Atomics === "object");
  presence("host.console",typeof console !== "undefined" && typeof console.log === "function");
  presence("host.node_require",typeof require === "function");
  presence("host.node_process",typeof process !== "undefined");
  presence("host.fetch",typeof fetch === "function");
  presence("host.xml_http_request",typeof XMLHttpRequest === "function");
  presence("host.set_timeout",typeof setTimeout === "function");

  var wasm=typeof WebAssembly !== "undefined";
  check("wasm.empty_module_instance",wasm && typeof WebAssembly.Module === "function"
    && typeof WebAssembly.Instance === "function",function(){
    var bytes=new Uint8Array([0,97,115,109,1,0,0,0]);
    var module=new WebAssembly.Module(bytes);
    var instance=new WebAssembly.Instance(module);
    if (!instance || !instance.exports) throw Error("Bad instance");
    return "8-byte empty WASM module instantiated";
  });
  check("wasm.exported_add_function",wasm && typeof WebAssembly.Module === "function"
    && typeof WebAssembly.Instance === "function",function(){
    /* 41-byte wasm module exports add(i32, i32) -> i32. */
    var bytes=new Uint8Array([
      0,97,115,109,1,0,0,0,
      1,7,1,96,2,127,127,1,127,
      3,2,1,0,
      7,7,1,3,97,100,100,0,0,
      10,9,1,7,0,32,0,32,1,106,11
    ]);
    var instance=new WebAssembly.Instance(new WebAssembly.Module(bytes));
    if(typeof instance.exports.add !== "function") throw Error("Exported add missing");
    if(instance.exports.add(20,22) !== 42) throw Error("WASM result mismatch");
    return "WASM export add(20,22) = 42";
  });
  check("wasm.validate",wasm && typeof WebAssembly.validate === "function",function(){
    if(!WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0])))
      throw Error("WASM validation failed");
    return "valid empty WASM module";
  });
  check("wasm.memory",wasm && typeof WebAssembly.Memory === "function",function(){
    var memory=new WebAssembly.Memory({initial:1});
    if(memory.buffer.byteLength !== 65536) throw Error("Memory size mismatch");
    return "one 64KiB page";
  });
  presence("wasm.compile_async_api",wasm && typeof WebAssembly.compile === "function");
  presence("wasm.instantiate_async_api",wasm && typeof WebAssembly.instantiate === "function");
  presence("wasm.compile_streaming_api",wasm && typeof WebAssembly.compileStreaming === "function");
  presence("wasm.instantiate_streaming_api",wasm && typeof WebAssembly.instantiateStreaming === "function");
  presence("objc.global",typeof ObjC !== "undefined");
  check("objc.foundation_import",typeof ObjC !== "undefined" &&
      typeof ObjC.import === "function",function(){
    ObjC.import("Foundation");
    if(typeof $ === "undefined" || typeof $.NSString === "undefined")
      throw Error("NSString missing");
    return "Foundation NSString available";
  });
  check("objc.foundation_fs_roundtrip",typeof ObjC !== "undefined" &&
      typeof ObjC.import === "function",function(){
    ObjC.import("Foundation");
    var dir=ObjC.unwrap($.NSTemporaryDirectory());
    var path=dir + "/JxaVsJsc-" + String(Date.now()) + ".txt";
    var manager=$.NSFileManager.defaultManager;
    var value=$.NSString.stringWithString("JxaVsJsc");
    var wrote=false;
    try {
      wrote=value.writeToFileAtomicallyEncodingError(
        path,true,$.NSUTF8StringEncoding,null);
      if(!wrote) throw Error("NSString write failed");
      var read=$.NSString.stringWithContentsOfFileEncodingError(
        path,$.NSUTF8StringEncoding,null);
      if(ObjC.unwrap(read) !== "JxaVsJsc") throw Error("Readback mismatch");
      return "temporary file write/read success";
    } finally {
      if(wrote) manager.removeItemAtPathError(path,null);
    }
  });
  check("objc.appkit_import",typeof ObjC !== "undefined" &&
      typeof ObjC.import === "function",function(){
    ObjC.import("AppKit");
    if(typeof $.NSApplication === "undefined") throw Error("NSApplication missing");
    return "AppKit imported; no GUI operation";
  });
  presence("objc.register_subclass_api",typeof ObjC !== "undefined" &&
    typeof ObjC.registerSubclass === "function");
  presence("automation.application_global",typeof Application === "function");
  check("automation.current_application",typeof Application === "function"
    && typeof Application.currentApplication === "function",function(){
    if(!Application.currentApplication()) throw Error("No proxy");
    return "current application proxy constructed";
  });
  data.capabilities["automation.other_app_control"] = {
    status:"not_tested",detail:"Requires GUI and TCC Automation permission; no app controlled"
  };
  data.capabilities["objc.gui_control"] = {
    status:"not_tested",detail:"AppKit import does not establish TCC/GUI permission"
  };
  return data;
}
function run(argv) { return PREFIX+JSON.stringify(collect()); }

