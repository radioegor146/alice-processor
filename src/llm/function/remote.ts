import {Functions} from "../types";
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

    async callFunction(name: string, parameters: Record<string, number>): Promise<void> {
        await fetch(this.url, {
            method: "POST",
            body: JSON.stringify({
                name,
                parameters
            }),
            headers: {
                "content-type": "application/json"
            }
        });
    }
}