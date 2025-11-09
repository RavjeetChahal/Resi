import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ConversationProvider } from "./src/context/ConversationContext";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import ChatScreen from "./src/screens/ChatScreen";
import RoleSelectScreen from "./src/screens/RoleSelectScreen";
import { colors } from "./src/theme/colors";

const Stack = createNativeStackNavigator();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.primary,
    card: colors.card,
    text: colors.text,
    border: colors.border,
  },
};

const AppNavigator = () => {
  const { role, user } = useAuth();
  const isAuthenticated = !!user;
  const navigatorKey = `${role ?? "guest"}-${
    isAuthenticated ? "auth" : "anon"
  }`;
  const initialRouteName = !role
    ? "RoleSelect"
    : !isAuthenticated
    ? "Login"
    : role === "resident"
    ? "Home"
    : "Dashboard";

  return (
    <Stack.Navigator
      key={navigatorKey}
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
      initialRouteName={initialRouteName}
    >
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
    </Stack.Navigator>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ConversationProvider>
        <NavigationContainer theme={navigationTheme}>
          <AppNavigator />
        </NavigationContainer>
      </ConversationProvider>
    </AuthProvider>
  );
}
