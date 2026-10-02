import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'cf_toolkit_v1';

function computeCalc(a: number, op: string, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
    default: return b;
  }
}

function fmtResult(n: number): string {
  if (isNaN(n) || !isFinite(n)) return 'Error';
  const s = n.toPrecision(12).replace(/\.?0+$/, '');
  return s.length > 12 ? n.toExponential(4) : s;
}

interface ToolkitState {
  // Persisted settings
  enabled: boolean;
  opacity: number;  // 0.3 – 1.0
  buttonSize: number; // 36, 44, 52
  // Calculator (session)
  calcOpen: boolean;
  display: string;
  expression: string;
  prevValue: number | null;
  operator: string | null;
  waitingOperand: boolean;
  // Actions
  setEnabled: (v: boolean) => void;
  setOpacity: (v: number) => void;
  setButtonSize: (v: number) => void;
  openCalc: () => void;
  closeCalc: () => void;
  toggleCalc: () => void;
  calcInput: (key: string) => void;
  loadSettings: () => Promise<void>;
}

export const useToolkitStore = create<ToolkitState>((set, get) => ({
  enabled: true,
  opacity: 0.85,
  buttonSize: 44,
  calcOpen: false,
  display: '0',
  expression: '',
  prevValue: null,
  operator: null,
  waitingOperand: false,

  setEnabled: (v) => {
    set({ enabled: v });
    const s = get();
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: v, opacity: s.opacity, buttonSize: s.buttonSize }));
  },

  setOpacity: (v) => {
    set({ opacity: v });
    const s = get();
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: s.enabled, opacity: v, buttonSize: s.buttonSize }));
  },

  setButtonSize: (v) => {
    set({ buttonSize: v });
    const s = get();
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: s.enabled, opacity: s.opacity, buttonSize: v }));
  },

  openCalc: () => set({ calcOpen: true }),
  closeCalc: () => set({ calcOpen: false }),
  toggleCalc: () => set((s) => ({ calcOpen: !s.calcOpen })),

  calcInput: (key) => set((s) => {
    let { display, expression, prevValue, operator, waitingOperand } = s;

    if (key === 'AC') {
      return { display: '0', expression: '', prevValue: null, operator: null, waitingOperand: false };
    }

    if (key === '±') {
      return { display: display.startsWith('-') ? display.slice(1) : '-' + display };
    }

    if (key === '%') {
      const val = parseFloat(display);
      const result = prevValue !== null ? (val / 100) * prevValue : val / 100;
      return { display: fmtResult(result) };
    }

    if (['+', '-', '×', '÷'].includes(key)) {
      const current = parseFloat(display);
      if (prevValue !== null && operator && !waitingOperand) {
        const result = computeCalc(prevValue, operator, current);
        if (isNaN(result)) return { display: 'Error', expression: '', prevValue: null, operator: null, waitingOperand: false };
        return {
          display: fmtResult(result),
          expression: fmtResult(result) + ' ' + key,
          prevValue: result,
          operator: key,
          waitingOperand: true,
        };
      }
      return {
        expression: (display === 'Error' ? '0' : display) + ' ' + key,
        prevValue: display === 'Error' ? 0 : current,
        operator: key,
        waitingOperand: true,
      };
    }

    if (key === '=') {
      if (prevValue === null || !operator) return {};
      const result = computeCalc(prevValue, operator, parseFloat(display));
      if (isNaN(result)) return { display: 'Error', expression: '', prevValue: null, operator: null, waitingOperand: false };
      return {
        display: fmtResult(result),
        expression: '',
        prevValue: null,
        operator: null,
        waitingOperand: false,
      };
    }

    if (key === '.') {
      if (waitingOperand) return { display: '0.', waitingOperand: false };
      if (display.includes('.')) return {};
      return { display: display + '.', waitingOperand: false };
    }

    // Digit
    if (waitingOperand) {
      return { display: key === '0' ? '0' : key, waitingOperand: false };
    }
    if (display === '0' || display === 'Error') return { display: key };
    if (display.replace('-', '').replace('.', '').length >= 10) return {};
    return { display: display + key };
  }),

  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const { enabled, opacity, buttonSize } = JSON.parse(raw);
        set({
          enabled: enabled ?? true,
          opacity: opacity ?? 0.85,
          buttonSize: buttonSize ?? 44,
        });
      }
    } catch { /* ignore */ }
  },
}));
