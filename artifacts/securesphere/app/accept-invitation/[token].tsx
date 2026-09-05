import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  savePendingInvitation,
  clearPendingInvitation,
} from "@/lib/pendingInvitation";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

/**
 * Landing screen for the invitation links sent by email
 * (`FRONTEND_URL/accept-invitation/<token>`).
 *
 * The token alone is not enough to join: the server also checks that the signed
 * in account's email matches the address that was invited. So this screen has
 * to handle arriving signed out, arriving as the wrong person, and arriving
 * with a link that has expired or already been used.
 */
type Status =
  | "checking"
  | "needsSignIn"
  | "accepting"
  | "accepted"
  | "wrongAccount"
  | "error";

interface Teammate {
  id: string;
  name: string | null;
  email: string;
}

export default function AcceptInvitation() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [teammate, setTeammate] = useState<Teammate | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const accept = useCallback(async () => {
    if (!token) {
      setStatus("error");
      setMessage("This invitation link is missing its token.");
      return;
    }

    setStatus("accepting");

    try {
      const sessionToken = await getToken();
      if (!sessionToken) {
        setStatus("needsSignIn");
        return;
      }

      const authHeaders = {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      };

      // Make sure this account exists in Postgres before accepting.
      //
      // Accepting is usually the very first thing a brand-new user does: they
      // are invited, they sign up, they land here. If the sign-in sync has not
      // finished (or failed), the accept endpoint cannot find their row and
      // rejects a perfectly valid invitation. Syncing here is idempotent and
      // removes that race entirely.
      const email = user?.primaryEmailAddress?.emailAddress;
      if (email) {
        try {
          await fetch(`${API_BASE_URL}/api/teammates/sync-user`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              email,
              name: user?.fullName || user?.firstName || null,
            }),
          });
        } catch (syncErr) {
          // Not fatal on its own - the accept call below reports the real problem.
          console.warn("Profile sync before accept failed:", syncErr);
        }
      }

      const response = await fetch(
        `${API_BASE_URL}/api/teammates/accept`,
        { method: "POST", headers: authHeaders, body: JSON.stringify({ token }) },
      );

      const data = await response.json().catch(() => ({}) as any);

      if (response.ok) {
        await clearPendingInvitation();
        setTeammate(data?.teammate ?? null);
        setStatus("accepted");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      // 403 is specifically "you are signed in as the wrong person", which is
      // recoverable by switching accounts rather than a dead end.
      if (response.status === 403) {
        setStatus("wrongAccount");
        setMessage(
          data?.error ||
            "This invitation was sent to a different email address.",
        );
        return;
      }

      setStatus("error");
      setMessage(data?.error || `Could not accept the invitation (${response.status}).`);
    } catch (err) {
      console.error("Accept invitation failed:", err);
      setStatus("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Could not reach the server. Check your connection and try again.",
      );
    }
  }, [token, getToken, user]);

  // Guards against re-entry. `accept` closes over the Clerk `user` object,
  // which is a fresh reference on most renders, so listing it as an effect
  // dependency turns "accept once" into an unbounded retry loop: each attempt
  // sets state, which re-renders, which rebuilds `accept`, which re-fires the
  // effect. That hammered the server with ~120 requests in seven seconds.
  // The token is the identity of the work, so key the guard on it.
  const attemptedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      // Park the token so the sign-in flow can bring them back here.
      if (token) {
        savePendingInvitation(token);
      }
      setStatus("needsSignIn");
      return;
    }

    if (!token || attemptedToken.current === token) {
      return;
    }
    attemptedToken.current = token;

    accept();
    // `accept` is deliberately excluded - see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, token]);

  const currentEmail = user?.primaryEmailAddress?.emailAddress;

  const renderBody = () => {
    switch (status) {
      case "checking":
      case "accepting":
        return (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.foreground }]}>
              {status === "checking"
                ? "Checking your invitation…"
                : "Accepting invitation…"}
            </Text>
          </>
        );

      case "needsSignIn":
        return (
          <>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
              <Ionicons name="log-in-outline" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Sign in to accept
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              You need to be signed in with the email address this invitation was
              sent to. We&apos;ll bring you straight back here afterwards.
            </Text>
            <TouchableOpacity
              onPress={() => router.replace("/auth/login")}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace("/auth/register")}>
              <Text style={[styles.link, { color: colors.primary }]}>
                Don&apos;t have an account? Create one
              </Text>
            </TouchableOpacity>
          </>
        );

      case "accepted":
        return (
          <>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.success}18` }]}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              You&apos;re now teammates
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              {teammate?.name || teammate?.email
                ? `You and ${teammate.name || teammate.email} can now share encrypted files with each other.`
                : "You can now share encrypted files with each other."}
            </Text>
            <TouchableOpacity
              onPress={() => router.replace("/members")}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                View Teammates
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace("/(tabs)/home")}>
              <Text style={[styles.link, { color: colors.primary }]}>Go to Home</Text>
            </TouchableOpacity>
          </>
        );

      case "wrongAccount":
        return (
          <>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.warning}18` }]}>
              <Ionicons name="person-remove-outline" size={44} color={colors.warning} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Signed in as the wrong account
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              {message}
              {currentEmail ? `\n\nYou are currently signed in as ${currentEmail}.` : ""}
            </Text>
            <TouchableOpacity
              onPress={() => router.replace("/settings")}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Switch Account
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace("/(tabs)/home")}>
              <Text style={[styles.link, { color: colors.primary }]}>Go to Home</Text>
            </TouchableOpacity>
          </>
        );

      default:
        return (
          <>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.destructive}18` }]}>
              <Ionicons name="alert-circle-outline" size={44} color={colors.destructive} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Invitation not accepted
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              {message}
            </Text>
            <TouchableOpacity
              onPress={accept}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Try Again
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace("/(tabs)/home")}>
              <Text style={[styles.link, { color: colors.primary }]}>Go to Home</Text>
            </TouchableOpacity>
          </>
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
        <Text style={[styles.brand, { color: colors.foreground }]}>SecureSphere</Text>
      </View>

      <View style={styles.content}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {renderBody()}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orbTL: {
    position: "absolute",
    top: -70,
    left: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(0,212,255,0.05)",
  },
  orbBR: {
    position: "absolute",
    bottom: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(0,102,255,0.05)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  brand: { fontSize: 16, fontFamily: "Inter_700Bold" },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 14,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  primaryBtn: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  link: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 4 },
});
