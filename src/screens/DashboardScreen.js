import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CommonActions } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { colors } from "../theme/colors";
import { IssueCard } from "../components/IssueCard";
import { useAuth } from "../context/AuthContext";
import {
  updateIssueQueuePosition,
  updateIssueStatus,
  useIssues,
} from "../services/issueService";

const urgencyOrder = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"];
const CLOSED_HIDE_DELAY_MS = 7000;

const DashboardScreen = ({ navigation }) => {
  const [filterUrgency, setFilterUrgency] = useState("ALL");
  const [nowTick, setNowTick] = useState(Date.now());
  const { logout } = useAuth();
  const issuesData = useIssues();

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { sortedIssues, filteredIssues } = useMemo(() => {
    const now = nowTick;
    const visibleIssues = issuesData.filter((issue) => {
      if (issue.status !== "closed") {
        return true;
      }
      if (!issue.closedAt) {
        return true;
      }
      const closedMs = new Date(issue.closedAt).getTime();
      if (Number.isNaN(closedMs)) {
        return true;
      }
      return now - closedMs < CLOSED_HIDE_DELAY_MS;
    });

    const getUrgencyIndex = (issue) => {
      const idx = urgencyOrder.indexOf(issue.urgency);
      return idx === -1 ? urgencyOrder.length : idx;
    };

    const getReportedAtMs = (issue) => {
      if (!issue.reportedAt) {
        return Number.MAX_SAFE_INTEGER;
      }
      const value = new Date(issue.reportedAt).getTime();
      return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
    };

    const sorted = [...visibleIssues].sort((a, b) => {
      const urgencyDiff = getUrgencyIndex(a) - getUrgencyIndex(b);
      if (urgencyDiff !== 0) {
        return urgencyDiff;
      }
      return getReportedAtMs(a) - getReportedAtMs(b);
    });

    const filteredList =
      filterUrgency === "ALL"
        ? sorted
        : sorted.filter((issue) => issue.urgency === filterUrgency);

    return { sortedIssues: sorted, filteredIssues: filteredList };
  }, [filterUrgency, issuesData, nowTick]);

  useEffect(() => {
    if (!sortedIssues.length) {
      return;
    }

    const syncPositions = async () => {
      const updates = [];
      sortedIssues.forEach((issue, index) => {
        const expectedPosition = index + 1;
        if (issue.queuePosition !== expectedPosition) {
          updates.push(
            updateIssueQueuePosition(issue.id, expectedPosition).catch(
              (error) => {
                console.warn(
                  "[Dashboard] Failed to sync queue position",
                  issue.id,
                  error
                );
              }
            )
          );
        }
      });
      if (updates.length) {
        await Promise.all(updates);
      }
    };

    syncPositions();
  }, [sortedIssues]);

  const handleLogout = useCallback(async () => {
    console.log("[Dashboard] Signing out user");
    await logout();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "RoleSelect" }],
      })
    );
  }, [logout, navigation]);

  const handleStatusChange = useCallback(async (issueId, nextStatus) => {
    try {
      await updateIssueStatus(issueId, nextStatus);
    } catch (error) {
      console.error("[Dashboard] Failed to update ticket status:", error);
      Alert.alert(
        "Update failed",
        "We couldn't update the ticket status. Please try again."
      );
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Team Dashboard</Text>
            <Text style={styles.title}>Live issue queue</Text>
            <Text style={styles.subtitle}>
              Track high-urgency tickets in real time as MoveMate routes new
              reports to your team.
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filters}>
          {["ALL", "HIGH", "MEDIUM", "LOW"].map((level) => {
            const isActive = filterUrgency === level;
            return (
              <TouchableOpacity
                key={level}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilterUrgency(level)}
              >
                <Text
                  style={[
                    styles.filterText,
                    isActive && styles.filterTextActive,
                  ]}
                >
                  {level}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FlatList
          data={filteredIssues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          renderItem={({ item, index }) => (
            <IssueCard
              issue={item}
              position={index + 1}
              onStatusChange={(status) => handleStatusChange(item.id, status)}
            />
          )}
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
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 8,
  },
  logoutButton: {
    position: "absolute",
    right: 0,
    top: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFFAA",
  },
  logoutText: {
    fontSize: 13,
    color: colors.muted,
  },
  filters: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    paddingBottom: 32,
  },
});
