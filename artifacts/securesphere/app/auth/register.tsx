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
import { useSignUp, useClerk } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import { formatClerkError } from '@/utils/authErrors';
import { validatePassword, validateConfirmPassword } from '@/utils/passwordValidation';
import { PasswordRequirements } from '@/components/PasswordRequirements';

export default function Register() {
  const { signUp } = useSignUp();
  const { setActive } = useClerk();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const passwordValidation = validatePassword(password);
  const confirmValidation = validateConfirmPassword(password, confirmPassword);
  const isFormValid =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    passwordValidation.isValid &&
    confirmValidation.isValid;

  // STEP 1: Submit Registration
  const handleRegister = async () => {
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!passwordValidation.isValid) {
      setErrorMessage('Password must satisfy all security requirements.');
      return;
    }

    if (!confirmValidation.isValid) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      console.log('Initiating registration for:', email.trim());

      // Attempt sign up with password and names
      const result = await signUp.password({
        emailAddress: email.trim(),
        password,
        firstName,
        lastName,
      });

      console.log('SignUp Password Result:', result);

      if (result?.error) {
        console.warn('SignUp error:', result.error);
        const parsed = formatClerkError(result.error, 'Registration Failed');
        setErrorMessage(parsed.message);
        return;
      }

      // Send email verification code
      const sendResult = await signUp.verifications.sendEmailCode();
      console.log('Send Email Result:', sendResult);

      if (sendResult?.error) {
        console.warn('Send code error:', sendResult.error);
        const parsed = formatClerkError(sendResult.error, 'Verification Error');
        setErrorMessage(parsed.message);
        return;
      }

      setIsVerifying(true);
      startCooldown();
    } catch (err: any) {
      console.error('REGISTER UNHANDLED ERROR:', err);
      const parsed = formatClerkError(err, 'Registration Failed');
      setErrorMessage(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify Email Code & Finalize
  const handleVerify = async () => {
    setErrorMessage(null);

    if (!code.trim()) {
      setErrorMessage('Please enter the verification code.');
      return;
    }

    setLoading(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const verifyResult = await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      });

      console.log('Verify Result:', verifyResult);

      if (verifyResult?.error) {
        console.warn('Verify code error:', verifyResult.error);
        const parsed = formatClerkError(verifyResult.error, 'Verification Failed');
        setErrorMessage(parsed.message);
        return;
      }

      // Finalize the sign-up session
      const finalizeResult = await signUp.finalize();
      console.log('SignUp Finalize Result:', finalizeResult);

      if (finalizeResult?.error) {
        console.warn('SignUp Finalize error:', finalizeResult.error);
        const parsed = formatClerkError(finalizeResult.error, 'Finalization Failed');
        setErrorMessage(parsed.message);
        return;
      }

      // Activate the newly created session
      if (signUp.createdSessionId) {
        await setActive({
          session: signUp.createdSessionId,
        });
      }

      router.replace('/(tabs)/home');
    } catch (err: any) {
      console.error('VERIFY UNHANDLED ERROR:', err);
      const parsed = formatClerkError(err, 'Verification Failed');
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
      const sendRes = await signUp.verifications.sendEmailCode();

      if (sendRes?.error) {
        const parsed = formatClerkError(sendRes.error, 'Resend Failed');
        setErrorMessage(parsed.message);
        return;
      }

      Alert.alert('Code Resent', 'A new verification code has been sent to your email.');
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
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (isVerifying ? setIsVerifying(false) : router.back())}
          >
            <Ionicons name="arrow-back" size={20} color="#E8F4FD" />
          </TouchableOpacity>

          {isVerifying ? (
            /* VERIFICATION STEP */
            <>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Verify your email</Text>
                <Text style={styles.subtitle}>
                  We sent a 6-digit confirmation code to <Text style={styles.highlightText}>{email}</Text>
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
                    <Ionicons
                      name="mail-unread-outline"
                      size={18}
                      color="#7A9BB5"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={[styles.input, styles.codeInput]}
                      value={code}
                      onChangeText={(val) => {
                        setCode(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="123456"
                      keyboardType="number-pad"
                      autoCapitalize="none"
                      maxLength={6}
                      placeholderTextColor="#7A9BB5"
                      editable={!loading}
                    />
                  </View>
                </View>

                <View style={styles.encryptionNote}>
                  <Ionicons name="shield-checkmark" size={16} color="#00E676" />
                  <Text style={styles.encryptionText}>
                    Verify your email to activate your encrypted vault
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleVerify}
                  activeOpacity={0.8}
                  disabled={loading || !code.trim()}
                  style={[styles.actionBtnContainer, (!code.trim() || loading) && styles.disabledBtn]}
                >
                  <LinearGradient
                    colors={['#00D4FF', '#0066FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.registerBtn}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#050B18" />
                    ) : (
                      <Text style={styles.registerBtnText}>Verify & Activate</Text>
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
                    <Text style={styles.resendLink}>Resend code</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* REGISTRATION STEP */
            <>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Create account</Text>
                <Text style={styles.subtitle}>
                  Join the privacy-preserving collaboration network
                </Text>
              </View>

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color="#FF3B5C" />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              )}

              <View style={styles.form}>
                {/* Full Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color="#7A9BB5"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={(val) => {
                        setName(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Alex Carter"
                      placeholderTextColor="#7A9BB5"
                      editable={!loading}
                    />
                  </View>
                </View>

                {/* Email Address */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color="#7A9BB5"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={(val) => {
                        setEmail(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="your@email.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholderTextColor="#7A9BB5"
                      editable={!loading}
                    />
                  </View>
                </View>

                {/* Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color="#7A9BB5"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={password}
                      onChangeText={(val) => {
                        setPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="••••••••"
                      secureTextEntry={!showPassword}
                      placeholderTextColor="#7A9BB5"
                      editable={!loading}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((prev) => !prev)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off' : 'eye'}
                        size={18}
                        color="#7A9BB5"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={18}
                      color="#7A9BB5"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={confirmPassword}
                      onChangeText={(val) => {
                        setConfirmPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="••••••••"
                      secureTextEntry={!showPassword}
                      placeholderTextColor="#7A9BB5"
                      editable={!loading}
                    />
                  </View>
                </View>

                {/* Live Password Validation Feedback */}
                <PasswordRequirements
                  rules={passwordValidation.rules}
                  confirmStatus={confirmPassword.length > 0 ? confirmValidation : undefined}
                />

                <View style={styles.encryptionNote}>
                  <Ionicons name="shield-checkmark" size={16} color="#00E676" />
                  <Text style={styles.encryptionText}>
                    Your account is protected with end-to-end client encryption
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleRegister}
                  activeOpacity={0.8}
                  disabled={loading || !isFormValid}
                  style={[styles.actionBtnContainer, (!isFormValid || loading) && styles.disabledBtn]}
                >
                  <LinearGradient
                    colors={['#00D4FF', '#0066FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.registerBtn}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#050B18" />
                    ) : (
                      <Text style={styles.registerBtnText}>Create Encrypted Account</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Required for Expo Web bot verification */}
                <View nativeID="clerk-captcha" />
              </View>

              <TouchableOpacity
                style={styles.loginRow}
                onPress={() => router.push('/auth/login')}
                disabled={loading}
              >
                <Text style={styles.loginText}>Already have an account? </Text>
                <Text style={styles.loginLink}>Sign in</Text>
              </TouchableOpacity>
            </>
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
  title: { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#E8F4FD' },
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
    marginBottom: 16,
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
  encryptionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.2)',
  },
  encryptionText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#A8C4DC',
    flex: 1,
  },
  actionBtnContainer: {
    marginTop: 4,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  registerBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#050B18',
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
  loginText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#7A9BB5',
  },
  loginLink: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#00D4FF',
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
});
