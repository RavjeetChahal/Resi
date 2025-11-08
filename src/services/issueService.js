import { useEffect, useState } from 'react';
import { mockIssues } from '../assets/data/issues';

export const fetchIssues = async () => {
  return mockIssues;
};

export const subscribeToIssues = (callback) => {
  callback(mockIssues);
  return () => {};
};

export const useIssues = () => {
  const [issues, setIssues] = useState(mockIssues);

  useEffect(() => {
    const unsubscribe = subscribeToIssues(setIssues);
    return () => unsubscribe?.();
  }, []);

  return issues;
};

