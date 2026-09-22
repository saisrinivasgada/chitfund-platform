import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSegments } from 'expo-router';
import { C } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { getPageTutorial, type PageTutorial } from './tutorialDefinitions';
import {
  loadTutorialState,
  saveTutorialState,
  type TutorialPreference,
  type TutorialState,
} from './tutorialStorage';

interface TutorialContextValue {
  isLoaded: boolean;
  preference: TutorialPreference;
  replayCurrentPage: () => void;
  restartAll: () => Promise<void>;
  disableTutorials: () => Promise<void>;
  openTutorialMenu: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

function getScreenFromSegments(segments: string[]) {
  return segments[2] ?? 'index';
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const segments = useSegments() as string[];
  const [state, setState] = useState<TutorialState>({
    schemaVersion: 1,
    preference: 'unset',
    completedPages: {},
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState<PageTutorial | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const supportedSession = segments[0] === '(app)'
    && !!user
    && user.authSource !== 'HUB'
    && user.role !== 'SUPER_ADMIN'
    && user.role !== 'SUPPORT_AGENT';
  const scope = supportedSession && user ? `${user.id}:${user.role}` : null;
  const currentTutorial = supportedSession && user
    ? getPageTutorial(user.role, getScreenFromSegments(segments))
    : undefined;

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    setShowWelcome(false);
    setActiveTutorial(null);
    setStepIndex(0);

    if (!scope || !user) {
      setState({ schemaVersion: 1, preference: 'unset', completedPages: {} });
      return () => { cancelled = true; };
    }

    let welcomeTimer: ReturnType<typeof setTimeout> | null = null;
    loadTutorialState(user.id, user.role).then((saved) => {
      if (cancelled) return;
      setState(saved);
      setIsLoaded(true);
      if (saved.preference === 'unset') {
        // Delay the welcome modal so the Dashboard finishes rendering first
        welcomeTimer = setTimeout(() => setShowWelcome(true), 900);
      }
    });
    return () => { cancelled = true; if (welcomeTimer) clearTimeout(welcomeTimer); };
  }, [scope]);

  const persist = useCallback(async (next: TutorialState) => {
    setState(next);
    if (supportedSession && user) {
      await saveTutorialState(user.id, user.role, next);
    }
  }, [supportedSession, user?.id, user?.role]);

  useEffect(() => {
    if (!isLoaded || showWelcome || activeTutorial || state.preference !== 'enabled' || !currentTutorial) return;
    if ((state.completedPages[currentTutorial.key] ?? 0) >= currentTutorial.version) return;

    const timer = setTimeout(() => {
      setStepIndex(0);
      setActiveTutorial(currentTutorial);
    }, 450);
    return () => clearTimeout(timer);
  }, [isLoaded, showWelcome, activeTutorial, state.preference, state.completedPages, currentTutorial?.key, currentTutorial?.version]);

  const startTutorials = useCallback(async () => {
    const next: TutorialState = { ...state, preference: 'enabled' };
    setShowWelcome(false);
    await persist(next);
    if (currentTutorial) {
      setStepIndex(0);
      setActiveTutorial(currentTutorial);
    }
  }, [state, persist, currentTutorial]);

  const declineTutorials = useCallback(async () => {
    setShowWelcome(false);
    await persist({ ...state, preference: 'disabled' });
  }, [state, persist]);

  const finishCurrentPage = useCallback(async () => {
    if (!activeTutorial) return;
    const finished = activeTutorial;
    setActiveTutorial(null);
    setStepIndex(0);
    await persist({
      ...state,
      completedPages: {
        ...state.completedPages,
        [finished.key]: finished.version,
      },
    });
  }, [activeTutorial, state, persist]);

  const replayCurrentPage = useCallback(() => {
    if (!currentTutorial) {
      Alert.alert('No tutorial on this page', 'Open a main app page and try again.');
      return;
    }
    setShowWelcome(false);
    setStepIndex(0);
    setActiveTutorial(currentTutorial);
  }, [currentTutorial]);

  const restartAll = useCallback(async () => {
    const next: TutorialState = { schemaVersion: 1, preference: 'enabled', completedPages: {} };
    setShowWelcome(false);
    setActiveTutorial(null);
    setStepIndex(0);
    await persist(next);
    if (currentTutorial) {
      setActiveTutorial(currentTutorial);
    }
  }, [persist, currentTutorial]);

  const disableTutorials = useCallback(async () => {
    setShowWelcome(false);
    setActiveTutorial(null);
    await persist({ ...state, preference: 'disabled' });
  }, [state, persist]);

  const openTutorialMenu = useCallback(() => {
    const actions = [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Show this page', onPress: replayCurrentPage },
      { text: 'Restart all tutorials', onPress: () => { void restartAll(); } },
    ];
    if (state.preference === 'enabled') {
      actions.push({ text: 'Turn off tutorials', onPress: () => { void disableTutorials(); } });
    }
    Alert.alert('Tutorials', 'Choose how you would like to use guided help.', actions);
  }, [state.preference, replayCurrentPage, restartAll, disableTutorials]);

  const contextValue = useMemo<TutorialContextValue>(() => ({
    isLoaded,
    preference: state.preference,
    replayCurrentPage,
    restartAll,
    disableTutorials,
    openTutorialMenu,
  }), [isLoaded, state.preference, replayCurrentPage, restartAll, disableTutorials, openTutorialMenu]);

  const step = activeTutorial?.steps[stepIndex];
  const isLastStep = !!activeTutorial && stepIndex === activeTutorial.steps.length - 1;

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}

