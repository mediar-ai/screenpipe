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
  ArrowUpDown,
  ChevronDown,
  MoreHorizontal,
  RefreshCw,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AudioTranscription {
  id: number;
  audio_chunk_id: number;
  offset_index: number;
  timestamp: string;
  transcription: string;
  device: string;
  is_input_device: boolean;
  speaker_id: number | null;
  transcription_engine: string;
}
interface AudioDevice {
  name: string;
  is_default: boolean;
}

const columns: ColumnDef<AudioTranscription>[] = [
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
    cell: ({ row }) => {
      const timestamp = new Date(row.getValue("timestamp"));
      return timestamp.toLocaleString();
    },
  },
  {
    accessorKey: "transcription",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Transcription
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <div className="max-w-[500px] truncate font-mono">
        {row.getValue("transcription")}
      </div>
    ),
  },
  {
    accessorKey: "device",
    header: "Device",
    cell: ({ row }) => (
      <Badge variant="outline">
        {row.getValue("device")}
        {row.original.is_input_device ? " (input)" : " (output)"}
      </Badge>
    ),
  },
  {
    accessorKey: "speaker_id",
    header: "Speaker",
    cell: ({ row }) => (
      <Badge variant="secondary">
        {row.getValue("speaker_id") ?? "unknown"}
      </Badge>
    ),
  },
  {
    accessorKey: "transcription_engine",
    header: "Engine",
    cell: ({ row }) => <Badge>{row.getValue("transcription_engine")}</Badge>,
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const transcription = row.original;

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
                navigator.clipboard.writeText(transcription.transcription)
              }
            >
              copy text
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                navigator.clipboard.writeText(
                  JSON.stringify(transcription, null, 2)
                )
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

export function AudioTranscriptionsTable() {
  const [data, setData] = React.useState<AudioTranscription[]>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [pageSize, setPageSize] = React.useState(10);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [totalRows, setTotalRows] = React.useState(0);

  const [transcriptionFilter, setTranscriptionFilter] = React.useState("");
  const [deviceFilter, setDeviceFilter] = React.useState("");
  const [availableAudioDevices, setAvailableAudioDevices] = React.useState<
    AudioDevice[]
  >([]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filterClauses = [
        "transcription IS NOT NULL",
        transcriptionFilter
          ? `LOWER(transcription) LIKE '%${transcriptionFilter
              .toLowerCase()
              .replace(/'/g, "''")}%'`
          : null,
        deviceFilter
          ? `LOWER(device) LIKE '%${deviceFilter
              .toLowerCase()
              .replace(/'/g, "''")}%'`
          : null,
      ]
        .filter(Boolean)
        .join(" AND ");

      // Get total count first
      const countResponse = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT COUNT(*) as total
            FROM audio_transcriptions 
            WHERE ${filterClauses}
          `,
        }),
      });

      if (!countResponse.ok) {
        throw new Error("failed to fetch count");
      }

      const countResult = await countResponse.json();
      setTotalRows(countResult[0].total);

      // Then get the actual data
      const response = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT 
              id,
              audio_chunk_id,
              offset_index,
              timestamp,
              transcription,
              device,
              is_input_device,
              speaker_id,
              transcription_engine
            FROM audio_transcriptions 
            WHERE ${filterClauses}
            ORDER BY timestamp DESC
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
        `failed to load audio transcriptions: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };
  const loadDevices = async () => {
    try {
      // Fetch audio devices
      const audioDevicesResponse = await fetch(
        "http://localhost:3030/audio/list"
      );
      if (!audioDevicesResponse.ok) {
        throw new Error("Failed to fetch audio devices");
      }
      const audioDevices: AudioDevice[] = await audioDevicesResponse.json();
      console.log("audioDevices", audioDevices);
      setAvailableAudioDevices(
        audioDevices.map((device) => ({
          name: device.name
            .replace("(input)", "")
            .replace("(default)", "")
            .trimEnd(),
          is_default: device.is_default,
        }))
      );
    } catch (error) {
      console.error("Failed to load devices:", error);
    }
  };
  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);

    return () => clearTimeout(timer);
  }, [transcriptionFilter, deviceFilter, pageIndex, pageSize]);

  React.useEffect(() => {
    loadDevices();
  }, []);

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
          <Input
            placeholder="filter transcription..."
            value={transcriptionFilter}
            onChange={(event) => {
              setTranscriptionFilter(event.target.value);
              setPageIndex(0);
            }}
            className="max-w-sm"
          />
          {availableAudioDevices.length > 0 && (
            <Select
              value={deviceFilter}
              onValueChange={(value) => {
                setDeviceFilter(value);
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="filter by device..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>audio devices</SelectLabel>
                  {availableAudioDevices.map((device) => (
                    <SelectItem key={device.name} value={device.name}>
                      {device.name} {device.is_default && "(default)"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="icon"
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
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          next
        </Button>
      </div>
    </div>
  );
}
