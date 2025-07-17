import {StructuredResponse} from "../types";
import {ResponseParser} from "./types";
import {getLogger} from "../../logger";
import {logger} from "handlebars";

export class FunctionCallFormatResponseParser implements ResponseParser {
    private readonly logger = getLogger();

    parse(text: string): StructuredResponse {
        const parts = text.split(/\s/ig).filter(part => part);
        const functionCalls: [string, Record<string, number>][] = [];
        let requireMoreInput = false;
        let i = 0;
        while (i < parts.length) {
            if (parts[i] === "call_function") {
                i++;
                const functionName = parts[i];
                i++;
                const rawParameters: [string, number][] = [];
                while (i < parts.length) {
                    const parameter = parts[i];
                    const parameterParts = parameter.split("=");
                    if (parameterParts.length != 2) {
                        break;
                    }
                    try {
                        const value = parseInt(parameterParts[1])
                        rawParameters.push([parameterParts[0], value]);
                        i++;
                    } catch (e) {
                        break;
                    }
                }
                const resultParameters: Record<string, number> = {};
                for (const [name, value] of rawParameters) {
                    if (resultParameters[name] !== undefined) {
                        this.logger.warn(`Duplicate parameter '${name}'`);
                        continue;
                    }
                    resultParameters[name] = value;
                }
                functionCalls.push([functionName, resultParameters]);
            } else {
                if (parts[i] === "CONTINUE_DIALOG") {
                    i++;
                    requireMoreInput = true;
                    break;
                }
                break;
            }
        }

        return {
            text: parts.slice(i).join(" "),
            requireMoreInput,
            functionCalls: functionCalls.map(([name, parsedParameters]) => ({
                name,
                parameters: parsedParameters
            }))
        };
    }
}