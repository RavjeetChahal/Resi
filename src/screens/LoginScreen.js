import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { RoleCard } from '../components/RoleCard';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

const roleOptions = [
  {
    key: 'resident',
    title: 'Resident',
    description: 'Report maintenance or residential life issues quickly using your voice.',
    primary: true,
  },
  {
    key: 'maintenance',
    title: 'Maintenance',
    description: 'Review, prioritize, and resolve maintenance tickets in real time.',
  },
  {
    key: 'ra',
    title: 'Resident Assistant',
    description: 'Stay on top of student-life issues and coordinate follow-ups.',
  },
];

const LoginScreen = ({ navigation }) => {
  const { setRole } = useAuth();

  const handleSelectRole = (roleKey) => {
    setRole(roleKey);
    const destination = roleKey === 'resident' ? 'Home' : 'Dashboard';
    navigation.reset({
      index: 0,
      routes: [{ name: destination }],
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MoveMate</Text>
          <Text style={styles.title}>Choose how you’ll use MoveMate</Text>
          <Text style={styles.subtitle}>
            Residents can report issues with voice. Maintenance teams and RAs can triage live issues from their
            dashboards.
          </Text>
        </View>

        <View style={styles.rolesGrid}>
          {roleOptions.map((role) => (
            <RoleCard
              key={role.key}
              title={role.title}
              description={role.description}
              isPrimary={role.primary}
              onPress={() => handleSelectRole(role.key)}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 28,
  },
  header: {
    gap: 12,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  rolesGrid: {
    flex: 1,
    gap: 18,
  },
});

