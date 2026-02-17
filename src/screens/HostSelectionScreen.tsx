import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../convexApi';
import { useApp } from '../context/AppContext';
import { saveHostId } from '../services/storage';

type RootStackParamList = {
  HostSelection: undefined;
  Auth: { hostId: string };
  DirectoryBrowser: { hostId: string; jwt: string };
  HostChat: { hostId: string; jwt: string; directory: string; port: number };
  Connect: undefined;
  Sessions: undefined;
  Chat: undefined;
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'HostSelection'>;
};

export function HostSelectionScreen({ navigation }: Props) {
  const { state, dispatch } = useApp();
  const [hostIdInput, setHostIdInput] = useState(state.hostId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if we already have a JWT - if so, skip to directory browser
  const hasJwt = !!state.jwt && !!state.hostId;

  const handleConnect = async () => {
    const trimmed = hostIdInput.trim();
    if (!trimmed) {
      setError('Please enter a Host ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Save host ID
      await saveHostId(trimmed);
      dispatch({ type: 'SET_HOST_ID', payload: trimmed });

      if (hasJwt && trimmed === state.hostId) {
        // Already authenticated, go to directory browser
        navigation.navigate('DirectoryBrowser', {
          hostId: trimmed,
          jwt: state.jwt!,
        });
      } else {
        // Need to authenticate
        navigation.navigate('Auth', { hostId: trimmed });
      }
    } catch (err) {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipToLegacy = () => {
    // Go to the old Connect -> Sessions -> Chat flow
    navigation.navigate('Connect');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>OpenCode Remote</Text>
        <Text style={styles.subtitle}>
          Connect to a Host running the OpenCode companion
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Host ID</Text>
          <TextInput
            style={styles.input}
            value={hostIdInput}
            onChangeText={(text) => {
              setHostIdInput(text);
              setError(null);
            }}
            placeholder="e.g., host-a1b2c3d4..."
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
          <Text style={styles.hint}>
            Copy the Host ID from the terminal running 'bun run host'
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {hasJwt && hostIdInput.trim() === state.hostId
                  ? 'Resume Session'
                  : 'Connect'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={handleSkipToLegacy}
        >
          <Text style={styles.linkText}>
            Use direct Convex sessions instead
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fafafa',
    color: '#333',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
  },
  error: {
    fontSize: 14,
    color: '#e74c3c',
    marginTop: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 24,
    padding: 12,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
  },
});
