import {Functions, SessionContext} from "../types";
import {FunctionServer, functionsType} from "./types";

export class RemoteFunctionServer implements FunctionServer {
    constructor(private readonly url: string) {
    }

    getName(): string {
        return `remote{${this.url}}`;
    }

    async getFunctions(): Promise<Functions> {
        return functionsType.parse(await (await fetch(this.url)).json());
    }

    async callFunction(context: SessionContext, name: string, parameters: Record<string, number | string>): Promise<void> {
        await fetch(this.url, {
            method: "POST",
            body: JSON.stringify({
                sessionContext: context,
                name,
                parameters
            }),
            headers: {
                "content-type": "application/json"
            }
        });
    }
}