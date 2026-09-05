import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Holds an invitation token across a sign-in.
 *
 * Invitation links arrive by email, so the person opening one is often signed
 * out - or signed into the wrong account. The accept screen parks the token
 * here, sends them to sign in, and the auth flow picks it back up afterwards
 * instead of dropping them on the home screen with the invitation forgotten.
 */
const KEY = "pendingInvitationToken";

export async function savePendingInvitation(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, token);
  } catch (err) {
    console.warn("Could not store the pending invitation:", err);
  }
}

/** Read without clearing - use when you only need to know one exists. */
export async function peekPendingInvitation(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Read and clear, so a consumed invitation is not replayed on the next launch. */
export async function takePendingInvitation(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(KEY);
    if (token) {
      await AsyncStorage.removeItem(KEY);
    }
    return token;
  } catch {
    return null;
  }
}

export async function clearPendingInvitation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to do - a stale token is cleared on the next successful accept.
  }
}

/**
 * Where to send someone once they are authenticated: back to a waiting
 * invitation if there is one, otherwise the normal landing screen.
 */
export async function resolvePostAuthRoute(): Promise<string> {
  const token = await peekPendingInvitation();
  return token ? `/accept-invitation/${token}` : "/(tabs)/home";
}
