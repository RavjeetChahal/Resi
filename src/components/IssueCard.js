import React from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, shadows } from "../theme/colors";

const urgencyColors = {
  HIGH: colors.danger,
  MEDIUM: colors.warning,
  LOW: colors.success,
  UNKNOWN: colors.warning,
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

const formatTimestamp = (timestamp) => {
  if (!timestamp && timestamp !== 0) return null;

  const date =
    typeof timestamp === "number"
      ? new Date(timestamp)
      : new Date(String(timestamp));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return formatter.format(date);
  } catch {
    return date.toLocaleString();
  }
};

export const IssueCard = ({ issue, position, onPress, onStatusChange }) => {
  const displayId = issue.displayId || issue.id;
  const statusValue = (issue.status || "open").toLowerCase();
  const urgency = issue.urgency || "UNKNOWN";
  const reportedAtLabel = formatTimestamp(issue.reportedAt);
  const showReported = Boolean(reportedAtLabel);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => onPress?.(issue)}
    >
      <View style={styles.header}>
        <View style={styles.identifier}>
          <Text style={styles.positionLabel}>
            {typeof position === "number" ? `#${position}` : displayId}
          </Text>
        </View>
        <View
          style={[
            styles.badge,
            { backgroundColor: `${(urgencyColors[urgency] ?? colors.warning)}22` },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: urgencyColors[urgency] ?? colors.warning },
            ]}
          >
            {urgency}
          </Text>
        </View>
      </View>

      <Text style={styles.summary}>{issue.summary}</Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{issue.category}</Text>
        <Text style={styles.metaText}>{issue.issueType}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Location</Text>
        <Text style={styles.metaText}>{issue.location}</Text>
      </View>
      <View style={styles.statusSection}>
        <Text style={styles.metaLabel}>Status</Text>
        <View style={styles.chipsRow}>
          {STATUS_OPTIONS.map((option) => {
            const isActive = statusValue === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.statusChip,
                  isActive && styles.statusChipActive,
                ]}
                onPress={() => {
                  if (!isActive) {
                    onStatusChange?.(option.value);
                  }
                }}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    isActive && styles.statusChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Ticket</Text>
        <Text style={styles.metaText}>{displayId}</Text>
      </View>
      {showReported && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Reported</Text>
          <Text style={styles.metaText}>{reportedAtLabel}</Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.94,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  identifier: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  positionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  summary: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  metaText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  statusSection: {
    gap: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusChipActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}16`,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  statusChipTextActive: {
    color: colors.primary,
  },
});
