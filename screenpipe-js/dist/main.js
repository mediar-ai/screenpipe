import {createRequire} from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = createRequire(import.meta.url);

// node_modules/node-cron/src/task.js
var require_task = __commonJS((exports, module) => {
  var EventEmitter = __require("events");

  class Task extends EventEmitter {
    constructor(execution) {
      super();
      if (typeof execution !== "function") {
        throw "execution must be a function";
      }
      this._execution = execution;
    }
    execute(now) {
      let exec;
      try {
        exec = this._execution(now);
      } catch (error) {
        return this.emit("task-failed", error);
      }
      if (exec instanceof Promise) {
        return exec.then(() => this.emit("task-finished")).catch((error) => this.emit("task-failed", error));
      } else {
        this.emit("task-finished");
        return exec;
      }
    }
  }
  module.exports = Task;
});

// node_modules/node-cron/src/convert-expression/month-names-conversion.js
var require_month_names_conversion = __commonJS((exports, module) => {
  module.exports = (() => {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december"
    ];
    const shortMonths = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec"
    ];
    function convertMonthName(expression, items) {
      for (let i = 0;i < items.length; i++) {
        expression = expression.replace(new RegExp(items[i], "gi"), parseInt(i, 10) + 1);
      }
      return expression;
    }
    function interprete(monthExpression) {
      monthExpression = convertMonthName(monthExpression, months);
      monthExpression = convertMonthName(monthExpression, shortMonths);
      return monthExpression;
    }
    return interprete;
  })();
});

// node_modules/node-cron/src/convert-expression/week-day-names-conversion.js
var require_week_day_names_conversion = __commonJS((exports, module) => {
  module.exports = (() => {
    const weekDays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday"
    ];
    const shortWeekDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    function convertWeekDayName(expression, items) {
      for (let i = 0;i < items.length; i++) {
        expression = expression.replace(new RegExp(items[i], "gi"), parseInt(i, 10));
      }
      return expression;
    }
    function convertWeekDays(expression) {
      expression = expression.replace("7", "0");
      expression = convertWeekDayName(expression, weekDays);
      return convertWeekDayName(expression, shortWeekDays);
    }
    return convertWeekDays;
  })();
});

// node_modules/node-cron/src/convert-expression/asterisk-to-range-conversion.js
var require_asterisk_to_range_conversion = __commonJS((exports, module) => {
  module.exports = (() => {
    function convertAsterisk(expression, replecement) {
      if (expression.indexOf("*") !== -1) {
        return expression.replace("*", replecement);
      }
      return expression;
    }
    function convertAsterisksToRanges(expressions) {
      expressions[0] = convertAsterisk(expressions[0], "0-59");
      expressions[1] = convertAsterisk(expressions[1], "0-59");
      expressions[2] = convertAsterisk(expressions[2], "0-23");
      expressions[3] = convertAsterisk(expressions[3], "1-31");
      expressions[4] = convertAsterisk(expressions[4], "1-12");
      expressions[5] = convertAsterisk(expressions[5], "0-6");
      return expressions;
    }
    return convertAsterisksToRanges;
  })();
});

// node_modules/node-cron/src/convert-expression/range-conversion.js
var require_range_conversion = __commonJS((exports, module) => {
  module.exports = (() => {
    function replaceWithRange(expression, text, init, end) {
      const numbers = [];
      let last = parseInt(end);
      let first = parseInt(init);
      if (first > last) {
        last = parseInt(init);
        first = parseInt(end);
      }
      for (let i = first;i <= last; i++) {
        numbers.push(i);
      }
      return expression.replace(new RegExp(text, "i"), numbers.join());
    }
    function convertRange(expression) {
      const rangeRegEx = /(\d+)-(\d+)/;
      let match = rangeRegEx.exec(expression);
      while (match !== null && match.length > 0) {
        expression = replaceWithRange(expression, match[0], match[1], match[2]);
        match = rangeRegEx.exec(expression);
      }
      return expression;
    }
    function convertAllRanges(expressions) {
      for (let i = 0;i < expressions.length; i++) {
        expressions[i] = convertRange(expressions[i]);
      }
      return expressions;
    }
    return convertAllRanges;
  })();
});

