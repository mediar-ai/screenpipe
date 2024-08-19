import { op_info } from "ext:core/ops";
function info(msg) {
  op_info(msg);
}

function fetch(url) {
  return ops.op_fetch(url);
}

globalThis.Extension = { info, fetch };
