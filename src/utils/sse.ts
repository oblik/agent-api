import { type Response, Router } from "express";
import type { RawAction } from "./types.js";

const sseConnections = new Map<string, Response>();

const sseRouter = Router();

export const sendInference = (
  message: string,
  actions?: RawAction[],
  simulationId?: string,
) => {
  const connection = sseConnections?.get(simulationId || "");

  if (connection) {
    const inferenceData = {
      type: "inference",
      message: message,
      timestamp: Date.now(),
      actions,
    };

    // Send a message in SSE format
    // Double newline is required for SSE
    connection.write(`data: ${JSON.stringify(inferenceData)}\n\n`);
  }
};

sseRouter.get("/", (req, res) => {
  try {
    const { simulationId } = req.query;

    if (!simulationId || typeof simulationId !== "string") {
      console.error("Backend: Invalid simulationId provided");
      return res.status(400).send("Valid simulationId is required");
    }

    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(
      `data: ${JSON.stringify({
        type: "connected",
        simulationId,
      })}\n\n`,
    );

    const pingInterval = setInterval(() => {
      res.write(
        `data: ${JSON.stringify({
          type: "ping",
          timestamp: Date.now(),
        })}\n\n`,
      );
    }, 10000);

    sseConnections.set(simulationId, res);

    req.on("close", () => {
      sseConnections.delete(simulationId);
      clearInterval(pingInterval);
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
});

export { sseRouter };
