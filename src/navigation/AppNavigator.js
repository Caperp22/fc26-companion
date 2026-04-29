import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BudgetScreen from '../screens/BudgetScreen';
import PlayerDetailScreen from '../screens/PlayerDetailScreen';
import ScoutingScreen from '../screens/ScoutingScreen';
import SquadBuilderScreen from '../screens/SquadBuilderScreen';

const Tab = createBottomTabNavigator();
const SquadStack = createNativeStackNavigator();

const STACK_HEADER = {
  headerStyle: { backgroundColor: '#0f172a' },
  headerTintColor: '#f1f5f9',
  headerShadowVisible: false,
};

function SquadStackNavigator() {
  return (
    <SquadStack.Navigator screenOptions={STACK_HEADER}>
      <SquadStack.Screen
        name="SquadBuilder"
        component={SquadBuilderScreen}
        options={{ headerShown: false }}
      />
      <SquadStack.Screen
        name="Scouting"
        component={ScoutingScreen}
        options={{ title: 'Red de Ojeadores' }}
      />
      <SquadStack.Screen
        name="PlayerDetail"
        component={PlayerDetailScreen}
        options={{ title: 'Ficha del Jugador' }}
      />
    </SquadStack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f1f5f9',
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: '#1e293b',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#475569',
        tabBarIcon: ({ color, size }) => {
          const icon = route.name === 'Pizarra' ? 'football-outline' : 'wallet-outline';
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Pizarra"
        component={SquadStackNavigator}
        options={{ headerShown: false, tabBarLabel: 'Pizarra' }}
      />
      <Tab.Screen
        name="Presupuesto"
        component={BudgetScreen}
        options={{ title: 'Gestor Financiero', tabBarLabel: 'Presupuesto' }}
      />
    </Tab.Navigator>
  );
}
