import { createContext, useContext, useReducer, useEffect } from 'react';
import {
  apiGetCustomers, apiGetOrders, apiGetPayments, apiGetInventory,
  apiGetContainers, apiGetUsers, apiGetNotifications, apiGetStockItems,
} from '../api';

const AppContext = createContext(null);

const initialState = {
  customers: [], orders: [], payments: [], containers: [], users: [], stockItems: [],
  inventory: { readyGallons: 0, totalGallons: 0, waterLevel: 0, maxCapacity: 10000 },
  notifications: [], loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ALL':
      return { ...state, ...action.payload, loading: false };
    case 'SET_CUSTOMERS':
      return { ...state, customers: action.payload };
    case 'ADD_CUSTOMER':
      return { ...state, customers: [...state.customers, action.payload] };
    case 'UPDATE_CUSTOMER':
      return { ...state, customers: state.customers.map((c) => (c.id === action.payload.id ? action.payload : c)) };
    case 'DELETE_CUSTOMER':
      return { ...state, customers: state.customers.filter((c) => c.id !== action.id) };
    case 'SET_ORDERS':
      return { ...state, orders: action.payload };
    case 'ADD_ORDER':
      return { ...state, orders: [...state.orders, action.payload] };
    case 'UPDATE_ORDER':
      return { ...state, orders: state.orders.map((o) => (o.id === action.payload.id ? action.payload : o)) };
    case 'SET_PAYMENTS':
      return { ...state, payments: action.payload };
    case 'ADD_PAYMENT':
      return { ...state, payments: [...state.payments, action.payload] };
    case 'SET_INVENTORY':
      return { ...state, inventory: action.payload };
    case 'SET_STOCK_ITEMS':
      return { ...state, stockItems: Array.isArray(action.payload) ? action.payload : [] };
    case 'UPDATE_STOCK_ITEM':
      return {
        ...state,
        stockItems: state.stockItems.map((i) => (i.id === action.payload.id ? action.payload : i)),
      };
    case 'SET_CONTAINERS':
      return { ...state, containers: action.payload };
    case 'ADD_CONTAINER':
      return { ...state, containers: [...state.containers, action.payload] };
    case 'DELETE_CONTAINER':
      return { ...state, containers: state.containers.filter((c) => c.id !== action.id) };
    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: action.payload };
    case 'MARK_NOTIFICATION_READ':
      return { ...state, notifications: state.notifications.map((n) => (n.id === action.id ? { ...n, read: 1 } : n)) };
    case 'MARK_ALL_NOTIFICATIONS_READ':
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: 1 })) };
    case 'SET_USERS':
      return { ...state, users: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const KEYS = ['customers', 'orders', 'payments', 'inventory', 'containers', 'users', 'notifications', 'stockItems'];

    const fetchAll = () => {
      Promise.allSettled([
        apiGetCustomers(),
        apiGetOrders(),
        apiGetPayments(),
        apiGetInventory(),
        apiGetContainers(),
        apiGetUsers(),
        apiGetNotifications('admin'),
        apiGetStockItems(),
      ]).then((results) => {
        const payload = {};
        results.forEach((result, i) => {
          const key = KEYS[i];
          if (result.status === 'fulfilled') {
            payload[key] = result.value;
          } else {
            console.warn(`Failed to load "${key}":`, result.reason);
          }
        });
        dispatch({ type: 'SET_ALL', payload });
      });
    };

    fetchAll();
    const interval = setInterval(fetchAll, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
