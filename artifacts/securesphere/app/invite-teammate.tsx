import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  Clipboard,
  Share,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, useUser } from "@clerk/expo";

export default function InviteTeammate() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const resetInvitation = () => {
    setInvitationLink(null);
    setInvitedEmail(null);
    setExpiresAt(null);
    setCopyFeedback(null);
    setInvitationToken(null);
    setEmailSent(false);
    setEmailError(null);
  };

  const handleInvite = async () => {
    if (loading) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert("Error", "Please enter an email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    if (!isLoaded || !isSignedIn || !user) {
      Alert.alert("Error", "You must be signed in to generate an invitation.");
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Error", "Unable to load your Clerk session token.");
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"}/api/teammates/invite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ invitedEmail: normalizedEmail }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        Alert.alert(
          "Error",
          errorData?.error || "Failed to create invitation.",
        );
        return;
      }

      const data = await response.json();
      const nextLink = data?.invitationLink || null;
      const nextExpiresAt = data?.expiresAt
        ? new Date(data.expiresAt).toLocaleString()
        : null;

      setInvitationLink(nextLink);
      setInvitedEmail(data?.invitedEmail || normalizedEmail);
      setExpiresAt(nextExpiresAt);
      setInvitationToken(data?.token ?? null);
      setEmailSent(Boolean(data?.emailSent));
      setEmailError(data?.emailSent ? null : (data?.emailError ?? null));
      setCopyFeedback(null);
      setEmail("");
      Alert.alert(
        data?.emailSent ? "Invitation sent" : "Invitation created",
        data?.emailSent
          ? `We emailed the invitation link to ${data?.invitedEmail || normalizedEmail}.`
          : "The invitation was created, but the email could not be sent. Share the link below instead.",
      );
    } catch (err) {
      console.error("Error inviting teammate:", err);
      Alert.alert(
        "Error",
        err instanceof Error
          ? err.message
          : "Failed to create invitation. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!invitationToken || resending) {
      return;
    }

    setResending(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Error", "Unable to load your Clerk session token.");
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"}/api/teammates/invite/resend`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: invitationToken }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setEmailError(data?.error || "Failed to send the invitation email.");
        Alert.alert(
          "Email not sent",
          data?.error || "Failed to send the invitation email.",
        );
        return;
      }

      setEmailSent(true);
      setEmailError(null);
      Alert.alert("Email sent", `Invitation emailed to ${invitedEmail}.`);
    } catch (err) {
      console.error("Error resending invitation email:", err);
      const message =
        err instanceof Error ? err.message : "Failed to send the email.";
      setEmailError(message);
      Alert.alert("Error", message);
    } finally {
      setResending(false);
    }
  };

  const handleCopyLink = async () => {
    if (!invitationLink) {
      return;
    }

    try {
      await Clipboard.setString(invitationLink);
      setCopyFeedback("Link copied!");
      Alert.alert("Copied", "Invitation link copied to clipboard.");
    } catch (err) {
      console.error("Copy invitation link failed:", err);
      Alert.alert("Error", "Failed to copy link");
    }
  };

  const handleShareLink = async () => {
    if (!invitationLink) {
      return;
    }

    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined") {
        if (navigator.share) {
          await navigator.share({
            title: "SecureSphere invitation",
            text: "Join my SecureSphere workspace.",
            url: invitationLink,
          });
          return;
        }

        if (navigator.clipboard) {
          await navigator.clipboard.writeText(invitationLink);
          Alert.alert(
            "Share unavailable",
            "The invitation link was copied to your clipboard for sharing.",
          );
          return;
        }
      }

      await Share.share({
        message: invitationLink,
        url: invitationLink,
        title: "SecureSphere invitation",
      });
    } catch (err) {
      console.error("Share invitation link failed:", err);
      if (Platform.OS === "web" && typeof navigator !== "undefined") {
        try {
          await navigator.clipboard.writeText(invitationLink);
          Alert.alert(
            "Share unavailable",
            "The invitation link was copied to your clipboard for sharing.",
          );
          return;
        } catch {
          Alert.alert("Error", "Failed to share link");
        }
        return;
      }
      Alert.alert("Error", "Failed to share link");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { paddingTop: topPad + 16 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.backBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Invite Teammate
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          {!invitationLink ? (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons
                  name="person-add-outline"
                  size={48}
                  color={colors.primary}
                  style={{ marginBottom: 16 }}
                />
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Invite a Teammate
                </Text>
                <Text
                  style={[
                    styles.cardDescription,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Share secure collaboration with your team members
                </Text>
              </View>

              <View style={styles.form}>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  Email Address
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder="teammate@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  editable={!loading}
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  onPress={handleInvite}
                  disabled={loading}
                  style={[
                    styles.inviteBtn,
                    {
                      backgroundColor: loading
                        ? `${colors.primary}80`
                        : colors.primary,
                    },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator
                      color={colors.primaryForeground}
                      size="small"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="send"
                        size={16}
                        color={colors.primaryForeground}
                      />
                      <Text
                        style={[
                          styles.inviteBtnText,
                          { color: colors.primaryForeground },
                        ]}
                      >
                        Generate Invitation
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <Text
                  style={[styles.helperText, { color: colors.mutedForeground }]}
                >
                  We email them a secure invitation link. It expires in 7 days
                  and only works for this address.
                </Text>
              </View>
            </>
          ) : (
            <>
              <View
                style={[
                  styles.successCard,
                  {
                    backgroundColor: `${colors.success}15`,
                    borderColor: `${colors.success}40`,
                  },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color={colors.success}
                  style={{ marginBottom: 16 }}
                />
                <Text
                  style={[styles.successTitle, { color: colors.foreground }]}
                >
                  Invitation Created
                </Text>
                <Text
                  style={[
                    styles.successDescription,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Successfully created invitation for
                </Text>
                <Text style={[styles.emailDisplay, { color: colors.primary }]}>
                  {invitedEmail}
                </Text>
                {expiresAt ? (
                  <Text
                    style={[
                      styles.expiresText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Expires: {expiresAt}
                  </Text>
                ) : null}

                <View
                  style={[
                    styles.deliveryRow,
                    {
                      backgroundColor: emailSent
                        ? `${colors.success}15`
                        : `${colors.warning}15`,
                      borderColor: emailSent
                        ? `${colors.success}40`
                        : `${colors.warning}40`,
                    },
                  ]}
                >
                  <Ionicons
                    name={emailSent ? "mail-open-outline" : "mail-unread-outline"}
                    size={16}
                    color={emailSent ? colors.success : colors.warning}
                  />
                  <Text
                    style={[
                      styles.deliveryText,
                      { color: emailSent ? colors.success : colors.warning },
                    ]}
                  >
                    {emailSent
                      ? "Invitation email delivered"
                      : emailError ||
                        "Email not sent — share the link below instead."}
                  </Text>
                </View>
              </View>

              <View style={styles.linksSection}>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Invitation Link
                </Text>

                <View
                  style={[
                    styles.linkBox,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.linkText, { color: colors.foreground }]}
                    numberOfLines={4}
                  >
                    {invitationLink}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleCopyLink}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons name="copy" size={18} color={colors.primary} />
                  <Text
                    style={[styles.actionBtnText, { color: colors.foreground }]}
                  >
                    Copy Link
                  </Text>
                </TouchableOpacity>

                {copyFeedback ? (
                  <Text
                    style={[styles.copyFeedback, { color: colors.success }]}
                  >
                    {copyFeedback}
                  </Text>
                ) : null}

                <TouchableOpacity
                  onPress={handleShareLink}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="share-social"
                    size={18}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.actionBtnText, { color: colors.foreground }]}
                  >
                    Share Link
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleResendEmail}
                  disabled={!invitationToken || resending}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      opacity: !invitationToken || resending ? 0.6 : 1,
                    },
                  ]}
                >
                  {resending ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={colors.primary}
                    />
                  )}
                  <Text
                    style={[styles.actionBtnText, { color: colors.foreground }]}
                  >
                    {emailSent ? "Resend Email" : "Send Email Invitation"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={resetInvitation}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: `${colors.primary}15`,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={18}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.actionBtnText, { color: colors.primary }]}
                  >
                    Invite Another
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => router.back()}
                style={[
                  styles.backBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    width: "100%",
                    marginTop: 20,
                  },
                ]}
              >
                <Text
                  style={[styles.backBtnText, { color: colors.foreground }]}
                >
                  Back to Teammates
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 28,
    marginTop: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 12,
  },
  inviteBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  helperText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    textAlign: "center",
  },
  successCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 28,
    marginTop: 16,
  },
  successTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  successDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  emailDisplay: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  expiresText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 8,
  },
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
  },
  deliveryText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  linksSection: {
    gap: 10,
    marginTop: 24,
  },
  copyFeedback: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: -4,
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  linkBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  linkText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
  },
});
