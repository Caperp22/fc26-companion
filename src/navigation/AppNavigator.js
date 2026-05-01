import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AnalysisScreen from '../screens/AnalysisScreen';
import AutoLineupScreen from '../screens/AutoLineupScreen';
import BudgetScreen from '../screens/BudgetScreen';
import LeaguePlayersScreen from '../screens/LeaguePlayersScreen';
import LeaguesScreen from '../screens/LeaguesScreen';
import PlayerCompareScreen from '../screens/PlayerCompareScreen';
import PlayerDetailScreen from '../screens/PlayerDetailScreen';
import ScoutingScreen from '../screens/ScoutingScreen';
import ShortlistScreen from '../screens/ShortlistScreen';
import SquadBuilderScreen from '../screens/SquadBuilderScreen';
import TeamsScreen from '../screens/TeamsScreen';

const Tab            = createBottomTabNavigator();
const SquadStack     = createNativeStackNavigator();
const PlantillaStack = createNativeStackNavigator();
const ShortStack     = createNativeStackNavigator();
const LeaguesStack   = createNativeStackNavigator();
const AnalStack      = createNativeStackNavigator();

const HEADER = {
  headerStyle: { backgroundColor: '#0f172a' },
  headerTintColor: '#f1f5f9',
  headerShadowVisible: false,
};

function SquadStackNavigator() {
  return (
    <SquadStack.Navigator screenOptions={HEADER}>
      <SquadStack.Screen name="SquadBuilder" component={SquadBuilderScreen} options={{ title: 'Mi Pizarra' }} />
      <SquadStack.Screen name="Teams"        component={TeamsScreen}        options={{ title: 'Mis Equipos' }} />
      <SquadStack.Screen name="AutoLineup"   component={AutoLineupScreen}   options={({ route }) => ({ title: route.params?.teamName ?? 'Auto-Alinear' })} />
      <SquadStack.Screen name="Scouting"     component={ScoutingScreen}     options={{ title: 'Red de Ojeadores' }} />
      <SquadStack.Screen name="PlayerDetail" component={PlayerDetailScreen} options={{ title: 'Ficha del Jugador' }} />
      <SquadStack.Screen name="PlayerCompare" component={PlayerCompareScreen}
        options={({ route }) => ({
          title: `${route.params?.playerA?.name?.split(' ').slice(-1)[0] ?? '?'} vs ${route.params?.playerB?.name?.split(' ').slice(-1)[0] ?? '?'}`,
        })}
      />
    </SquadStack.Navigator>
  );
}

function PlantillaStackNavigator() {
  return (
    <PlantillaStack.Navigator screenOptions={HEADER}>
      <PlantillaStack.Screen name="PlantillaTeams"    options={{ title: 'Mis Equipos' }}>
        {(props) => <TeamsScreen {...props} autoLineupRoute="PlantillaAutoLineup" />}
      </PlantillaStack.Screen>
      <PlantillaStack.Screen name="PlantillaAutoLineup" component={AutoLineupScreen}   options={({ route }) => ({ title: route.params?.teamName ?? 'Plantilla' })} />
      <PlantillaStack.Screen name="PlantillaDetail"     component={PlayerDetailScreen} options={{ title: 'Ficha del Jugador' }} />
    </PlantillaStack.Navigator>
  );
}

function ShortlistStackNavigator() {
  return (
    <ShortStack.Navigator screenOptions={HEADER}>
      <ShortStack.Screen name="Shortlist"    component={ShortlistScreen}    options={{ title: 'Objetivos de Fichaje' }} />
      <ShortStack.Screen name="PlayerDetail" component={PlayerDetailScreen} options={{ title: 'Ficha del Jugador' }} />
      <ShortStack.Screen name="PlayerCompare" component={PlayerCompareScreen}
        options={({ route }) => ({
          title: `${route.params?.playerA?.name?.split(' ').slice(-1)[0] ?? '?'} vs ${route.params?.playerB?.name?.split(' ').slice(-1)[0] ?? '?'}`,
        })}
      />
    </ShortStack.Navigator>
  );
}

function LeaguesStackNavigator() {
  return (
    <LeaguesStack.Navigator screenOptions={HEADER}>
      <LeaguesStack.Screen name="Leagues"       component={LeaguesScreen}       options={{ title: 'Ligas y Selecciones' }} />
      <LeaguesStack.Screen name="LeaguePlayers" component={LeaguePlayersScreen} options={({ route }) => ({ title: route.params?.title ?? 'Jugadores' })} />
      <LeaguesStack.Screen name="PlayerDetail"  component={PlayerDetailScreen}  options={{ title: 'Ficha del Jugador' }} />
    </LeaguesStack.Navigator>
  );
}

function AnalysisStackNavigator() {
  return (
    <AnalStack.Navigator screenOptions={HEADER}>
      <AnalStack.Screen name="Analysis"     component={AnalysisScreen}     options={{ title: 'Análisis' }} />
      <AnalStack.Screen name="PlayerDetail" component={PlayerDetailScreen} options={{ title: 'Ficha del Jugador' }} />
    </AnalStack.Navigator>
  );
}

const TAB_ICONS = {
  Pizarra:     { on: 'football',        off: 'football-outline'        },
  Plantilla:   { on: 'people',          off: 'people-outline'          },
  Objetivos:   { on: 'star',            off: 'star-outline'            },
  Presupuesto: { on: 'wallet',          off: 'wallet-outline'          },
  Ligas:       { on: 'trophy',          off: 'trophy-outline'          },
  Analisis:    { on: 'analytics',       off: 'analytics-outline'       },
};

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f1f5f9',
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b', borderTopWidth: 1 },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#475569',
        tabBarIcon: ({ color, size, focused }) => {
          const icons = TAB_ICONS[route.name];
          const name  = icons ? (focused ? icons.on : icons.off) : 'ellipse-outline';
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Pizarra"     component={SquadStackNavigator}      options={{ headerShown: false, tabBarLabel: 'Pizarra' }} />
      <Tab.Screen name="Plantilla"   component={PlantillaStackNavigator}  options={{ headerShown: false, tabBarLabel: 'Plantilla' }} />
      <Tab.Screen name="Objetivos"   component={ShortlistStackNavigator}  options={{ headerShown: false, tabBarLabel: 'Objetivos' }} />
      <Tab.Screen name="Presupuesto" component={BudgetScreen}             options={{ title: 'Gestor Financiero', tabBarLabel: 'Presupuesto' }} />
      <Tab.Screen name="Ligas"       component={LeaguesStackNavigator}    options={{ headerShown: false, tabBarLabel: 'Ligas' }} />
      <Tab.Screen name="Analisis"    component={AnalysisStackNavigator}   options={{ headerShown: false, tabBarLabel: 'Análisis' }} />
    </Tab.Navigator>
  );
}
