import React, { useMemo, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { IssueCard } from '../components/IssueCard';
import { useAuth } from '../context/AuthContext';
import { useIssues } from '../services/issueService';

const urgencyOrder = ['HIGH', 'MEDIUM', 'LOW'];

const DashboardScreen = ({ navigation }) => {
  const [filterUrgency, setFilterUrgency] = useState('ALL');
  const { resetRole } = useAuth();
  const issuesData = useIssues();

  const issues = useMemo(() => {
    const sorted = [...issuesData].sort(
      (a, b) => urgencyOrder.indexOf(a.urgency) - urgencyOrder.indexOf(b.urgency),
    );
    if (filterUrgency === 'ALL') return sorted;
    return sorted.filter((issue) => issue.urgency === filterUrgency);
  }, [filterUrgency, issuesData]);

  const handleLogout = () => {
    resetRole();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Team Dashboard</Text>
            <Text style={styles.title}>Live issue queue</Text>
            <Text style={styles.subtitle}>
              Track high-urgency tickets in real time as MoveMate routes new reports to your team.
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filters}>
          {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((level) => {
            const isActive = filterUrgency === level;
            return (
              <TouchableOpacity
                key={level}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilterUrgency(level)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{level}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FlatList
          data={issues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          renderItem={({ item }) => <IssueCard issue={item} />}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
};

export default DashboardScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 8,
  },
  logoutButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFFAA',
  },
  logoutText: {
    fontSize: 13,
    color: colors.muted,
  },
  filters: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 32,
  },
});

