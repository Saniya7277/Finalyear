export interface FormattedAuthError {
  title: string;
  message: string;
  code?: string;
  isSessionError?: boolean;
  isNetworkError?: boolean;
  isLockedError?: boolean;
}

/**
 * Maps Clerk error codes and general exceptions into clear, user-friendly messages.
 * Never exposes raw JSON or confusing technical details to users.
 */
export function formatClerkError(err: unknown, defaultTitle: string = 'Authentication Error'): FormattedAuthError {
  if (!err) {
    return {
      title: defaultTitle,
      message: 'An unexpected error occurred. Please try again.',
    };
  }

  // Handle Clerk error wrapper or error response array
  const anyErr = err as any;
  const clerkErrors = anyErr?.errors || (Array.isArray(anyErr) ? anyErr : null);
  const firstError = clerkErrors?.[0] || (anyErr?.code ? anyErr : null);

  const code: string = firstError?.code || anyErr?.code || '';
  const rawMsg: string = firstError?.longMessage || firstError?.message || anyErr?.message || '';

  // Network / Connection errors
  if (
    code === 'network_error' ||
    rawMsg.toLowerCase().includes('network') ||
    rawMsg.toLowerCase().includes('failed to fetch') ||
    rawMsg.toLowerCase().includes('internet')
  ) {
    return {
      title: 'Connection Error',
      message: 'Unable to reach the server. Please check your internet connection and try again.',
      code: 'network_error',
      isNetworkError: true,
    };
  }

  // Specific Clerk Error Code Mappings
  switch (code) {
    // Incorrect credentials
    case 'form_password_incorrect':
      return {
        title: 'Incorrect Password',
        message: 'The password you entered is incorrect. Please double-check and try again.',
        code,
      };

    case 'form_identifier_not_found':
    case 'user_not_found':
      return {
        title: 'Account Not Found',
        message: 'No account found with this email address. Please check your spelling or create a new account.',
        code,
      };

    case 'form_identifier_exists':
    case 'identifier_already_signed_in':
      return {
        title: 'Account Already Exists',
        message: 'An account with this email address already exists. Please sign in instead.',
        code,
      };

    // Password policy errors
    case 'form_password_pwned':
      return {
        title: 'Insecure Password',
        message: 'This password has appeared in a data breach. For your protection, please choose a stronger, unique password.',
        code,
      };

    case 'form_password_length_too_short':
    case 'form_password_not_strong_enough':
    case 'form_password_validation_failed':
      return {
        title: 'Password Requirements Not Met',
        message: 'Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.',
        code,
      };

    // Verification code errors
    case 'form_code_incorrect':
    case 'verification_failed':
    case 'verification_code_invalid':
      return {
        title: 'Invalid Verification Code',
        message: 'The verification code entered is incorrect. Please check your email and try again.',
        code,
      };

    case 'verification_expired':
    case 'form_code_expired':
      return {
        title: 'Verification Code Expired',
        message: 'This code has expired. Please tap "Resend Code" to receive a new one.',
        code,
      };

    // Account lockout / restrictions
    case 'user_locked':
    case 'session_locked':
    case 'user_banned':
    case 'account_locked':
      return {
        title: 'Account Locked',
        message: 'This account has been temporarily locked for security. Please reset your password or contact support.',
        code,
        isLockedError: true,
      };

    case 'too_many_requests':
      return {
        title: 'Too Many Attempts',
        message: 'Too many attempts detected. Please wait a few moments before trying again.',
        code,
      };

    // Stale / Invalid Sessions
    case 'session_expired':
    case 'stale_session':
    case 'cookie_invalid':
    case 'session_not_found':
      return {
        title: 'Session Expired',
        message: 'Your previous session has expired. Please sign in again to continue.',
        code,
        isSessionError: true,
      };

    case 'session_exists':
      return {
        title: 'Active Session Exists',
        message: 'You already have an active session. Refreshing your vault now.',
        code,
        isSessionError: true,
      };

    case 'identifier_not_verified':
      return {
        title: 'Email Not Verified',
        message: 'Please complete email verification to activate your account.',
        code,
      };

    default:
      // If we have a readable longMessage from Clerk that doesn't contain technical json
      if (rawMsg && !rawMsg.includes('{') && !rawMsg.includes('JSON')) {
        return {
          title: defaultTitle,
          message: rawMsg,
          code,
        };
      }
      return {
        title: defaultTitle,
        message: 'Authentication failed. Please verify your credentials and try again.',
        code,
      };
  }
}
