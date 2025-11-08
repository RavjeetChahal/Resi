import React, { createContext, useContext, useMemo, useState } from 'react';

const AuthContext = createContext({
  role: null,
  setRole: () => {},
  resetRole: () => {},
});

export const AuthProvider = ({ children }) => {
  const [role, setRole] = useState(null);

  const resetRole = () => setRole(null);

  const value = useMemo(
    () => ({
      role,
      setRole,
      resetRole,
    }),
    [role],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

