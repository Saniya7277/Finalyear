import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Clears a legacy pending invitation token. Invitation continuation is carried
 * explicitly in the auth route's `invitationToken` parameter instead of being
 * restored from storage after unrelated future logins.
 */
const KEY = "pendingInvitationToken";

export async function clearPendingInvitation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to do - a stale token is cleared on the next successful accept.
  }
}

/**
 * Continue an invitation only when the current auth navigation explicitly
 * carries a valid token. Normal logins always go Home, and clearing the legacy
 * key here prevents a previously abandoned token from being replayed.
 */
export async function resolvePostAuthRoute(
  invitationToken?: string,
): Promise<string> {
  await clearPendingInvitation();
  return /^[a-f0-9]{64}$/i.test(invitationToken ?? "")
    ? `/accept-invitation/${invitationToken}`
    : "/(tabs)/home";
}
