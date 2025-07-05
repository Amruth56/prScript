// Complete solution for verification and state update issues

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify'; // or your toast library

// ============================================================================
// SOLUTION 1: Fix Toast Message Timing Issues
// ============================================================================

const VerificationComponent = () => {
  const [userInfo, setUserInfo] = useState({
    email: '',
    phone: '',
    emailVerified: false,
    phoneVerified: false
  });
  const [isLoading, setIsLoading] = useState(false);

  // ✅ CORRECT: Handle email verification with proper state updates
  const handleEmailVerification = async (verificationCode) => {
    setIsLoading(true);
    
    try {
      // Call your verification API
      const response = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: userInfo.email, 
          code: verificationCode 
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // ✅ Update state immediately with verified status
        setUserInfo(prev => ({
          ...prev,
          emailVerified: true
        }));
        
        // ✅ Toast AFTER state update
        toast.success("Email verified successfully!");
        
        // ✅ Optional: Save to database immediately
        await saveVerificationStatus({ emailVerified: true });
        
      } else {
        toast.error(result.message || "Email verification failed");
      }
    } catch (error) {
      console.error('Verification error:', error);
      toast.error("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ CORRECT: Handle phone verification
  const handlePhoneVerification = async (verificationCode) => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: userInfo.phone, 
          code: verificationCode 
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setUserInfo(prev => ({
          ...prev,
          phoneVerified: true
        }));
        
        toast.success("Phone verified successfully!");
        await saveVerificationStatus({ phoneVerified: true });
        
      } else {
        toast.error(result.message || "Phone verification failed");
      }
    } catch (error) {
      console.error('Phone verification error:', error);
      toast.error("Phone verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Save verification status and update UI immediately
  const saveVerificationStatus = async (updates) => {
    try {
      const response = await fetch('/api/user/verification-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      const result = await response.json();
      
      if (result.success) {
        // ✅ Update local state with server response
        setUserInfo(prev => ({
          ...prev,
          ...result.user // Use fresh data from server
        }));
      }
    } catch (error) {
      console.error('Save error:', error);
      // ✅ Don't show error toast here, handle in calling function
    }
  };

  // ✅ Watch for both verifications complete
  useEffect(() => {
    if (userInfo.emailVerified && userInfo.phoneVerified) {
      toast.success("🎉 All verifications completed!");
    }
  }, [userInfo.emailVerified, userInfo.phoneVerified]);

  return (
    <div>
      <div>
        Email: {userInfo.email} 
        {userInfo.emailVerified ? " ✅ Verified" : " ❌ Not Verified"}
      </div>
      <div>
        Phone: {userInfo.phone} 
        {userInfo.phoneVerified ? " ✅ Verified" : " ❌ Not Verified"}
      </div>
      
      <button 
        onClick={() => handleEmailVerification("123456")}
        disabled={isLoading || userInfo.emailVerified}
      >
        {isLoading ? "Verifying..." : "Verify Email"}
      </button>
      
      <button 
        onClick={() => handlePhoneVerification("654321")}
        disabled={isLoading || userInfo.phoneVerified}
      >
        {isLoading ? "Verifying..." : "Verify Phone"}
      </button>
    </div>
  );
};

// ============================================================================
// SOLUTION 2: Fix Data Not Updating Until Refresh
// ============================================================================

// ✅ Custom hook for user data management
const useUserData = () => {
  const [userData, setUserData] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user');
      const data = await response.json();
      setUserData(data);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserData = async (updates) => {
    setLoading(true);
    try {
      const response = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      const result = await response.json();
      
      if (result.success) {
        // ✅ CRITICAL: Update local state immediately
        setUserData(result.user);
        toast.success("Data updated successfully!");
        return result.user;
      } else {
        toast.error("Update failed");
        return null;
      }
    } catch (error) {
      console.error('Update error:', error);
      toast.error("Update failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    userData,
    loading,
    fetchUserData,
    updateUserData,
    setUserData // For manual updates
  };
};

// ✅ Component using the custom hook
const UserProfileComponent = () => {
  const { userData, loading, updateUserData, setUserData } = useUserData();

  const handleSave = async (formData) => {
    // ✅ Update immediately and handle response
    const updatedUser = await updateUserData(formData);
    
    if (updatedUser) {
      // Data is already updated in state via updateUserData
      console.log("User data updated:", updatedUser);
    }
  };

  const handleVerificationComplete = (verificationType) => {
    // ✅ Update local state immediately for instant UI feedback
    setUserData(prev => ({
      ...prev,
      [`${verificationType}Verified`]: true
    }));
    
    // ✅ Then sync with server
    updateUserData({ [`${verificationType}Verified`]: true });
  };

  return (
    <div>
      {loading && <div>Loading...</div>}
      <div>Email Verified: {userData.emailVerified ? "Yes" : "No"}</div>
      <div>Phone Verified: {userData.phoneVerified ? "Yes" : "No"}</div>
    </div>
  );
};

// ============================================================================
// SOLUTION 3: Context API Solution (if using Context)
// ============================================================================

import { createContext, useContext, useReducer } from 'react';

const UserContext = createContext();

const userReducer = (state, action) => {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, ...action.payload };
    case 'VERIFY_EMAIL':
      return { ...state, emailVerified: true };
    case 'VERIFY_PHONE':
      return { ...state, phoneVerified: true };
    case 'UPDATE_VERIFICATION':
      return { 
        ...state, 
        emailVerified: action.payload.email || state.emailVerified,
        phoneVerified: action.payload.phone || state.phoneVerified
      };
    default:
      return state;
  }
};

export const UserProvider = ({ children }) => {
  const [user, dispatch] = useReducer(userReducer, {
    emailVerified: false,
    phoneVerified: false
  });

  const verifyEmail = async () => {
    // API call
    const result = await callVerificationAPI();
    if (result.success) {
      dispatch({ type: 'VERIFY_EMAIL' });
      toast.success("Email verified!");
    }
  };

  return (
    <UserContext.Provider value={{ user, dispatch, verifyEmail }}>
      {children}
    </UserContext.Provider>
  );
};

// ============================================================================
// SOLUTION 4: Zustand Solution (if using Zustand)
// ============================================================================

import { create } from 'zustand';

const useUserStore = create((set, get) => ({
  user: {
    emailVerified: false,
    phoneVerified: false
  },
  
  verifyEmail: async () => {
    try {
      const result = await fetch('/api/verify-email', { method: 'POST' });
      const data = await result.json();
      
      if (data.success) {
        set((state) => ({
          user: { ...state.user, emailVerified: true }
        }));
        toast.success("Email verified!");
      }
    } catch (error) {
      toast.error("Verification failed");
    }
  },
  
  updateUser: (updates) => set((state) => ({
    user: { ...state.user, ...updates }
  }))
}));

// ============================================================================
// DEBUGGING TIPS
// ============================================================================

// Add this to see state changes in real-time
useEffect(() => {
  console.log("User state changed:", userInfo);
}, [userInfo]);

// Add this to check if your API is returning correct data
const debugAPIResponse = async () => {
  const response = await fetch('/api/user');
  const data = await response.json();
  console.log("Fresh data from API:", data);
};

export {
  VerificationComponent,
  useUserData,
  UserProfileComponent,
  UserProvider,
  useUserStore
}; 