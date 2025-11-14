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
import {
  getDefaultWeek,
  getPreviousWeek,
  getNextWeek,
  formatWeekRange,
  getClosedTicketsForWeek,
} from "../utils/weekUtils";

const urgencyOrder = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"];

const DashboardScreen = ({ navigation }) => {
  console.log("[Dashboard] Component mounted/rendered");
  const [viewMode, setViewMode] = useState("queue"); // "queue" or "calendar"
  const [filterUrgency, setFilterUrgency] = useState("ALL");
  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedWeek, setSelectedWeek] = useState(getDefaultWeek());
  const { logout, role } = useAuth();
  const issuesData = useIssues();
  console.log("[Dashboard] issuesData loaded, count:", issuesData.length);

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

  // Separate open and closed issues
  const { openIssues, closedIssues } = useMemo(() => {
    const open = issuesForRole.filter((issue) => issue.status !== "closed");
    const closed = issuesForRole.filter((issue) => issue.status === "closed");
    return { openIssues: open, closedIssues: closed };
  }, [issuesForRole]);

  // Queue view: sorted open issues by urgency
  const { sortedOpenIssues, filteredOpenIssues } = useMemo(() => {
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

    const sorted = [...openIssues].sort((a, b) => {
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

    return { sortedOpenIssues: sorted, filteredOpenIssues: filteredList };
  }, [filterUrgency, openIssues]);

  // Calendar view: closed issues for selected week, sorted by closed date
  const { weekClosedIssues, sortedWeekClosedIssues } = useMemo(() => {
    const weekTickets = getClosedTicketsForWeek(closedIssues, selectedWeek);
    
    const sorted = [...weekTickets].sort((a, b) => {
      const aClosed = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bClosed = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return bClosed - aClosed; // Most recent first
    });

    return { weekClosedIssues: weekTickets, sortedWeekClosedIssues: sorted };
  }, [closedIssues, selectedWeek]);

  useEffect(() => {
    console.log("[Dashboard] sortedOpenIssues changed, count:", sortedOpenIssues.length);
    if (!sortedOpenIssues.length) {
      console.log("[Dashboard] No issues to sync");
      return;
    }

    const syncPositions = async () => {
      const updates = [];
      console.log("[Dashboard] Checking queue positions for", sortedOpenIssues.length, "issues");
      sortedOpenIssues.forEach((issue, index) => {
        const expectedPosition = index + 1;
        console.log("[Dashboard] Issue queue check:", {
          id: issue.id.substring(0, 10),
          currentQueue: issue.queuePosition,
          expectedQueue: expectedPosition,
          match: issue.queuePosition === expectedPosition,
        });
        if (issue.queuePosition !== expectedPosition) {
          console.log("[Dashboard] Queue position mismatch - will update:", {
            id: issue.id,
            current: issue.queuePosition,
            expected: expectedPosition,
          });
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
        console.log("[Dashboard] Syncing", updates.length, "queue positions");
        await Promise.all(updates);
        console.log("[Dashboard] Queue sync complete");
      } else {
        console.log("[Dashboard] All queue positions already in sync");
      }
    };

    syncPositions();
  }, [sortedOpenIssues]);

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

  const handlePreviousWeek = useCallback(() => {
    setSelectedWeek(getPreviousWeek(selectedWeek));
  }, [selectedWeek]);

  const handleNextWeek = useCallback(() => {
    setSelectedWeek(getNextWeek(selectedWeek));
  }, [selectedWeek]);

  const displayIssues = viewMode === "queue" ? filteredOpenIssues : sortedWeekClosedIssues;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient
        colors={gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroOverlay}
      />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Resi Command</Text>
            <Text style={styles.title}>
              {role === "maintenance"
                ? "Maintenance Operations"
                : role === "ra"
                ? "Resident Life Operations"
                : "Live Issue Queue"}
            </Text>
            <Text style={styles.subtitle}>
              Monitor the requests that matter most. Prioritized by urgency and
              freshness so your team can respond instantly.
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Open tickets</Text>
            <Text style={styles.metricValue}>
              {openIssues.length}
            </Text>
            <Text style={styles.metricHint}>
              Updated {new Date(nowTick).toLocaleTimeString()}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Queue focus</Text>
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

        {/* View Mode Toggle */}
        <View style={styles.viewModeCard}>
          <Text style={styles.viewModeLabel}>View</Text>
          <View style={styles.viewModeButtons}>
            <TouchableOpacity
              style={[
                styles.viewModeButton,
                viewMode === "queue" && styles.viewModeButtonActive,
              ]}
              onPress={() => setViewMode("queue")}
            >
              <Text
                style={[
                  styles.viewModeButtonText,
                  viewMode === "queue" && styles.viewModeButtonTextActive,
                ]}
              >
                Queue
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewModeButton,
                viewMode === "calendar" && styles.viewModeButtonActive,
              ]}
              onPress={() => setViewMode("calendar")}
            >
              <Text
                style={[
                  styles.viewModeButtonText,
                  viewMode === "calendar" && styles.viewModeButtonTextActive,
                ]}
              >
                Calendar
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Week Navigation (only in Calendar view) */}
        {viewMode === "calendar" && (
          <View style={styles.weekNavigationCard}>
            <TouchableOpacity
              style={styles.weekNavButton}
              onPress={handlePreviousWeek}
            >
              <Text style={styles.weekNavButtonText}>← Previous</Text>
            </TouchableOpacity>
            <View style={styles.weekNavCenter}>
              <Text style={styles.weekNavLabel}>Week of</Text>
              <Text style={styles.weekNavDate}>
                {formatWeekRange(selectedWeek)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.weekNavButton}
              onPress={handleNextWeek}
            >
              <Text style={styles.weekNavButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Urgency Filter (only in Queue view) */}
        {viewMode === "queue" && (
          <View style={styles.filtersCard}>
            <Text style={styles.filtersLabel}>Filter by urgency</Text>
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
                      style={[styles.filterText, isActive && styles.filterTextActive]}
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Empty state messages */}
        {viewMode === "queue" && displayIssues.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No open tickets {filterUrgency !== "ALL" ? `with ${filterUrgency} urgency` : ""}
            </Text>
          </View>
        )}

        {viewMode === "calendar" && displayIssues.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No closed tickets for this week
            </Text>
          </View>
        )}

        <FlatList
          data={displayIssues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          renderItem={({ item, index }) => (
            <IssueCard
              issue={item}
              position={viewMode === "queue" ? index + 1 : null}
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
  heroOverlay: {
    position: "absolute",
    top: -260,
    left: -180,
    right: -180,
    height: 520,
    opacity: 0.28,
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 20,
  },
  topBar: {
    position: "relative",
    borderRadius: 26,
    padding: 22,
    backgroundColor: "rgba(8, 12, 26, 0.85)",
    overflow: "hidden",
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    marginTop: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(221,227,250,0.78)",
    marginTop: 10,
    maxWidth: 520,
    lineHeight: 22,
  },
  logoutButton: {
    position: "absolute",
    right: 20,
    top: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.78)",
  },
  logoutText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
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
    borderColor: "rgba(127,92,255,0.18)",
    ...shadows.card,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  metricValue: {
    marginTop: 10,
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
  },
  metricHint: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
  },
  filtersCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(127,92,255,0.18)",
    ...shadows.card,
  },
  filtersLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 0,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: {
    backgroundColor: "rgba(127,92,255,0.24)",
  },
  filterText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  filterTextActive: {
    color: colors.primary,
  },
  listContent: {
    paddingBottom: 72,
    paddingTop: 6,
  },
  viewModeCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(127,92,255,0.18)",
    ...shadows.card,
  },
  viewModeLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  viewModeButtons: {
    flexDirection: "row",
    gap: 12,
  },
  viewModeButton: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 0,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
  },
  viewModeButtonActive: {
    backgroundColor: "rgba(127,92,255,0.24)",
  },
  viewModeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  viewModeButtonTextActive: {
    color: colors.primary,
  },
  weekNavigationCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(127,92,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...shadows.card,
  },
  weekNavButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  weekNavButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  weekNavCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 16,
  },
  weekNavLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  weekNavDate: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});