// node_modules/node-cron/src/convert-expression/step-values-conversion.js
var require_step_values_conversion = __commonJS((exports, module) => {
  module.exports = (() => {
    function convertSteps(expressions) {
      var stepValuePattern = /^(.+)\/(\w+)$/;
      for (var i = 0;i < expressions.length; i++) {
        var match = stepValuePattern.exec(expressions[i]);
        var isStepValue = match !== null && match.length > 0;
        if (isStepValue) {
          var baseDivider = match[2];
          if (isNaN(baseDivider)) {
            throw baseDivider + " is not a valid step value";
          }
          var values = match[1].split(",");
          var stepValues = [];
          var divider = parseInt(baseDivider, 10);
          for (var j = 0;j <= values.length; j++) {
            var value = parseInt(values[j], 10);
            if (value % divider === 0) {
              stepValues.push(value);
            }
          }
          expressions[i] = stepValues.join(",");
        }
      }
      return expressions;
    }
    return convertSteps;
  })();
});

// node_modules/node-cron/src/convert-expression/index.js
var require_convert_expression = __commonJS((exports, module) => {
  var monthNamesConversion = require_month_names_conversion();
  var weekDayNamesConversion = require_week_day_names_conversion();
  var convertAsterisksToRanges = require_asterisk_to_range_conversion();
  var convertRanges = require_range_conversion();
  var convertSteps = require_step_values_conversion();
  module.exports = (() => {
    function appendSeccondExpression(expressions) {
      if (expressions.length === 5) {
        return ["0"].concat(expressions);
      }
      return expressions;
    }
    function removeSpaces(str) {
      return str.replace(/\s{2,}/g, " ").trim();
    }
    function normalizeIntegers(expressions) {
      for (let i = 0;i < expressions.length; i++) {
        const numbers = expressions[i].split(",");
        for (let j = 0;j < numbers.length; j++) {
          numbers[j] = parseInt(numbers[j]);
        }
        expressions[i] = numbers;
      }
      return expressions;
    }
    function interprete(expression) {
      let expressions = removeSpaces(expression).split(" ");
      expressions = appendSeccondExpression(expressions);
      expressions[4] = monthNamesConversion(expressions[4]);
      expressions[5] = weekDayNamesConversion(expressions[5]);
      expressions = convertAsterisksToRanges(expressions);
      expressions = convertRanges(expressions);
      expressions = convertSteps(expressions);
      expressions = normalizeIntegers(expressions);
      return expressions.join(" ");
    }
    return interprete;
  })();
});

// node_modules/node-cron/src/pattern-validation.js
var require_pattern_validation = __commonJS((exports, module) => {
  function isValidExpression(expression, min, max) {
    const options = expression.split(",");
    for (const option of options) {
      const optionAsInt = parseInt(option, 10);
      if (!Number.isNaN(optionAsInt) && (optionAsInt < min || optionAsInt > max) || !validationRegex.test(option))
        return false;
    }
    return true;
  }
  function isInvalidSecond(expression) {
    return !isValidExpression(expression, 0, 59);
  }
  function isInvalidMinute(expression) {
    return !isValidExpression(expression, 0, 59);
  }
  function isInvalidHour(expression) {
    return !isValidExpression(expression, 0, 23);
  }
  function isInvalidDayOfMonth(expression) {
    return !isValidExpression(expression, 1, 31);
  }
  function isInvalidMonth(expression) {
    return !isValidExpression(expression, 1, 12);
  }
  function isInvalidWeekDay(expression) {
    return !isValidExpression(expression, 0, 7);
  }
  function validateFields(patterns, executablePatterns) {
    if (isInvalidSecond(executablePatterns[0]))
      throw new Error(`${patterns[0]} is a invalid expression for second`);
    if (isInvalidMinute(executablePatterns[1]))
      throw new Error(`${patterns[1]} is a invalid expression for minute`);
    if (isInvalidHour(executablePatterns[2]))
      throw new Error(`${patterns[2]} is a invalid expression for hour`);
    if (isInvalidDayOfMonth(executablePatterns[3]))
      throw new Error(`${patterns[3]} is a invalid expression for day of month`);
    if (isInvalidMonth(executablePatterns[4]))
      throw new Error(`${patterns[4]} is a invalid expression for month`);
    if (isInvalidWeekDay(executablePatterns[5]))
      throw new Error(`${patterns[5]} is a invalid expression for week day`);
  }
  function validate(pattern) {
    if (typeof pattern !== "string")
      throw new TypeError("pattern must be a string!");
    const patterns = pattern.split(" ");
    const executablePatterns = convertExpression(pattern).split(" ");
    if (patterns.length === 5)
      patterns.unshift("0");
    validateFields(patterns, executablePatterns);
  }
  var convertExpression = require_convert_expression();
  var validationRegex = /^(?:\d+|\*|\*\/\d+)$/;
  module.exports = validate;
});

