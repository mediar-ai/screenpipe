"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Search,
  Monitor,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VideoChunk {
  id: number;
  file_path: string;
  device_name: string;
}

interface MonitorDevice {
  id: string;
  name: string;
  is_default: boolean;
  width: number;
  height: number;
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

const columns: ColumnDef<VideoChunk>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          ID
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: "file_path",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          File Path
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <CellContent
        value={row.getValue("file_path")}
        className="max-w-[500px] truncate"
      />
    ),
  },
  {
    accessorKey: "device_name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Device Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <CellContent
        value={row.getValue("device_name")}
        className="max-w-[200px] truncate"
      />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const videoChunk = row.original;

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
              onClick={() =>
                navigator.clipboard.writeText(videoChunk.file_path)
              }
            >
              copy path
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                navigator.clipboard.writeText(JSON.stringify(videoChunk))
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

export function VideoChunksTable() {
  const [data, setData] = React.useState<VideoChunk[]>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [pageSize, setPageSize] = React.useState(9);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [totalRows, setTotalRows] = React.useState(0);
  const [filePathFilter] = React.useState("");
  const [deviceFilter, setDeviceFilter] = React.useState("");
  const [availableMonitors, setAvailableMonitors] = React.useState<
    MonitorDevice[]
  >([]);

  const fetchData = async () => {
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
      const countResponse = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `SELECT COUNT(*) as total FROM video_chunks ${whereClause}`,
        }),
      });

      if (!countResponse.ok) throw new Error("failed to fetch count");
      const countResult = await countResponse.json();
      setTotalRows(countResult[0].total);

      // Get paginated data
      const response = await fetch("http://localhost:3030/raw_sql", {
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

      if (!response.ok) throw new Error("failed to fetch data");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("error fetching data:", error);
      setError(
        `failed to load video chunks: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Add monitor loading function
  const loadMonitors = async () => {
    try {
      const response = await fetch("http://localhost:3030/vision/list", {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.text();
        console.warn("failed to fetch monitors:", error);
        return;
      }
      const monitors: MonitorDevice[] = await response.json();
      setAvailableMonitors(monitors);
    } catch (error) {
      console.error("failed to load monitors:", error);
    }
  };

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
        const newState = updater({ pageIndex, pageSize });
        setPageIndex(newState.pageIndex);
        setPageSize(newState.pageSize);
      }
    },
    getSortedRowModel: getSortedRowModel(),
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

  return (
    <div className="w-full">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="filter by file path..."
              value={
                (table.getColumn("file_path")?.getFilterValue() as string) ?? ""
              }
              onChange={(event) =>
                table.getColumn("file_path")?.setFilterValue(event.target.value)
              }
              className="max-w-sm pl-8"
            />
          </div>
          {availableMonitors.length > 0 && (
            <Select
              value={deviceFilter}
              onValueChange={(value) => {
                setDeviceFilter(value);
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <Monitor className="mr-2 h-4 w-4" />
                <SelectValue placeholder="filter by device..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>monitors</SelectLabel>
                  {availableMonitors.map((monitor) => (
                    <SelectItem
                      key={monitor.id}
                      value={`monitor_${monitor.id}`}
                    >
                      {monitor.name} {monitor.is_default && "(default)"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}

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
