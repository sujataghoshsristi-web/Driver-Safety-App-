import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  signOutUser, 
  handleFirestoreError, 
  OperationType,
  testFirestoreConnection
} from '../lib/firebase';
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
  currentUser: User | null;
  userProfile: FleetUserProfile | null;
  isAuthReady: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginDemoDriver: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<FleetUserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    testFirestoreConnection().catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch or create Firestore user profile
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            setUserProfile(snap.data() as FleetUserProfile);
          } else {
            // Create initial profile
            const newProfile: FleetUserProfile = {
              uid: user.uid,
              email: user.email || 'operator@fleet.drivelock',
              displayName: user.displayName || 'Authorized Fleet Driver',
              photoURL: user.photoURL || '',
              driverId: `DRV-${user.uid.slice(0, 5).toUpperCase()}`,
              cabUnitId: '408',
              role: 'driver',
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newProfile);
            setUserProfile(newProfile);
          }
        } catch (err) {
          // Fallback local profile if offline or permission denied
          setUserProfile({
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Fleet Operator',
            photoURL: user.photoURL || '',
            driverId: `DRV-${user.uid.slice(0, 4).toUpperCase()}`,
            cabUnitId: '408',
            role: 'driver',
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      cabAudio.playKeyClick();
      await signInWithGoogle();
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
    const demoProfile: FleetUserProfile = {
      uid: 'demo-driver-8492',
      email: 'driver.demo@fleet.drivelock',
      displayName: 'Operator DRV-8492 (Demo)',
      photoURL: '',
      driverId: 'DRV-8492',
      cabUnitId: '408',
      role: 'driver',
      createdAt: new Date().toISOString(),
    };
    setUserProfile(demoProfile);
    cabAudio.playSuccessChime();
  };

  const logout = async () => {
    cabAudio.playKeyClick();
    if (currentUser) {
      await signOutUser();
    }
    setUserProfile(null);
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
