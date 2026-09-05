import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import { formatClerkError } from '@/utils/authErrors';
import { validatePassword, validateConfirmPassword } from '@/utils/passwordValidation';
import { PasswordRequirements } from '@/components/PasswordRequirements';

type ForgotPasswordStep = 'enter_email' | 'enter_code' | 'new_password' | 'success';

export default function ForgotPassword() {
  const { signIn } = useSignIn();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<ForgotPasswordStep>('enter_email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const passwordValidation = validatePassword(password);
  const confirmValidation = validateConfirmPassword(password, confirmPassword);
  const isPasswordValid = passwordValidation.isValid && confirmValidation.isValid;

  // STEP 1: Send Reset Code to Email
  const handleSendCode = async () => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Create sign-in attempt for password reset
      const createRes = await signIn.create({
        identifier: email.trim(),
      });

      if (createRes?.error) {
        const parsed = formatClerkError(createRes.error, 'Reset Failed');
        setErrorMessage(parsed.message);
        return;
      }

      // Send password reset code
      const sendRes = await signIn.resetPasswordEmailCode.sendCode();

      if (sendRes?.error) {
        const parsed = formatClerkError(sendRes.error, 'Verification Error');
        setErrorMessage(parsed.message);
        return;
      }

      setStep('enter_code');
      startCooldown();
    } catch (err: any) {
      console.error('Send reset code error:', err);
      const parsed = formatClerkError(err, 'Reset Failed');
      setErrorMessage(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify Code
  const handleVerifyCode = async () => {
    if (!code.trim()) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const verifyRes = await signIn.resetPasswordEmailCode.verifyCode({
        code: code.trim(),
      });

      if (verifyRes?.error) {
        const parsed = formatClerkError(verifyRes.error, 'Invalid Code');
        setErrorMessage(parsed.message);
        return;
      }

      setStep('new_password');
    } catch (err: any) {
      console.error('Verify code error:', err);
      const parsed = formatClerkError(err, 'Verification Error');
      setErrorMessage(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  // Resend code handler
  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const sendRes = await signIn.resetPasswordEmailCode.sendCode();

      if (sendRes?.error) {
        const parsed = formatClerkError(sendRes.error, 'Resend Failed');
        setErrorMessage(parsed.message);
        return;
      }

      Alert.alert('Code Sent', 'A new verification code has been dispatched to your email.');
      startCooldown();
    } catch (err: any) {
      const parsed = formatClerkError(err, 'Resend Failed');
      setErrorMessage(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  const startCooldown = () => {
    setResendCooldown(30);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // STEP 3: Submit New Password
  const handleSubmitNewPassword = async () => {
    if (!isPasswordValid) {
      setErrorMessage('Please ensure your new password satisfies all security requirements and matches.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const submitRes = await signIn.resetPasswordEmailCode.submitPassword({
        password,
        signOutOfOtherSessions: true,
      });

      if (submitRes?.error) {
        const parsed = formatClerkError(submitRes.error, 'Reset Failed');
        setErrorMessage(parsed.message);
        return;
      }

      setStep('success');
    } catch (err: any) {
      console.error('Submit password error:', err);
      const parsed = formatClerkError(err, 'Reset Failed');
      setErrorMessage(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    if (step === 'enter_code') {
      setStep('enter_email');
    } else if (step === 'new_password') {
      setStep('enter_code');
    } else {
      router.back();
    }
  };

  return (
    <LinearGradient colors={['#050B18', '#0A1628', '#050B18']} style={styles.bg}>
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: topPad + 24, paddingBottom: botPad + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {step !== 'success' && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color="#E8F4FD" />
            </TouchableOpacity>
          )}

          {/* STEP 1: Enter Email */}
          {step === 'enter_email' && (
            <>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>
                  Enter the email associated with your SecureSphere vault to receive a verification code
                </Text>
              </View>

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#FF3B5C" />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              )}

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-outline" size={18} color="#7A9BB5" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={(val) => {
                        setEmail(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholderTextColor="#7A9BB5"
                      placeholder="your@email.com"
                      editable={!loading}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSendCode}
                  activeOpacity={0.8}
                  disabled={loading || !email.trim()}
                  style={[styles.actionBtnContainer, (!email.trim() || loading) && styles.disabledBtn]}
                >
                  <LinearGradient
                    colors={['#00D4FF', '#0066FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryBtn}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#050B18" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Send Reset Code</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* STEP 2: Enter Verification Code */}
          {step === 'enter_code' && (
            <>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Enter Verification Code</Text>
                <Text style={styles.subtitle}>
                  We sent a 6-digit recovery code to <Text style={styles.highlightText}>{email}</Text>
                </Text>
              </View>

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#FF3B5C" />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              )}

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Verification Code</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="key-outline" size={18} color="#7A9BB5" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, styles.codeInput]}
                      value={code}
                      onChangeText={(val) => {
                        setCode(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      keyboardType="number-pad"
                      autoCapitalize="none"
                      maxLength={6}
                      placeholderTextColor="#7A9BB5"
                      placeholder="123456"
                      editable={!loading}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleVerifyCode}
                  activeOpacity={0.8}
                  disabled={loading || !code.trim()}
                  style={[styles.actionBtnContainer, (!code.trim() || loading) && styles.disabledBtn]}
                >
                  <LinearGradient
                    colors={['#00D4FF', '#0066FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryBtn}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#050B18" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Verify Code</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendRow}
                  onPress={handleResendCode}
                  disabled={resendCooldown > 0 || loading}
                >
                  <Text style={styles.resendText}>
                    {resendCooldown > 0
                      ? `Resend code in ${resendCooldown}s`
                      : "Didn't receive a code? "}
                  </Text>
                  {resendCooldown === 0 && (
                    <Text style={styles.resendLink}>Resend now</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* STEP 3: Create & Confirm New Password */}
          {step === 'new_password' && (
            <>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Create New Password</Text>
                <Text style={styles.subtitle}>
                  Choose a strong, encrypted password for your vault
                </Text>
              </View>

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#FF3B5C" />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              )}

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>New Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={18} color="#7A9BB5" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={password}
                      onChangeText={(val) => {
                        setPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      secureTextEntry={!showPassword}
                      placeholderTextColor="#7A9BB5"
                      placeholder="••••••••"
                      editable={!loading}
                    />
                    <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                      <Ionicons
                        name={showPassword ? 'eye-off' : 'eye'}
                        size={18}
                        color="#7A9BB5"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm New Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#7A9BB5" style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={confirmPassword}
                      onChangeText={(val) => {
                        setConfirmPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      secureTextEntry={!showPassword}
                      placeholderTextColor="#7A9BB5"
                      placeholder="••••••••"
                      editable={!loading}
                    />
                  </View>
                </View>

                {/* Live Password Validation Feedback */}
                <PasswordRequirements
                  rules={passwordValidation.rules}
                  confirmStatus={confirmPassword.length > 0 ? confirmValidation : undefined}
                />

                <TouchableOpacity
                  onPress={handleSubmitNewPassword}
                  activeOpacity={0.8}
                  disabled={loading || !isPasswordValid}
                  style={[styles.actionBtnContainer, (!isPasswordValid || loading) && styles.disabledBtn]}
                >
                  <LinearGradient
                    colors={['#00D4FF', '#0066FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryBtn}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#050B18" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Reset Password</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* STEP 4: Success & Return to Login */}
          {step === 'success' && (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrapper}>
                <Ionicons name="checkmark-done-circle" size={72} color="#00E676" />
              </View>

              <Text style={styles.successTitle}>Password Successfully Reset</Text>
              <Text style={styles.successSubtitle}>
                Your vault password has been updated. You can now sign in using your new credentials.
              </Text>

              <TouchableOpacity
                onPress={() => router.replace('/auth/login')}
                activeOpacity={0.8}
                style={styles.actionBtnContainer}
              >
                <LinearGradient
                  colors={['#00D4FF', '#0066FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Return to Login</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {step !== 'success' && (
            <TouchableOpacity
              style={styles.returnRow}
              onPress={() => router.replace('/auth/login')}
            >
              <Text style={styles.returnText}>Remember your password? </Text>
              <Text style={styles.returnLink}>Sign in</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#050B18' },
  orbTL: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(0,212,255,0.06)',
  },
  orbBR: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(0,102,255,0.07)',
  },
  scroll: { paddingHorizontal: 24, flexGrow: 1 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0D1B2A',
    borderWidth: 1,
    borderColor: '#1A3050',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  titleBlock: { marginBottom: 28, gap: 8 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', color: '#E8F4FD' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#7A9BB5', lineHeight: 20 },
  highlightText: { color: '#00D4FF', fontFamily: 'Inter_600SemiBold' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 59, 92, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 92, 0.3)',
    padding: 12,
    marginBottom: 18,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#FF3B5C',
    flex: 1,
  },
  form: { gap: 16 },
  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#A8C4DC' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2D4A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A3050',
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#E8F4FD',
  },
  codeInput: {
    letterSpacing: 4,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
  },
  actionBtnContainer: {
    marginTop: 8,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#050B18',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  resendText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#7A9BB5',
  },
  resendLink: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#00D4FF',
  },
  successContainer: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 16,
  },
  successIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#E8F4FD',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#7A9BB5',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  returnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  returnText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#7A9BB5',
  },
  returnLink: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#00D4FF',
  },
});
