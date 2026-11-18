import { createContext, useContext, useEffect, useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Animated, Keyboard, StyleSheet } from 'react-native';

export type ChitDialogClosers = MutableRefObject<Map<symbol, () => void>>;
const CloseContext = createContext<ChitDialogClosers | null>(null);
export const ChitDialogHost = CloseContext.Provider;

/** Action panels stay inside the chit sheet's single native presentation. */
export function ChitActionDialog({ visible, children, onRequestClose }: {
  visible: boolean; children: ReactNode; onRequestClose?: () => void;
  animationType?: 'none' | 'slide' | 'fade'; transparent?: boolean;
  presentationStyle?: 'pageSheet' | 'formSheet' | 'fullScreen' | 'overFullScreen';
}) {
  const closers = useContext(CloseContext);
  const identity = useRef(Symbol('chit-action'));
  const fade = useRef(new Animated.Value(1)).current;
  useLayoutEffect(() => {
    if (!visible || !onRequestClose || !closers) return;
    closers.current.set(identity.current, onRequestClose);
    return () => { closers.current.delete(identity.current); };
  }, [visible, onRequestClose, closers]);
  useEffect(() => {
    if (!visible) return;
    fade.setValue(0.85);
    const animation = Animated.timing(fade, { toValue: 1, duration: 140, useNativeDriver: true });
    animation.start();
    // Closing a sheet or leaving the screen must release input focus too.
    return () => { animation.stop(); Keyboard.dismiss(); };
  }, [visible]);
  if (!visible) return null;
  return <Animated.View testID="chit-action-dialog" accessibilityViewIsModal importantForAccessibility="yes"
    collapsable={false} style={[StyleSheet.absoluteFill, { zIndex: 20, elevation: 20, opacity: fade }]}>
    {children}
  </Animated.View>;
}
