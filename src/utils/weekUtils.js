/**
 * Utility functions for week-based calendar navigation
 */

/**
 * Get the start of a week (Sunday) for a given date
 * @param {Date} date - The date to get the week start for
 * @returns {Date} - The start of the week (Sunday 00:00:00)
 */
export const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = d.getDate() - day; // Days to subtract to get to Sunday
  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

/**
 * Get the end of a week (Saturday 23:59:59) for a given date
 * @param {Date} date - The date to get the week end for
 * @returns {Date} - The end of the week (Saturday 23:59:59.999)
 */
export const getWeekEnd = (date = new Date()) => {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Add 6 days to get to Saturday
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
};

/**
 * Get the previous week's start date
 * @param {Date} date - The current week's date
 * @returns {Date} - The start of the previous week
 */
export const getPreviousWeek = (date = new Date()) => {
  const weekStart = getWeekStart(date);
  const prevWeek = new Date(weekStart);
  prevWeek.setDate(prevWeek.getDate() - 7);
  return prevWeek;
};

/**
 * Get the next week's start date
 * @param {Date} date - The current week's date
 * @returns {Date} - The start of the next week
 */
export const getNextWeek = (date = new Date()) => {
  const weekStart = getWeekStart(date);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return nextWeek;
};

/**
 * Format a week range for display (e.g., "Dec 1 - Dec 7, 2024")
 * @param {Date} weekStart - The start of the week
 * @returns {string} - Formatted week range string
 */
export const formatWeekRange = (weekStart) => {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startMonth = start.toLocaleDateString(undefined, { month: "short" });
  const startDay = start.getDate();
  const endMonth = end.toLocaleDateString(undefined, { month: "short" });
  const endDay = end.getDate();
  const year = start.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
};

/**
 * Check if a date falls within a specific week
 * @param {Date|string} date - The date to check
 * @param {Date} weekStart - The start of the week
 * @returns {boolean} - True if the date is within the week
 */
export const isDateInWeek = (date, weekStart) => {
  if (!date) return false;
  
  const checkDate = typeof date === "string" ? new Date(date) : new Date(date);
  if (Number.isNaN(checkDate.getTime())) return false;

  const weekEnd = getWeekEnd(weekStart);
  const weekStartTime = getWeekStart(weekStart).getTime();
  const weekEndTime = weekEnd.getTime();
  const checkTime = checkDate.getTime();

  return checkTime >= weekStartTime && checkTime <= weekEndTime;
};

/**
 * Get closed tickets for a specific week
 * @param {Array} tickets - Array of ticket objects
 * @param {Date} weekStart - The start of the week
 * @returns {Array} - Filtered tickets closed within the week
 */
export const getClosedTicketsForWeek = (tickets, weekStart) => {
  return tickets.filter((ticket) => {
    if (ticket.status !== "closed") return false;
    if (!ticket.closedAt) return false;
    return isDateInWeek(ticket.closedAt, weekStart);
  });
};

/**
 * Get the default week (past week, starting from last Sunday)
 * @returns {Date} - The start of the past week
 */
export const getDefaultWeek = () => {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  return getWeekStart(lastWeek);
};

