"use strict";
"use client";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OcrDataTable = OcrDataTable;
const React = __importStar(require("react"));
const react_table_1 = require("@tanstack/react-table");
const lucide_react_1 = require("lucide-react");
const button_1 = require("@/components/ui/button");
const dropdown_menu_1 = require("@/components/ui/dropdown-menu");
const input_1 = require("@/components/ui/input");
const table_1 = require("@/components/ui/table");
const badge_1 = require("@/components/ui/badge");
const sql_autocomplete_input_1 = require("./sql-autocomplete-input");
const columns = [
    {
        accessorKey: "frame_id",
        header: ({ column }) => {
            return (<button_1.Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Frame ID
          <lucide_react_1.ArrowUpDown className="ml-2 h-4 w-4"/>
        </button_1.Button>);
        },
    },
    {
        accessorKey: "text",
        header: ({ column }) => {
            return (<button_1.Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Text Content
          <lucide_react_1.ArrowUpDown className="ml-2 h-4 w-4"/>
        </button_1.Button>);
        },
        cell: ({ row }) => (<div className="max-w-[500px] truncate font-mono">
        {row.getValue("text")}
      </div>),
    },
    {
        accessorKey: "app_name",
        header: ({ column }) => {
            return (<button_1.Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Application
          <lucide_react_1.ArrowUpDown className="ml-2 h-4 w-4"/>
        </button_1.Button>);
        },
        cell: ({ row }) => (<badge_1.Badge variant="outline">{row.getValue("app_name")}</badge_1.Badge>),
    },
    {
        accessorKey: "window_name",
        header: ({ column }) => {
            return (<button_1.Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Window
          <lucide_react_1.ArrowUpDown className="ml-2 h-4 w-4"/>
        </button_1.Button>);
        },
        cell: ({ row }) => (<div className="max-w-[200px] truncate">
        {row.getValue("window_name") || "N/A"}
      </div>),
    },
    // {
    //   accessorKey: "ocr_engine",
    //   header: "Engine",
    //   cell: ({ row }) => (
    //     <Badge variant="secondary">{row.getValue("ocr_engine")}</Badge>
    //   ),
    // },
    // {
    //   accessorKey: "focused",
    //   header: "Focused",
    //   cell: ({ row }) => (
    //     <Badge variant={row.getValue("focused") ? "default" : "outline"}>
    //       {row.getValue("focused") ? "yes" : "no"}
    //     </Badge>
    //   ),
    // },
    {
        id: "actions",
        cell: ({ row }) => {
            const ocrText = row.original;
            return (<dropdown_menu_1.DropdownMenu>
          <dropdown_menu_1.DropdownMenuTrigger asChild>
            <button_1.Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">open menu</span>
              <lucide_react_1.MoreHorizontal className="h-4 w-4"/>
            </button_1.Button>
          </dropdown_menu_1.DropdownMenuTrigger>
          <dropdown_menu_1.DropdownMenuContent align="end">
            <dropdown_menu_1.DropdownMenuLabel>actions</dropdown_menu_1.DropdownMenuLabel>
            <dropdown_menu_1.DropdownMenuItem onClick={() => navigator.clipboard.writeText(ocrText.text)}>
              copy text
            </dropdown_menu_1.DropdownMenuItem>
            <dropdown_menu_1.DropdownMenuItem onClick={() => navigator.clipboard.writeText(ocrText.text_json || "")}>
              copy json
            </dropdown_menu_1.DropdownMenuItem>
            <dropdown_menu_1.DropdownMenuItem onClick={() => navigator.clipboard.writeText(JSON.stringify(ocrText, null, 2))}>
              copy raw data
            </dropdown_menu_1.DropdownMenuItem>
          </dropdown_menu_1.DropdownMenuContent>
        </dropdown_menu_1.DropdownMenu>);
        },
    },
];
function OcrDataTable() {
    var _a;
    const [data, setData] = React.useState([]);
    const [sorting, setSorting] = React.useState([]);
    const [columnVisibility, setColumnVisibility] = React.useState({});
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [pageSize, setPageSize] = React.useState(9);
    const [pageIndex, setPageIndex] = React.useState(0);
    const [totalRows, setTotalRows] = React.useState(0);
    const [textFilter, setTextFilter] = React.useState("");
    const [appFilter, setAppFilter] = React.useState("");
    const fetchData = () => __awaiter(this, void 0, void 0, function* () {
        setIsLoading(true);
        setError(null);
        try {
            const filterClauses = [
                "text IS NOT NULL",
                "trim(text) != ''",
                textFilter
                    ? `LOWER(text) LIKE '%${textFilter
                        .toLowerCase()
                        .replace(/'/g, "''")}%'`
                    : null,
                appFilter
                    ? `LOWER(app_name) LIKE '%${appFilter
                        .toLowerCase()
                        .replace(/'/g, "''")}%'`
                    : null,
            ]
                .filter(Boolean)
                .join(" AND ");
            const countResponse = yield fetch("http://localhost:3030/raw_sql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    query: `
            SELECT COUNT(*) as total
            FROM ocr_text 
            WHERE ${filterClauses}
          `,
                }),
            });
            if (!countResponse.ok) {
                throw new Error("failed to fetch count");
            }
            const countResult = yield countResponse.json();
            setTotalRows(countResult[0].total);
            const response = yield fetch("http://localhost:3030/raw_sql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    query: `
            SELECT 
              frame_id,
              text,
              text_json,
              app_name,
              ocr_engine,
              window_name,
              focused
            FROM ocr_text 
            WHERE ${filterClauses}
            ORDER BY frame_id DESC
            LIMIT ${pageSize}
            OFFSET ${pageIndex * pageSize}
          `,
                }),
            });
            if (!response.ok) {
                throw new Error("failed to fetch data");
            }
            const result = yield response.json();
            setData(result);
        }
        catch (error) {
            console.error("error fetching data:", error);
            setError(`failed to load ocr data: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        finally {
            setIsLoading(false);
        }
    });
    React.useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 300);
        return () => clearTimeout(timer);
    }, [textFilter, appFilter, pageIndex, pageSize]);
    const table = (0, react_table_1.useReactTable)({
        data,
        columns,
        onSortingChange: setSorting,
        getCoreRowModel: (0, react_table_1.getCoreRowModel)(),
        manualPagination: true,
        manualFiltering: true,
        pageCount: Math.ceil(totalRows / pageSize),
        onPaginationChange: (updater) => {
            if (typeof updater === "function") {
                const newState = updater({
                    pageIndex,
                    pageSize,
                });
                setPageIndex(newState.pageIndex);
                setPageSize(newState.pageSize);
            }
        },
        getSortedRowModel: (0, react_table_1.getSortedRowModel)(),
        onColumnVisibilityChange: setColumnVisibility,
        state: {
            sorting,
            columnVisibility,
            pagination: {
                pageIndex,
                pageSize,
            },
        },
    });
    return (<div className="w-full">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <lucide_react_1.Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"/>
            <input_1.Input placeholder="filter by text content..." value={textFilter} onChange={(event) => {
            setTextFilter(event.target.value);
            setPageIndex(0);
        }} className="max-w-sm pl-8"/>
          </div>
          <sql_autocomplete_input_1.SqlAutocompleteInput id="appFilter" type="app" icon={<lucide_react_1.AppWindow className="h-4 w-4"/>} value={appFilter} onChange={(value) => {
            setAppFilter(value);
            setPageIndex(0);
        }} placeholder="filter by app..." className="w-[300px]"/>
          <button_1.Button variant="outline" size="icon" className="w-12" onClick={fetchData} disabled={isLoading}>
            <lucide_react_1.RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}/>
          </button_1.Button>
        </div>
        <dropdown_menu_1.DropdownMenu>
          <dropdown_menu_1.DropdownMenuTrigger asChild>
            <button_1.Button variant="outline">
              columns <lucide_react_1.ChevronDown className="ml-2 h-4 w-4"/>
            </button_1.Button>
          </dropdown_menu_1.DropdownMenuTrigger>
          <dropdown_menu_1.DropdownMenuContent align="end">
            {table
            .getAllColumns()
            .filter((column) => column.getCanHide())
            .map((column) => {
            return (<dropdown_menu_1.DropdownMenuCheckboxItem key={column.id} className="capitalize" checked={column.getIsVisible()} onCheckedChange={(value) => column.toggleVisibility(!!value)}>
                    {column.id}
                  </dropdown_menu_1.DropdownMenuCheckboxItem>);
        })}
          </dropdown_menu_1.DropdownMenuContent>
        </dropdown_menu_1.DropdownMenu>
      </div>
      {error ? (<div className="text-center text-red-500 py-4">{error}</div>) : (<div className="rounded-md border">
          <table_1.Table>
            <table_1.TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (<table_1.TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (<table_1.TableHead key={header.id}>
                        {header.isPlaceholder
                            ? null
                            : (0, react_table_1.flexRender)(header.column.columnDef.header, header.getContext())}
                      </table_1.TableHead>);
                })}
                </table_1.TableRow>))}
            </table_1.TableHeader>
            <table_1.TableBody>
              {isLoading ? (<table_1.TableRow>
                  <table_1.TableCell colSpan={columns.length} className="h-24 text-center">
                    loading...
                  </table_1.TableCell>
                </table_1.TableRow>) : ((_a = table.getRowModel().rows) === null || _a === void 0 ? void 0 : _a.length) ? (table.getRowModel().rows.map((row) => (<table_1.TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map((cell) => (<table_1.TableCell key={cell.id}>
                        {(0, react_table_1.flexRender)(cell.column.columnDef.cell, cell.getContext())}
                      </table_1.TableCell>))}
                  </table_1.TableRow>))) : (<table_1.TableRow>
                  <table_1.TableCell colSpan={columns.length} className="h-24 text-center">
                    no results.
                  </table_1.TableCell>
                </table_1.TableRow>)}
            </table_1.TableBody>
          </table_1.Table>
        </div>)}
      <div className="flex items-center justify-center space-x-2 py-4">
        <button_1.Button variant="outline" size="lg" className="w-32" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          <lucide_react_1.ChevronLeft className="h-4 w-4"/>
          previous
        </button_1.Button>
        <button_1.Button variant="outline" size="lg" className="w-32" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          next
          <lucide_react_1.ChevronRight className="h-4 w-4"/>
        </button_1.Button>
      </div>
    </div>);
}
