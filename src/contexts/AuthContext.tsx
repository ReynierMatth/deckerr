import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import {
  supabase,
  isInstanceConfigured,
  isInstanceLocked,
  setInstanceConfig,
  clearInstanceConfig,
} from '../lib/supabase';
import type { InstanceConfig } from '../lib/instanceConfig';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Whether a Supabase instance (baked or user-chosen) is configured yet. */
  instanceConfigured: boolean;
  /** True when the instance is baked in (self-host) and can't be changed from the UI. */
  instanceLocked: boolean;
  /** Persist + activate a user-chosen instance and proceed to login. */
  connectInstance: (config: InstanceConfig) => void;
  /** Sign out, forget the stored instance and return to the instance screen. */
  changeInstance: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: 'google' | 'discord') => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [instanceConfigured, setInstanceConfigured] = useState<boolean>(() =>
    isInstanceConfigured(),
  );

  useEffect(() => {
    // Until an instance is configured there's no client to talk to; the
    // InstanceForm is shown instead of the login/app.
    if (!instanceConfigured) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);

      // If this is a new sign up, create a profile using setTimeout to avoid deadlock
      if (_event === 'SIGNED_IN' && session) {
        setTimeout(async () => {
          const { error } = await supabase
            .from('profiles')
            .upsert(
              {
                id: session.user.id
              },
              { onConflict: 'id' }
            );

          if (error) {
            console.error('Error creating profile:', error);
          }
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [instanceConfigured]);

  const connectInstance = (config: InstanceConfig) => {
    setInstanceConfig(config);
    setInstanceConfigured(true);
  };

  const changeInstance = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Best-effort — we're tearing the instance down regardless.
    }
    clearInstanceConfig();
    setUser(null);
    setInstanceConfigured(isInstanceConfigured());
  };

  const signUp = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) throw error;

    // Create a profile for the new user using setTimeout to avoid deadlock
    if (data.user) {
      setTimeout(async () => {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user!.id
          });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          // Optionally handle the error (e.g., delete the auth user)
          throw profileError;
        }
      }, 0);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signInWithProvider = async (provider: 'google' | 'discord') => {
    // Supabase handles the OAuth handshake; it returns to this app's origin
    // (works for any instance's domain). Enable the provider in
    // Supabase → Authentication → Sign In / Providers first.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        instanceConfigured,
        instanceLocked: isInstanceLocked(),
        connectInstance,
        changeInstance,
        signIn,
        signUp,
        signInWithProvider,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
