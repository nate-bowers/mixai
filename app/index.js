import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';

import MixScreen from './screens/MixScreen';
import LibraryScreen from './screens/LibraryScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const ACCENT = '#c8f542';

function TabIcon({ label, focused }) {
  const icons = { Mix: '◈', Library: '♫', Settings: '⚙' };
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 18, color: focused ? ACCENT : '#444' }}>
        {icons[label]}
      </Text>
    </View>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0d0d0d',
            borderTopColor: '#1a1a1a',
            borderTopWidth: 1,
            height: 72,
            paddingBottom: 14,
            paddingTop: 10,
          },
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: '#444',
          tabBarLabelStyle: {
            fontFamily: 'DMM',
            fontSize: 10,
            letterSpacing: 1.5,
          },
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name} focused={focused} />
          ),
        })}
      >
        <Tab.Screen name="Mix" component={MixScreen} />
        <Tab.Screen name="Library" component={LibraryScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
