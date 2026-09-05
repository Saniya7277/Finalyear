import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Platform, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { INITIAL_CHAT, ChatMessage } from '@/data/mockData';
import * as Haptics from 'expo-haptics';

const AI_RESPONSES = [
  "I've analyzed your vault. Your encryption is strong across 8 of 10 files. I recommend enabling encryption for the remaining 2 files.",
  "Your collaboration permissions look good. I noticed Emma Wilson and Varsha Patel's invites are still pending. Should I send a reminder?",
  "Based on your security patterns, I recommend rotating your encryption keys monthly. Your current keys are 45 days old.",
  "I can help you organize your files by sensitivity level — Critical, Confidential, Internal, and Public. Want me to scan and categorize?",
  "Your storage is at 28% capacity. At your current rate, you'll reach 80% in approximately 3 months.",
];

export default function AIAssistant() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const sendMessage = () => {
    if (!input.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = {
      id: Date.now().toString() + 'u',
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: Date.now().toString() + 'a',
        role: 'ai',
        content: AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)],
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 1200 + Math.random() * 800);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={16} color="#050B18" />
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser
            ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 },
        ]}>
          <Text style={[styles.bubbleText, { color: isUser ? colors.primaryForeground : colors.foreground }]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <LinearGradient colors={['#00D4FF', '#0066FF']} style={styles.aiIconBg}>
            <Ionicons name="sparkles" size={18} color="#050B18" />
          </LinearGradient>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>SecureAI</Text>
            <Text style={[styles.headerSub, { color: colors.success }]}>End-to-end encrypted</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={topPad + 70}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={renderMessage}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={isTyping ? (
            <View style={styles.typingRow}>
              <View style={styles.aiAvatar}>
                <Ionicons name="sparkles" size={16} color="#050B18" />
              </View>
              <View style={[styles.bubble, styles.typingBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.typingDots}>
                  {[0, 1, 2].map(i => (
                    <View key={i} style={[styles.typingDot, { backgroundColor: colors.mutedForeground }]} />
                  ))}
                </View>
              </View>
            </View>
          ) : null}
        />

        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: botPad + 8 }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted }]}
            value={input}
            onChangeText={setInput}
            placeholder="Ask SecureAI anything..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={!input.trim() || isTyping}
            style={[styles.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.muted }]}
          >
            <Ionicons name="arrow-up" size={20} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1A3050' },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  messageList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 12 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  messageRowUser: { justifyContent: 'flex-end' },
  aiAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#00D4FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  bubbleText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  typingBubble: { borderWidth: 1 },
  typingDots: { flexDirection: 'row', gap: 4, padding: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3, opacity: 0.7 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, gap: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: 'Inter_400Regular', maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
