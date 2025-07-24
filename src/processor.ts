import {getLogger} from "./logger";
import {SessionStorage} from "./session-storage/types";
import {OpenAI} from "openai";
import {
    BiometryData,
    FunctionArgument,
    FunctionCall,
    FunctionCallArguments,
    FunctionInfo,
    Functions, SessionContext,
    State,
    StructuredResponse
} from "./llm/types";
import {StateServer} from "./llm/state/types";
import {FunctionServer} from "./llm/function/types";
import {ChatCompletionMessageParam} from "openai/src/resources/chat/completions/completions";
import {randomUUID} from "node:crypto";
import {PromptGenerator} from "./llm/prompt-generator/types";
import {ResponseParser} from "./llm/response-parser/types";
import {AliceDirectiveFunctionServer} from "./llm/function/alice-directive";
import {ca} from "zod/dist/types/v4/locales";

interface ProcessorParams {
    openAI: OpenAI;
    model: string;
    promptGenerator: PromptGenerator;
    stateServers: StateServer[];
    functionServers: FunctionServer[];
    sessionStorage: SessionStorage<ChatCompletionMessageParam[]>;
    responseParser: ResponseParser;
}

export interface ProcessorRequest {
    text: string;
    sessionId?: string;
    biometry: BiometryData;
}

export interface SoundSetLevelDirective {
    type: "soundSetLevel";
    newLevel: number;
}

export interface SoundQuieterDirective {
    type: "soundQuieter";
}

export interface SoundLouderDirective {
    type: "soundLouder";
}

export type AliceDirective = SoundSetLevelDirective | SoundQuieterDirective | SoundLouderDirective;

export interface ProcessorResult {
    text: string;
    requireMoreInput: boolean;
    sessionId: string;
    directives: AliceDirective[];
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

        const context: SessionContext = {
            id: sessionId,
            biometry: request.biometry
        };

        const state = await this.getState();

        this.fillStateFromRequest(state, request);

        const functions = await this.getFunctions();

        const prompt = this.params.promptGenerator.generate(state, functions);

        this.logger.info(`Received request: ${request.text}`);
        this.logger.debug(`Prompt: ${prompt}`);
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

        this.logger.info(`Received answer from LLM: ${responseContent}`);

        previousMessages.push({
            role: "assistant",
            content: responseContent
        });
        await this.params.sessionStorage.save(sessionId, previousMessages);

        const structuredResponse = this.params.responseParser.parse(responseContent);
        const [directives, functionPromises] =
            await this.callFunctions(context, functions, structuredResponse.functionCalls);

        functionPromises.catch(error => this.logger.error(`Failed to call functions: ${error}`));

        return {
            text: structuredResponse.text,
            requireMoreInput: structuredResponse.requireMoreInput,
            sessionId,
            directives
        };
    }

    private async callFunctions(context: SessionContext, functions: ExtendedFunctions,
                                functionCalls: FunctionCall[]): Promise<[AliceDirective[], Promise<void>]> {
        const directives: AliceDirective[] = [];

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

            if (func.server instanceof AliceDirectiveFunctionServer) {
                directives.push(await func.server.callDirectiveFunction(context, call.name, call.parameters));
                continue;
            }

            promises.push((async () => {
                try {
                    if (call.schedule) {
                        this.logger.info(`Calling ${call.name} with ${JSON.stringify(call.parameters)} after ${call.schedule} milliseconds`);
                        await new Promise(resolve => setTimeout(resolve, call.schedule));
                    }
                    await func.server.callFunction(context, call.name, call.parameters);
                } catch (e) {
                    this.logger.warn(`Failed to call function '${call.name}' with parameters ${JSON.stringify(call.parameters)}: ${e}`);
                }
            })());
        }

        return [directives, Promise.all(promises).then(() => {
        })];
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

    private validateParameterValue(value: number | string, constraints: FunctionArgument): boolean {
        let numberValue = 0;
        let stringValue = "";
        switch (constraints.constraints.argumentType) {
            case "number":
                switch (typeof value) {
                    case "string":
                        try {
                            numberValue = parseFloat(value);
                        } catch (e) {
                            this.logger.warn(`Failed to parse '${value}' as number`);
                            return false;
                        }
                        break;
                    case "number":
                        numberValue = value;
                        break;
                }
                break;
            case "string":
                switch (typeof value) {
                    case "number":
                        stringValue = value.toString();
                        break;
                    default:
                        stringValue = value;
                        break;
                }
                break;
        }
        switch (constraints.constraints.type) {
            case "number-min-max":
                if (numberValue < constraints.constraints.min || numberValue > constraints.constraints.max) {
                    return false;
                }
                break;
            case "number-variants":
                if (!constraints.constraints.variants.find(variant => variant.value === numberValue)) {
                    return false;
                }
                break;
            case "string-not-empty":
                if (!stringValue) {
                    return false;
                }
                break;
            case "string-variants":
                if (!constraints.constraints.variants.find(variant => variant.value === stringValue)) {
                    return false;
                }
                break;
        }
        return true;
    }

    private fillStateFromRequest(state: State, request: ProcessorRequest): void {
        state["input_person_gender"] = {
            description: "gender of person who talked to you",
            value: request.biometry.gender
        };
        state["input_person_age"] = {
            description: "age of person who talked to you",
            value: request.biometry.age
        };
        state["input_person_name"] = {
            description: "name of person who talked to you or 'unknown' if not enrolled yet",
            value: "unknown"
        };
    }
}