      <Modal visible={showWelcome && supportedSession} transparent animationType="fade" onRequestClose={declineTutorials}>
        <View style={styles.backdrop}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.welcomeIcon}>
              <Text style={{ fontSize: 30 }}>👋</Text>
            </View>
            <Text style={styles.title}>Welcome to ChitWise</Text>
            <Text style={styles.body}>
              Would you like short guidance as you explore? Tutorials appear only when you open a feature for the first time.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Start tutorials"
              onPress={() => { void startTutorials(); }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Start tutorials</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="No thanks"
              onPress={() => { void declineTutorials(); }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>No, thanks</Text>
            </TouchableOpacity>
            <Text style={styles.privacyNote}>You can change this later from Tutorials in the app.</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={!!activeTutorial && !!step} transparent animationType="fade" onRequestClose={finishCurrentPage}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close tutorial" onPress={() => { void finishCurrentPage(); }} />
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.progressRow}>
              <Text style={styles.pageLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{activeTutorial?.pageTitle}</Text>
              <Text style={styles.progressText}>{stepIndex + 1} of {activeTutorial?.steps.length}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {
                width: `${((stepIndex + 1) / (activeTutorial?.steps.length ?? 1)) * 100}%`,
              }]} />
            </View>
            <View style={styles.stepIcon}>
              <Text style={{ fontSize: 28 }}>{step?.icon}</Text>
            </View>
            <Text style={styles.title}>{step?.title}</Text>
            <Text style={styles.body}>{step?.description}</Text>
            <View style={styles.actionRow}>
              {stepIndex > 0 ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Previous tutorial step"
                  onPress={() => setStepIndex((value) => value - 1)}
                  style={[styles.secondaryButton, { flex: 1, marginTop: 0 }]}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Skip this page tutorial"
                  onPress={() => { void finishCurrentPage(); }}
                  style={[styles.secondaryButton, { flex: 1, marginTop: 0 }]}
                >
                  <Text style={styles.secondaryButtonText}>Skip page</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isLastStep ? 'Finish tutorial' : 'Next tutorial step'}
                onPress={() => {
                  if (isLastStep) void finishCurrentPage();
                  else setStepIndex((value) => value + 1);
                }}
                style={[styles.primaryButton, { flex: 1, marginTop: 0 }]}
              >
                <Text style={styles.primaryButtonText}>{isLastStep ? 'Done' : 'Next'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </TutorialContext.Provider>
  );
}

export function useTutorials() {
  const context = useContext(TutorialContext);
  if (!context) throw new Error('useTutorials must be used inside TutorialProvider');
  return context;
}

export function TutorialHelpButton() {
  const { openTutorialMenu } = useTutorials();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Tutorial help"
      onPress={openTutorialMenu}
      style={styles.helpButton}
    >
      <Text style={styles.helpButtonText}>?</Text>
    </TouchableOpacity>
  );
}

export function TutorialSettingsRow() {
  const { preference, openTutorialMenu } = useTutorials();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Tutorial settings"
      onPress={openTutorialMenu}
      activeOpacity={0.75}
      style={styles.settingsRow}
    >
      <View style={styles.settingsIcon}>
        <Text style={{ fontSize: 22 }}>🎓</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingsTitle}>Tutorials</Text>
        <Text style={styles.settingsDescription}>
          {preference === 'disabled' ? 'Turn on guided help' : 'Replay a page or restart all guides'}
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: C.gray300 }}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 22,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
  welcomeIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: C.navy50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  stepIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: C.navy50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    marginBottom: 16,
  },
  title: {
    color: C.gray900,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  body: {
    color: C.gray600,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  primaryButton: {
    marginTop: 22,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: C.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: C.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: C.gray700,
    fontSize: 15,
    fontWeight: '700',
  },
  privacyNote: {
    color: C.gray400,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageLabel: {
    flex: 1,
    color: C.navy,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  progressText: {
    color: C.gray500,
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.gray200,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.gold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  helpButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.gray200,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButtonText: {
    color: C.navy,
    fontSize: 19,
    fontWeight: '800',
  },
  settingsRow: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: C.gray100,
  },
  settingsIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.navy50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.gray900,
  },
  settingsDescription: {
    fontSize: 12,
    color: C.gray500,
    marginTop: 1,
  },
});
