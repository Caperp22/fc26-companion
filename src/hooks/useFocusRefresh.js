import { useEffect } from 'react';

export function useFocusRefresh(navigation, callback) {
  useEffect(() => {
    callback();
    const unsub = navigation?.addListener('focus', callback);
    return unsub;
  }, [navigation, callback]);
}
