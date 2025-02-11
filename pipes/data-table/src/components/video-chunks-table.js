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
exports.VideoChunksTable = VideoChunksTable;
const React = __importStar(require("react"));
const react_table_1 = require("@tanstack/react-table");
const lucide_react_1 = require("lucide-react");
const button_1 = require("@/components/ui/button");
const dropdown_menu_1 = require("@/components/ui/dropdown-menu");
const input_1 = require("@/components/ui/input");
const table_1 = require("@/components/ui/table");
const select_1 = require("@/components/ui/select");
const columns = [
    {
        accessorKey: "id",
        header: ({ column }) => {
            return (<button_1.Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          ID
          <lucide_react_1.ArrowUpDown className="ml-2 h-4 w-4"/>
        </button_1.Button>);
        },
    },
    {
        accessorKey: "file_path",
        header: ({ column }) => {
            return (<button_1.Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          File Path
          <lucide_react_1.ArrowUpDown className="ml-2 h-4 w-4"/>
        </button_1.Button>);
        },
    },
    {
        accessorKey: "device_name",
        header: ({ column }) => {
            return (<button_1.Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Device Name
          <lucide_react_1.ArrowUpDown className="ml-2 h-4 w-4"/>
        </button_1.Button>);
        },
    },
    {
        id: "actions",
        cell: ({ row }) => {
            const videoChunk = row.original;
            return (<dropdown_menu_1.DropdownMenu>
          <dropdown_menu_1.DropdownMenuTrigger asChild>
            <button_1.Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">open menu</span>
              <lucide_react_1.MoreHorizontal className="h-4 w-4"/>
            </button_1.Button>
          </dropdown_menu_1.DropdownMenuTrigger>
          <dropdown_menu_1.DropdownMenuContent align="end">
            <dropdown_menu_1.DropdownMenuLabel>actions</dropdown_menu_1.DropdownMenuLabel>
            <dropdown_menu_1.DropdownMenuItem onClick={() => navigator.clipboard.writeText(videoChunk.file_path)}>
              copy path
            </dropdown_menu_1.DropdownMenuItem>
            <dropdown_menu_1.DropdownMenuItem onClick={() => navigator.clipboard.writeText(JSON.stringify(videoChunk))}>
              copy raw data
            </dropdown_menu_1.DropdownMenuItem>
          </dropdown_menu_1.DropdownMenuContent>
        </dropdown_menu_1.DropdownMenu>);
        },
    },
];
function VideoChunksTable() {
    var _a, _b, _c;
    const [data, setData] = React.useState([]);
    const [sorting, setSorting] = React.useState([]);
    const [columnFilters] = React.useState([]);
    const [columnVisibility, setColumnVisibility] = React.useState({});
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [pageSize, setPageSize] = React.useState(9);
    const [pageIndex, setPageIndex] = React.useState(0);
    const [totalRows, setTotalRows] = React.useState(0);
    const [filePathFilter] = React.useState("");
    const [deviceFilter, setDeviceFilter] = React.useState("");
    const [availableMonitors, setAvailableMonitors] = React.useState([]);
    const fetchData = () => __awaiter(this, void 0, void 0, function* () {
        setIsLoading(true);
        setError(null);
        try {
            const filterClauses = [
                filePathFilter
                    ? `LOWER(file_path) LIKE '%${filePathFilter
                        .toLowerCase()
                        .replace(/'/g, "''")}%'`
                    : null,
                deviceFilter
                    ? `LOWER(device_name) LIKE '%${deviceFilter
                        .toLowerCase()
                        .replace(/'/g, "''")}%'`
                    : null,
            ]
                .filter(Boolean)
                .join(" AND ");
            const whereClause = filterClauses ? `WHERE ${filterClauses}` : "";
            // Get total count
            const countResponse = yield fetch("http://localhost:3030/raw_sql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: `SELECT COUNT(*) as total FROM video_chunks ${whereClause}`,
                }),
            });
            if (!countResponse.ok)
                throw new Error("failed to fetch count");
            const countResult = yield countResponse.json();
            setTotalRows(countResult[0].total);
            // Get paginated data
            const response = yield fetch("http://localhost:3030/raw_sql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: `
            SELECT * FROM video_chunks 
            ${whereClause}
            ORDER BY id DESC
            LIMIT ${pageSize}
            OFFSET ${pageIndex * pageSize}
          `,
                }),
            });
            if (!response.ok)
                throw new Error("failed to fetch data");
            const result = yield response.json();
            setData(result);
        }
        catch (error) {
            console.error("error fetching data:", error);
            setError(`failed to load video chunks: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        finally {
            setIsLoading(false);
        }
    });
    // Add monitor loading function
    const loadMonitors = () => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch("http://localhost:3030/vision/list", {
                method: "POST",
            });
            if (!response.ok) {
                const error = yield response.text();
                console.warn("failed to fetch monitors:", error);
                return;
            }
            const monitors = yield response.json();
            setAvailableMonitors(monitors);
        }
        catch (error) {
            console.error("failed to load monitors:", error);
        }
    });
    // Add useEffect for monitors
    React.useEffect(() => {
        loadMonitors();
    }, []);
    React.useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 300);
        return () => clearTimeout(timer);
    }, [filePathFilter, deviceFilter, pageIndex, pageSize]);
    // Modify the table configuration
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
                const newState = updater({ pageIndex, pageSize });
                setPageIndex(newState.pageIndex);
                setPageSize(newState.pageSize);
            }
        },
        getSortedRowModel: (0, react_table_1.getSortedRowModel)(),
        onColumnVisibilityChange: setColumnVisibility,
        state: {
            sorting,
            columnFilters,
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
            <input_1.Input placeholder="filter by file path..." value={(_b = (_a = table.getColumn("file_path")) === null || _a === void 0 ? void 0 : _a.getFilterValue()) !== null && _b !== void 0 ? _b : ""} onChange={(event) => { var _a; return (_a = table.getColumn("file_path")) === null || _a === void 0 ? void 0 : _a.setFilterValue(event.target.value); }} className="max-w-sm pl-8"/>
          </div>
          {availableMonitors.length > 0 && (<select_1.Select value={deviceFilter} onValueChange={(value) => {
                setDeviceFilter(value);
                setPageIndex(0);
            }}>
              <select_1.SelectTrigger className="w-[200px]">
                <lucide_react_1.Monitor className="mr-2 h-4 w-4"/>
                <select_1.SelectValue placeholder="filter by device..."/>
              </select_1.SelectTrigger>
              <select_1.SelectContent>
                <select_1.SelectGroup>
                  <select_1.SelectLabel>monitors</select_1.SelectLabel>
                  {availableMonitors.map((monitor) => (<select_1.SelectItem key={monitor.id} value={`monitor_${monitor.id}`}>
                      {monitor.name} {monitor.is_default && "(default)"}
                    </select_1.SelectItem>))}
                </select_1.SelectGroup>
              </select_1.SelectContent>
            </select_1.Select>)}

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
                </table_1.TableRow>) : ((_c = table.getRowModel().rows) === null || _c === void 0 ? void 0 : _c.length) ? (table.getRowModel().rows.map((row) => (<table_1.TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
