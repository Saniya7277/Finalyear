import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";

declare global {
  namespace Express {
    interface Request {
      clerkId?: string;
    }
  }
}

function getSessionToken(req: Request): string | null {
  const authorizationHeader = req.headers.authorization;

  if (typeof authorizationHeader === "string") {
    const [scheme, token] = authorizationHeader.split(" ");
    if (scheme === "Bearer" && token) {
      return token;
    }
  }

  const sessionTokenHeader = req.headers["x-clerk-session-token"];
  if (typeof sessionTokenHeader === "string" && sessionTokenHeader.trim()) {
    return sessionTokenHeader.trim();
  }

  return null;
}

/**
 * Verify a Clerk session token and attach the authenticated user ID to the request.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getSessionToken(req);

  if (!token) {
    res
      .status(401)
      .json({ error: "Unauthorized - missing Clerk session token" });
    return;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    res.status(500).json({
      error: "Server misconfiguration: missing CLERK_SECRET_KEY",
    });
    return;
  }

  try {
    const payload = await verifyToken(token, { secretKey });
    const clerkId = payload?.sub;

    if (!clerkId) {
      res.status(401).json({ error: "Unauthorized - invalid Clerk session" });
      return;
    }

    req.clerkId = clerkId;
    next();
    return;
  } catch (error) {
    console.error("Clerk auth verification failed:", error);
    res.status(401).json({ error: "Unauthorized - invalid Clerk session" });
    return;
  }
}

/**
 * Extract clerk ID from the verified authenticated request.
 */
export function getClerkId(req: Request): string {
  const clerkId = req.clerkId;
  if (!clerkId) {
    throw new Error("Clerk ID not found in request - middleware not applied?");
  }
  return clerkId;
}
