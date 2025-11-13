// server/vapi-webhook.js
const express = require("express");
const admin = require("firebase-admin");
const conversationManager = require("./conversation-manager");
const { getConversation, updateConversation } = conversationManager;

const router = express.Router();

// Helper function to initialize Firebase (reuse from server/index.js)
const initFirebase = () => {
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

  return admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
};

const determineTicketTeam = (payload = {}) => {
  if (payload.team) return payload.team;

  const category = (payload.category || "").toLowerCase();
  const text = `${payload.issue_type || payload.issueType || ""} ${
    payload.summary || ""
  }`.toLowerCase();

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

const persistTicket = async (payload) => {
  console.log("[vapi-webhook] ===== persistTicket CALLED =====");
  const firebase = initFirebase();
  if (!firebase) {
    console.log("[vapi-webhook] ERROR: Firebase not initialized!");
    return null;
  }

  const db = firebase.database();
  const team = determineTicketTeam(payload);

  // Calculate queue position
  const ticketsSnapshot = await db.ref("tickets").once("value");
  const allTickets = ticketsSnapshot.val() || {};
  const openTicketsForTeam = Object.values(allTickets).filter(
    (t) =>
      t.team === team && (t.status === "open" || t.status === "in_progress")
  );
  const queuePosition = openTicketsForTeam.length + 1;

  const ref = db.ref("tickets").push();
  const ticket = {
    ...payload,
    team,
    status: "open",
    queuePosition,
    timestamp: new Date().toISOString(),
  };

  await ref.set(ticket);
  console.log("[vapi-webhook] Ticket saved! ID:", ref.key);
  return { id: ref.key, ...ticket };
};

// Parse classification from Vapi function call or message
const parseClassificationFromVapi = (functionCallResult) => {
  try {
    // Vapi will call a function with the extracted data
    // The function result should contain the classification
    if (typeof functionCallResult === "string") {
      return JSON.parse(functionCallResult);
    }
    return functionCallResult;
  } catch (error) {
    console.error("[vapi-webhook] Failed to parse classification:", error);
    return null;
  }
};

const handleFunctionCallResult = async (message) => {
  const { functionCall, result } = message;
  console.log(
    "[vapi-webhook] Function call result:",
    functionCall.name,
    result
  );

  // Store the classification in conversation context
  if (functionCall.name === "extract_issue_info") {
    const classification = parseClassificationFromVapi(result);
    if (classification) {
      const conversationId =
        message.call?.custom?.conversationId || `conv-${Date.now()}`;
      updateConversation(conversationId, classification);
    }
  }
};

const handleEndOfCall = async (message) => {
  console.log("[vapi-webhook] Call ended, processing final data");

  const call = message.call;
  const conversationId = call?.custom?.conversationId;
  const userId = call?.custom?.userId;

  if (!conversationId) {
    console.warn("[vapi-webhook] No conversation ID in call data");
    return;
  }

  // Get final classification from conversation context
  const classification = getConversation(conversationId);

  // Check if we have all required fields
  const requiredFields = [
    "category",
    "issue_type",
    "location",
    "urgency",
    "summary",
  ];
  const hasAllFields = requiredFields.every((field) => classification[field]);

  if (hasAllFields && !classification.needs_more_info) {
    // Create ticket
    const ticketRecord = await persistTicket({
      transcript: call.transcript || "",
      category: classification.category,
      issue_type: classification.issue_type,
      location: classification.location,
      urgency: classification.urgency,
      summary: classification.summary,
      conversation_timestamp:
        classification.timestamp || new Date().toISOString(),
      owner: userId,
    });

    console.log("[vapi-webhook] Ticket created:", ticketRecord?.id);
  } else {
    console.log(
      "[vapi-webhook] Ticket NOT created - missing required fields or needs more info"
    );
  }
};

// Webhook endpoint to receive Vapi events
router.post("/vapi/webhook", express.json(), async (req, res) => {
  console.log("[vapi-webhook] Received event:", req.body.message?.type);

  const { message } = req.body;

  // Respond immediately to prevent timeout
  res.status(200).json({ received: true });

  try {
    switch (message.type) {
      case "status-update":
        console.log(
          `[vapi-webhook] Call ${message.call?.id}: ${message.call?.status}`
        );
        // Handle call status changes (started, ended, etc.)
        if (message.call?.status === "ended") {
          await handleEndOfCall(message);
        }
        break;

      case "transcript":
        // Handle real-time transcripts
        console.log(
          `[vapi-webhook] Transcript [${message.role}]: ${message.transcript}`
        );
        // You can store transcripts in conversation context if needed
        break;

      case "function-call":
        // Vapi calls a function to extract structured data
        console.log(
          "[vapi-webhook] Function call:",
          message.functionCall?.name,
          message.functionCall?.parameters
        );
        // The function call is handled by Vapi, but we can log it
        break;

      case "function-call-result":
        // Result from function call
        await handleFunctionCallResult(message);
        break;

      case "end-of-call-report":
        // Call ended - extract final data and create ticket
        await handleEndOfCall(message);
        break;

      default:
        console.log(`[vapi-webhook] Unhandled event type: ${message.type}`);
    }
  } catch (error) {
    console.error("[vapi-webhook] Error processing event:", error);
  }
});

module.exports = router;

