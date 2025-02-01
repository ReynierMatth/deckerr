import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
                id: session.user.id,
                theme_color: 'blue' // Default theme color
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
  }, []);

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
            id: data.user!.id,
            theme_color: 'blue' // Default theme color
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

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
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