// node_modules/node-cron/src/time-matcher.js
var require_time_matcher = __commonJS((exports, module) => {
  function matchPattern(pattern, value) {
    if (pattern.indexOf(",") !== -1) {
      const patterns = pattern.split(",");
      return patterns.indexOf(value.toString()) !== -1;
    }
    return pattern === value.toString();
  }
  var validatePattern = require_pattern_validation();
  var convertExpression = require_convert_expression();

  class TimeMatcher {
    constructor(pattern, timezone) {
      validatePattern(pattern);
      this.pattern = convertExpression(pattern);
      this.timezone = timezone;
      this.expressions = this.pattern.split(" ");
      this.dtf = this.timezone ? new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        fractionalSecondDigits: 3,
        timeZone: this.timezone
      }) : null;
    }
    match(date) {
      date = this.apply(date);
      const runOnSecond = matchPattern(this.expressions[0], date.getSeconds());
      const runOnMinute = matchPattern(this.expressions[1], date.getMinutes());
      const runOnHour = matchPattern(this.expressions[2], date.getHours());
      const runOnDay = matchPattern(this.expressions[3], date.getDate());
      const runOnMonth = matchPattern(this.expressions[4], date.getMonth() + 1);
      const runOnWeekDay = matchPattern(this.expressions[5], date.getDay());
      return runOnSecond && runOnMinute && runOnHour && runOnDay && runOnMonth && runOnWeekDay;
    }
    apply(date) {
      if (this.dtf) {
        return new Date(this.dtf.format(date));
      }
      return date;
    }
  }
  module.exports = TimeMatcher;
});

// node_modules/node-cron/src/scheduler.js
var require_scheduler = __commonJS((exports, module) => {
  var EventEmitter = __require("events");
  var TimeMatcher = require_time_matcher();

  class Scheduler extends EventEmitter {
    constructor(pattern, timezone, autorecover) {
      super();
      this.timeMatcher = new TimeMatcher(pattern, timezone);
      this.autorecover = autorecover;
    }
    start() {
      this.stop();
      let lastCheck = process.hrtime();
      let lastExecution = this.timeMatcher.apply(new Date);
      const matchTime = () => {
        const delay = 1000;
        const elapsedTime = process.hrtime(lastCheck);
        const elapsedMs = (elapsedTime[0] * 1e9 + elapsedTime[1]) / 1e6;
        const missedExecutions = Math.floor(elapsedMs / 1000);
        for (let i = missedExecutions;i >= 0; i--) {
          const date = new Date(new Date().getTime() - i * 1000);
          let date_tmp = this.timeMatcher.apply(date);
          if (lastExecution.getTime() < date_tmp.getTime() && (i === 0 || this.autorecover) && this.timeMatcher.match(date)) {
            this.emit("scheduled-time-matched", date_tmp);
            date_tmp.setMilliseconds(0);
            lastExecution = date_tmp;
          }
        }
        lastCheck = process.hrtime();
        this.timeout = setTimeout(matchTime, delay);
      };
      matchTime();
    }
    stop() {
      if (this.timeout) {
        clearTimeout(this.timeout);
      }
      this.timeout = null;
    }
  }
  module.exports = Scheduler;
});

