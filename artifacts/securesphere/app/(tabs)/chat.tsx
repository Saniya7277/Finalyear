import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserCard";
import { DUMMY_USERS } from "@/data/mockData";

export default function Chat() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [conversations, setConversations] = useState<any[]>([]);

  // Get teammates (accepted collaborators)
  const teammates = DUMMY_USERS.filter((u) => u.inviteStatus === "accepted");

  const renderTeammate = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[
        styles.teammateCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <UserAvatar name={item.name} color={item.avatarColor} size={44} />
      <View style={styles.teammateInfo}>
        <Text style={[styles.teammateName, { color: colors.foreground }]}>
          {item.name}
        </Text>
        <Text
          style={[styles.teammateEmail, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {item.email}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.mutedForeground}
      />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Chat</Text>
      </View>

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconBox,
              { backgroundColor: `${colors.primary}15` },
            ]}
          >
            <Ionicons
              name="chatbubbles-outline"
              size={56}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No active conversations
          </Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Start a new conversation with your teammates
          </Text>

          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={20} color={colors.primaryForeground} />
            <Text
              style={[
                styles.startButtonText,
                { color: colors.primaryForeground },
              ]}
            >
              Start New Chat
            </Text>
          </TouchableOpacity>

          {teammates.length > 0 && (
            <>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: colors.mutedForeground, marginTop: 40 },
                ]}
              >
                Your Teammates
              </Text>
              <View style={{ width: "100%", paddingHorizontal: 20 }}>
                <FlatList
                  data={teammates}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTeammate}
                  scrollEnabled={false}
                  contentContainerStyle={{ gap: 8 }}
                />
              </View>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.conversationCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.conversationTitle, { color: colors.foreground }]}
              >
                {item.title}
              </Text>
            </View>
          )}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "web" ? 84 : 90,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orbTL: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(0,102,255,0.05)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "web" ? 84 : 90,
  },
  emptyIconBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 28,
  },

  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  startButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 16,
    alignSelf: "flex-start",
    paddingLeft: 20,
  },

  teammateCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  teammateInfo: { flex: 1 },
  teammateName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  teammateEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },

  conversationCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  conversationTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
