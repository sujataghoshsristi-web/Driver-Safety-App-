import React, { createContext, useContext, useState } from 'react';
import { cabAudio } from '../utils/audio';

export interface FleetUserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  driverId: string;
  cabUnitId: string;
  role: 'driver' | 'supervisor' | 'admin';
  createdAt: string;
}

interface AuthContextType {
  currentUser: any | null;
  userProfile: FleetUserProfile | null;
  isAuthReady: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginDemoDriver: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_OPERATOR_PROFILE: FleetUserProfile = {
  uid: 'operator-drivelock-active',
  email: 'operator@fleet.drivelock',
  displayName: 'Authorized Fleet Operator',
  photoURL: '',
  driverId: 'DRV-8492',
  cabUnitId: '408',
  role: 'driver',
  createdAt: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<FleetUserProfile | null>(DEFAULT_OPERATOR_PROFILE);
  const [isAuthReady] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      cabAudio.playKeyClick();
      const { signInWithGoogle } = await import('../lib/firebase');
      const user = await signInWithGoogle();
      setCurrentUser(user);
      setUserProfile({
        uid: user.uid,
        email: user.email || 'operator@fleet.drivelock',
        displayName: user.displayName || 'Authorized Fleet Driver',
        photoURL: user.photoURL || '',
        driverId: `DRV-${user.uid.slice(0, 5).toUpperCase()}`,
        cabUnitId: '408',
        role: 'driver',
        createdAt: new Date().toISOString(),
      });
      cabAudio.playSuccessChime();
    } catch (error: any) {
      console.error('Google Sign-In failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loginDemoDriver = () => {
    cabAudio.playKeyClick();
    setUserProfile(DEFAULT_OPERATOR_PROFILE);
    cabAudio.playSuccessChime();
  };

  const logout = async () => {
    cabAudio.playKeyClick();
    if (currentUser) {
      try {
        const { signOutUser } = await import('../lib/firebase');
        await signOutUser();
      } catch (e) {}
    }
    setUserProfile(DEFAULT_OPERATOR_PROFILE);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isAuthReady,
        isLoading,
        loginWithGoogle,
        loginDemoDriver,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
