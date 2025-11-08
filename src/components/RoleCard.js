import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, shadows } from '../theme/colors';

export const RoleCard = ({ title, description, onPress, isPrimary = false }) => {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={[styles.badge, isPrimary && styles.badgePrimary]}>
        <Text style={[styles.badgeText, isPrimary && styles.badgeTextPrimary]}>{isPrimary ? 'Recommended' : 'Alternate'}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#E7ECF5',
  },
  badgePrimary: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  badgeTextPrimary: {
    color: '#FFFFFF',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
});

