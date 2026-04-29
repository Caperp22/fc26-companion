import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AnalysisScreen from '../screens/AnalysisScreen';
import BudgetScreen from '../screens/BudgetScreen';
import LeaguePlayersScreen from '../screens/LeaguePlayersScreen';
import LeaguesScreen from '../screens/LeaguesScreen';
import PlayerDetailScreen from '../screens/PlayerDetailScreen';
import ScoutingScreen from '../screens/ScoutingScreen';
import SquadBuilderScreen from '../screens/SquadBuilderScreen';
import TeamsScreen from '../screens/TeamsScreen';

const Tab = createBottomTabNavigator();
const SquadStack = createNativeStackNavigator();
const LeaguesStack = createNativeStackNavigator();

const HEADER = {
  headerStyle: { backgroundColor: '#0f172a' },
  headerTintColor: '#f1f5f9',
  headerShadowVisible: false,
};

function SquadStackNavigator() {
  return (
    <SquadStack.Navigator screenOptions={HEADER}>
      <SquadStack.Screen
        name="SquadBuilder"
        component={SquadBuilderScreen}
        options={{ title: 'Mi Pizarra' }}
      />
      <SquadStack.Screen
        name="Teams"
        component={TeamsScreen}
        options={{ title: 'Mis Equipos' }}
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

function LeaguesStackNavigator() {
  return (
    <LeaguesStack.Navigator screenOptions={HEADER}>
      <LeaguesStack.Screen
        name="Leagues"
        component={LeaguesScreen}
        options={{ title: 'Ligas y Selecciones' }}
      />
      <LeaguesStack.Screen
        name="LeaguePlayers"
        component={LeaguePlayersScreen}
        options={({ route }) => ({ title: route.params?.title ?? 'Jugadores' })}
      />
    </LeaguesStack.Navigator>
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
          let icon = 'football-outline';
          if (route.name === 'Pizarra') icon = 'football-outline';
          else if (route.name === 'Presupuesto') icon = 'wallet-outline';
          else if (route.name === 'Ligas') icon = 'trophy-outline';
          else if (route.name === 'Analisis') icon = 'analytics-outline';
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
      <Tab.Screen
        name="Ligas"
        component={LeaguesStackNavigator}
        options={{ headerShown: false, tabBarLabel: 'Ligas' }}
      />
      <Tab.Screen
        name="Analisis"
        component={AnalysisScreen}
        options={{ title: 'Análisis', tabBarLabel: 'Análisis' }}
      />
    </Tab.Navigator>
  );
}