// node_modules/uuid/dist/rng.js
var require_rng = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function rng() {
    if (poolPtr > rnds8Pool.length - 16) {
      _crypto.default.randomFillSync(rnds8Pool);
      poolPtr = 0;
    }
    return rnds8Pool.slice(poolPtr, poolPtr += 16);
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = rng;
  var _crypto = _interopRequireDefault(__require("crypto"));
  var rnds8Pool = new Uint8Array(256);
  var poolPtr = rnds8Pool.length;
});

// node_modules/uuid/dist/regex.js
var require_regex = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
  exports.default = _default;
});

// node_modules/uuid/dist/validate.js
var require_validate = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function validate(uuid) {
    return typeof uuid === "string" && _regex.default.test(uuid);
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _regex = _interopRequireDefault(require_regex());
  var _default = validate;
  exports.default = _default;
});

// node_modules/uuid/dist/stringify.js
var require_stringify = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function stringify(arr, offset = 0) {
    const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
    if (!(0, _validate.default)(uuid)) {
      throw TypeError("Stringified UUID is invalid");
    }
    return uuid;
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _validate = _interopRequireDefault(require_validate());
  var byteToHex = [];
  for (let i = 0;i < 256; ++i) {
    byteToHex.push((i + 256).toString(16).substr(1));
  }
  var _default = stringify;
  exports.default = _default;
});

// node_modules/uuid/dist/v1.js
var require_v1 = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function v1(options, buf, offset) {
    let i = buf && offset || 0;
    const b = buf || new Array(16);
    options = options || {};
    let node = options.node || _nodeId;
    let clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;
    if (node == null || clockseq == null) {
      const seedBytes = options.random || (options.rng || _rng.default)();
      if (node == null) {
        node = _nodeId = [seedBytes[0] | 1, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
      }
      if (clockseq == null) {
        clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 16383;
      }
    }
    let msecs = options.msecs !== undefined ? options.msecs : Date.now();
    let nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;
    const dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 1e4;
    if (dt < 0 && options.clockseq === undefined) {
      clockseq = clockseq + 1 & 16383;
    }
    if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
      nsecs = 0;
    }
    if (nsecs >= 1e4) {
      throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
    }
    _lastMSecs = msecs;
    _lastNSecs = nsecs;
    _clockseq = clockseq;
    msecs += 12219292800000;
    const tl = ((msecs & 268435455) * 1e4 + nsecs) % 4294967296;
    b[i++] = tl >>> 24 & 255;
    b[i++] = tl >>> 16 & 255;
    b[i++] = tl >>> 8 & 255;
    b[i++] = tl & 255;
    const tmh = msecs / 4294967296 * 1e4 & 268435455;
    b[i++] = tmh >>> 8 & 255;
    b[i++] = tmh & 255;
    b[i++] = tmh >>> 24 & 15 | 16;
    b[i++] = tmh >>> 16 & 255;
    b[i++] = clockseq >>> 8 | 128;
    b[i++] = clockseq & 255;
    for (let n = 0;n < 6; ++n) {
      b[i + n] = node[n];
    }
    return buf || (0, _stringify.default)(b);
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _rng = _interopRequireDefault(require_rng());
  var _stringify = _interopRequireDefault(require_stringify());
  var _nodeId;
  var _clockseq;
  var _lastMSecs = 0;
  var _lastNSecs = 0;
  var _default = v1;
  exports.default = _default;
});

