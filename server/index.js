const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { formidable } = require("formidable");
const { OpenAI } = require("openai");
const admin = require("firebase-admin");
const conversationManager = require("./conversation-manager");
const { getConversation, updateConversation } = conversationManager;
require("dotenv").config();
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[server] OPENAI_API_KEY is not set. Whisper transcription will fail."
  );
}

if (!process.env.CORS_ALLOW_ORIGINS) {
  console.warn(
    "[server] CORS_ALLOW_ORIGINS not provided. Defaulting to http://localhost:8081"
  );
}

const app = express();
const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || 3000;

const allowedOrigins = (
  process.env.CORS_ALLOW_ORIGINS || "http://localhost:8081"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const RA_KEYWORDS = [
  "roommate",
  "dispute",
  "noise",
  "loud",
  "music",
  "party",
  "alcohol",
  "medical",
  "injury",
  "emergency",
  "wellness",
  "behavior",
  "safety",
  "dorm",
  "furniture",
  "damage",
];

const MAINTENANCE_KEYWORDS = [
  "heat",
  "heating",
  "hvac",
  "ac",
  "air",
  "water",
  "leak",
  "plumbing",
  "pipe",
  "electrical",
  "outlet",
  "light",
  "bulb",
  "power",
  "appliance",
  "laundry",
  "trash",
  "mold",
  "pest",
];

// Serve static files from Expo web build
// Expo SDK 54+ outputs to 'dist' directory when using Metro bundler
const webBuildPath = path.join(__dirname, "..", "dist");
app.use(
  express.static(webBuildPath, {
    setHeaders: (res, filePath) => {
      // Disable caching for HTML and JS files to ensure users get the latest version
      if (filePath.endsWith(".html") || filePath.endsWith(".js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn("[server] Blocked CORS origin", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

let firebaseApp;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  if (
    !process.env.FIREBASE_SERVICE_ACCOUNT ||
    !process.env.FIREBASE_DATABASE_URL
  ) {
    return null;
  }

  const serviceAccount =
    typeof process.env.FIREBASE_SERVICE_ACCOUNT === "string"
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : process.env.FIREBASE_SERVICE_ACCOUNT;

  firebaseApp = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });

  return firebaseApp;
};

const determineTicketTeam = (payload = {}) => {
  if (payload.team) {
    return payload.team;
  }

  const category = (payload.category || "").toLowerCase();
  const text = `${payload.issue_type || payload.issueType || ""} ${
    payload.summary || ""
  }`.toLowerCase();

  const matches = (keywords) =>
    keywords.some((keyword) => text.includes(keyword));

  if (matches(RA_KEYWORDS) || category === "resident life") {
    return "ra";
  }

  if (matches(MAINTENANCE_KEYWORDS) || category === "maintenance") {
    return "maintenance";
  }

  return "ra";
};

const openaiClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
};

const classifyTranscript = async ({ transcript, conversationId }) => {
  const client = openaiClient();

  const currentState = getConversation(conversationId);
  const conversationStart = currentState?.timestamp || new Date().toISOString();
  const contextForPrompt = { ...currentState, timestamp: conversationStart };

  try {
    console.log("[server] Conversation context for prompt", {
      conversationId,
      context: contextForPrompt,
    });
  } catch (logErr) {
    console.warn(
      "[server] Failed to log context for prompt",
      logErr.message || logErr
    );
  }

  const systemPrompt = `
You are MoveMate, an AI assistant that triages dorm and residential life issues.
You maintain context of the conversation and build a complete understanding of the issue over multiple interactions.
Always respond in the following JSON format, preserving any previously collected information:
{
  "category": "Maintenance | Resident Life",
  "issue_type": "Short label for the issue",
  "location": "Where the issue occurs or \"Unknown\"",
  "urgency": "HIGH | MEDIUM | LOW",
  "summary": "One-sentence summary of the issue",
  "reply": "Friendly acknowledgement and next steps",
  "needs_more_info": true/false (whether you need more details to complete the report)
}

Current conversation state:
${JSON.stringify(currentState, null, 2)}

Urgency rules:
- HIGH: water/gas leaks, electrical sparks, fire, medical emergencies, safety threats.
- MEDIUM: active leaks, repeated noise issues, broken fixtures, pests.
- LOW: cosmetic damage, general questions, mild discomfort, information requests.

If any required field is missing or incomplete, set needs_more_info to true and ask for the specific missing details in the reply.

When ALL required fields (category, issue_type, location, urgency, summary) are complete and needs_more_info is false, give a warm goodbye in the reply thanking the user for reporting the issue and letting them know the ticket has been created and the appropriate team will be notified. Make it friendly and reassuring.
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4-turbo",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Transcript: """${transcript}"""`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Failed to classify transcript");
  }

  const classification = JSON.parse(raw);
  if (!classification.timestamp) {
    classification.timestamp = conversationStart;
  }
  updateConversation(conversationId, classification);
  try {
    const mergedContext = getConversation(conversationId);
    console.log("[server] Conversation context updated", {
      conversationId,
      context: mergedContext,
    });
  } catch (logErr) {
    console.warn(
      "[server] Failed to log conversation context",
      logErr.message || logErr
    );
  }

  return classification;
};

const persistTicket = async (payload) => {
  console.log("[server] ===== persistTicket CALLED =====");
  console.log("[server] Payload:", {
    category: payload.category,
    issue_type: payload.issue_type,
    owner: payload.owner,
  });

  const firebase = initFirebase();
  if (!firebase) {
    console.log("[server] ERROR: Firebase not initialized!");
    return null;
  }

  const db = firebase.database();
  const team = determineTicketTeam(payload);
  console.log("[server] Team determined:", team);

  // Calculate queue position: count existing open tickets for this team
  console.log("[server] Counting existing tickets for team:", team);
  const ticketsSnapshot = await db.ref("tickets").once("value");
  const allTickets = ticketsSnapshot.val() || {};
  const openTicketsForTeam = Object.values(allTickets).filter(
    (t) =>
      t.team === team && (t.status === "open" || t.status === "in_progress")
  );
  const queuePosition = openTicketsForTeam.length + 1;

  console.log("[server] Assigning queue position:", {
    team,
    openTicketsCount: openTicketsForTeam.length,
    newQueuePosition: queuePosition,
  });

  const ref = db.ref("tickets").push();
  const ticket = {
    ...payload,
    team,
    status: "open",
    queuePosition,
    timestamp: new Date().toISOString(),
  };
  console.log(
    "[server] Saving ticket with owner:",
    ticket.owner,
    "queuePosition:",
    queuePosition
  );
  await ref.set(ticket);
  console.log("[server] Ticket saved! ID:", ref.key);
  return { id: ref.key, ...ticket };
};

// One-time migration: Assign queue positions to tickets that don't have them
const backfillQueuePositions = async () => {
  const firebase = initFirebase();
  if (!firebase) {
    console.log("[server] Firebase not available, skipping queue backfill");
    return;
  }

  console.log("[server] Starting queue position backfill...");
  const db = firebase.database();
  const ticketsSnapshot = await db.ref("tickets").once("value");
  const allTickets = ticketsSnapshot.val() || {};

  // Group tickets by team and count positions
  const teamQueues = { maintenance: [], ra: [] };

  Object.entries(allTickets).forEach(([id, ticket]) => {
    // Infer team from category if not set
    const team =
      ticket.team ||
      (ticket.category === "Resident Life"
        ? "ra"
        : ticket.category === "Maintenance"
        ? "maintenance"
        : null);

    console.log(`[server] Backfill checking ticket ${id.substring(0, 10)}:`, {
      status: ticket.status,
      team,
      category: ticket.category,
      hasQueue:
        ticket.queuePosition !== null && ticket.queuePosition !== undefined,
      queuePosition: ticket.queuePosition,
    });

    // Include tickets with undefined status (treat as open) or explicitly open/in_progress
    const isOpenTicket =
      !ticket.status ||
      ticket.status === "open" ||
      ticket.status === "in_progress";

    if (isOpenTicket && team) {
      teamQueues[team] = teamQueues[team] || [];
      teamQueues[team].push({ id, ticket: { ...ticket, team } });
    }
  });

  // Sort each team's queue by timestamp and assign positions
  const updates = {};
  for (const [team, tickets] of Object.entries(teamQueues)) {
    if (!tickets.length) continue;

    console.log(
      `[server] Processing ${tickets.length} tickets for team: ${team}`
    );

    // Sort by timestamp
    tickets.sort((a, b) => {
      const timeA = new Date(a.ticket.timestamp || 0).getTime();
      const timeB = new Date(b.ticket.timestamp || 0).getTime();
      return timeA - timeB;
    });

    // Assign queue positions, team, and status (if missing)
    tickets.forEach((item, index) => {
      const expectedPosition = index + 1;
      if (item.ticket.queuePosition !== expectedPosition) {
        updates[`tickets/${item.id}/queuePosition`] = expectedPosition;
        console.log(
          `[server] Backfilling queue position: ${item.id} → ${expectedPosition} (${team})`
        );
      }
      // Also set team if it's missing
      if (!item.ticket.team) {
        updates[`tickets/${item.id}/team`] = team;
        console.log(`[server] Backfilling team: ${item.id} → ${team}`);
      }
      // Set status to "open" if it's missing
      if (!item.ticket.status) {
        updates[`tickets/${item.id}/status`] = "open";
        console.log(`[server] Backfilling status: ${item.id} → open`);
      }
    });
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    console.log(
      `[server] Queue backfill complete: ${
        Object.keys(updates).length
      } tickets updated`
    );
  } else {
    console.log("[server] Queue backfill: no updates needed");
  }
};

// Run backfill on server start
setTimeout(() => {
  backfillQueuePositions().catch((err) => {
    console.error("[server] Queue backfill failed:", err);
  });
}, 2000); // Wait 2 seconds for Firebase to initialize

// Auto-sync queue positions every 5 seconds
setInterval(() => {
  backfillQueuePositions().catch((err) => {
    console.error("[server] Auto queue sync failed:", err);
  });
}, 5000); // Run every 5 seconds

const uploadDir = path.join(__dirname, "..", ".tmp");
fs.mkdirSync(uploadDir, { recursive: true });

const formParser = formidable({
  multiples: false,
  maxFileSize: 25 * 1024 * 1024,
  uploadDir,
  keepExtensions: true,
});

app.post("/api/processInput", (req, res) => {
  console.log(
    "[server] Incoming /api/processInput request from",
    req.headers["user-agent"]
  );
  formParser.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Upload error:", err);
      res.status(400).json({ error: "Invalid audio upload" });
      return;
    }

    const fileEntry = Array.isArray(files.file) ? files.file[0] : files.file;
    const audioFile = fileEntry || null;
    if (!audioFile) {
      res.status(400).json({ error: "Audio file is required" });
      return;
    }

    console.log("[server] Audio upload received", {
      filename: audioFile.originalFilename,
      mimetype: audioFile.mimetype,
      size: audioFile.size,
      filepath: audioFile.filepath,
      conversationId: fields?.conversationId,
    });

    const audioFilePath =
      audioFile.filepath ||
      audioFile.path ||
      audioFile._writeStream?.path ||
      audioFile.file?.filepath ||
      audioFile.file?.path;

    if (!audioFilePath) {
      console.error("[server] Uploaded file missing filepath", audioFile);
      res.status(500).json({ error: "Uploaded file path is missing" });
      return;
    }

    const conversationId = fields?.conversationId;
    try {
      console.time("[server] whisper+gpt pipeline");
      const client = openaiClient();

      const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: "whisper-1",
        response_format: "text",
      });

      const transcript =
        typeof transcription === "string" ? transcription : transcription.text;
      console.log("[server] Whisper transcription complete", {
        hasTranscript: Boolean(transcript),
      });

      if (!transcript) {
        res.status(200).json({ transcript: "" });
        return;
      }

      let classification = null;
      let ticketRecord = null;
      const conversationId = fields.conversationId?.[0] || `conv-${Date.now()}`;
      const userId = fields.userId?.[0] || null;
      console.log(
        "[server] Processing request with conversationId:",
        conversationId,
        "userId:",
        userId
      );

      try {
        classification = await classifyTranscript({
          transcript,
          conversationId,
        });
        console.log("[server] Classification complete", classification);

        // Only persist ticket if schema is complete (needs_more_info = false)
        if (classification && !classification.needs_more_info) {
          ticketRecord = await persistTicket({
            transcript,
            category: classification.category,
            issue_type: classification.issue_type,
            location: classification.location,
            urgency: classification.urgency,
            summary: classification.summary,
            conversation_timestamp: classification.timestamp,
            owner: userId,
          });
          if (ticketRecord) {
            console.log(
              "[server] Ticket persisted (schema complete)",
              ticketRecord.id
            );
          }
        } else {
          console.log(
            "[server] Ticket NOT persisted - more info needed",
            classification
          );
        }
      } catch (classificationError) {
        console.warn(
          "Classification or persistence failed:",
          classificationError.message
        );
      }

      const reply =
        classification?.reply ||
        "Thanks! MoveMate captured your issue and will share updates once a team member picks it up.";

      // Attempt to generate TTS audio and include it in the response. If TTS fails,
      // fall back to a text-only reply.
      try {
        const speechResponse = await client.audio.speech.create({
          model: "tts-1",
          voice: "nova",
          input: reply,
        });

        const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
        const audioBase64 = audioBuffer.toString("base64");

        res.status(200).json({
          transcript,
          ticket: ticketRecord,
          classification,
          reply,
          context: getConversation(conversationId),
          audio: {
            data: audioBase64,
            contentType: "audio/mpeg",
          },
        });
        console.log("[server] Response with TTS audio sent to client");
        console.timeEnd("[server] whisper+gpt pipeline");
      } catch (ttsError) {
        console.warn(
          "[server] TTS generation failed:",
          ttsError?.message || ttsError
        );
        res.status(200).json({
          transcript,
          ticket: ticketRecord,
          classification,
          reply,
          context: getConversation(conversationId),
        });
        console.log("[server] Response (text-only) sent to client");
        console.timeEnd("[server] whisper+gpt pipeline");
      }
    } catch (processingError) {
      console.error("Processing error:", processingError);
      res.status(500).json({
        error: "Failed to transcribe audio",
        details: processingError.message,
      });
    } finally {
      if (audioFile?.filepath) {
        fs.promises.unlink(audioFile.filepath).catch(() => undefined);
      }
    }
  });
});

app.get("/health", (req, res) => {
  console.log("[server] /health check", {
    origin: req.headers.origin,
    ip: req.ip,
    ua: req.headers["user-agent"],
  });
  res.json({ status: "ok" });
});

app.get("/api/version", (req, res) => {
  const distExists = fs.existsSync(webBuildPath);
  const indexExists = fs.existsSync(path.join(webBuildPath, "index.html"));
  const files = distExists ? fs.readdirSync(webBuildPath) : [];
  res.json({
    buildTime: new Date().toISOString(),
    distExists,
    indexExists,
    files,
    nodeVersion: process.version,
  });
});

// Serve index.html for all non-API routes (SPA fallback)
app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(webBuildPath, "index.html"));
});

app.listen(port, host, () => {
  console.log(`MoveMate server listening on http://${host}:${port}`);
});
