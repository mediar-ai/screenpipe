// inbox-server.ts
import express from "express";

const actionCallbacks = new Map<string, () => Promise<void>>();

export async function startInboxServer(port: number): Promise<express.Express> {
  const app = express();
  app.use(express.json());

  // cors middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.post("/action", (req, res) => {
    const { action } = req.body;
    const callback = actionCallbacks.get(action);
    if (callback) {
      callback()
        .then(() => {
          res.json({ success: true });
          actionCallbacks.delete(action);
        })
        .catch((error) => {
          console.error("action callback failed:", error);
          res.status(500).json({ success: false, error: error.message });
        });
    } else {
      res.status(404).json({ success: false, error: "action not found" });
    }
  });

  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`action server listening on port ${port}`);
      resolve(app);
    });
  });
}

export { actionCallbacks };