// node_modules/uuid/dist/parse.js
var require_parse = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function parse(uuid) {
    if (!(0, _validate.default)(uuid)) {
      throw TypeError("Invalid UUID");
    }
    let v;
    const arr = new Uint8Array(16);
    arr[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
    arr[1] = v >>> 16 & 255;
    arr[2] = v >>> 8 & 255;
    arr[3] = v & 255;
    arr[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
    arr[5] = v & 255;
    arr[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
    arr[7] = v & 255;
    arr[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
    arr[9] = v & 255;
    arr[10] = (v = parseInt(uuid.slice(24, 36), 16)) / 1099511627776 & 255;
    arr[11] = v / 4294967296 & 255;
    arr[12] = v >>> 24 & 255;
    arr[13] = v >>> 16 & 255;
    arr[14] = v >>> 8 & 255;
    arr[15] = v & 255;
    return arr;
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _validate = _interopRequireDefault(require_validate());
  var _default = parse;
  exports.default = _default;
});

// node_modules/uuid/dist/v35.js
var require_v35 = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function stringToBytes(str) {
    str = unescape(encodeURIComponent(str));
    const bytes = [];
    for (let i = 0;i < str.length; ++i) {
      bytes.push(str.charCodeAt(i));
    }
    return bytes;
  }
  function _default(name, version, hashfunc) {
    function generateUUID(value, namespace, buf, offset) {
      if (typeof value === "string") {
        value = stringToBytes(value);
      }
      if (typeof namespace === "string") {
        namespace = (0, _parse.default)(namespace);
      }
      if (namespace.length !== 16) {
        throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");
      }
      let bytes = new Uint8Array(16 + value.length);
      bytes.set(namespace);
      bytes.set(value, namespace.length);
      bytes = hashfunc(bytes);
      bytes[6] = bytes[6] & 15 | version;
      bytes[8] = bytes[8] & 63 | 128;
      if (buf) {
        offset = offset || 0;
        for (let i = 0;i < 16; ++i) {
          buf[offset + i] = bytes[i];
        }
        return buf;
      }
      return (0, _stringify.default)(bytes);
    }
    try {
      generateUUID.name = name;
    } catch (err) {
    }
    generateUUID.DNS = DNS;
    generateUUID.URL = URL;
    return generateUUID;
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = _default;
  exports.URL = exports.DNS = undefined;
  var _stringify = _interopRequireDefault(require_stringify());
  var _parse = _interopRequireDefault(require_parse());
  var DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  exports.DNS = DNS;
  var URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
  exports.URL = URL;
});

// node_modules/uuid/dist/md5.js
var require_md5 = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function md5(bytes) {
    if (Array.isArray(bytes)) {
      bytes = Buffer.from(bytes);
    } else if (typeof bytes === "string") {
      bytes = Buffer.from(bytes, "utf8");
    }
    return _crypto.default.createHash("md5").update(bytes).digest();
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _crypto = _interopRequireDefault(__require("crypto"));
  var _default = md5;
  exports.default = _default;
});

// node_modules/uuid/dist/v3.js
var require_v3 = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _v = _interopRequireDefault(require_v35());
  var _md = _interopRequireDefault(require_md5());
  var v3 = (0, _v.default)("v3", 48, _md.default);
  var _default = v3;
  exports.default = _default;
});

// node_modules/uuid/dist/v4.js
var require_v4 = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function v4(options, buf, offset) {
    options = options || {};
    const rnds = options.random || (options.rng || _rng.default)();
    rnds[6] = rnds[6] & 15 | 64;
    rnds[8] = rnds[8] & 63 | 128;
    if (buf) {
      offset = offset || 0;
      for (let i = 0;i < 16; ++i) {
        buf[offset + i] = rnds[i];
      }
      return buf;
    }
    return (0, _stringify.default)(rnds);
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _rng = _interopRequireDefault(require_rng());
  var _stringify = _interopRequireDefault(require_stringify());
  var _default = v4;
  exports.default = _default;
});

// node_modules/uuid/dist/sha1.js
var require_sha1 = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function sha1(bytes) {
    if (Array.isArray(bytes)) {
      bytes = Buffer.from(bytes);
    } else if (typeof bytes === "string") {
      bytes = Buffer.from(bytes, "utf8");
    }
    return _crypto.default.createHash("sha1").update(bytes).digest();
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _crypto = _interopRequireDefault(__require("crypto"));
  var _default = sha1;
  exports.default = _default;
});

