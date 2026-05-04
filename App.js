import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Syne_700Bold,
  Syne_800ExtraBold,
} from '@expo-google-fonts/syne';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import { StatusBar } from 'expo-status-bar';
import Navigation from './app/index';
import { AudioEngineProvider } from './app/context/AudioEngineContext';

export default function App() {
  const [fontsLoaded] = useFonts({
    Syne_700Bold,
    Syne_800ExtraBold,
    DMM: DMMono_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>mix.ai</Text>
      </View>
    );
  }

  return (
    <AudioEngineProvider>
      <StatusBar style="light" />
      <Navigation />
    </AudioEngineProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 24,
    color: '#c8f542',
  },
});
