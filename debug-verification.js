// Debug code for verification issues

// Issue 1: Toast showing wrong verification status
// Make sure you're checking the LATEST state, not stale state

// ❌ WRONG - This might use stale state
const handleVerification = async () => {
  await verifyEmail();
  
  // This might check old state before it updates
  if (!isEmailVerified) {
    toast.error("Email not verified");
  }
};

// ✅ CORRECT - Wait for state update or check fresh data
const handleVerification = async () => {
  const result = await verifyEmail();
  
  // Check the result directly, not state
  if (result.emailVerified) {
    toast.success("Email verified successfully!");
    setIsEmailVerified(true);
  } else {
    toast.error("Email verification failed");
  }
};

// OR use useEffect to watch state changes
useEffect(() => {
  if (isEmailVerified && isPhoneVerified) {
    toast.success("All verifications completed!");
  }
}, [isEmailVerified, isPhoneVerified]);

// Issue 2: UI not updating after save (requires refresh)
// This is usually a state management issue

// ❌ WRONG - Not updating local state after save
const handleSave = async () => {
  await saveUserData(userData);
  toast.success("Saved successfully");
  // Missing: Update local state with new data
};

// ✅ CORRECT - Update state immediately after save
const handleSave = async () => {
  try {
    const updatedData = await saveUserData(userData);
    
    // Update local state with fresh data
    setUserData(updatedData);
    // OR refetch data
    // await fetchUserData();
    
    toast.success("Saved successfully");
  } catch (error) {
    toast.error("Save failed");
  }
};

// For Context API users:
const updateUserContext = (newData) => {
  setUser(prevUser => ({
    ...prevUser,
    ...newData,
    emailVerified: true,
    phoneVerified: true
  }));
};

// For Zustand users:
const useUserStore = create((set) => ({
  user: {},
  updateUser: (userData) => set((state) => ({
    user: { ...state.user, ...userData }
  })),
  setVerificationStatus: (email, phone) => set((state) => ({
    user: {
      ...state.user,
      emailVerified: email,
      phoneVerified: phone
    }
  }))
}));

// Common patterns that cause these issues:

// 1. Race condition between save and verification check
const problematicFlow = async () => {
  saveData(); // Async
  checkVerification(); // Runs before save completes
};

// Fix: Use proper async/await
const fixedFlow = async () => {
  await saveData();
  await checkVerification();
};

// 2. Not updating the state that UI depends on
const ComponentWithIssue = () => {
  const [userData, setUserData] = useState({});
  const [isVerified, setIsVerified] = useState(false);
  
  const handleVerify = async () => {
    await verifyUser();
    // ❌ Forgot to update isVerified state
  };
  
  return (
    <div>
      {isVerified ? "Verified" : "Not Verified"}
    </div>
  );
};

// Fix: Update all related state
const FixedComponent = () => {
  const [userData, setUserData] = useState({});
  const [isVerified, setIsVerified] = useState(false);
  
  const handleVerify = async () => {
    const result = await verifyUser();
    setIsVerified(result.verified); // ✅ Update state
    setUserData(prev => ({ 
      ...prev, 
      emailVerified: result.emailVerified,
      phoneVerified: result.phoneVerified 
    }));
  };
  
  return (
    <div>
      {isVerified ? "Verified" : "Not Verified"}
    </div>
  );
};

// 3. Optimistic updates vs server state
const OptimisticUpdate = () => {
  const handleVerify = async () => {
    // Immediately update UI (optimistic)
    setIsVerified(true);
    toast.success("Verifying...");
    
    try {
      const result = await verifyEmail();
      if (!result.success) {
        // Revert on failure
        setIsVerified(false);
        toast.error("Verification failed");
      } else {
        toast.success("Verified successfully!");
      }
    } catch (error) {
      setIsVerified(false);
      toast.error("Verification error");
    }
  };
};

export {
  handleVerification,
  handleSave,
  updateUserContext,
  useUserStore,
  fixedFlow,
  FixedComponent,
  OptimisticUpdate
}; 