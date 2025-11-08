import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export const ChatBubble = ({ sender, text }) => {
  const isResident = sender === 'Resident';
  return (
    <View style={[styles.container, isResident ? styles.resident : styles.movemate]}>
      <Text style={[styles.sender, isResident && styles.senderResident]}>{sender}</Text>
      <Text style={[styles.text, isResident && styles.textResident]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    maxWidth: '85%',
  },
  movemate: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resident: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  sender: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 4,
  },
  senderResident: {
    color: '#D0E6FF',
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  textResident: {
    color: '#FFFFFF',
  },
});

