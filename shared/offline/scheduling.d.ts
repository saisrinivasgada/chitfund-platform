export function runAccountTasks<T>(accounts: T[], task: (account: T) => Promise<void>, options?: { deadline?: number; concurrency?: number }): Promise<void>;
