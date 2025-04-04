import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { getAvailableDatabases } from "@/lib/notion/notion";
import { NotionCredentials } from "@/lib/types";
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from "@/components/ui/select";

interface NotionIdInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  dialogTitle: string;
}

export function NotionIdInput({
  label,
  value,
  onChange,
  dialogTitle,
}: NotionIdInputProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const extractIdFromUrl = (url: string) => {
    try {
      const match = url.match(/notion\.so\/(?:[^/]+\/)?([a-zA-Z0-9]{32})/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  };

  const handleUrlSubmit = (url: string) => {
    const id = extractIdFromUrl(url);
    if (id) {
      onChange(id);
      setIsDialogOpen(false);
    } else {
      toast({
        title: "Error",
        description: "Invalid Notion URL",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
          Get ID from URL
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Notion Database URL</Label>
              <Input
                placeholder="https://www.notion.so/..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUrlSubmit(e.currentTarget.value);
                  }
                }}
              />
            </div>
            <Button
              className="w-full"
              onClick={(e) => {
                const input =
                  e.currentTarget.parentElement?.querySelector("input");
                if (input) handleUrlSubmit(input.value);
              }}
            >
              Extract ID
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface NotionDatabaseSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  accessToken: string;
}

interface Database {
  id: string;
  title: string;
}

export function NotionDatabaseSelector({
  label,
  value,
  onChange,
  accessToken,
}: NotionDatabaseSelectorProps) {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchDatabases = async () => {
      if (!accessToken) return;
      setIsLoading(true);
      try {
        const databases = await getAvailableDatabases(accessToken);
        setDatabases(databases);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDatabases();
  }, [accessToken]);
  

  return (
   <div className="space-y-2">
    <Label>{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading databases..." : label}>
          {isLoading ? "Loading..." : databases.find(db => db.id.replaceAll("-", "") === value.replaceAll("-", ""))?.title || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <SelectItem value="loading">Loading...</SelectItem>
        ) : databases.length > 0 ?  (
          databases.map((database) => (
            <SelectItem key={database.id} value={database.id}>
              {database.title}
            </SelectItem>
          ))
        ) : (
          <SelectItem value="no-databases">No databases found</SelectItem>
        )}
      </SelectContent>
    </Select>
   </div>
  )
}
