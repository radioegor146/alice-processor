import {SessionContext, State} from "../types";
import {StateServer, stateType} from "./types";

export class RemoteStateServer implements StateServer {
    constructor(private readonly url: string) {
    }

    getName(): string {
        return `remote{${this.url}}`;
    }

    async getState(context: SessionContext): Promise<State> {
        return stateType.parse(await (await fetch(this.url, {
            method: "POST",
            body: JSON.stringify({
                context
            }),
            headers: {
                "content-type": "application/json"
            }
        })).json());
    }
}