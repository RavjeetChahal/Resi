import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, shadows } from '../theme/colors';

const urgencyColors = {
  HIGH: colors.danger,
  MEDIUM: colors.warning,
  LOW: colors.success,
};

export const IssueCard = ({ issue, onPress }) => {
  return (
    <Pressable style={({ pressed }) => [styles.container, pressed && styles.pressed]} onPress={() => onPress?.(issue)}>
      <View style={styles.header}>
        <Text style={styles.id}>{issue.id}</Text>
        <View style={[styles.badge, { backgroundColor: `${urgencyColors[issue.urgency]}22` }]}>
          <Text style={[styles.badgeText, { color: urgencyColors[issue.urgency] }]}>{issue.urgency}</Text>
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
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Status</Text>
        <Text style={styles.metaText}>{issue.status}</Text>
      </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  id: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.4,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summary: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
});

