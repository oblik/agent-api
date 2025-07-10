import { writeFile } from "node:fs/promises";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";
import dotEnv from "dotenv";
import express, {
  type Request,
  type Response,
  type NextFunction,
  type Express,
} from "express";
import httpStatus from "http-status";
import jwt from "jsonwebtoken";
import moment from "moment-timezone";
import Moralis from "moralis";
import { Tracking, initModels } from "./db/index.js";
import apiRouters from "./routes/index.js";
import { isNaNValue } from "./utils/index.js";
import { sfConsoleError } from "./utils/log.js";
import { sseRouter } from "./utils/sse.js";

dotEnv.config();

const aiport =
  Number(process.env.AI_PORT) || Number(process.env.PORT || 5000) + 1000;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const app: Express = express();
let moralisInitialized = false;

// Enable cors
app.use(
  cors({
    origin: true, // Allow all origins in development
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(async (req, res, next) => {
  if (!moralisInitialized) {
    await Moralis.start({ apiKey: process.env.MORALIS_API_KEY });
    moralisInitialized = true;
  }
  await initModels();
  next();
});

// Configuring body parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Add OPTIONS handling for preflight requests
app.options("*", cors());

async function authorize(req: Request, res: Response, next: NextFunction) {
  const authIgnorePaths = [
    "/auth",
    "/auth/sol",
    "/user",
    "/settings",
    "/accrued-fees",
    "/submit-errors",
    "/unsubscribe",
    "/verified-entities",
    "/protocol-tokens",
  ];
  const backendSecret = process.env.BACKEND_TOKEN_SECRET;
  const isDevelopment = process.env.NODE_ENV === "development";

  // Bypass auth in development mode when backend secret matches
  if (isDevelopment && backendSecret && req.query.secret === backendSecret) {
    next();
    return;
  }

  if (
    authIgnorePaths.includes(req.path) ||
    (backendSecret && req.query.secret === backendSecret)
  ) {
    next();
    return;
  }

  try {
    const { accountAddress, address } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (
        !req.url.includes("0x6ED5b1F41072ff460105249ab251875c71460770") &&
        !req.url.includes("0xd8b07BC1bC3bAe553BCA5E94E99935dC12Df24Ff")
      ) {
        sfConsoleError(
          "authorization was missing",
          req.url,
          JSON.stringify(req.headers, null, 2),
          accountAddress,
          address,
        );
      }
      if (
        !accountAddress ||
        accountAddress.toLowerCase() ===
          "0xd8b07bc1bc3bae553bca5e94e99935dc12df24ff" ||
        accountAddress.toLowerCase() ===
          "0x6ed5b1f41072ff460105249ab251875c71460770"
      ) {
        return res.status(httpStatus.UNAUTHORIZED).json({
          status: "error",
          message: "Unauthorized!",
        });
      }
      throw new Error("Unauthorized!");
    }

    const token = authHeader.split(" ")[1];

    // Verify JWT token for both EVM and Solana
    const user = jwt.verify(
      token,
      process.env.JWT_ACCESS_TOKEN_SECRET ?? "",
    ) as {
      address: string;
    };

    if (
      user.address.toLowerCase() !== accountAddress?.toLowerCase() &&
      user.address.toLowerCase() !== address?.toLowerCase()
    ) {
      sfConsoleError(
        "authorization was incorrect",
        user,
        accountAddress,
        address,
      );
      throw new Error("Unauthorized!");
    }

    next();
  } catch (error) {
    sfConsoleError(error);
    res.status(httpStatus.UNAUTHORIZED).json({
      status: "error",
      message: "Unauthorized!",
    });
  }
}

// log req and res
app.post("*", (req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    const isExcludedEndpoint =
      /^\/(token-info|history|token-price|token-logo|token-balances|token-suggestions|token-history|user|settings|accrued-fees|protocol-positions|new-prompts|submit-errors)/i.test(
        req.url,
      );

    const urlPath = req.url.split("?")[0];
    const isEmptyConditionEndpoint =
      urlPath === "/condition" &&
      (typeof body === "string" ? JSON.parse(body) : body)?.conditions
        ?.length === 0;

    if (!isExcludedEndpoint && !isEmptyConditionEndpoint) {
      console.dir(
        {
          url: req.url,
          query: req.query,
          reqBody: req.body,
          statusCode: res.statusCode,
          body,
        },
        { showHidden: true, depth: null },
      );
    }
    return originalSend.call(this, body);
  };
  next();
});

app.post("*", authorize);

app.use("/api/sse", sseRouter);

// Add the apiRoutes stack to the server
app.use("/", apiRouters);

app.post("/process-message", (req, res) => {
  axios
    .post(`http://127.0.0.1:${aiport}/process-message`, req.body)
    .then(async (response) => {
      try {
        const { posthogSessionId } = req.body;
        const messageId = Number.parseInt(response.data?.data?.message_id);
        if (!isNaNValue(messageId)) {
          const tracking = await Tracking.findOne({
            where: { id: messageId },
          });
          if (tracking) {
            if (posthogSessionId) {
              tracking.set(
                "posthog",
                `https://us.posthog.com/project/43081/replay/${posthogSessionId}`,
              );
            }
            tracking.set(
              "logs",
              `https://admin.spicefi.xyz/devops/v1/journal?env=prod&unit=wallet-api&since=${moment
                .tz(new Date(), "America/New_York")
                .format("YYYY-MM-DD HH:mm:ss")}`,
            );
            await tracking.save();
          }
        }
      } catch (err) {
        sfConsoleError(err);
      }
      res.json(response.data);
    })
    .catch((error) => {
      sfConsoleError(error);
      console.log(aiport);
      res.status(500).json({ message: "Error forwarding request" });
    });
});

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

app.get("/discord", (_req: Request, res: Response) => {
  const authUrl =
    "https://discord.com/oauth2/authorize?client_id=1322653426961743897&response_type=code&redirect_uri=https%3A%2F%2Ftestapi.slate.ceo%2Fv1%2Fdiscord-redirect&scope=guilds+identify+messages.read+guilds.members.read";
  res.redirect(authUrl);
});

app.get("/discord-redirect", async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("No code provided");
  }

  try {
    // Exchange the code for a token
    const formData = new URLSearchParams({
      client_id: CLIENT_ID || "",
      client_secret: CLIENT_SECRET || "",
      grant_type: "authorization_code",
      code: code as string,
      redirect_uri: REDIRECT_URI || "",
    });

    const response = await axios.post<TokenResponse>(
      "https://discord.com/api/oauth2/token",
      formData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    // Save the token information
    await writeFile(
      "discord_token.json",
      JSON.stringify(response.data, null, 4),
    );

    res.send(`
          <h1>Success!</h1>
          <p>Token has been saved.</p>
          <p>You can close this window now.</p>
      `);
  } catch (error) {
    console.error("Error exchanging code for token:", error);
    if (axios.isAxiosError(error)) {
      res.status(500).send(`Error: ${error.response?.data || error.message}`);
    } else {
      res.status(500).send("An unexpected error occurred");
    }
  }
});

export default app;
