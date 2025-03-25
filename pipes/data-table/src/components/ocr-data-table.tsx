"use client";

import * as React from "react";
import {
  ColumnDef,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AppWindow,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SqlAutocompleteInput } from "./sql-autocomplete-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OcrText {
  frame_id: number;
  text: string;
  text_json: string | null;
  app_name: string;
  window_name: string | null;
  timestamp: string;
  browser_url: string | null;
}

// Component for cell content with click support
interface CellContentProps {
  value: string | null;
  className?: string;
}

function CellContent({ value, className }: CellContentProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const displayValue = value || "N/A";

  return (
    <>
      <div
        className={className}
        onClick={() => setIsDialogOpen(true)}
        style={{ cursor: "pointer" }}
      >
        {displayValue}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>cell content</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] font-mono p-4 border rounded-md bg-muted/50 whitespace-pre-wrap">
            {displayValue}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const columns: ColumnDef<OcrText>[] = [
  {
    accessorKey: "frame_id",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Frame ID
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: "timestamp",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Time
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {new Date(row.getValue("timestamp")).toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "text",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Text Content
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <CellContent
        value={row.getValue("text")}
        className="max-w-[500px] truncate font-mono"
      />
    ),
  },
  {
    accessorKey: "app_name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Application
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <Badge variant="outline">{row.getValue("app_name")}</Badge>
    ),
  },
  {
    accessorKey: "window_name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Window
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <CellContent
        value={row.getValue("window_name")}
        className="max-w-[200px] truncate"
      />
    ),
  },
  {
    accessorKey: "browser_url",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          URL
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <CellContent
        value={row.getValue("browser_url")}
        className="max-w-[200px] truncate"
      />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const ocrText = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(ocrText.text)}
            >
              copy text
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                navigator.clipboard.writeText(ocrText.text_json || "")
              }
            >
              copy json
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                navigator.clipboard.writeText(JSON.stringify(ocrText, null, 2))
              }
            >
              copy raw data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export function OcrDataTable() {
  const [data, setData] = React.useState<OcrText[]>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [pageSize, setPageSize] = React.useState(9);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [totalRows, setTotalRows] = React.useState(0);

  const [textFilter, setTextFilter] = React.useState("");
  const [appFilter, setAppFilter] = React.useState("");

  const fetchData = async () => {
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
          ? `LOWER(frames.app_name) LIKE '%${appFilter
              .toLowerCase()
              .replace(/'/g, "''")}%'`
          : null,
      ]
        .filter(Boolean)
        .join(" AND ");

      const countResponse = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT COUNT(*) as total
            FROM ocr_text 
            JOIN frames ON ocr_text.frame_id = frames.id
            WHERE ${filterClauses}
          `,
        }),
      });

      if (!countResponse.ok) {
        throw new Error("failed to fetch count");
      }

      const countResult = await countResponse.json();
      setTotalRows(countResult[0].total);

      const response = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT 
              ocr_text.frame_id,
              ocr_text.text,
              ocr_text.text_json,
              frames.app_name,
              frames.window_name,
              frames.timestamp,
              frames.browser_url
            FROM ocr_text 
            JOIN frames ON ocr_text.frame_id = frames.id
            WHERE ${filterClauses}
            ORDER BY ocr_text.frame_id DESC
            LIMIT ${pageSize}
            OFFSET ${pageIndex * pageSize}
          `,
        }),
      });
      if (!response.ok) {
        throw new Error("failed to fetch data");
      }
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("error fetching data:", error);
      setError(
        `failed to load ocr data: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);

    return () => clearTimeout(timer);
  }, [textFilter, appFilter, pageIndex, pageSize]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
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
    getSortedRowModel: getSortedRowModel(),
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

  return (
    <div className="w-full">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="filter by text content..."
              value={textFilter}
              onChange={(event) => {
                setTextFilter(event.target.value);
                setPageIndex(0);
              }}
              className="max-w-sm pl-8"
            />
          </div>
          <SqlAutocompleteInput
            id="appFilter"
            type="app"
            icon={<AppWindow className="h-4 w-4" />}
            value={appFilter}
            onChange={(value) => {
              setAppFilter(value);
              setPageIndex(0);
            }}
            placeholder="filter by app..."
            className="w-[300px]"
          />
          <Button
            variant="outline"
            size="icon"
            className="w-12"
            onClick={fetchData}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error ? (
        <div className="text-center text-red-500 py-4">{error}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    loading...
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    no results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex items-center justify-center space-x-2 py-4">
        <Button
          variant="outline"
          size="lg"
          className="w-32"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="h-4 w-4" />
          previous
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-32"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
