"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableCaption = exports.TableCell = exports.TableRow = exports.TableHead = exports.TableFooter = exports.TableBody = exports.TableHeader = exports.Table = void 0;
const React = __importStar(require("react"));
const utils_1 = require("@/lib/utils");
const Table = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<div className="relative w-full overflow-auto">
    <table ref={ref} className={(0, utils_1.cn)("w-full caption-bottom text-sm", className)} {...props}/>
  </div>);
});
exports.Table = Table;
Table.displayName = "Table";
const TableHeader = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<thead ref={ref} className={(0, utils_1.cn)("[&_tr]:border-b", className)} {...props}/>);
});
exports.TableHeader = TableHeader;
TableHeader.displayName = "TableHeader";
const TableBody = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<tbody ref={ref} className={(0, utils_1.cn)("[&_tr:last-child]:border-0", className)} {...props}/>);
});
exports.TableBody = TableBody;
TableBody.displayName = "TableBody";
const TableFooter = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<tfoot ref={ref} className={(0, utils_1.cn)("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props}/>);
});
exports.TableFooter = TableFooter;
TableFooter.displayName = "TableFooter";
const TableRow = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<tr ref={ref} className={(0, utils_1.cn)("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props}/>);
});
exports.TableRow = TableRow;
TableRow.displayName = "TableRow";
const TableHead = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<th ref={ref} className={(0, utils_1.cn)("h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className)} {...props}/>);
});
exports.TableHead = TableHead;
TableHead.displayName = "TableHead";
const TableCell = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<td ref={ref} className={(0, utils_1.cn)("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props}/>);
});
exports.TableCell = TableCell;
TableCell.displayName = "TableCell";
const TableCaption = React.forwardRef((_a, ref) => {
    var { className } = _a, props = __rest(_a, ["className"]);
    return (<caption ref={ref} className={(0, utils_1.cn)("mt-4 text-sm text-muted-foreground", className)} {...props}/>);
});
exports.TableCaption = TableCaption;
TableCaption.displayName = "TableCaption";
