import axios from "axios";

export const accessTokenKey = "classora.accessToken";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(accessTokenKey);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 && error.config?.headers?.Authorization) {
    localStorage.removeItem(accessTokenKey);
    if (window.location.pathname !== "/login") window.location.assign("/login");
  }
  return Promise.reject(error);
});