// node_modules/uuid/dist/v5.js
var require_v5 = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _v = _interopRequireDefault(require_v35());
  var _sha = _interopRequireDefault(require_sha1());
  var v5 = (0, _v.default)("v5", 80, _sha.default);
  var _default = v5;
  exports.default = _default;
});

// node_modules/uuid/dist/nil.js
var require_nil = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _default = "00000000-0000-0000-0000-000000000000";
  exports.default = _default;
});

// node_modules/uuid/dist/version.js
var require_version = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  function version(uuid) {
    if (!(0, _validate.default)(uuid)) {
      throw TypeError("Invalid UUID");
    }
    return parseInt(uuid.substr(14, 1), 16);
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.default = undefined;
  var _validate = _interopRequireDefault(require_validate());
  var _default = version;
  exports.default = _default;
});

// node_modules/uuid/dist/index.js
var require_dist = __commonJS((exports) => {
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  Object.defineProperty(exports, "v1", {
    enumerable: true,
    get: function() {
      return _v.default;
    }
  });
  Object.defineProperty(exports, "v3", {
    enumerable: true,
    get: function() {
      return _v2.default;
    }
  });
  Object.defineProperty(exports, "v4", {
    enumerable: true,
    get: function() {
      return _v3.default;
    }
  });
  Object.defineProperty(exports, "v5", {
    enumerable: true,
    get: function() {
      return _v4.default;
    }
  });
  Object.defineProperty(exports, "NIL", {
    enumerable: true,
    get: function() {
      return _nil.default;
    }
  });
  Object.defineProperty(exports, "version", {
    enumerable: true,
    get: function() {
      return _version.default;
    }
  });
  Object.defineProperty(exports, "validate", {
    enumerable: true,
    get: function() {
      return _validate.default;
    }
  });
  Object.defineProperty(exports, "stringify", {
    enumerable: true,
    get: function() {
      return _stringify.default;
    }
  });
  Object.defineProperty(exports, "parse", {
    enumerable: true,
    get: function() {
      return _parse.default;
    }
  });
  var _v = _interopRequireDefault(require_v1());
  var _v2 = _interopRequireDefault(require_v3());
  var _v3 = _interopRequireDefault(require_v4());
  var _v4 = _interopRequireDefault(require_v5());
  var _nil = _interopRequireDefault(require_nil());
  var _version = _interopRequireDefault(require_version());
  var _validate = _interopRequireDefault(require_validate());
  var _stringify = _interopRequireDefault(require_stringify());
  var _parse = _interopRequireDefault(require_parse());
});

// node_modules/node-cron/src/scheduled-task.js
var require_scheduled_task = __commonJS((exports, module) => {
  var EventEmitter = __require("events");
  var Task = require_task();
  var Scheduler = require_scheduler();
  var uuid = require_dist();

  class ScheduledTask extends EventEmitter {
    constructor(cronExpression, func, options) {
      super();
      if (!options) {
        options = {
          scheduled: true,
          recoverMissedExecutions: false
        };
      }
      this.options = options;
      this.options.name = this.options.name || uuid.v4();
      this._task = new Task(func);
      this._scheduler = new Scheduler(cronExpression, options.timezone, options.recoverMissedExecutions);
      this._scheduler.on("scheduled-time-matched", (now) => {
        this.now(now);
      });
      if (options.scheduled !== false) {
        this._scheduler.start();
      }
      if (options.runOnInit === true) {
        this.now("init");
      }
    }
    now(now = "manual") {
      let result = this._task.execute(now);
      this.emit("task-done", result);
    }
    start() {
      this._scheduler.start();
    }
    stop() {
      this._scheduler.stop();
    }
  }
  module.exports = ScheduledTask;
});

