import React, { createContext, useContext, useState, useCallback } from "react";

const ConversationContext = createContext({
  conversationState: {},
  updateConversationState: () => {},
  clearConversationState: () => {},
  isSchemaComplete: false,
});

const requiredFields = [
  "category",
  "issue_type",
  "location",
  "urgency",
  "summary",
];

export const ConversationProvider = ({ children }) => {
  const [conversationState, setConversationState] = useState({});

  const updateConversationState = useCallback((newData) => {
    setConversationState((prevState) => ({
      ...prevState,
      ...newData,
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  const clearConversationState = useCallback(() => {
    setConversationState({});
  }, []);

  const isSchemaComplete = requiredFields.every(
    (field) => conversationState[field]
  );

  const value = {
    conversationState,
    updateConversationState,
    clearConversationState,
    isSchemaComplete,
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
};

export const useConversation = () => useContext(ConversationContext);
