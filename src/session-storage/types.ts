export interface SessionStorage<T> {
  load(id: string): Promise<T | undefined>;
  save(id: string, data: T): Promise<void>;
}
