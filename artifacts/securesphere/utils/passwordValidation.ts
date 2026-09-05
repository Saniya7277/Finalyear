export interface PasswordRequirementRule {
  id: 'length' | 'uppercase' | 'lowercase' | 'number' | 'special';
  label: string;
  isValid: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  rules: PasswordRequirementRule[];
}

export interface ConfirmPasswordResult {
  isValid: boolean;
  message: string;
}

/**
 * Validates a password against Clerk's standard password policy:
 * - At least 8 characters
 * - Contains uppercase letter
 * - Contains lowercase letter
 * - Contains number
 * - Contains special character
 */
export function validatePassword(password: string): PasswordValidationResult {
  const rules: PasswordRequirementRule[] = [
    {
      id: 'length',
      label: 'At least 8 characters',
      isValid: password.length >= 8,
    },
    {
      id: 'uppercase',
      label: 'Uppercase letter (A-Z)',
      isValid: /[A-Z]/.test(password),
    },
    {
      id: 'lowercase',
      label: 'Lowercase letter (a-z)',
      isValid: /[a-z]/.test(password),
    },
    {
      id: 'number',
      label: 'Number (0-9)',
      isValid: /[0-9]/.test(password),
    },
    {
      id: 'special',
      label: 'Special character (!@#$%...)',
      isValid: /[^A-Za-z0-9]/.test(password),
    },
  ];

  const isValid = rules.every((r) => r.isValid);
  return { isValid, rules };
}

/**
 * Validates if confirmation password matches the primary password.
 */
export function validateConfirmPassword(password: string, confirmPassword: string): ConfirmPasswordResult {
  if (!confirmPassword) {
    return { isValid: false, message: '' };
  }

  if (password === confirmPassword) {
    return { isValid: true, message: 'Passwords match' };
  }

  return { isValid: false, message: 'Passwords do not match' };
}
