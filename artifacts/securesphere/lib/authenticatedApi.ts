import { useAuth } from "@clerk/expo";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export function useAuthenticatedApi() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const request = async (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    if (!isLoaded || !isSignedIn) {
      throw new Error("User is not signed in.");
    }

    const token = await getToken();
    if (!token) {
      throw new Error("Clerk session token is unavailable.");
    }

    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);

    if (
      !headers.has("Content-Type") &&
      init.body !== undefined &&
      !(init.body instanceof FormData)
    ) {
      headers.set("Content-Type", "application/json");
    }

    const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

    return fetch(url, {
      ...init,
      headers,
    });
  };

  return { request };
}