// node_modules/node-cron/src/background-scheduled-task/index.js
var require_background_scheduled_task = __commonJS((exports, module) => {
  var __dirname = "/Users/louisbeaumont/Documents/screen-pipe/screenpipe-js/node_modules/node-cron/src/background-scheduled-task";
  var EventEmitter = __require("events");
  var path = __require("path");
  var { fork } = __require("child_process");
  var uuid = require_dist();
  var daemonPath = `${__dirname}/daemon.js`;

  class BackgroundScheduledTask extends EventEmitter {
    constructor(cronExpression, taskPath, options) {
      super();
      if (!options) {
        options = {
          scheduled: true,
          recoverMissedExecutions: false
        };
      }
      this.cronExpression = cronExpression;
      this.taskPath = taskPath;
      this.options = options;
      this.options.name = this.options.name || uuid.v4();
      if (options.scheduled) {
        this.start();
      }
    }
    start() {
      this.stop();
      this.forkProcess = fork(daemonPath);
      this.forkProcess.on("message", (message) => {
        switch (message.type) {
          case "task-done":
            this.emit("task-done", message.result);
            break;
        }
      });
      let options = this.options;
      options.scheduled = true;
      this.forkProcess.send({
        type: "register",
        path: path.resolve(this.taskPath),
        cron: this.cronExpression,
        options
      });
    }
    stop() {
      if (this.forkProcess) {
        this.forkProcess.kill();
      }
    }
    pid() {
      if (this.forkProcess) {
        return this.forkProcess.pid;
      }
    }
    isRunning() {
      return !this.forkProcess.killed;
    }
  }
  module.exports = BackgroundScheduledTask;
});

// node_modules/node-cron/src/storage.js
var require_storage = __commonJS((exports, module) => {
  module.exports = (() => {
    if (!global.scheduledTasks) {
      global.scheduledTasks = new Map;
    }
    return {
      save: (task) => {
        if (!task.options) {
          const uuid = require_dist();
          task.options = {};
          task.options.name = uuid.v4();
        }
        global.scheduledTasks.set(task.options.name, task);
      },
      getTasks: () => {
        return global.scheduledTasks;
      }
    };
  })();
});

// node_modules/node-cron/src/node-cron.js
var require_node_cron = __commonJS((exports, module) => {
  function schedule(expression, func, options) {
    const task = createTask(expression, func, options);
    storage.save(task);
    return task;
  }
  function createTask(expression, func, options) {
    if (typeof func === "string")
      return new BackgroundScheduledTask(expression, func, options);
    return new ScheduledTask(expression, func, options);
  }
  function validate(expression) {
    try {
      validation(expression);
      return true;
    } catch (_) {
      return false;
    }
  }
  function getTasks() {
    return storage.getTasks();
  }
  var ScheduledTask = require_scheduled_task();
  var BackgroundScheduledTask = require_background_scheduled_task();
  var validation = require_pattern_validation();
  var storage = require_storage();
  module.exports = { schedule, validate, getTasks };
});

