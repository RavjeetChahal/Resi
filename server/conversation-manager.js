const conversations = new Map();

const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const cleanupConversation = (conversationId) => {
  conversations.delete(conversationId);
};

const getConversation = (conversationId) => {
  const conversation = conversations.get(conversationId);
  console.log("[conversation-manager] getConversation", {
    conversationId,
    hasConversation: !!conversation,
    data: conversation?.data,
  });
  if (conversation) {
    // Reset timeout
    clearTimeout(conversation.timeoutId);
    conversation.timeoutId = setTimeout(
      () => cleanupConversation(conversationId),
      CONVERSATION_TIMEOUT
    );
  }
  return conversation?.data || {};
};

const updateConversation = (conversationId, data) => {
  const existing = conversations.get(conversationId);
  console.log("[conversation-manager] updateConversation", {
    conversationId,
    hasExisting: !!existing,
    existingData: existing?.data,
    incomingData: data,
  });
  if (existing) {
    clearTimeout(existing.timeoutId);
  }

  const timeoutId = setTimeout(
    () => cleanupConversation(conversationId),
    CONVERSATION_TIMEOUT
  );

  const mergedData = { ...(existing?.data || {}), ...data };
  conversations.set(conversationId, {
    data: mergedData,
    timeoutId,
    lastUpdated: new Date().toISOString(),
  });

  console.log("[conversation-manager] After merge", {
    conversationId,
    mergedData,
  });

  return conversations.get(conversationId).data;
};

module.exports = {
  getConversation,
  updateConversation,
  cleanupConversation,
};
