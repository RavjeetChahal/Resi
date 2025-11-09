import { useEffect, useState } from "react";
import { get, onValue, ref, update } from "firebase/database";
import { getFirebaseDatabase } from "./firebase";
import { mockIssues } from "../assets/data/issues";

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

const normalizeStatus = (value) => {
  if (!value) return "open";
  return value.toString().trim().toLowerCase().replace(/\s+/g, "_");
};

const normalizeUrgency = (value) => {
  if (!value) return "LOW";
  return value.toString().trim().toUpperCase();
};

const buildDisplayId = (rawId, explicitId) => {
  if (explicitId) return explicitId;
  if (!rawId) return "ISS-UNKNOWN";
  return `ISS-${rawId.slice(-6).toUpperCase()}`;
};

const parseDateValue = (value) => {
  if (!value && value !== 0) {
    return null;
  }
  if (typeof value === "object" && value?.seconds) {
    return new Date(value.seconds * 1000).toISOString();
  }
  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const determineIssueTeam = (payload = {}) => {
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

const normalizeIssue = (id, payload) => {
  if (!id || !payload) return null;

  const status = normalizeStatus(payload.status);
  const closedAtRaw = payload.closedAt || payload.closed_at || null;
  const closedAt = parseDateValue(closedAtRaw);
  const reportedAt =
    parseDateValue(
      payload.reportedAt ||
        payload.reported_at ||
        payload.createdAt ||
        payload.created_at ||
        payload.timestamp
    ) || null;
  return {
    id,
    displayId: buildDisplayId(id, payload.id),
    category: payload.category || "Maintenance",
    issueType: payload.issue_type || payload.issueType || "General",
    summary:
      payload.summary ||
      payload.transcript ||
      payload.notes ||
      "Issue reported in MoveMate.",
    location: payload.location || "Unknown location",
    urgency: normalizeUrgency(payload.urgency),
    status,
    reportedBy: payload.reportedBy || payload.reported_by || null,
    reportedAt,
    transcript: payload.transcript || null,
    closedAt,
    team: determineIssueTeam(payload),
    queuePosition: payload.queuePosition || payload.queue_position || null,
    raw: payload,
  };
};

const fromArray = (items = []) =>
  items
    .map((item) => normalizeIssue(item.id ?? item.id, item))
    .filter(Boolean);

const fromSnapshot = (snapshot) => {
  const value = snapshot?.val();
  if (!value) return [];
  return Object.entries(value)
    .map(([key, data]) => normalizeIssue(key, data))
    .filter(Boolean);
};

export const fetchIssues = async () => {
  const db = getFirebaseDatabase();
  if (!db) {
    console.warn(
      "[Issues] Firebase not configured. Using mock issues as fallback."
    );
    return fromArray(mockIssues);
  }

  const snap = await get(ref(db, "tickets"));
  if (!snap.exists()) {
    return [];
  }
  return fromSnapshot(snap);
};

export const subscribeToIssues = (callback) => {
  const db = getFirebaseDatabase();
  if (!db) {
    console.warn(
      "[Issues] Firebase not configured. Using mock issues as fallback."
    );
    callback(fromArray(mockIssues));
    return () => {};
  }

  const unsubscribe = onValue(
    ref(db, "tickets"),
    (snapshot) => {
      callback(fromSnapshot(snapshot));
    },
    (error) => {
      console.error("[Issues] Failed to subscribe to tickets:", error);
      callback([]);
    }
  );

  return () => unsubscribe();
};

export const useIssues = () => {
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToIssues(setIssues);
    return () => unsubscribe?.();
  }, []);

  return issues;
};

export const updateIssueStatus = async (issueId, nextStatus) => {
  const db = getFirebaseDatabase();
  if (!db) {
    throw new Error("Firebase database is not configured.");
  }

  const normalizedStatus = normalizeStatus(nextStatus);
  const nowIso = new Date().toISOString();
  await update(ref(db, `tickets/${issueId}`), {
    status: normalizedStatus,
    updatedAt: nowIso,
    closedAt: normalizedStatus === "closed" ? nowIso : null,
  });
};

export const updateIssueQueuePosition = async (issueId, position) => {
  const db = getFirebaseDatabase();
  if (!db) {
    throw new Error("Firebase database is not configured.");
  }
  await update(ref(db, `tickets/${issueId}`), {
    queuePosition: position,
    updatedAt: new Date().toISOString(),
  });
};
