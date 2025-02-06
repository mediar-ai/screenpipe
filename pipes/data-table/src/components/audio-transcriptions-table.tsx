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
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Search,
  Mic2,
  Users,
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
  speaker_name: string | null;
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
    cell: ({ row }) => {
      const deviceName = `${row.getValue("device")}${
        row.original.is_input_device ? " (input)" : " (output)"
      }`;
      return (
        <div className="relative group">
          <Badge variant="outline" className="max-w-[200px] truncate">
            {deviceName}
          </Badge>
          <div className="absolute z-50 hidden group-hover:block bg-popover text-popover-foreground px-2 py-1 rounded-md text-sm -top-8 left-0 whitespace-nowrap shadow-md">
            {deviceName}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "speaker_id",
    header: "Speaker ID",
    cell: ({ row }) => (
      <Badge variant="secondary">
        {row.getValue("speaker_id") ?? "unknown"}
      </Badge>
    ),
  },
  {
    accessorKey: "speaker_name",
    header: "Speaker Name",
    cell: ({ row }) => (
      <Badge variant="outline">
        {row.getValue("speaker_name") ?? "unnamed"}
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

  const [pageSize, setPageSize] = React.useState(9);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [totalRows, setTotalRows] = React.useState(0);

  const [transcriptionFilter, setTranscriptionFilter] = React.useState("");
  const [deviceFilter, setDeviceFilter] = React.useState("");
  const [speakerFilter, setSpeakerFilter] = React.useState("");
  const [availableAudioDevices, setAvailableAudioDevices] = React.useState<
    AudioDevice[]
  >([]);
  const [availableSpeakers, setAvailableSpeakers] = React.useState<
    { id: number; name: string }[]
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
        speakerFilter
          ? `s.name = '${speakerFilter.replace(/'/g, "''")}'`
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
            FROM audio_transcriptions at
            LEFT JOIN speakers s ON at.speaker_id = s.id 
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
              at.id,
              at.audio_chunk_id,
              at.offset_index,
              at.timestamp,
              at.transcription,
              at.device,
              at.is_input_device,
              at.speaker_id,
              s.name as speaker_name,
              at.transcription_engine
            FROM audio_transcriptions at
            LEFT JOIN speakers s ON at.speaker_id = s.id 
            WHERE ${filterClauses}
            ORDER BY at.timestamp DESC
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
  const loadSpeakers = async () => {
    try {
      const response = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `SELECT DISTINCT id, name FROM speakers WHERE name IS NOT NULL ORDER BY name`,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch speakers");
      }
      const speakers = await response.json();
      setAvailableSpeakers(speakers);
    } catch (error) {
      console.error("Failed to load speakers:", error);
    }
  };
  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);

    return () => clearTimeout(timer);
  }, [transcriptionFilter, deviceFilter, speakerFilter, pageIndex, pageSize]);

  React.useEffect(() => {
    loadDevices();
  }, []);

  React.useEffect(() => {
    loadSpeakers();
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
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="filter transcription..."
              value={transcriptionFilter}
              onChange={(event) => {
                setTranscriptionFilter(event.target.value);
                setPageIndex(0);
              }}
              className="max-w-sm pl-8"
            />
          </div>

          {availableAudioDevices.length > 0 && (
            <Select
              value={deviceFilter}
              onValueChange={(value) => {
                setDeviceFilter(value);
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <Mic2 className="mr-2 h-4 w-4" />
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

          {availableSpeakers.length > 0 && (
            <Select
              value={speakerFilter}
              onValueChange={(value) => {
                setSpeakerFilter(value);
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <Users className="mr-2 h-4 w-4" />
                <SelectValue placeholder="filter by speaker..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>speakers</SelectLabel>
                  {availableSpeakers.map((speaker) => (
                    <SelectItem key={speaker.id} value={speaker.name}>
                      {speaker.name}
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
