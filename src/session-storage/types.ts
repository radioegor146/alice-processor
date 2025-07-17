export interface SessionStorage<T> {
    save(id: string, data: T): Promise<void>;
    load(id: string): Promise<T | undefined>;
}