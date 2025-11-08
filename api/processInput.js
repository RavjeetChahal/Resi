const fs = require("fs");
const formidable = require("formidable");
const { OpenAI } = require("openai");
const admin = require("firebase-admin");

let firebaseApp;

const initFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  if (
    !process.env.FIREBASE_SERVICE_ACCOUNT ||
    !process.env.FIREBASE_DATABASE_URL
  ) {
    console.warn(
      "Firebase environment variables missing. Skipping database persistence."
    );
    return null;
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

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

const classifyTranscript = async ({ transcript }) => {
  const client = openaiClient();

  const systemPrompt = `
You are MoveMate, an AI assistant that triages dorm and residential life issues.
Always respond in the following JSON format:
{
  "category": "Maintenance | Resident Life",
  "issue_type": "Short label for the issue",
  "location": "Where the issue occurs or "Unknown"",
  "urgency": "HIGH | MEDIUM | LOW",
  "summary": "One-sentence summary of the issue",
  "reply": "Friendly acknowledgement and next steps"
}

Urgency rules:
- HIGH: water/gas leaks, electrical sparks, fire, medical emergencies, safety threats.
- MEDIUM: active leaks, repeated noise issues, broken fixtures, pests.
- LOW: cosmetic damage, general questions, mild discomfort, information requests.
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
  return JSON.parse(raw);
};

const persistTicket = async (payload) => {
  const app = initFirebase();
  if (!app) {
    return null;
  }

  const db = app.database();
  const ref = db.ref("tickets").push();
  const ticket = {
    ...payload,
    status: "open",
    timestamp: new Date().toISOString(),
  };
  await ref.set(ticket);
  return { id: ref.key, ...ticket };
};

const applyCors = (req, res) => {
  const origins = process.env.CORS_ALLOW_ORIGINS
    ? process.env.CORS_ALLOW_ORIGINS.split(",").map((origin) => origin.trim())
    : ["*"];
  const requestOrigin = req.headers.origin;
  const allowOrigin = origins.includes("*")
    ? "*"
    : origins.find((origin) => origin === requestOrigin) || origins[0];

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
};

const handler = async (req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const form = formidable({
    multiples: false,
    maxFileSize: 25 * 1024 * 1024,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Upload error:", err);
      res.status(400).json({ error: "Invalid audio upload" });
      return;
    }

    const audioFile = files.file;
    if (!audioFile) {
      res.status(400).json({ error: "Audio file is required" });
      return;
    }

    try {
      const client = openaiClient();

      const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(audioFile.filepath),
        model: "whisper-1",
        response_format: "text",
      });

      const transcript =
        typeof transcription === "string" ? transcription : transcription.text;

      if (!transcript) {
        res.status(200).json({ transcript: "" });
        return;
      }

      let classification = null;
      let ticketRecord = null;

      try {
        classification = await classifyTranscript({ transcript });
        ticketRecord = await persistTicket({
          transcript,
          category: classification.category,
          issue_type: classification.issue_type,
          location: classification.location,
          urgency: classification.urgency,
          summary: classification.summary,
        });
      } catch (classificationError) {
        console.warn(
          "Classification or persistence failed:",
          classificationError.message
        );
      }

      res.status(200).json({
        transcript,
        ticket: ticketRecord,
        classification,
        reply:
          classification?.reply ||
          "Thanks! MoveMate captured your issue and will share updates once a team member picks it up.",
      });
    } catch (processingError) {
      console.error("Processing error:", processingError);
      res.status(500).json({
        error: "Failed to transcribe audio",
        details: processingError.message,
      });
    }
  });
};

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
