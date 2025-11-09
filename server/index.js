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
const port = process.env.PORT || 3000;

const allowedOrigins = (
  process.env.CORS_ALLOW_ORIGINS || "http://localhost:8081"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
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
  const stateForPrompt = JSON.stringify(contextForPrompt, null, 2);

  const systemPrompt = `
You are MoveMate, an AI assistant that triages dorm and residential life issues.
You maintain context of the conversation and build a complete understanding of the issue over multiple interactions.

CRITICAL: You MUST preserve all previously collected field values. If a field already has a value in the conversation state and the user doesn't provide new information for that field, you MUST keep the existing value. Never replace collected values with empty strings, "Unknown", or null.

Always respond in the following JSON format:
{
  "timestamp": "ISO 8601 timestamp (use existing value from conversation state, or set once at conversation start)",
  "category": "Maintenance | Resident Life (keep existing if already set)",
  "issue_type": "Short label for the issue (keep existing if already set)",
  "location": "UMass campus location like 'John Adams Dorm 716' (keep existing if already set)",
  "urgency": "HIGH | MEDIUM | LOW (keep existing if already set)",
  "summary": "One-sentence summary (keep existing if already set)",
  "reply": "Friendly acknowledgement and next steps",
  "needs_more_info": true/false
}

Current conversation state (PRESERVE ALL EXISTING VALUES):
${stateForPrompt}

Category rules:
- Use \"Maintenance\" for physical issues (plumbing, electrical, HVAC, pests, infrastructure damage, accessibility barriers, etc.).
- Use \"Resident Life\" for behavioral, community, staffing, programming, policy, and wellbeing concerns.
- If the report is primarily a personal safety, health, or emergency issue, classify as \"Maintenance\" with HIGH urgency and clearly note the nature of the emergency in the summary so staff can escalate.

Urgency rules:
- HIGH: fire, gas leaks, flooding, electrical shorts, medical or personal safety emergencies, total power loss, inoperative elevator with occupants, or anything that could cause immediate harm.
- MEDIUM: active but contained leaks, repeated disruptive noise, outages impacting multiple residents, broken fixtures, pests, accessibility impediments, temperature control failures.
- LOW: cosmetic damage, one-off noise complaints, information requests, minor inconveniences, housekeeping questions, general inquiries.

If any required field is missing or incomplete, set needs_more_info to true and ask for the specific missing details in the reply. When you already have a value for a field and the user does not give new information for that field on the current turn, keep the previously recorded value instead of sending an empty string, null, or placeholder.

Location rules:
- Only accept UMass Amherst campus locations. Reference the specific residence hall, apartment complex, academic building, dining hall, transportation hub, or outdoor campus space impacted.
- For residence halls, prefer "<Dorm Name> Dorm <Room/Area>" (e.g., "John Adams Dorm 716") or a clearly named shared area ("John Adams laundry room (basement)"). If the issue affects the entire building, use just the building name (e.g., "John Adams").
- For non-residence facilities, capture the official facility name and specific area if possible (e.g., "Franklin Dining Commons kitchen", "Integrated Sciences Building lobby").
- If the resident uses an abbreviation, nickname, or speaks phonetically ("JA 716", "Southwest mailroom"), restate or clarify it into the official building name before saving it.
- If the resident truly cannot give a room number, capture the best available detail (e.g., building + floor or common area) and explain in the reply what additional detail is needed.
- If they mention multiple buildings or areas, list each UMass location involved (e.g., "John Adams and John Quincy courtyard") and ensure the summary makes the scope clear.
- If the user gives an off-campus or clearly invalid location, politely remind them MoveMate only handles UMass Amherst properties and ask them to provide the correct on-campus location before completion.

Timestamp rules:
- Always include the ISO 8601 timestamp for when this conversation started in the "timestamp" field.
- Preserve the same timestamp value on every response, even when collecting more details. Do not overwrite it with the current time.
- If the existing conversation state already contains a timestamp, reuse it. Only set a new timestamp the very first time (when no timestamp has been captured yet) using the supplied conversation start value.

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
  const firebase = initFirebase();
  if (!firebase) {
    return null;
  }

  const db = firebase.database();
  const ref = db.ref("tickets").push();
  const ticketsSnapshot = await db.ref("tickets").once("value");
  const existingTickets = ticketsSnapshot.val() || {};
  const queuePositions = Object.values(existingTickets)
    .map((ticket) => Number(ticket.queuePosition))
    .filter((value) => Number.isFinite(value) && value > 0);
  const nextQueuePosition =
    queuePositions.length > 0 ? Math.max(...queuePositions) + 1 : 1;
  const ticket = {
    ...payload,
    status: "open",
    timestamp: new Date().toISOString(),
    queuePosition: nextQueuePosition,
  };
  await ref.set(ticket);
  return { id: ref.key, ...ticket };
};

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

    try {
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
app.listen(port, () => {
  console.log(`MoveMate server listening on http://localhost:${port}`);
});
