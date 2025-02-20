type Result<T> = { success: true; data: T } | { success: false; error: any };

export class PipesManager {
  async list(): Promise<Result<string[]>> {
    try {
      const apiUrl = "http://localhost:3030";
      const response = await fetch(`${apiUrl}/pipes/list`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }   

      const data = await response.json();
      return { success: true, data: data.data };
    } catch (error) {
      console.error("failed to list pipes:", error);
      return { success: false, error: error };
    }
  }

  async download(url: string): Promise<Result<Record<string, any>>> {
    try {
      const apiUrl = "http://localhost:3030";
      const response = await fetch(`${apiUrl}/pipes/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
        }),
      });

      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }   

      const data: Record<string, any> = await response.json();
      return { success: true, data: data.data };
    } catch (error) {
      console.error("failed to download pipe:", error);
      return { success: false, error: error };
    }
  }

  async enable(pipeId: string): Promise<boolean> {
    try {
      const apiUrl = "http://localhost:3030";
      const response = await fetch(`${apiUrl}/pipes/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipe_id: pipeId,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("failed to enable pipe:", error);
      return false;
    }
  }

  async disable(pipeId: string): Promise<boolean> {
    try {
      const apiUrl = "http://localhost:3030";
      const response = await fetch(`${apiUrl}/pipes/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipe_id: pipeId,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("failed to disable pipe:", error);
      return false;
    }
  }

  async update(
    pipeId: string,
    config: { [key: string]: string },
  ): Promise<boolean> {
    try {
      const apiUrl = "http://localhost:3030";
      const response = await fetch(`${apiUrl}/pipes/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipe_id: pipeId,
          config,
        }),
      }); 

      return response.ok;
    } catch (error) {
      console.error("failed to update pipe:", error);
      return false;
    }
  }

  async info(pipeId: string): Promise<Result<Record<string, any>>> {
    try {
      const apiUrl = "http://localhost:3030";
      const response = await fetch(`${apiUrl}/pipes/info/${pipeId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }

      const data: Record<string, any> = await response.json();
      return { success: true, data: data.data };
    } catch (error) {
      console.error("failed to get pipe info:", error);
      return { success: false, error: error };
    }
  }

  async downloadPrivate(
    url: string,
    pipeName: string,
    pipeId: string
  ): Promise<Result<Record<string, any>>> {
    try {
      const apiUrl = "http://localhost:3030";
      const response = await fetch(`${apiUrl}/pipes/download-private`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          pipe_name: pipeName,
          pipe_id: pipeId,
        }),
      });

      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }

      const data: Record<string, any> = await response.json();
      return { success: true, data: data.data };
    } catch (error) {
      console.error("failed to download private pipe:", error);
      return { success: false, error: error };
    }
  }

  async delete(pipeId: string): Promise<boolean> {
    try {
      const apiUrl = "http://localhost:3030";
      const response = await fetch(`${apiUrl}/pipes/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipe_id: pipeId,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("failed to delete pipe:", error);
      return false;
    }
  }
}

