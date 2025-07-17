import {State} from "../types";
import {StateServer, stateType} from "./types";

export class RemoteStateServer implements StateServer {
    constructor(private readonly url: string) {
    }

    getName(): string {
        return `remote{${this.url}}`;
    }

    async getState(): Promise<State> {
        return stateType.parse(await (await fetch(this.url)).json());
    }
}