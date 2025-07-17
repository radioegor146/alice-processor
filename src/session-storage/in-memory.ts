import {SessionStorage} from "./types";

export class InMemorySessionStorage<T> implements SessionStorage<T> {

    private readonly storage: Record<string, T> = {};

    save(id: string, data: T): Promise<void> {
        this.storage[id] = data;
        return Promise.resolve();
    }

    load(id: string): Promise<T | undefined> {
        return Promise.resolve(this.storage[id]);
    }
}