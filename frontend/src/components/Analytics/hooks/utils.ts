export const getBaseUrl = (): string => {
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : '';
};

export const getAuthToken = (): string | null => {
  const authData = localStorage.getItem('luxury-lodging-auth');
  return authData ? JSON.parse(authData).token : null;
};
