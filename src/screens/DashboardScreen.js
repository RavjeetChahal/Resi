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
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, shadows } from "../theme/colors";
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
  const { logout, role } = useAuth();
  const issuesData = useIssues();

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const issuesForRole = useMemo(() => {
    if (role === "maintenance") {
      return issuesData.filter((issue) => issue.team === "maintenance");
    }
    if (role === "ra") {
      return issuesData.filter((issue) => issue.team === "ra");
    }
    return issuesData;
  }, [issuesData, role]);

  const { sortedIssues, filteredIssues } = useMemo(() => {
    const now = nowTick;
    const visibleIssues = issuesForRole.filter((issue) => {
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
  }, [filterUrgency, issuesForRole, nowTick]);

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
      <LinearGradient
        colors={gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBackground}
      />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Team Ops</Text>
            <Text style={styles.title}>
              {role === "maintenance"
                ? "Maintenance Command Center"
                : role === "ra"
                ? "Resident Life Command Center"
                : "Live Issue Queue"}
            </Text>
            <Text style={styles.subtitle}>
              Track the requests that matter most. Prioritised by urgency and
              freshness so your team can respond in record time.
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Open Tickets</Text>
            <Text style={styles.metricValue}>
              {sortedIssues.filter((issue) => issue.status !== "closed").length}
            </Text>
            <Text style={styles.metricHint}>
              Updated {new Date(nowTick).toLocaleTimeString()}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Team Focus</Text>
            <Text style={styles.metricValue}>
              {role === "maintenance"
                ? "Maintenance"
                : role === "ra"
                ? "Resident Life"
                : "All"}
            </Text>
            <Text style={styles.metricHint}>
              Showing tickets routed to your team
            </Text>
          </View>
        </View>

        <View style={styles.filtersCard}>
          <Text style={styles.filtersLabel}>Filter by urgency</Text>
          <View style={styles.filters}>
            {["ALL", "HIGH", "MEDIUM", "LOW"].map((level) => {
              const isActive = filterUrgency === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.filterChip,
                    isActive && styles.filterChipActive,
                  ]}
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
        </View>

        <FlatList
          data={filteredIssues}
          keyExtractor={(item) => item.id}
          style={styles.list}
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
    minHeight: 0,
  },
  heroBackground: {
    position: "absolute",
    top: -180,
    left: -120,
    right: -120,
    height: 360,
    opacity: 0.35,
  },
  container: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 32,
    gap: 24,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E0E7FF",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.surface,
    marginTop: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(241, 245, 255, 0.82)",
    marginTop: 10,
    maxWidth: 520,
    lineHeight: 21,
  },
  logoutButton: {
    position: "absolute",
    right: 0,
    top: 0,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
  },
  logoutText: {
    fontSize: 13,
    color: colors.surface,
    fontWeight: "600",
  },
  topBar: {
    position: "relative",
    borderRadius: 28,
    padding: 26,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    overflow: "hidden",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.18)",
    ...shadows.card,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  metricValue: {
    marginTop: 12,
    fontSize: 26,
    fontWeight: "800",
    color: colors.primaryDark,
  },
  metricHint: {
    marginTop: 8,
    color: colors.muted,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderWidth: 0,
    backgroundColor: "rgba(99,102,241,0.12)",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  filterTextActive: {
    color: colors.primaryDark,
  },
  filtersCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.1)",
    ...shadows.card,
  },
  filtersLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 64,
    paddingTop: 8,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
});
