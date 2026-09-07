import colors from "@/constants/colors";
import { useApp } from "@/context/AppContext";

/**
 * Hook that returns the current color palette based on SecureSphere's
 * appearance setting. The app defaults to the same navy theme as its auth
 * screens, rather than inheriting a potentially light device preference.
 */
export function useColors() {
  const { darkMode } = useApp();

  const palette = darkMode ? colors.dark : colors.light;

  return { ...palette, radius: colors.radius };
}
