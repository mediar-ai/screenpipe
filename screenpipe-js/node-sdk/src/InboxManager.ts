import { ChildProcess, fork } from "child_process";
import type { InboxMessage } from "../../common/types";
import { type AddressInfo, createServer } from "net";

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

export class InboxManager {
  private actionServerPort?: number;
  private actionServerProcess?: ChildProcess;

  async send(message: InboxMessage): Promise<boolean> {
    if (!this.actionServerPort) {
      this.actionServerPort = await getAvailablePort();
      this.actionServerProcess = fork("./inbox-server.js", [
        this.actionServerPort.toString(),
      ]);
    }

    if (message.actions) {
      message.actions = message.actions.map((action) => {
        const actionId = crypto.randomUUID();
        return {
          label: action.label,
          action: actionId,
          port: this.actionServerPort,
          callback: action.callback,
        };
      });
    }

    try {
      const response = await fetch("http://localhost:11435/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...message,
          type: "inbox",
          actionServerPort: this.actionServerPort,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("failed to send inbox message:", error);
      return false;
    }
  }
}
