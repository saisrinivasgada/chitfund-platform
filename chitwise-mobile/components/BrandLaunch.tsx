import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { C } from './ui';

type BrandLaunchProps = {
  onFinish: () => void;
};

/**
 * A brief, in-app brand reveal shown after the native launch screen.
 * The native screen stays static and fast; this layer provides the motion.
 */
export function BrandLaunch({ onFinish }: BrandLaunchProps) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.76)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkOffset = useRef(new Animated.Value(12)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let stopped = false;
    let animation: Animated.CompositeAnimation | undefined;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (stopped) return;

        if (reduceMotion) {
          logoOpacity.setValue(1);
          logoScale.setValue(1);
          wordmarkOpacity.setValue(1);
          wordmarkOffset.setValue(0);
        }

        animation = Animated.sequence([
          // Start after the native splash has handed off to React Native so
          // the reveal remains visible on slower cold launches.
          Animated.delay(180),
          reduceMotion
            ? Animated.delay(300)
            : Animated.parallel([
                Animated.timing(logoOpacity, {
                  toValue: 1,
                  duration: 300,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }),
                Animated.spring(logoScale, {
                  toValue: 1,
                  speed: 13,
                  bounciness: 5,
                  useNativeDriver: true,
                }),
              ]),
          reduceMotion
            ? Animated.delay(0)
            : Animated.parallel([
                Animated.timing(wordmarkOpacity, {
                  toValue: 1,
                  duration: 320,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
                Animated.timing(wordmarkOffset, {
                  toValue: 0,
                  duration: 320,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }),
              ]),
          Animated.delay(reduceMotion ? 150 : 360),
          Animated.timing(screenOpacity, {
            toValue: 0,
            duration: reduceMotion ? 160 : 240,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]);

        animation.start(({ finished }) => {
          if (finished && !stopped) onFinish();
        });
      });

    return () => {
      stopped = true;
      animation?.stop();
    };
  }, [logoOpacity, logoScale, onFinish, screenOpacity, wordmarkOffset, wordmarkOpacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="auto"
      testID="brand-launch"
      style={[styles.screen, { opacity: screenOpacity }]}
    >
      <View style={styles.content}>
        <Animated.View
          style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}
        >
          <Image
            accessibilityIgnoresInvertColors
            source={require('../assets/splash-icon.png')}
            style={styles.logo}
          />
        </Animated.View>
        <Animated.View
          style={{
            opacity: wordmarkOpacity,
            transform: [{ translateY: wordmarkOffset }],
          }}
        >
          <Text style={styles.wordmark}>ChitWise</Text>
          <View style={styles.accent} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: C.navy,
    justifyContent: 'center',
    zIndex: 10_000,
  },
  content: {
    alignItems: 'center',
    transform: [{ translateY: -12 }],
  },
  logo: {
    height: 136,
    resizeMode: 'contain',
    width: 136,
  },
  wordmark: {
    color: C.white,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 14,
    textAlign: 'center',
  },
  accent: {
    alignSelf: 'center',
    backgroundColor: C.gold,
    borderRadius: 2,
    height: 3,
    marginTop: 10,
    width: 38,
  },
});