// main.ts
var import_node_cron = __toESM(require_node_cron(), 1);
import * as fs from "node:fs";
function toCamelCase(str) {
  return str.replace(/([-_][a-z])/g, (group) => group.toUpperCase().replace("-", "").replace("_", ""));
}
function convertToCamelCase(obj) {
  if (Array.isArray(obj)) {
    return obj.map(convertToCamelCase);
  } else if (obj !== null && typeof obj === "object") {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      result[camelKey] = convertToCamelCase(obj[key]);
      return result;
    }, {});
  }
  return obj;
}
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
async function sendDesktopNotification(options) {
  const notificationApiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:11435";
  try {
    await fetch(`${notificationApiUrl}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options)
    });
    return true;
  } catch (error) {
    console.error("Failed to send notification:", error);
    return false;
  }
}
function loadPipeConfig() {
  try {
    const configPath = `${process.env.SCREENPIPE_DIR}/pipes/${process.env.PIPE_ID}/pipe.json`;
    const configContent = fs.readFileSync(configPath, "utf8");
    const parsedConfig = JSON.parse(configContent);
    const config = {};
    parsedConfig.fields.forEach((field) => {
      config[field.name] = field.value !== undefined ? field.value : field.default;
    });
    return config;
  } catch (error) {
    console.error("Error loading pipe.json:", error);
    return {};
  }
}
async function queryScreenpipe(params) {
  const queryParams = new URLSearchParams;
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      const snakeKey = toSnakeCase(key);
      queryParams.append(snakeKey, value.toString());
    }
  });
  const url = `http://localhost:3030/search?${queryParams}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return convertToCamelCase(data);
  } catch (error) {
    console.error("error querying screenpipe:", error);
    return null;
  }
}
function extractJsonFromLlmResponse(response) {
  let cleaned = response.replace(/^```(?:json)?\s*|\s*```$/g, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  cleaned = cleaned.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
  cleaned = cleaned.replace(/\\n/g, "").replace(/\n/g, "");
  cleaned = cleaned.replace(/"(\\"|[^"])*"/g, (match) => {
    return match.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  });
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.warn("failed to parse json:", error);
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/'/g, '"').replace(/(\w+):/g, '"$1":').replace(/:\s*'([^']*)'/g, ': "$1"').replace(/\\"/g, '"').replace(/"{/g, '{"').replace(/}"/g, '"}');
    try {
      return JSON.parse(cleaned);
    } catch (secondError) {
      console.warn("failed to parse json after attempted fixes:", secondError);
      throw new Error("invalid json format in llm response");
    }
  }
}
async function sendInputControl(action) {
  const apiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:3030";
  try {
    const response = await fetch(`${apiUrl}/experimental/input_control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error("failed to control input:", error);
    return false;
  }
}

class Task {
  _name;
  _interval;
  _time = null;
  _handler = null;
  _cronTask = null;
  constructor(name) {
    this._name = name;
    this._interval = 0;
  }
  every(interval) {
    this._interval = interval;
    return this;
  }
  at(time) {
    this._time = time;
    return this;
  }
  do(handler) {
    this._handler = handler;
    return this;
  }
  schedule() {
    if (!this._handler) {
      throw new Error(`No handler defined for task: ${this._name}`);
    }
    const cronExpression = this.toCronExpression();
    this._cronTask = import_node_cron.default.schedule(cronExpression, this._handler, {
      name: this._name
    });
  }
  stop() {
    return this._cronTask.stop();
  }
  toCronExpression() {
    if (typeof this._interval === "number") {
      const minutes = Math.floor(this._interval / 60000);
      return `*/${minutes} * * * *`;
    }
    const [value, unit] = this._interval.split(" ");
    switch (unit) {
      case "second":
      case "seconds":
        return `*/${value} * * * * *`;
      case "minute":
      case "minutes":
        return `*/${value} * * * *`;
      case "hour":
      case "hours":
        return `0 */${value} * * *`;
      case "day":
      case "days":
        return `0 0 */${value} * *`;
      default:
        throw new Error(`Unsupported interval unit: ${unit}`);
    }
  }
}

class Scheduler {
  tasks = [];
  task(name) {
    const task = new Task(name);
    this.tasks.push(task);
    return task;
  }
  start() {
    this.tasks.forEach((task) => task.schedule());
  }
  stop() {
    import_node_cron.default.getTasks().forEach((task) => task.stop());
    this.tasks = [];
  }
}
var pipe = {
  sendDesktopNotification,
  loadPipeConfig,
  queryScreenpipe,
  inbox: {
    send: async (message) => {
      const notificationApiUrl = process.env.SCREENPIPE_SERVER_URL || "http://localhost:11435";
      try {
        const response = await fetch(`${notificationApiUrl}/inbox`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...message, type: "inbox" })
        });
        return response.ok;
      } catch (error) {
        console.error("failed to send inbox message:", error);
        return false;
      }
    }
  },
  scheduler: new Scheduler,
  input: {
    type: (text) => {
      return sendInputControl({ type: "WriteText", data: text });
    },
    press: (key) => {
      return sendInputControl({ type: "KeyPress", data: key });
    },
    moveMouse: (x, y) => {
      return sendInputControl({ type: "MouseMove", data: { x, y } });
    },
    click: (button) => {
      return sendInputControl({ type: "MouseClick", data: button });
    }
  }
};
export {
  sendDesktopNotification,
  queryScreenpipe,
  pipe,
  loadPipeConfig,
  extractJsonFromLlmResponse
};
