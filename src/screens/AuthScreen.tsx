import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convexApi';
import { useApp } from '../context/AppContext';
import { saveJwt, saveHostId } from '../services/storage';

type RootStackParamList = {
  HostSelection: undefined;
  Auth: { hostId: string };
  DirectoryBrowser: { hostId: string; jwt: string };
  HostChat: { hostId: string; jwt: string; directory: string; port: number };
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
  route: { params: { hostId: string } };
};

export function AuthScreen({ navigation, route }: Props) {
  const { hostId } = route.params;
  const { dispatch } = useApp();
  const [otpInput, setOtpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestClientId] = useState(`auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [sessionCode, setSessionCode] = useState('');

  const createSession = useMutation(api.sessions.create);
  const createRequest = useMutation(api.requests.create);

  // Poll for the auth response
  const authResponse = useQuery(api.requests.getResponse, { clientId: requestClientId });

  // Step 1: Create a session when screen loads
  useEffect(() => {
    let cancelled = false;

    const startAuth = async () => {
      try {
        // Create a new Convex session to get code + OTP
        const session = await createSession({});
        if (cancelled) return;

        setSessionCode(session.code);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to create session');
      }
    };

    startAuth();
    return () => { cancelled = true; };
  }, []);

  // Step 2: User clicks Connect - send the OTP to host
  const handleConnect = async () => {
    if (!otpInput.trim()) {
      setError('Please enter the OTP from the terminal');
      return;
    }

    if (!sessionCode) {
      setError('Session not ready, please wait');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Send authentication request to the Host with user-provided OTP
      await createRequest({
        hostId,
        type: 'authenticate',
        payload: {
          sessionCode,
          otp: otpInput.trim(),
        },
        clientId: requestClientId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setLoading(false);
    }
  };

  // Step 3: Watch for Host response with JWT
  useEffect(() => {
    if (!authResponse) return;

    if (authResponse.status === 'completed' && authResponse.response?.jwtToken) {
      // Success! Save JWT and go to directory browser
      const jwt = authResponse.response.jwtToken;
      saveJwt(jwt);
      saveHostId(hostId);
      dispatch({ type: 'SET_JWT', payload: jwt });
      dispatch({ type: 'SET_HOST_ID', payload: hostId });
      dispatch({ type: 'SET_HOST_STATUS', payload: 'authenticated' });

      navigation.replace('DirectoryBrowser', { hostId, jwt });
    } else if (authResponse.status === 'failed') {
      setError(authResponse.error || 'Authentication failed');
      setLoading(false);
    }
  }, [authResponse, hostId, navigation, dispatch]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter OTP</Text>
      <Text style={styles.subtitle}>
        Check the terminal running bun run host for the OTP code
      </Text>

      {sessionCode && (
        <Text style={styles.sessionCode}>Session: {sessionCode}</Text>
      )}

      <TextInput
        style={styles.input}
        value={otpInput}
        onChangeText={setOtpInput}
        placeholder="Enter OTP from terminal"
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleConnect}
        disabled={loading || !sessionCode}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Connect</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  sessionCode: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  error: {
    color: '#d00',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
