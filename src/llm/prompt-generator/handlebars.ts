import Handlebars from "handlebars";
import {PromptGenerator} from "./types";
import {FunctionArgument, FunctionArgumentValueConstraints, Functions, State} from "../types";

export class HandlebarsPromptGenerator implements PromptGenerator {
    private readonly template: HandlebarsTemplateDelegate;

    constructor(private readonly rawTemplate: string) {
        this.template = Handlebars.compile(rawTemplate, {
            noEscape: true
        });
    }

    generate(state: State, functions: Functions): string {
        return this.template({
            stateText: this.getStateText(state),
            functionsText: this.getFunctionsText(functions)
        });
    }

    private getStateText(state: State): string {
        let text = "";
        for (const [name, entry] of Object.entries(state)) {
            text += `${name} (${entry.description}): ${entry.value}\n`;
        }
        return text.trim();
    }

    private getFunctionsText(functions: Functions): string {
        let text = "";
        for (const [name, functionInfo] of Object.entries(functions)) {
            text += `${name} (${functionInfo.description})${this.getFunctionArgumentsText(functionInfo.arguments)}\n`;
        }
        return text;
    }

    private getFunctionArgumentsText(argumentMap: Record<string, FunctionArgument>): string {
        let text = "";
        for (const [name, argument] of Object.entries(argumentMap)) {
            text += ` ${name} (MUST BE ${argument.constraints.argumentType}) (${argument.description})=${this.getFunctionArgumentConstraintsText(argument.constraints)}`;
        }
        return text;
    }

    private getFunctionArgumentConstraintsText(constraints: FunctionArgumentValueConstraints): string {
        switch (constraints.type) {
            case "number-variants": {
                return constraints.variants.map(variant =>
                    `${variant.value} (${variant.description})`).join("|");
            }
            case "number-min-max": {
                return `(min ${constraints.min}, max ${constraints.max})`;
            }
            case "string-not-empty": {
                return "\"any not empty string\"";
            }
            case "string-variants": {
                return constraints.variants.map(variant =>
                    `"${variant.value}" (${variant.description})`).join("|");
            }
        }
        return "(any number)";
    }
}