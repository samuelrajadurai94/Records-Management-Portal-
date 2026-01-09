import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if token exists and is valid (optional: call a /me endpoint)
        // For now, just check presence of token
        const token = localStorage.getItem('token');
        if (token) {
            // ideally decode token or fetch user
            setUser({ username: "Company" }); // Placeholder
        }
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await api.post('/auth/login', formData);
        localStorage.setItem('token', response.data.access_token);
        setUser({ username });
    };

    const register = async (username, password) => {
        await api.post('/auth/register', { username, password });
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
