import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Switch,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { getServerUrl, saveServerUrl } from '../services/serverConfig';
import { checkServerHealth } from '../services/analysisService';

const ACCENT = '#c8f542';

const TEMPO_OPTIONS = [
  { id: '2', label: '±2 BPM' },
  { id: '4', label: '±4 BPM' },
  { id: '6', label: '±6 BPM' },
  { id: '10', label: '±10 BPM' },
];

export default function SettingsScreen() {
  const [tempTolerance, setTempTolerance] = useState('4');
  const [harmonicMatch, setHarmonicMatch] = useState(true);
  const [energyFlow, setEnergyFlow] = useState(true);
  const [serverUrl, setServerUrl] = useState('');
  const [serverStatus, setServerStatus] = useState('unknown'); // 'ok' | 'error' | 'checking' | 'unknown'
  const [editingUrl, setEditingUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    getServerUrl().then((url) => {
      setServerUrl(url);
      setEditingUrl(url);
      pingServer(url);
    });
  }, []);

  const pingServer = async (url) => {
    setServerStatus('checking');
    const ok = await checkServerHealth(url);
    setServerStatus(ok ? 'ok' : 'error');
  };

  const handleSaveUrl = async () => {
    const trimmed = editingUrl.trim().replace(/\/$/, '');
    await saveServerUrl(trimmed);
    setServerUrl(trimmed);
    setIsEditing(false);
    pingServer(trimmed);
  };

  const statusColor = { ok: ACCENT, error: '#f54242', checking: '#888', unknown: '#444' }[serverStatus];
  const statusLabel = { ok: '● Connected', error: '● Not reachable', checking: '◌ Checking…', unknown: '◌ Unknown' }[serverStatus];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Settings</Text>

        <Section label="Tempo Tolerance">
          <Text style={styles.sectionDesc}>
            How much BPM difference to allow when auto-selecting the next track
          </Text>
          <View style={styles.pills}>
            {TEMPO_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.pill, tempTolerance === opt.id && styles.pillActive]}
                onPress={() => setTempTolerance(opt.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, tempTolerance === opt.id && styles.pillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        <Section label="Smart Matching">
          <Row label="Harmonic Compatibility" desc="Prefer tracks in compatible Camelot keys">
            <Switch
              value={harmonicMatch}
              onValueChange={setHarmonicMatch}
              trackColor={{ false: '#333', true: `${ACCENT}60` }}
              thumbColor={harmonicMatch ? ACCENT : '#555'}
            />
          </Row>
          <Row label="Energy Flow" desc="Maintain energy arc — don't drop too early">
            <Switch
              value={energyFlow}
              onValueChange={setEnergyFlow}
              trackColor={{ false: '#333', true: `${ACCENT}60` }}
              thumbColor={energyFlow ? ACCENT : '#555'}
            />
          </Row>
        </Section>

        <Section label="Analysis Server">
          <Text style={styles.sectionDesc}>
            Your Mac's local IP address + port 8000. Must be on the same WiFi as your phone.
          </Text>

          {isEditing ? (
            <View style={styles.urlEditRow}>
              <TextInput
                style={styles.urlInput}
                value={editingUrl}
                onChangeText={setEditingUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="http://192.168.x.x:8000"
                placeholderTextColor="#444"
                onSubmitEditing={handleSaveUrl}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl} activeOpacity={0.8}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.urlDisplayRow} onPress={() => setIsEditing(true)} activeOpacity={0.7}>
              <Text style={styles.urlText}>{serverUrl}</Text>
              <Text style={styles.editHint}>tap to edit</Text>
            </TouchableOpacity>
          )}

          <View style={styles.statusRow}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            <TouchableOpacity onPress={() => pingServer(serverUrl)} activeOpacity={0.7}>
              <Text style={styles.retryBtn}>Test</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.urlHint}>
            Find your Mac's IP: System Settings → Wi-Fi → Details{'\n'}
            Start server: cd analysis && python3 -m uvicorn main:app --host 0.0.0.0 --reload
          </Text>
        </Section>

        <View style={styles.about}>
          <Text style={styles.aboutLogo}>
            <Text style={{ color: '#fff' }}>mix</Text>
            <Text style={{ color: ACCENT }}>.</Text>
            <Text style={{ color: '#fff' }}>ai</Text>
          </Text>
          <Text style={styles.aboutVersion}>v0.1.0 — Phase 1+2</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, desc, children }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc && <Text style={styles.rowDesc}>{desc}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 40, gap: 20 },
  heading: { fontFamily: 'Syne_800ExtraBold', fontSize: 28, color: '#fff', marginBottom: 4 },
  section: { gap: 10 },
  sectionLabel: { fontFamily: 'DMM', fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase' },
  sectionBody: { backgroundColor: '#141414', borderRadius: 12, borderWidth: 1, borderColor: '#222', overflow: 'hidden' },
  sectionDesc: { fontFamily: 'DMM', fontSize: 12, color: '#444', lineHeight: 18, paddingHorizontal: 16, paddingTop: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#333', backgroundColor: '#0a0a0a' },
  pillActive: { borderColor: ACCENT, backgroundColor: `${ACCENT}15` },
  pillText: { fontFamily: 'DMM', fontSize: 13, color: '#555' },
  pillTextActive: { color: ACCENT },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  rowLeft: { flex: 1, marginRight: 16 },
  rowLabel: { fontFamily: 'Syne_700Bold', fontSize: 14, color: '#fff', marginBottom: 2 },
  rowDesc: { fontFamily: 'DMM', fontSize: 11, color: '#444', lineHeight: 16 },
  urlEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  urlInput: { flex: 1, fontFamily: 'DMM', fontSize: 13, color: '#fff', backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  saveBtn: { backgroundColor: ACCENT, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { fontFamily: 'DMM', fontSize: 13, color: '#000', fontWeight: '700' },
  urlDisplayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  urlText: { fontFamily: 'DMM', fontSize: 13, color: '#888' },
  editHint: { fontFamily: 'DMM', fontSize: 11, color: '#333' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  statusText: { fontFamily: 'DMM', fontSize: 12 },
  retryBtn: { fontFamily: 'DMM', fontSize: 12, color: '#444', padding: 4 },
  urlHint: { fontFamily: 'DMM', fontSize: 11, color: '#333', paddingHorizontal: 16, paddingBottom: 14, lineHeight: 18 },
  about: { alignItems: 'center', paddingTop: 20, gap: 4 },
  aboutLogo: { fontFamily: 'Syne_800ExtraBold', fontSize: 22 },
  aboutVersion: { fontFamily: 'DMM', fontSize: 11, color: '#333' },
});
