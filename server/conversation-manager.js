const conversations = new Map();

const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const cleanupConversation = (conversationId) => {
  conversations.delete(conversationId);
};

const getConversation = (conversationId) => {
  const conversation = conversations.get(conversationId);
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
  if (existing) {
    clearTimeout(existing.timeoutId);
  }

  const timeoutId = setTimeout(
    () => cleanupConversation(conversationId),
    CONVERSATION_TIMEOUT
  );

  conversations.set(conversationId, {
    data: { ...(existing?.data || {}), ...data },
    timeoutId,
    lastUpdated: new Date().toISOString(),
  });

  return conversations.get(conversationId).data;
};

module.exports = {
  getConversation,
  updateConversation,
  cleanupConversation,
};
