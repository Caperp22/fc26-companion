import { NavigationContainer } from '@react-navigation/native';
import { useEffect } from 'react';
import { initDB } from './src/db/database';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  
  // Este hook ejecuta la creación de la base de datos al iniciar la app
  useEffect(() => {
    initDB();
  }, []);

  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}