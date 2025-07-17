import {getLogger} from "./logger";
import {SessionStorage} from "./session-storage/types";
import {OpenAI} from "openai";
import {
    FunctionArgument,
    FunctionCall,
    FunctionCallArguments,
    FunctionInfo,
    Functions,
    State,
    StructuredResponse
} from "./llm/types";
import {StateServer} from "./llm/state/types";
import {FunctionServer} from "./llm/function/types";
import {ChatCompletionMessageParam} from "openai/src/resources/chat/completions/completions";
import {randomUUID} from "node:crypto";
import {PromptGenerator} from "./llm/prompt-generator/types";
import {ResponseParser} from "./llm/response-parser/types";

interface ProcessorParams {
    openAI: OpenAI;
    model: string;
    promptGenerator: PromptGenerator;
    stateServers: StateServer[];
    functionServers: FunctionServer[];
    sessionStorage: SessionStorage<ChatCompletionMessageParam[]>;
    responseParser: ResponseParser;
}

interface ProcessorRequest {
    text: string;
    sessionId?: string;
}

interface ProcessorResult {
    text: string;
    requireMoreInput: boolean;
    sessionId: string;
}

type ExtendedFunctionInfo = FunctionInfo & {
    server: FunctionServer
};

type ExtendedFunctions = Record<string, ExtendedFunctionInfo>;

function compareStrings(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}

export class Processor {
    private readonly logger = getLogger<Processor>();

    constructor(private readonly params: ProcessorParams) {
    }

    private async getState(): Promise<State> {
        const promises: Promise<[StateServer, State, unknown | undefined]>[] = [];
        for (const server of this.params.stateServers) {
            promises.push((async () => {
                try {
                    const state = await server.getState();
                    return [server, state, undefined];
                } catch (e) {
                    return [server, {}, e];
                }
            })());
        }
        const resultState: State = {};
        const results = await Promise.all(promises);
        for (const [server, state, error] of results) {
            if (error) {
                this.logger.warn(`State server ${server.getName()} returned error: ${error}`);
                continue;
            }
            for (const [key, stateEntry] of Object.entries(state)) {
                if (resultState[key]) {
                    this.logger.warn(`State server ${server.getName()} returned duplicate state entry '${key}'`);
                    continue;
                }
                resultState[key] = stateEntry;
            }
        }
        return resultState;
    }

    private async getFunctions(): Promise<ExtendedFunctions> {
        const promises: Promise<[FunctionServer, Functions, unknown | undefined]>[] = [];
        for (const server of this.params.functionServers) {
            promises.push((async () => {
                try {
                    const functions = await server.getFunctions();
                    return [server, functions, undefined];
                } catch (e) {
                    return [server, {}, e];
                }
            })());
        }
        const resultFunctions: ExtendedFunctions = {};
        const results = await Promise.all(promises);
        for (const [server, state, error] of results) {
            if (error) {
                this.logger.warn(`Function server ${server.getName()} returned error while fetching functions: ${error}`);
                continue;
            }
            for (const [key, functionInfo] of Object.entries(state)) {
                if (resultFunctions[key]) {
                    this.logger.warn(`Function server ${server.getName()} returned duplicate function entry '${key}'`);
                    continue;
                }
                resultFunctions[key] = {
                    ...functionInfo,
                    server
                };
            }
        }
        return resultFunctions;
    }

    async process(request: ProcessorRequest): Promise<ProcessorResult> {
        const sessionId = request.sessionId ?? randomUUID();
        const previousMessages = await this.params.sessionStorage.load(sessionId) ?? [];
        previousMessages.push({
            role: "user",
            content: request.text
        });

        const state = await this.getState();
        const functions = await this.getFunctions();

        const prompt = this.params.promptGenerator.generate(state, functions);

        const response = await this.params.openAI.chat.completions.create({
            model: this.params.model,
            messages: [
                {
                    role: "system",
                    content: prompt
                },
                ...previousMessages
            ]
        });

        const responseContent = response.choices[0].message.content ?? "";

        this.logger.debug(`Received answer from LLM: ${responseContent}`);

        previousMessages.push({
            role: "assistant",
            content: responseContent
        });
        await this.params.sessionStorage.save(sessionId, previousMessages);

        const structuredResponse = this.params.responseParser.parse(responseContent);
        this.callFunctions(functions, structuredResponse.functionCalls)
            .catch(error => this.logger.error(`Failed to call functions: ${error}`));

        return {
            text: structuredResponse.text,
            requireMoreInput: structuredResponse.requireMoreInput,
            sessionId
        };
    }

    private async callFunctions(functions: ExtendedFunctions, functionCalls: FunctionCall[]): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const call of functionCalls) {
            const func = functions[call.name];
            if (!func) {
                this.logger.warn(`Tried to call non-existent function '${call.name}'`);
                continue;
            }
            if (!this.validateParameters(func, call.parameters)) {
                this.logger.warn(`Tried to call function '${call.name}' with invalid parameters: ${JSON.stringify(call.parameters)}`);
                continue;
            }

            promises.push((async () => {
                try {
                    await func.server.callFunction(call.name, call.parameters);
                } catch (e) {
                    this.logger.warn(`Failed to call function '${call.name}' with parameters ${JSON.stringify(call.parameters)}: ${e}`);
                }
            })());
        }

        await Promise.all(promises);
    }

    private validateParameters(func: ExtendedFunctionInfo, callArguments: FunctionCallArguments): boolean {
        const callArgumentsList = Object.entries(callArguments)
            .sort((a, b) => compareStrings(a[0], b[0]));
        const requiredArgumentsList = Object.entries(func.arguments)
            .sort((a, b) => compareStrings(a[0], b[0]));

        if (callArgumentsList.length !== requiredArgumentsList.length) {
            return false;
        }

        for (let i = 0; i < callArgumentsList.length; i++) {
            const [callArgumentName, callArgumentValue] = callArgumentsList[i];
            const [requiredArgumentName, requiredArgumentConstraints] = requiredArgumentsList[i];

            if (callArgumentName !== requiredArgumentName) {
                this.logger.warn(`Call argument '${callArgumentName}' !== '${requiredArgumentName}'`)
                return false;
            }

            if (!this.validateParameterValue(callArgumentValue, requiredArgumentConstraints)) {
                this.logger.warn(`Call argument '${callArgumentName}' value does not satisfy constraints`);
                return false;
            }
        }

        return true;
    }

    private validateParameterValue(value: number, constraints: FunctionArgument): boolean {
        switch (constraints.constraints.type) {
            case "min-max":
                if (value < constraints.constraints.min || value > constraints.constraints.max) {
                    return false;
                }
                break;
            case "variants":
                if (!constraints.constraints.variants.find(variant => variant.value === value)) {
                    return false;
                }
                break;
        }
        return true;
    }
}